import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai";
import { storageMode } from "@/lib/store";
import { presetTallyUrl } from "@/lib/tally-connection";
import AdminClient from "./admin-client";

export const dynamic = "force-dynamic";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export default async function AdminPage() {
  const session = await getSession();
  if (session?.role !== "admin") redirect("/");
  return (
    <AdminClient
      setup={{
        ai: aiEnabled,
        gateway: Boolean(process.env.TALLY_URL),
        durable: storageMode === "postgres" || !process.env.VERCEL,
        supabase: storageMode === "postgres",
        tallyPreset: hostOf(presetTallyUrl),
      }}
    />
  );
}
