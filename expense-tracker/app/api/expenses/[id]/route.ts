import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteExpense, getExpense, updateExpense } from "@/lib/store";
import {
  CATEGORIES,
  isCurrency,
  type Category,
  type Expense,
  type Session,
} from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

function canTouch(session: Session | null, expense: Expense): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  // Team members can change their own expenses until they are sent to Tally.
  return session.employeeId === expense.employeeId && !expense.tallyPushedAt;
}

export async function PATCH(request: Request, { params }: Context) {
  const session = await getSession();
  const { id } = await params;
  const expense = await getExpense(id);
  if (!expense) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!canTouch(session, expense)) {
    return NextResponse.json(
      { error: "This expense can no longer be changed." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter the amount paid." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "")) {
    return NextResponse.json({ error: "Choose the date of the expense." }, { status: 400 });
  }

  const updated: Expense = {
    ...expense,
    merchant: String(body.merchant ?? "").trim().slice(0, 120),
    description: String(body.description ?? "").trim().slice(0, 200) || "Expense",
    category: CATEGORIES.includes(body.category) ? (body.category as Category) : expense.category,
    amount: Math.round(amount * 100) / 100,
    currency: isCurrency(body.currency) ? body.currency : expense.currency,
    date: body.date,
    note: String(body.note ?? "").trim().slice(0, 500),
    needsReview: false,
  };
  await updateExpense(updated);
  return NextResponse.json({ expense: updated });
}

export async function DELETE(_request: Request, { params }: Context) {
  const session = await getSession();
  const { id } = await params;
  const expense = await getExpense(id);
  if (!expense) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!canTouch(session, expense)) {
    return NextResponse.json(
      { error: "This expense can no longer be deleted." },
      { status: 403 },
    );
  }
  await deleteExpense(id);
  return NextResponse.json({ ok: true });
}
