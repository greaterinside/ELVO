import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export type McpCheck = { serverName: string; tools: string[] };

async function listTools(transport: Transport): Promise<McpCheck> {
  const client = new Client({ name: "receipts", version: "1.0.0" });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    return {
      serverName: client.getServerVersion()?.name ?? "",
      tools: tools.map((t) => t.name),
    };
  } finally {
    await client.close().catch(() => {});
  }
}

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("The server took too long to answer.")), ms),
    ),
  ]);
}

/** True when the server answered, but wants the caller to sign in first. */
export function isUnauthorized(error: unknown): boolean {
  if (error instanceof UnauthorizedError) return true;
  const e = error as { code?: unknown; message?: unknown } | null;
  return e?.code === 401 || /\b401\b|unauthori[sz]ed/i.test(String(e?.message ?? ""));
}

/**
 * Connects to an MCP server and lists the tools it offers. Tries the current
 * HTTP transport first, then the older SSE one that some servers still use.
 */
export async function checkMcpServer(url: string, token: string): Promise<McpCheck> {
  const target = new URL(url);
  const requestInit = token
    ? { headers: { Authorization: `Bearer ${token}` } }
    : undefined;
  try {
    return await withTimeout(
      listTools(new StreamableHTTPClientTransport(target, { requestInit })),
      15000,
    );
  } catch (error) {
    // The server is there but wants a sign-in: the older transport will not help.
    if (isUnauthorized(error)) throw error;
    return await withTimeout(
      listTools(new SSEClientTransport(target, { requestInit })),
      15000,
    );
  }
}
