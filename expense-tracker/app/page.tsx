import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getEmployees } from "@/lib/store";
import SignIn from "./sign-in";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (session?.role === "admin") redirect("/admin");
  if (session?.role === "employee") redirect("/me");

  const people = (await getEmployees()).map(({ id, name }) => ({ id, name }));
  return <SignIn people={people} />;
}
