"use client";

import { useEffect, useState } from "react";
import type { TallyStatus } from "@/lib/types";
import { Button, Field, inputClass } from "../ui";

export type Setup = {
  ai: boolean;
  gateway: boolean;
  durable: boolean;
  /** True when the data is in Supabase, false when it is in local files */
  supabase: boolean;
  /** Host of the Tally MCP server preset for this deployment, or "" */
  tallyPreset: string;
};

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const METHOD_WORDS = {
  signin: "Signed in",
  token: "Using an access token",
  open: "No sign-in needed",
} as const;

function toolsLine(tools: string[]) {
  if (tools.length === 0) return "The server answered but offers no tools.";
  const shown = tools.slice(0, 6).join(", ");
  return `${tools.length} ${tools.length === 1 ? "tool" : "tools"} available: ${shown}${
    tools.length > 6 ? " and more" : ""
  }.`;
}

export function Settings({
  setup,
  tally,
  onTally,
  onToast,
}: {
  setup: Setup;
  tally: TallyStatus;
  onTally: (t: TallyStatus) => void;
  onToast: (m: string) => void;
}) {
  return (
    <>
      {tally.connected ? (
        <Connected tally={tally} onTally={onTally} onToast={onToast} />
      ) : (
        <Connect preset={setup.tallyPreset} onTally={onTally} onToast={onToast} />
      )}

      <div className="mt-6 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
        <StatusRow
          label="Receipt reading"
          on={setup.ai}
          detail={
            setup.ai
              ? "Photos are read automatically. This also powers the push through your Tally connection."
              : "People type the amount themselves. Add ANTHROPIC_API_KEY to the app's environment to switch it on. The Tally connection needs it too."
          }
        />
        <StatusRow
          label="Database"
          on={setup.durable}
          detail={
            setup.supabase
              ? "Expenses, team members and settings are kept in Supabase."
              : setup.durable
                ? "Running locally: data is kept in files on this computer."
              : "Not connected, so saved data and these settings can disappear. Connect a Supabase project to this app in Vercel."
          }
        />
        {setup.gateway && (
          <StatusRow
            label="Tally HTTP gateway"
            on
            detail="TALLY_URL is set. It is used when Tally is not connected above."
          />
        )}
      </div>
    </>
  );
}

/* ---------- not connected: one button ---------- */

function Connect({
  preset,
  onTally,
  onToast,
}: {
  preset: string;
  onTally: (t: TallyStatus) => void;
  onToast: (m: string) => void;
}) {
  const [ownServer, setOwnServer] = useState(!preset);
  const [mcpUrl, setMcpUrl] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"" | "connect" | "token">("");
  const [error, setError] = useState("");

  async function connect() {
    setBusy("connect");
    setError("");
    try {
      const res = await fetch("/api/settings/tally/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpUrl: ownServer ? mcpUrl : "" }),
      });
      const data = await res.json();
      if (data.redirect) {
        // Off to the server's own sign-in page; it sends the admin back here.
        window.location.href = data.redirect;
        return;
      }
      setBusy("");
      if (!res.ok) {
        setError(data.error);
        if (data.needsToken) setAdvanced(true);
        return;
      }
      onTally(data.status);
      onToast("Tally connected");
    } catch {
      setBusy("");
      setError("Could not start the connection. Check your internet and try again.");
    }
  }

  async function connectWithToken() {
    setBusy("token");
    setError("");
    const res = await fetch("/api/settings/tally", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mcpUrl, token, company: "", save: true }),
    });
    const data = await res.json();
    setBusy("");
    if (!res.ok) return setError(data.error);
    onTally(data.status);
    onToast("Tally connected");
  }

  return (
    <section className="mt-6 rounded-2xl bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight">Tally connection</h2>
        <span className="text-[14px] text-muted">Not connected</span>
      </div>
      <p className="mt-1 text-[14px] leading-snug text-muted">
        Connect Tally once. After that, Push to Tally sends every expense there
        as a journal voucher.
      </p>

      <form
        className="mt-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          connect();
        }}
      >
        {ownServer && (
          <div className="mb-3">
            <Field label="Tally MCP server address">
              <input
                className={inputClass}
                type="url"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="https://tally.example.com/mcp"
                value={mcpUrl}
                onChange={(e) => setMcpUrl(e.target.value)}
                required
              />
            </Field>
          </div>
        )}
        <Button type="submit" disabled={busy !== ""} className="w-full">
          {busy === "connect" ? "Opening the sign-in page" : "Connect Tally"}
        </Button>
      </form>

      <p className="mt-2 text-[13px] leading-snug text-faint">
        {ownServer
          ? "You sign in on the next screen. There are no keys to copy or paste."
          : `You sign in at ${preset} on the next screen. There is nothing to type here.`}
      </p>

      {error && <p className="mt-3 text-[14px] text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3">
        {preset && (
          <button
            type="button"
            onClick={() => setOwnServer(!ownServer)}
            className="text-[14px] font-medium text-accent"
          >
            {ownServer ? `Use ${preset}` : "Use a different server"}
          </button>
        )}
        <button
          type="button"
          aria-expanded={advanced}
          onClick={() => {
            setAdvanced(!advanced);
            setOwnServer(true);
          }}
          className="text-[14px] font-medium text-accent"
        >
          {advanced ? "Hide access token" : "Connect with an access token instead"}
        </button>
      </div>

      {advanced && (
        <form
          className="mt-3 space-y-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            connectWithToken();
          }}
        >
          <p className="text-[14px] leading-snug text-muted">
            For servers that have no sign-in page and gave you a token. Enter
            the server address above, then the token here.
          </p>
          <Field label="Access token">
            <input
              className={inputClass}
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" kind="quiet" disabled={busy !== "" || !mcpUrl} className="w-full">
            {busy === "token" ? "Connecting" : "Connect with this token"}
          </Button>
        </form>
      )}
    </section>
  );
}

/* ---------- connected ---------- */

function Connected({
  tally,
  onTally,
  onToast,
}: {
  tally: TallyStatus;
  onTally: (t: TallyStatus) => void;
  onToast: (m: string) => void;
}) {
  const [company, setCompany] = useState(tally.company);
  const [busy, setBusy] = useState<"" | "test" | "save">("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => setCompany(tally.company), [tally.company]);

  async function check(save: boolean) {
    setBusy(save ? "save" : "test");
    setError("");
    setNote("");
    const res = await fetch("/api/settings/tally", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mcpUrl: tally.mcpUrl, token: "", company, save }),
    });
    const data = await res.json();
    setBusy("");
    if (!res.ok) return setError(data.error);
    if (data.status) {
      onTally(data.status);
      onToast("Company name saved");
    } else {
      setNote(`The connection works. ${toolsLine(data.tools)}`);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Tally? Push will stop sending expenses until you connect again.")) return;
    const res = await fetch("/api/settings/tally", { method: "DELETE" });
    onTally(await res.json());
    onToast("Tally disconnected");
  }

  return (
    <section className="mt-6 rounded-2xl bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight">Tally connection</h2>
        <span className="text-[14px] text-ok">Connected</span>
      </div>
      <p className="mt-1 break-words text-[15px]">{hostOf(tally.mcpUrl)}</p>
      <p className="mt-0.5 text-[14px] leading-snug text-muted">
        {tally.method ? `${METHOD_WORDS[tally.method]}. ` : ""}
        {toolsLine(tally.tools)}
      </p>

      <form
        className="mt-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          check(true);
        }}
      >
        <Field label="Tally company name (optional)">
          <div className="flex gap-2">
            <input
              className={inputClass}
              placeholder="As it appears in Tally"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
            {company.trim() !== tally.company && (
              <Button type="submit" disabled={busy !== ""} className="whitespace-nowrap">
                {busy === "save" ? "Saving" : "Save"}
              </Button>
            )}
          </div>
        </Field>
      </form>

      {error && <p className="mt-3 text-[14px] text-danger">{error}</p>}
      {note && <p className="mt-3 text-[14px] leading-snug text-muted">{note}</p>}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <button
          type="button"
          disabled={busy !== ""}
          onClick={() => check(false)}
          className="text-[14px] font-medium text-accent disabled:opacity-40"
        >
          {busy === "test" ? "Testing" : "Test connection"}
        </button>
        <button type="button" onClick={disconnect} className="text-[14px] font-medium text-danger">
          Disconnect Tally
        </button>
      </div>
    </section>
  );
}

function StatusRow({ label, on, detail }: { label: string; on: boolean; detail: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span
        aria-hidden
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${on ? "bg-ok" : "bg-faint"}`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[16px] font-medium">{label}</span>
          <span className={`text-[14px] ${on ? "text-ok" : "text-muted"}`}>
            {on ? "On" : "Off"}
          </span>
        </span>
        <span className="mt-0.5 block text-[14px] leading-snug text-muted">{detail}</span>
      </span>
    </div>
  );
}
