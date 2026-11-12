"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CATEGORIES,
  CURRENCIES,
  HOME_CURRENCY,
  HOME_CURRENCY_NAME,
  type Currency,
  type Expense,
} from "@/lib/types";

/* ---------- formatting ---------- */

const LOCALE = "en-AE";

// Signs to show in place of the bare currency code.
const SIGNS: Partial<Record<Currency, string>> = { AED: "Dhs" };

const formatters = new Map<string, Intl.NumberFormat>();

/** Whole amounts print without decimals (Dhs 450); others with two (Dhs 450.50). */
function formatter(currency: Currency, whole = true): Intl.NumberFormat {
  const key = `${currency}:${whole}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: whole ? 0 : 2,
    });
    formatters.set(key, f);
  }
  return f;
}

/** The sign for a currency, for example Dhs or $. Falls back to its code. */
export const currencySymbol = (currency: Currency) =>
  SIGNS[currency] ??
  formatter(currency)
    .formatToParts(0)
    .find((p) => p.type === "currency")?.value ??
  currency;

export const money = (n: number, currency: Currency = HOME_CURRENCY) =>
  formatter(currency, Number.isInteger(Math.round(n * 100) / 100))
    .formatToParts(n)
    .map((p) => (p.type === "currency" ? currencySymbol(currency) : p.value))
    .join("");

export const todayLocal = () => new Date().toLocaleDateString("en-CA");

export function niceDate(date: string): string {
  const today = todayLocal();
  if (date === today) return "Today";
  const d = new Date(date + "T00:00:00");
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (date === y.toLocaleDateString("en-CA")) return "Yesterday";
  return d.toLocaleDateString(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/* ---------- periods ---------- */

export type Period = "week" | "month" | "all";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

export function periodStart(period: Period): string {
  if (period === "all") return "0000-00-00";
  const d = new Date();
  if (period === "week") {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  } else {
    d.setDate(1);
  }
  return d.toLocaleDateString("en-CA");
}

export const inPeriod = (e: Expense, period: Period) => e.date >= periodStart(period);

/** Total of the expenses in one currency. Other currencies are left out, never added in. */
export const sum = (list: Expense[], currency: Currency = HOME_CURRENCY) =>
  list.reduce((t, e) => (e.currency === currency ? t + e.amount : t), 0);

/**
 * Totals as text, one per currency, because amounts in different currencies
 * cannot be added together. The company's own currency comes first; an empty
 * list gives a single zero in it.
 */
export function totalParts(list: Expense[]): string[] {
  const parts = CURRENCIES.map((c) => [c, sum(list, c)] as const)
    .filter(([, total]) => total > 0)
    .map(([c, total]) => money(total, c));
  return parts.length ? parts : [money(0)];
}

/** A headline total: the main figure large, other currencies on a line beneath. */
export function BigTotal({ list }: { list: Expense[] }) {
  const [main, ...rest] = totalParts(list);
  // Step the size down for long figures so they stay on one line on a phone.
  const size =
    main.length > 13 ? "text-[34px]" : main.length > 10 ? "text-[42px]" : "text-[52px]";
  return (
    <>
      <p className={`tnum mt-1 whitespace-nowrap font-semibold leading-none tracking-tight ${size}`}>
        {main}
      </p>
      {rest.length > 0 && (
        <p className="tnum mt-2 text-[17px] font-medium text-muted">plus {rest.join(", ")}</p>
      )}
    </>
  );
}

/* ---------- small pieces ---------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-[10px] bg-fill p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
            o.value === value ? "bg-surface text-ink shadow-sm" : "text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  kind = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "primary" | "quiet" | "danger";
}) {
  const kinds = {
    primary: "bg-accent text-white active:bg-accent-press",
    quiet: "bg-fill text-ink active:bg-line",
    danger: "bg-transparent text-danger active:bg-fill",
  };
  return (
    <button
      {...rest}
      className={`rounded-xl px-4 py-3 text-[15px] font-semibold transition-colors disabled:opacity-40 ${kinds[kind]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-faint focus:border-accent focus:outline-none";

export function TopBar({ title, who }: { title: string; who: string }) {
  async function signOut() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/";
  }
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <span className="text-[17px] font-semibold tracking-tight">{title}</span>
        <span className="flex items-center gap-3 text-[14px] text-muted">
          <span className="max-w-[40vw] truncate">{who}</span>
          <button onClick={signOut} className="font-medium text-accent">
            Sign out
          </button>
        </span>
      </div>
    </header>
  );
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/35 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="sheet flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-bg shadow-2xl sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} className="text-[15px] font-medium text-accent">
            Close
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-40 mx-auto w-fit max-w-[90vw] rounded-2xl bg-ink px-4 py-2.5 text-center text-[14px] text-white shadow-lg"
    >
      {message}
    </div>
  );
}

/* ---------- expense row ---------- */

export function ExpenseRow({ e, onClick }: { e: Expense; onClick: () => void }) {
  const title = e.merchant || e.description;
  const detail = e.merchant ? e.description : e.category;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-bg"
    >
      {e.hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/expenses/${e.id}/image`}
          alt=""
          loading="lazy"
          className="h-11 w-11 shrink-0 rounded-lg bg-fill object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-fill text-[15px] font-semibold text-muted"
        >
          {title.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{title}</span>
        <span className="block truncate text-[13px] text-muted">{detail}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tnum block text-[15px] font-medium">
          {e.amount > 0 ? money(e.amount, e.currency) : "No amount"}
        </span>
        {e.needsReview ? (
          <span className="block text-[12px] font-medium text-warn">Needs details</span>
        ) : e.tallyPushedAt ? (
          <span className="block text-[12px] text-ok">In Tally</span>
        ) : (
          <span className="block text-[12px] text-faint">Not sent yet</span>
        )}
      </span>
    </button>
  );
}

/* ---------- expense editor ---------- */

export function ExpenseEditor({
  expense,
  locked,
  intro,
  onSaved,
  onDeleted,
}: {
  expense: Expense;
  /** True when the viewer may only look (already in Tally, and not an admin) */
  locked: boolean;
  intro?: string;
  onSaved: (e: Expense) => void;
  onDeleted: (id: string) => void;
}) {
  const [form, setForm] = useState({
    merchant: expense.merchant,
    description: expense.description,
    category: expense.category,
    amount: expense.amount > 0 ? String(expense.amount) : "",
    currency: expense.currency,
    date: expense.date,
    note: expense.note,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (ev: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: ev.target.value }));

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/expenses/${expense.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error);
    onSaved(data.expense);
  }

  async function remove() {
    if (!window.confirm("Delete this expense? This cannot be undone.")) return;
    setBusy(true);
    const res = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error);
    onDeleted(expense.id);
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {intro && <p className="text-[14px] text-muted">{intro}</p>}
      {expense.hasImage && (
        <a href={`/api/expenses/${expense.id}/image`} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/expenses/${expense.id}/image`}
            alt="Receipt photo"
            className="max-h-56 w-full rounded-2xl bg-fill object-contain"
          />
        </a>
      )}
      <fieldset disabled={locked || busy} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Amount (${currencySymbol(form.currency)})`}>
            <input
              className={inputClass + " tnum"}
              inputMode="decimal"
              value={form.amount}
              onChange={set("amount")}
              placeholder="0"
              required
            />
          </Field>
          <Field label="Currency">
            <select className={inputClass} value={form.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {currencySymbol(c) === c ? c : `${c} (${currencySymbol(c)})`}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {form.currency !== HOME_CURRENCY && (
          <p className="text-[13px] leading-snug text-muted">
            Kept in {form.currency} as on the receipt. Tally takes {HOME_CURRENCY_NAME} only,
            so this is not sent until the amount is changed to {HOME_CURRENCY_NAME}.
          </p>
        )}
        <Field label="Date">
          <input
            className={inputClass}
            type="date"
            value={form.date}
            max={todayLocal()}
            onChange={set("date")}
            required
          />
        </Field>
        <Field label="Paid to">
          <input
            className={inputClass}
            value={form.merchant}
            onChange={set("merchant")}
            placeholder="Shop, restaurant or vendor"
          />
        </Field>
        <Field label="What it was for">
          <input
            className={inputClass}
            value={form.description}
            onChange={set("description")}
            placeholder="Team lunch"
          />
        </Field>
        <Field label="Category">
          <select className={inputClass} value={form.category} onChange={set("category")}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <textarea
            className={inputClass}
            rows={2}
            value={form.note}
            onChange={set("note")}
            placeholder="Anything accounts should know"
          />
        </Field>
      </fieldset>
      {error && <p className="text-[14px] text-danger">{error}</p>}
      {locked ? (
        <p className="pb-2 text-[14px] text-muted">
          This expense is already in Tally, so it can no longer be changed here.
        </p>
      ) : (
        <div className="flex gap-2 pb-2 pt-1">
          <Button type="submit" disabled={busy} className="flex-1">
            Save changes
          </Button>
          <Button type="button" kind="danger" disabled={busy} onClick={remove}>
            Delete
          </Button>
        </div>
      )}
    </form>
  );
}
