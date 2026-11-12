import { NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai";
import { storageHealth } from "@/lib/store";

export const dynamic = "force-dynamic";

// A public status check with no private details: is the database answering,
// and is receipt reading switched on.
export async function GET() {
  const database = await storageHealth();
  return NextResponse.json(
    { database, receiptReading: aiEnabled ? "on" : "off" },
    { status: database === "error" ? 503 : 200 },
  );
}
