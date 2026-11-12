import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSession } from "@/lib/auth";
import { aiEnabled, readReceipt } from "@/lib/ai";
import { addExpense, getExpenses } from "@/lib/store";
import { HOME_CURRENCY, type Expense } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const expenses = await getExpenses(
    session.role === "admin" ? undefined : session.employeeId,
  );
  return NextResponse.json({ expenses });
}

// A team member sends a receipt photo and an optional note; AI fills in the rest.
export async function POST(request: Request) {
  const session = await getSession();
  if (session?.role !== "employee") {
    return NextResponse.json({ error: "Sign in as a team member." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const image = typeof body.image === "string" ? body.image : "";
  const note = String(body.note ?? "").trim().slice(0, 500);
  const today = DATE.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);

  if (!image.startsWith("data:image/")) {
    return NextResponse.json({ error: "Add a photo of the receipt." }, { status: 400 });
  }
  if (image.length > 4_000_000) {
    return NextResponse.json({ error: "That photo is too large. Try again." }, { status: 413 });
  }

  const reading = await readReceipt(image, note);
  const amount = reading && reading.amount > 0 ? Math.round(reading.amount * 100) / 100 : 0;

  const expense: Expense = {
    id: randomUUID(),
    employeeId: session.employeeId,
    merchant: reading?.merchant ?? "",
    description: reading?.description || note || "Receipt",
    category: reading?.category ?? "Other",
    amount,
    currency: reading?.currency ?? HOME_CURRENCY,
    date: reading && DATE.test(reading.date) && reading.date <= today ? reading.date : today,
    note,
    hasImage: true,
    needsReview: !reading || !reading.is_receipt || amount === 0,
    createdAt: new Date().toISOString(),
    tallyPushedAt: null,
  };

  await addExpense(expense, image);
  return NextResponse.json({ expense, aiRead: Boolean(reading), aiEnabled });
}
