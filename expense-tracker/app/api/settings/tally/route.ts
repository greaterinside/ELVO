import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkMcpServer, isUnauthorized } from "@/lib/mcp";
import { SignInExpired } from "@/lib/mcp-oauth";
import {
  clearPendingSignIn,
  clearTallySettings,
  getTallySettings,
  saveTallySettings,
} from "@/lib/store";
import { parseServerUrl, tallyAccess, tallyStatus } from "@/lib/tally-connection";
import type { McpOAuthState } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function adminOnly() {
  const session = await getSession();
  return session?.role === "admin"
    ? null
    : NextResponse.json({ error: "Admins only." }, { status: 403 });
}

export async function GET() {
  return (await adminOnly()) ?? NextResponse.json(tallyStatus(await getTallySettings()));
}

// POST { mcpUrl, token, company, save }
// Checks an MCP server by connecting and listing its tools. With save: true the
// connection is stored once the check passes. Used for "Test connection", for
// changing the company name, and for connecting with a typed access token.
// (The one-click sign-in lives in ./connect and ./callback.)
// When no token is typed and the address is the one already connected, the
// saved way in is reused, so nothing has to be entered again.
export async function POST(request: Request) {
  const denied = await adminOnly();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const parsed = parseServerUrl(String(body.mcpUrl ?? ""));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const mcpUrl = parsed.url;
  const company = String(body.company ?? "").trim().slice(0, 120);

  let token = String(body.token ?? "").trim();
  let oauth: McpOAuthState | null = null;
  if (!token) {
    const saved = await getTallySettings();
    if (saved?.mcpUrl === mcpUrl) {
      try {
        const access = await tallyAccess();
        token = access?.token ?? "";
        oauth = access?.settings.oauth ?? null;
      } catch (error) {
        if (!(error instanceof SignInExpired)) throw error;
        return NextResponse.json(
          { error: "Your Tally sign-in has run out. Disconnect and connect Tally again." },
          { status: 401 },
        );
      }
    }
  }

  let check;
  try {
    check = await checkMcpServer(mcpUrl, token);
  } catch (error) {
    return NextResponse.json(
      {
        error: isUnauthorized(error)
          ? "That server did not accept the sign-in. Check the access token, or connect again."
          : "Could not connect to that MCP server. Check the address, and that the server is reachable from the internet.",
      },
      { status: 502 },
    );
  }

  if (body.save) {
    await saveTallySettings({
      mcpUrl,
      company,
      tools: check.tools,
      checkedAt: new Date().toISOString(),
      token: oauth ? "" : token,
      oauth,
    });
  }
  return NextResponse.json({
    serverName: check.serverName,
    tools: check.tools,
    status: body.save ? tallyStatus(await getTallySettings()) : undefined,
  });
}

export async function DELETE() {
  const denied = await adminOnly();
  if (denied) return denied;
  await clearTallySettings();
  await clearPendingSignIn();
  return NextResponse.json(tallyStatus(null));
}
