import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai";
import { SignInExpired } from "@/lib/mcp-oauth";
import { getEmployees, getExpenses, markPushed } from "@/lib/store";
import { buildTallyXml } from "@/lib/tally";
import { tallyAccess } from "@/lib/tally-connection";
import { HOME_CURRENCY } from "@/lib/types";
import { pushViaMcp } from "@/lib/tally-push";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST { ids, action: "push" | "export" }
// "export" returns the Tally import file.
// "push" sends the expenses to Tally and marks the ones that went through:
//   1. through the MCP server connected in Settings, if there is one
//   2. else to TALLY_URL (Tally's own HTTP gateway), if that is set
//   3. else nothing is sent and they are only marked, as a demo
export async function POST(request: Request) {
  const session = await getSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const ids = new Set<string>(Array.isArray(body.ids) ? body.ids : []);
  const [expenses, employees] = await Promise.all([getExpenses(), getEmployees()]);
  // Tally vouchers are in the company's own currency. An expense in another
  // currency is left out of both the push and the file until an admin changes
  // its amount; sending it as it is would record, say, $180 as Dhs 180.
  const chosen = expenses.filter((e) => ids.has(e.id) && e.currency === HOME_CURRENCY);

  if (body.action === "export") {
    return new Response(buildTallyXml(chosen, employees), {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }

  const ready = chosen.filter((e) => !e.tallyPushedAt && !e.needsReview && e.amount > 0);
  if (ready.length === 0) {
    return NextResponse.json({ error: "Nothing is ready to send." }, { status: 400 });
  }

  let sent = new Set(ready.map((e) => e.id));
  let failed = 0;
  let firstError = "";
  let via: "mcp" | "gateway" | "demo" = "demo";

  let mcp;
  try {
    mcp = await tallyAccess();
  } catch (error) {
    if (!(error instanceof SignInExpired)) throw error;
    return NextResponse.json(
      { error: "Your Tally sign-in has run out. Open Settings and connect Tally again." },
      { status: 401 },
    );
  }
  const tallyUrl = process.env.TALLY_URL;

  if (mcp) {
    via = "mcp";
    if (!aiEnabled) {
      return NextResponse.json(
        {
          error:
            "Pushing through the Tally connection needs ANTHROPIC_API_KEY to be set for this app.",
        },
        { status: 400 },
      );
    }
    try {
      const results = await pushViaMcp(ready, employees, mcp.settings, mcp.token);
      const ok = new Set(results.filter((r) => r.ok).map((r) => r.id));
      sent = new Set(ready.filter((e) => ok.has(e.id)).map((e) => e.id));
      failed = ready.length - sent.size;
      firstError = results.find((r) => !r.ok)?.error ?? "";
    } catch (error) {
      console.error("Tally push through MCP failed:", error);
      return NextResponse.json(
        {
          error:
            "The push to Tally did not go through. Test the connection in Settings and try again.",
        },
        { status: 502 },
      );
    }
  } else if (tallyUrl) {
    via = "gateway";
    try {
      const res = await fetch(tallyUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: buildTallyXml(ready, employees),
      });
      const text = await res.text();
      if (!res.ok || /<LINEERROR>|<ERRORS>[1-9]/.test(text)) {
        return NextResponse.json(
          { error: "Tally did not accept the entries. Check the ledger names in Tally." },
          { status: 502 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Could not reach Tally. Check that it is running and reachable." },
        { status: 502 },
      );
    }
  }

  await markPushed([...sent], new Date().toISOString());
  return NextResponse.json({ pushed: sent.size, failed, firstError, via });
}
