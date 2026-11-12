import { freshAccessToken } from "./mcp-oauth";
import { getTallySettings, saveTallySettings } from "./store";
import type { TallySettings, TallyStatus } from "./types";

/** The Tally MCP server preset for this deployment, if the owner set one. */
export const presetTallyUrl = (process.env.TALLY_MCP_URL || "").trim();

/** What the browser may know about the connection: no tokens. */
export function tallyStatus(s: TallySettings | null): TallyStatus {
  return {
    connected: Boolean(s),
    mcpUrl: s?.mcpUrl ?? "",
    company: s?.company ?? "",
    method: !s ? null : s.oauth ? "signin" : s.token ? "token" : "open",
    tools: s?.tools ?? [],
  };
}

/**
 * The saved connection together with an access token that works right now.
 * Renews a signed-in connection's token when it is about to run out, and
 * saves the renewed one. Throws SignInExpired when the admin must sign in again.
 */
export async function tallyAccess(): Promise<{ settings: TallySettings; token: string } | null> {
  const settings = await getTallySettings();
  if (!settings) return null;
  if (!settings.oauth) return { settings, token: settings.token };

  const { token, renewed } = await freshAccessToken(settings.mcpUrl, settings.oauth);
  if (renewed) {
    settings.oauth = renewed;
    await saveTallySettings(settings);
  }
  return { settings, token };
}

/** Checks an address the admin typed. Returns the cleaned address or an error. */
export function parseServerUrl(raw: string): { url: string } | { error: string } {
  const value = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: "Enter the full address of the Tally MCP server, starting with https://" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "The address must start with https://" };
  }
  return { url: value };
}
