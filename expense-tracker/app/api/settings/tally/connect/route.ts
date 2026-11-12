import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkMcpServer, isUnauthorized } from "@/lib/mcp";
import { beginSignIn } from "@/lib/mcp-oauth";
import { getTallySettings, savePendingSignIn, saveTallySettings } from "@/lib/store";
import { parseServerUrl, presetTallyUrl, tallyStatus } from "@/lib/tally-connection";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { mcpUrl?, company? }  -  the "Connect Tally" button.
// Uses the address the admin gave, or the one preset for this deployment.
//   - If the server needs no sign-in, it is connected straight away.
//   - Otherwise this returns { redirect }: the server's own sign-in page. The
//     admin signs in there and comes back through ./callback, connected.
export async function POST(request: Request) {
  const session = await getSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const raw = String(body.mcpUrl ?? "").trim() || presetTallyUrl;
  if (!raw) {
    return NextResponse.json(
      { error: "Enter the address of your Tally MCP server." },
      { status: 400 },
    );
  }
  const parsed = parseServerUrl(raw);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const mcpUrl = parsed.url;
  const company = String(body.company ?? "").trim().slice(0, 120);

  // An open server: nothing to sign in to.
  try {
    const check = await checkMcpServer(mcpUrl, "");
    await saveTallySettings({
      mcpUrl,
      company,
      tools: check.tools,
      checkedAt: new Date().toISOString(),
      token: "",
      oauth: null,
    });
    return NextResponse.json({ status: tallyStatus(await getTallySettings()) });
  } catch (error) {
    if (!isUnauthorized(error)) {
      return NextResponse.json(
        {
          error:
            "Could not reach that server. Check the address, and that the server is reachable from the internet.",
        },
        { status: 502 },
      );
    }
  }

  // The server wants a sign-in: send the admin to its sign-in page.
  const origin = (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  try {
    const { url, oauth } = await beginSignIn(mcpUrl, `${origin}/api/settings/tally/callback`);
    await savePendingSignIn({ mcpUrl, company, oauth, startedAt: Date.now() });
    return NextResponse.json({ redirect: url });
  } catch (error) {
    console.error("Could not start the Tally sign-in:", error);
    return NextResponse.json(
      {
        error:
          "That server has no sign-in page this app can use. If it gave you an access token, add it under Advanced.",
        needsToken: true,
      },
      { status: 502 },
    );
  }
}
