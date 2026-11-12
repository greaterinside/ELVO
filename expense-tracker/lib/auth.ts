import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import type { Session } from "./types";

const SECRET = process.env.SESSION_SECRET || "dev-only-secret-change-me";
const COOKIE = "receipts_session";

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "demo-admin";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac || !safeEqual(sign(body), mac)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
  } catch {
    return null;
  }
}

export async function setSession(session: Session): Promise<void> {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  (await cookies()).set(COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
