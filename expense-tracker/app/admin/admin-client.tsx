"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HOME_CURRENCY, HOME_CURRENCY_NAME, type Employee, type Expense, type TallyStatus } from "@/lib/types";
import {
  BigTotal,
  Button,
  ExpenseEditor,
  ExpenseRow,
  Field,
  PERIODS,
  Segmented,
  Sheet,
  Toast,
  TopBar,
  inPeriod,
  inputClass,
  sum,
  totalParts,
  type Period,
} from "../ui";
import { Settings, type Setup } from "./settings";

type Tab = "expenses" | "team" | "settings";

const NO_TALLY: TallyStatus = {
  connected: false,
  mcpUrl: "",
  company: "",
  method: null,
  tools: [],
};

// What to tell the admin when the Tally sign-in page sends them back here.
const SIGN_IN_OUTCOMES: Record<string, string> = {
  connected: "Tally connected",
  declined: "The sign-in was cancelled. Tally is not connected.",
  expired: "The sign-in took too long. Press Connect Tally to try again.",
  failed: "The Tally sign-in did not complete. Press Connect Tally to try again.",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function AdminClient({ setup }: { setup: Setup }) {
  const [tab, setTab] = useState<Tab>("expenses");
  const [period, setPeriod] = useState<Period>("month");
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [tally, setTally] = useState<TallyStatus>(NO_TALLY);

  const load = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([
        fetch("/api/employees").then((r) => r.json()),
        fetch("/api/expenses").then((r) => r.json()),
        fetch("/api/settings/tally").then((r) => r.json()),
      ]);
      setEmployees(a.employees ?? []);
      setExpenses(b.expenses ?? []);
      if (typeof c.connected === "boolean") setTally(c);
    } catch {
      setEmployees((list) => list ?? []);
      setToast("Could not load the data. Check the database connection and reload.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Coming back from the Tally sign-in page: open Settings and say how it went.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("tab") === "settings") setTab("settings");
    const outcome = SIGN_IN_OUTCOMES[query.get("tally") ?? ""];
    if (outcome) setToast(outcome);
    if (query.size > 0) window.history.replaceState(null, "", "/admin");
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const shown = useMemo(
    () =>
      expenses
        .filter((e) => inPeriod(e, period))
        .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)),
    [expenses, period],
  );
  // Tally takes the company's own currency only, so expenses in another
  // currency wait until an admin changes the amount to it.
  const ready = shown.filter(
    (e) =>
      !e.tallyPushedAt && !e.needsReview && e.amount > 0 && e.currency === HOME_CURRENCY,
  );
  const needDetails = shown.filter((e) => e.needsReview).length;
  const foreign = shown.filter(
    (e) => !e.tallyPushedAt && e.currency !== HOME_CURRENCY,
  ).length;

  const people = useMemo(
    () =>
      (employees ?? [])
        .map((p) => {
          const list = shown.filter((e) => e.employeeId === p.id);
          return { ...p, list, total: sum(list) };
        })
        .sort(
          (a, b) =>
            b.total - a.total ||
            b.list.length - a.list.length ||
            a.name.localeCompare(b.name),
        ),
    [employees, shown],
  );

  async function pushToTally() {
    setBusy(true);
    const res = await fetch("/api/tally", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "push", ids: ready.map((e) => e.id) }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setToast(data.error);
    await load();
    const n = `${data.pushed} ${data.pushed === 1 ? "expense" : "expenses"}`;
    if (data.via === "demo") {
      setToast(`${n} marked as pushed. Connect Tally in Settings to send them for real.`);
    } else if (data.failed > 0) {
      setToast(
        `${n} pushed to Tally, ${data.failed} not accepted${data.firstError ? `: ${data.firstError}` : "."}`,
      );
    } else {
      setToast(`${n} pushed to Tally`);
    }
  }

  async function downloadXml() {
    const res = await fetch("/api/tally", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "export", ids: shown.map((e) => e.id) }),
    });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `tally-expenses-${period}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const closeEditor = useCallback(() => setEditing(null), []);

  return (
    <div className="min-h-dvh pb-16">
      <TopBar title="Receipts" who="Admin" />
      {toast && <Toast message={toast} />}

      <main className="mx-auto max-w-2xl px-4 pt-5">
        <Segmented
          label="Section"
          value={tab}
          onChange={setTab}
          options={[
            { value: "expenses", label: "Expenses" },
            { value: "team", label: `Team${employees ? ` (${employees.length})` : ""}` },
            { value: "settings", label: "Settings" },
          ]}
        />

        {tab === "expenses" ? (
          <>
            <section className="pb-5 pt-8">
              <p className="text-[15px] text-muted">
                Team spend, {PERIODS.find((p) => p.value === period)!.label.toLowerCase()}
              </p>
              <BigTotal list={shown} />
              <p className="mt-3 text-[14px] text-muted">
                {shown.length} {shown.length === 1 ? "expense" : "expenses"},{" "}
                {ready.length} ready for Tally
                {needDetails > 0 && `, ${needDetails} missing details`}
                {foreign > 0 && `, ${foreign} not in ${HOME_CURRENCY_NAME}`}
              </p>
            </section>

            <Segmented label="Period" options={PERIODS} value={period} onChange={setPeriod} />

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={pushToTally}
                disabled={busy || ready.length === 0}
                className="flex-1 whitespace-nowrap"
              >
                {ready.length === 0
                  ? shown.length > 0 && shown.every((e) => e.tallyPushedAt)
                    ? "Everything is in Tally"
                    : "Nothing ready to push"
                  : busy
                    ? "Pushing to Tally"
                    : `Push ${ready.length} to Tally`}
              </Button>
              <Button kind="quiet" onClick={downloadXml} disabled={shown.length === 0}>
                Download Tally file
              </Button>
            </div>

            {employees === null ? (
              <p className="py-10 text-center text-[14px] text-faint">Loading expenses</p>
            ) : (
              <div className="mt-6 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
                {people.map((p) => (
                  <div key={p.id}>
                    <button
                      onClick={() => setOpen(open === p.id ? null : p.id)}
                      aria-expanded={open === p.id}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-bg"
                    >
                      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fill text-[13px] font-semibold text-muted">
                        {initials(p.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-medium">{p.name}</span>
                        <span className="block text-[13px] text-muted">
                          {p.list.length === 0
                            ? "Nothing logged"
                            : `${p.list.length} ${p.list.length === 1 ? "expense" : "expenses"}`}
                        </span>
                      </span>
                      <span className="tnum text-right text-[16px] font-medium">
                        {totalParts(p.list).join(" + ")}
                      </span>
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                        className={`shrink-0 text-faint transition-transform ${open === p.id ? "rotate-90" : ""}`}
                      >
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </button>
                    {open === p.id && p.list.length > 0 && (
                      <div className="divide-y divide-line border-t border-line bg-bg/60 pl-6">
                        {p.list.map((e) => (
                          <ExpenseRow key={e.id} e={e} onClick={() => setEditing(e)} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {people.length === 0 && (
                  <p className="px-4 py-8 text-center text-[15px] text-muted">
                    No one on the team yet. Add people in the Team tab.
                  </p>
                )}
              </div>
            )}

            {!setup.durable && (
              <p className="mt-8 rounded-2xl border border-line p-4 text-[14px] leading-snug text-muted">
                No database is connected, so anything saved here can disappear.
                See Settings for what to connect.
              </p>
            )}
          </>
        ) : tab === "team" ? (
          <Team employees={employees ?? []} onChange={load} onToast={setToast} />
        ) : (
          <Settings setup={setup} tally={tally} onTally={setTally} onToast={setToast} />
        )}
      </main>

      {editing && (
        <Sheet
          title={employees?.find((p) => p.id === editing.employeeId)?.name ?? "Expense"}
          onClose={closeEditor}
        >
          <ExpenseEditor
            key={editing.id}
            expense={editing}
            locked={false}
            onSaved={(saved) => {
              setExpenses((list) => list.map((e) => (e.id === saved.id ? saved : e)));
              setEditing(null);
            }}
            onDeleted={(id) => {
              setExpenses((list) => list.filter((e) => e.id !== id));
              setEditing(null);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

function Team({
  employees,
  onChange,
  onToast,
}: {
  employees: Employee[];
  onChange: () => Promise<void>;
  onToast: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pin }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error);
    setName("");
    setPin("");
    await onChange();
    onToast(`${data.employee.name} added`);
  }

  async function remove(p: Employee) {
    if (!window.confirm(`Remove ${p.name}? Their expenses and receipt photos are deleted too.`)) return;
    await fetch(`/api/employees/${p.id}`, { method: "DELETE" });
    await onChange();
    onToast(`${p.name} removed`);
  }

  return (
    <>
      <form onSubmit={add} className="mt-6 rounded-2xl bg-surface p-4">
        <h2 className="text-[17px] font-semibold tracking-tight">Add a team member</h2>
        <p className="mt-1 text-[14px] text-muted">
          They sign in with their name and the PIN you set here.
        </p>
        <div className="mt-3 grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Full name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="PIN">
            <input
              className={inputClass + " tnum"}
              inputMode="numeric"
              maxLength={6}
              placeholder="4 digits"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              required
            />
          </Field>
        </div>
        {error && <p className="mt-2 text-[14px] text-danger">{error}</p>}
        <Button type="submit" disabled={busy} className="mt-3 w-full">
          Add to team
        </Button>
      </form>

      <div className="mt-6 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
        {employees.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fill text-[13px] font-semibold text-muted">
              {initials(p.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-medium">{p.name}</span>
              <span className="tnum block text-[13px] text-muted">PIN {p.pin}</span>
            </span>
            <button onClick={() => remove(p)} className="text-[14px] font-medium text-danger">
              Remove
            </button>
          </div>
        ))}
        {employees.length === 0 && (
          <p className="px-4 py-8 text-center text-[15px] text-muted">No one on the team yet.</p>
        )}
      </div>
    </>
  );
}
