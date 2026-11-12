"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Expense } from "@/lib/types";
import {
  BigTotal,
  Button,
  ExpenseEditor,
  ExpenseRow,
  PERIODS,
  Segmented,
  Sheet,
  TopBar,
  inPeriod,
  inputClass,
  niceDate,
  todayLocal,
  totalParts,
  type Period,
} from "../ui";

/** Shrinks a phone photo to a size that is quick to upload and still easy to read. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const PERIOD_WORDS: Record<Period, string> = {
  week: "this week",
  month: "this month",
  all: "in total",
};

export default function MeClient({ name }: { name: string }) {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ expense: Expense; intro?: string } | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/expenses")
      .then((r) => r.json())
      .then((d) => setExpenses(d.expenses ?? []))
      .catch(() => {
        setExpenses([]);
        setError("Could not load your expenses. Reload the page to try again.");
      });
  }, []);

  const shown = useMemo(
    () =>
      (expenses ?? [])
        .filter((e) => inPeriod(e, period))
        .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)),
    [expenses, period],
  );

  const days = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of shown) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()];
  }, [shown]);

  const waiting = shown.filter((e) => !e.tallyPushedAt).length;

  async function picked(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    setError("");
    setNote("");
    try {
      setPhoto(await shrink(file));
    } catch {
      setError("That photo could not be opened. Try taking it again.");
    }
  }

  async function logExpense() {
    if (!photo) return;
    setReading(true);
    setError("");
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: photo, note, today: todayLocal() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const expense: Expense = data.expense;
      setExpenses((list) => [expense, ...(list ?? [])]);
      setPhoto(null);
      setEditing({
        expense,
        intro: expense.needsReview
          ? data.aiEnabled
            ? "The receipt was hard to read. Fill in the amount and save."
            : "Receipt reading is not switched on yet. Fill in the amount and save."
          : "Logged. Check the details and change anything that looks wrong.",
      });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Could not save. Check your connection and try again.");
    } finally {
      setReading(false);
    }
  }

  const closeEditor = useCallback(() => setEditing(null), []);
  const closePhoto = useCallback(() => !reading && setPhoto(null), [reading]);

  return (
    <div className="min-h-dvh pb-44">
      <TopBar title="Receipts" who={name} />

      <main className="mx-auto max-w-2xl px-4">
        <section className="pb-5 pt-8">
          <p className="text-[15px] text-muted">You spent {PERIOD_WORDS[period]}</p>
          <BigTotal list={shown} />
          <p className="mt-3 text-[14px] text-muted">
            {shown.length === 0
              ? "No expenses yet."
              : `${shown.length} ${shown.length === 1 ? "expense" : "expenses"}, ${
                  waiting === 0 ? "all sent to accounts" : `${waiting} not sent to accounts yet`
                }`}
          </p>
        </section>

        <Segmented label="Period" options={PERIODS} value={period} onChange={setPeriod} />

        {expenses === null ? (
          <p className="py-10 text-center text-[14px] text-faint">Loading your expenses</p>
        ) : days.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-[17px] font-medium">Nothing logged {PERIOD_WORDS[period]}</p>
            <p className="mt-1 text-[15px] text-muted">
              Tap the camera button to add your first receipt.
            </p>
          </div>
        ) : (
          days.map(([date, list]) => (
            <section key={date} className="mt-6">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-[13px] font-medium text-muted">{niceDate(date)}</h2>
                <span className="tnum text-[13px] text-muted">{totalParts(list).join(" + ")}</span>
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
                {list.map((e) => (
                  <ExpenseRow key={e.id} e={e} onClick={() => setEditing({ expense: e })} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {/* The camera button: the one loud thing on the screen */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center bg-gradient-to-t from-bg via-bg/90 to-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pt-10">
        <button
          onClick={() => cameraInput.current?.click()}
          aria-label="Take a photo of a receipt"
          className="pointer-events-auto grid h-[72px] w-[72px] place-items-center rounded-full bg-accent text-white shadow-[0_8px_24px_rgba(0,113,227,0.35)] ring-4 ring-surface transition-transform active:scale-95"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1-1.6a1 1 0 0 1 .85-.4h4.9a1 1 0 0 1 .85.4l1 1.6h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" />
            <circle cx="12" cy="12.5" r="3.4" />
          </svg>
        </button>
        <button
          onClick={() => libraryInput.current?.click()}
          className="pointer-events-auto mt-2 text-[14px] font-medium text-accent"
        >
          Choose from photos
        </button>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={picked} />
        <input ref={libraryInput} type="file" accept="image/*" hidden onChange={picked} />
      </div>

      {error && !photo && (
        <p role="alert" className="fixed inset-x-4 bottom-40 z-20 mx-auto max-w-sm rounded-xl bg-surface p-3 text-center text-[14px] text-danger shadow">
          {error}
        </p>
      )}

      {photo && (
        <Sheet title="New expense" onClose={closePhoto}>
          <div className="space-y-3 pb-2">
            <div className="relative overflow-hidden rounded-2xl bg-fill">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Receipt you just photographed" className="max-h-72 w-full object-contain" />
              {reading && (
                <div aria-hidden className="scanline absolute inset-0 bg-gradient-to-b from-transparent via-accent/30 to-transparent" />
              )}
            </div>
            <textarea
              className={inputClass}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was this for? (optional)"
              disabled={reading}
            />
            {error && <p className="text-[14px] text-danger">{error}</p>}
            <Button onClick={logExpense} disabled={reading} className="w-full">
              {reading ? "Reading the receipt" : "Log expense"}
            </Button>
          </div>
        </Sheet>
      )}

      {editing && (
        <Sheet title={editing.intro ? "Expense logged" : "Expense"} onClose={closeEditor}>
          <ExpenseEditor
            key={editing.expense.id}
            expense={editing.expense}
            intro={editing.intro}
            locked={Boolean(editing.expense.tallyPushedAt)}
            onSaved={(saved) => {
              setExpenses((list) => (list ?? []).map((e) => (e.id === saved.id ? saved : e)));
              setEditing(null);
            }}
            onDeleted={(id) => {
              setExpenses((list) => (list ?? []).filter((e) => e.id !== id));
              setEditing(null);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
