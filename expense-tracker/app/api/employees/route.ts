import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSession } from "@/lib/auth";
import { addEmployee, getEmployees } from "@/lib/store";

export const dynamic = "force-dynamic";

// Admins get the full list (with PINs, so they can hand them out).
// Everyone else gets names only, for the sign-in screen.
export async function GET() {
  const session = await getSession();
  const employees = await getEmployees();
  if (session?.role === "admin") return NextResponse.json({ employees });
  return NextResponse.json({
    employees: employees.map(({ id, name }) => ({ id, name })),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Enter the person's name." }, { status: 400 });
  }
  if (!/^\d{4,6}$/.test(pin)) {
    return NextResponse.json({ error: "The PIN must be 4 to 6 digits." }, { status: 400 });
  }
  const employees = await getEmployees();
  if (employees.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: `${name} is already on the team.` }, { status: 400 });
  }
  const employee = { id: randomUUID(), name, pin, createdAt: new Date().toISOString() };
  await addEmployee(employee);
  return NextResponse.json({ employee });
}
