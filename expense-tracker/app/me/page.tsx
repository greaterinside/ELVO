import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getEmployees } from "@/lib/store";
import MeClient from "./me-client";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const session = await getSession();
  if (session?.role !== "employee") redirect("/");
  const me = (await getEmployees()).find((e) => e.id === session.employeeId);
  if (!me) redirect("/");
  return <MeClient name={me.name} />;
}
