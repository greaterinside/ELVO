import { NextResponse } from "next/server";
import { ADMIN_PASSWORD, safeEqual, setSession } from "@/lib/auth";
import { getEmployees } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (body.role === "admin") {
    if (!safeEqual(String(body.password ?? ""), ADMIN_PASSWORD)) {
      return NextResponse.json({ error: "That password is not right." }, { status: 401 });
    }
    await setSession({ role: "admin" });
    return NextResponse.json({ ok: true, to: "/admin" });
  }

  const employee = (await getEmployees()).find((e) => e.id === body.employeeId);
  if (!employee || !safeEqual(String(body.pin ?? ""), employee.pin)) {
    return NextResponse.json({ error: "That PIN does not match." }, { status: 401 });
  }
  await setSession({ role: "employee", employeeId: employee.id });
  return NextResponse.json({ ok: true, to: "/me" });
}
