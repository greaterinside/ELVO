import {
  auth,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { randomBytes } from "crypto";
import { withTimeout } from "./mcp";
import type { McpOAuthState } from "./types";

// The "Connect Tally" button uses the MCP standard's sign-in flow (OAuth 2.1):
//   1. beginSignIn finds the server's sign-in page, registers this app with it
//      automatically, and returns the address to send the admin to.
//   2. The admin signs in there and is sent back to our callback with a code.
//   3. finishSignIn swaps that code for access tokens.
// Nothing is typed or copied by hand. The MCP SDK does the protocol work; this
// class only tells it where to keep its state between those steps.
class StoredProvider implements OAuthClientProvider {
  authorizationUrl: URL | null = null;

  constructor(readonly data: McpOAuthState) {}

  get redirectUrl() {
    return this.data.redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Receipts expense tracker",
      redirect_uris: [this.data.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  state() {
    return this.data.state ?? "";
  }

  // The SDK stamps what it saves with the server it belongs to, so these are
  // stored and handed back exactly as received.
  clientInformation() {
    return this.data.client as OAuthClientInformationMixed | undefined;
  }
  saveClientInformation(info: OAuthClientInformationMixed) {
    this.data.client = info;
  }

  tokens() {
    return this.data.tokens as OAuthTokens | undefined;
  }
  saveTokens(tokens: OAuthTokens) {
    this.data.tokens = tokens;
    this.data.expiresAt = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null;
  }

  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }

  saveCodeVerifier(verifier: string) {
    this.data.codeVerifier = verifier;
  }
  codeVerifier() {
    if (!this.data.codeVerifier) throw new Error("No sign-in is in progress.");
    return this.data.codeVerifier;
  }

  saveDiscoveryState(state: OAuthDiscoveryState) {
    this.data.discovery = state;
  }
  discoveryState() {
    return this.data.discovery as OAuthDiscoveryState | undefined;
  }
}

/** Starts a sign-in. Returns the page to send the admin to, and state to keep. */
export async function beginSignIn(
  mcpUrl: string,
  redirectUrl: string,
): Promise<{ url: string; oauth: McpOAuthState }> {
  const oauth: McpOAuthState = {
    redirectUrl,
    state: randomBytes(24).toString("base64url"),
  };
  const provider = new StoredProvider(oauth);
  const result = await withTimeout(auth(provider, { serverUrl: mcpUrl }), 25000);
  if (result !== "REDIRECT" || !provider.authorizationUrl) {
    throw new Error("The server did not offer a sign-in page.");
  }
  return { url: provider.authorizationUrl.toString(), oauth };
}

/** Finishes a sign-in with the code the server sent back. */
export async function finishSignIn(
  mcpUrl: string,
  pending: McpOAuthState,
  code: string,
): Promise<McpOAuthState> {
  const oauth = structuredClone(pending);
  const provider = new StoredProvider(oauth);
  const result = await withTimeout(
    auth(provider, { serverUrl: mcpUrl, authorizationCode: code }),
    25000,
  );
  if (result !== "AUTHORIZED" || !oauth.tokens) {
    throw new Error("The sign-in did not complete.");
  }
  delete oauth.codeVerifier;
  delete oauth.state;
  return oauth;
}

export class SignInExpired extends Error {
  constructor() {
    super("The Tally sign-in has run out.");
  }
}

/**
 * Returns an access token that is good to use now, renewing it first if it is
 * about to run out. `renewed` is set when the stored state must be saved again.
 */
export async function freshAccessToken(
  mcpUrl: string,
  current: McpOAuthState,
): Promise<{ token: string; renewed: McpOAuthState | null }> {
  const tokens = current.tokens as OAuthTokens | undefined;
  if (!tokens?.access_token) throw new SignInExpired();

  const expiring = current.expiresAt != null && current.expiresAt - Date.now() < 120_000;
  if (!expiring) return { token: tokens.access_token, renewed: null };
  if (!tokens.refresh_token) throw new SignInExpired();

  // Work on a copy: a failed renewal must not disturb what is stored.
  const oauth = structuredClone(current);
  const provider = new StoredProvider(oauth);
  let result;
  try {
    result = await withTimeout(auth(provider, { serverUrl: mcpUrl }), 25000);
  } catch {
    throw new SignInExpired();
  }
  const renewed = oauth.tokens as OAuthTokens | undefined;
  if (result !== "AUTHORIZED" || !renewed?.access_token) throw new SignInExpired();
  delete oauth.codeVerifier;
  return { token: renewed.access_token, renewed: oauth };
}
