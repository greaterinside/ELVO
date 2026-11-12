import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CATEGORIES, CURRENCIES, HOME_CURRENCY } from "./types";

const Receipt = z.object({
  is_receipt: z.boolean(),
  merchant: z.string(),
  description: z.string(),
  category: z.enum(CATEGORIES),
  amount: z.number(),
  currency: z.enum(CURRENCIES),
  date: z.string(),
});

export type ReceiptReading = z.infer<typeof Receipt>;

const SYSTEM = `You read photos of receipts, bills and invoices so a small company based in the United Arab Emirates can log employee expenses.

Return:
- is_receipt: whether the photo shows a receipt, bill, invoice or ticket.
- merchant: the business the money was paid to, as printed. Empty string if unknown.
- description: one short plain phrase saying what was bought, for example "Team lunch" or "Cab to airport". Use the employee's note when it explains the purpose.
- category: the best fit from the allowed list.
- amount: the final total paid, including taxes and tips, as a number, exactly as printed and in the receipt's own currency. Never convert it to another currency. 0 if you cannot read it.
- currency: the currency the total is in. Work it out from the symbol or code next to the amounts, and from the country, address, phone number and tax names on the receipt: a "$" on a receipt from the United States is USD, from Singapore SGD, from Australia AUD. Amounts marked "AED", "Dhs", "Dh" or "د.إ" are AED; amounts marked "₹", "Rs" or "INR" are INR. Use ${HOME_CURRENCY} when nothing on the receipt points to a currency. If the receipt is in a currency that is not in the allowed list, use ${HOME_CURRENCY} and set amount to 0 so a person fills it in.
- date: the date printed on the receipt as YYYY-MM-DD. Most receipts are day first; receipts from the United States are month first. Empty string if no date is visible.

Report only what is visible or stated in the note. Do not guess an amount, and do not mention the currency in the description.`;

export const aiEnabled = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
);

/** Reads a receipt photo. Returns null when AI is not configured or the read fails. */
export async function readReceipt(
  dataUrl: string,
  note: string,
): Promise<ReceiptReading | null> {
  if (!aiEnabled) return null;
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const mediaType = match[1] as "image/jpeg" | "image/png" | "image/webp" | "image/gif";

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(Receipt) },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: match[2] },
            },
            {
              type: "text",
              text: note
                ? `Employee's note: ${note}`
                : "The employee left no note.",
            },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    return response.parsed_output ?? null;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Receipt reading failed: the Anthropic API key is invalid.");
    } else if (error instanceof Anthropic.RateLimitError) {
      console.error("Receipt reading failed: rate limited.");
    } else if (error instanceof Anthropic.APIError) {
      console.error(`Receipt reading failed: API error ${error.status}`, error.message);
    } else {
      console.error("Receipt reading failed:", error);
    }
    return null;
  }
}
