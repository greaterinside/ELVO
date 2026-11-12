"use client";

import { useState } from "react";
import { Button, Field, Segmented, inputClass } from "./ui";

type Role = "employee" | "admin";

export default function SignIn({ people }: { people: { id: string; name: string }[] }) {
  const [role, setRole] = useState<Role>(people.length ? "employee" : "admin");
  const [employeeId, setEmployeeId] = useState(people[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        role === "admin" ? { role, password } : { role, employeeId, pin },
      ),
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setError(data.error);
    }
    window.location.href = data.to;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="text-[40px] font-semibold leading-none tracking-tight">Receipts</h1>
      <p className="mt-3 text-[17px] leading-snug text-muted">
        Photograph a receipt. It is read, logged under your name and ready for
        accounts.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <Segmented
          label="Who is signing in"
          value={role}
          onChange={(r) => {
            setRole(r);
            setError("");
          }}
          options={[
            { value: "employee", label: "Team member" },
            { value: "admin", label: "Admin" },
          ]}
        />

        {role === "employee" && people.length === 0 ? (
          <p className="rounded-xl bg-surface p-4 text-[15px] leading-snug text-muted">
            No team members have been added yet. An admin needs to sign in and
            add the team first.
          </p>
        ) : role === "employee" ? (
          <>
            <Field label="Your name">
              <select
                className={inputClass}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="PIN">
              <input
                className={inputClass + " tnum tracking-[0.3em]"}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
              />
            </Field>
          </>
        ) : (
          <Field label="Admin password">
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
        )}

        {error && <p className="text-[14px] text-danger">{error}</p>}

        {(role === "admin" || people.length > 0) && (
          <Button type="submit" disabled={busy} className="w-full">
            Sign in
          </Button>
        )}
      </form>

      {role === "employee" && people.length > 0 && (
        <p className="mt-6 text-[13px] text-faint">
          Not on the list? Ask your admin to add you.
        </p>
      )}
    </main>
  );
}
