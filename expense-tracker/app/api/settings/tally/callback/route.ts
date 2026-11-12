import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkMcpServer } from "@/lib/mcp";
import { finishSignIn } from "@/lib/mcp-oauth";
import { clearPendingSignIn, getPendingSignIn, saveTallySettings } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// The Tally MCP server sends the admin back here after they sign in.
// Finishes the sign-in, checks the connection works, saves it, and returns the
// admin to Settings with the outcome in the address (?tally=connected and so on).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = (process.env.APP_URL || url.origin).replace(/\/$/, "");
  const back = (outcome: string) =>
    NextResponse.redirect(`${origin}/admin?tab=settings&tally=${outcome}`);

  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.redirect(`${origin}/`);

  const pending = await getPendingSignIn();
  if (!pending || Date.now() - pending.startedAt > FIFTEEN_MINUTES) {
    await clearPendingSignIn();
    return back("expired");
  }
  if (url.searchParams.get("error")) {
    await clearPendingSignIn();
    return back("declined");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !pending.oauth.state || state !== pending.oauth.state) {
    return back("failed");
  }

  try {
    const oauth = await finishSignIn(pending.mcpUrl, pending.oauth, code);
    const token = (oauth.tokens as { access_token: string }).access_token;
    const check = await checkMcpServer(pending.mcpUrl, token);
    await saveTallySettings({
      mcpUrl: pending.mcpUrl,
      company: pending.company,
      tools: check.tools,
      checkedAt: new Date().toISOString(),
      token: "",
      oauth,
    });
    await clearPendingSignIn();
    return back("connected");
  } catch (error) {
    console.error("Could not finish the Tally sign-in:", error);
    await clearPendingSignIn();
    return back("failed");
  }
}
