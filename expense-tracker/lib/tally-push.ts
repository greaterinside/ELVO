import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Employee, Expense } from "./types";

const Results = z.object({
  results: z.array(
    z.object({ id: z.string(), ok: z.boolean(), error: z.string() }),
  ),
});

export type PushResult = z.infer<typeof Results>["results"][number];

const RESULTS_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          ok: { type: "boolean" },
          error: { type: "string" },
        },
        required: ["id", "ok", "error"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
} as const;

const SYSTEM = `You post employee expense entries into Tally accounting software through the connected Tally tools.

For each expense in the list, create exactly one Journal voucher:
- debit the expense ledger named in "ledger"
- credit the ledger named in "employee" (the amount is owed to that employee)
- use the given date, amount (already in the company's own currency) and narration
- use the Tally company named in the request when a tool asks for one

Only create these vouchers. Do not alter or delete anything in Tally, and do not create ledgers. If a voucher cannot be created, for example because a ledger does not exist, record that as a failure and move on to the next expense.

When every expense has been attempted, reply with the results. Set ok to true only when Tally confirmed the voucher was created; otherwise set ok to false and give a short plain reason in error. Use an empty string for error when ok is true. Include every expense id exactly once.`;

/**
 * Sends expenses to Tally through the admin's MCP server. Claude is given the
 * server's tools and works out how to create each voucher with them, so this
 * works with any Tally MCP server rather than one fixed tool name.
 */
export async function pushViaMcp(
  expenses: Expense[],
  employees: Employee[],
  settings: { mcpUrl: string; company: string },
  accessToken: string,
): Promise<PushResult[]> {
  const nameOf = new Map(employees.map((e) => [e.id, e.name]));
  const entries = expenses.map((e) => ({
    id: e.id,
    date: e.date,
    amount: e.amount,
    ledger: e.category,
    employee: nameOf.get(e.employeeId) ?? "Employee",
    narration: [e.merchant, e.description, e.note].filter(Boolean).join(" | "),
  }));

  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Tally company: ${settings.company || "(use the one currently open)"}\n\nExpenses to post:\n${JSON.stringify(entries, null, 2)}`,
    },
  ];

  // A long run of tool calls can pause; resume it a few times before giving up.
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      mcp_servers: [
        {
          type: "url",
          name: "tally",
          url: settings.mcpUrl,
          ...(accessToken ? { authorization_token: accessToken } : {}),
        },
      ],
      tools: [{ type: "mcp_toolset", mcp_server_name: "tally" }],
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: RESULTS_SCHEMA },
      },
      messages,
    });

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (response.stop_reason !== "end_turn") {
      throw new Error(`Tally push stopped early (${response.stop_reason}).`);
    }
    const text = response.content.findLast((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("Tally push returned no result.");
    return Results.parse(JSON.parse(text.text)).results;
  }
  throw new Error("Tally push did not finish.");
}
