import { getSession } from "@/lib/auth";
import { getExpense, getImage } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const { id } = await params;
  const expense = await getExpense(id);
  const allowed =
    expense &&
    session &&
    (session.role === "admin" || session.employeeId === expense.employeeId);
  if (!allowed) return new Response("Not found", { status: 404 });

  const dataUrl = await getImage(id);
  const match = dataUrl && /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return new Response("Not found", { status: 404 });

  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Type": match[1],
      "Cache-Control": "private, max-age=86400",
    },
  });
}
