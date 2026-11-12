import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { removeEmployee } from "@/lib/store";

// Removes a team member together with their expenses and receipt photos.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const { id } = await params;
  if (!(await removeEmployee(id))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
