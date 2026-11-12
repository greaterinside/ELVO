import postgres from "postgres";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  HOME_CURRENCY,
  isCurrency,
  type Employee,
  type Expense,
  type PendingSignIn,
  type TallySettings,
} from "./types";

// Storage: Supabase (Postgres) when a connection string is present, otherwise
// JSON files on disk for local development.
//
// POSTGRES_URL is what Vercel's Supabase integration sets. DATABASE_URL and
// SUPABASE_DB_URL are accepted for a Supabase project connected by hand; use
// the "Transaction pooler" connection string from the Supabase dashboard.
const rawUrl =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  "";

function connect(raw: string) {
  const url = new URL(raw);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  // Drop query flags such as ?pgbouncer=true: this driver would pass them to
  // the server as settings, and the server rejects ones it does not know.
  url.search = "";
  return postgres(url.toString(), {
    ssl: local ? false : "require",
    prepare: false, // required by Supabase's transaction pooler
    // One query at a time per connection. By default this driver sends several
    // queries down a connection without waiting ("pipelining"); through
    // Supabase's pooler that stalls any query that has parameters until the
    // database's 2 minute limit. Measured: stalls with it on, never with it off.
    max_pipeline: 1,
    fetch_types: false, // no array columns here, so skip the lookup on connect
    max: 3, // a few connections so parallel requests do not queue behind each other
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
}

// One client per server process. Kept on globalThis so that hot reloads in
// development, and the separate bundles Next builds per route, all share it
// instead of each opening their own connection.
const shared = globalThis as typeof globalThis & {
  __receiptsSql?: ReturnType<typeof connect> | null;
  __receiptsSchemaReady?: Promise<void> | null;
};
if (shared.__receiptsSql === undefined) {
  shared.__receiptsSql = rawUrl ? connect(rawUrl) : null;
}
const sql = shared.__receiptsSql;

export const storageMode: "postgres" | "file" = sql ? "postgres" : "file";

// Everything lives in its own "receipts" schema so it cannot collide with
// other tables in the same Supabase project, and is not exposed through
// Supabase's public Data API. Row level security is switched on as a second
// lock; this app connects as the owner, which is not subject to it.
const SCHEMA = `
create schema if not exists receipts;

create table if not exists receipts.employees (
  id text primary key,
  name text not null,
  pin text not null,
  created_at timestamptz not null default now()
);

create table if not exists receipts.expenses (
  id text primary key,
  employee_id text not null references receipts.employees(id) on delete cascade,
  merchant text not null default '',
  description text not null default '',
  category text not null,
  amount numeric(12,2) not null default 0,
  date date not null,
  note text not null default '',
  has_image boolean not null default false,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  tally_pushed_at timestamptz
);

-- Added after the first release: the currency printed on the receipt. Rows
-- from before it were logged as rupees, hence this default; the app always
-- sets the currency itself on new rows.
alter table receipts.expenses add column if not exists currency text not null default 'INR';

create index if not exists expenses_employee_idx on receipts.expenses (employee_id);

create table if not exists receipts.receipt_images (
  expense_id text primary key references receipts.expenses(id) on delete cascade,
  data_url text not null
);

create table if not exists receipts.settings (
  key text primary key,
  value jsonb not null
);

alter table receipts.employees enable row level security;
alter table receipts.expenses enable row level security;
alter table receipts.receipt_images enable row level security;
alter table receipts.settings enable row level security;
`;

// Creating tables takes exclusive locks, so it must not run on every server
// start: several instances starting together would block each other and every
// request behind them. So:
//   - Normally this is one cheap read that finds the tables already there.
//   - The very first time, or when a newer version of the app needs a column
//     that is not there yet, the setup runs inside a single transaction,
//     behind a lock that lets only one server instance do it.
// "Ready" means the newest thing the setup adds is present.
const SCHEMA_READY = `
  select to_regclass('receipts.settings') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'receipts' and table_name = 'expenses'
         and column_name = 'currency'
     ) as ready`;

async function ensureSchema(q: NonNullable<typeof sql>): Promise<void> {
  const first = await q.unsafe<{ ready: boolean }[]>(SCHEMA_READY);
  if (first[0]?.ready) return;

  await q.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(7323169)`;
    const again = await tx.unsafe<{ ready: boolean }[]>(SCHEMA_READY);
    if (!again[0]?.ready) await tx.unsafe(SCHEMA);
  });
}

/** Returns the database client once the tables exist. */
async function db() {
  shared.__receiptsSchemaReady ??= ensureSchema(sql!).catch((error) => {
    shared.__receiptsSchemaReady = null; // try again on the next request
    throw error;
  });
  await shared.__receiptsSchemaReady;
  return sql!;
}

/* ---------- row mapping ---------- */

type EmployeeRow = { id: string; name: string; pin: string; created_at: Date };
type ExpenseRow = {
  id: string;
  employee_id: string;
  merchant: string;
  description: string;
  category: Expense["category"];
  amount: string;
  currency: string;
  date: string;
  note: string;
  has_image: boolean;
  needs_review: boolean;
  created_at: Date;
  tally_pushed_at: Date | null;
};

const toEmployee = (r: EmployeeRow): Employee => ({
  id: r.id,
  name: r.name,
  pin: r.pin,
  createdAt: new Date(r.created_at).toISOString(),
});

const toExpense = (r: ExpenseRow): Expense => ({
  id: r.id,
  employeeId: r.employee_id,
  merchant: r.merchant,
  description: r.description,
  category: r.category,
  amount: Number(r.amount),
  currency: isCurrency(r.currency) ? r.currency : HOME_CURRENCY,
  date: r.date,
  note: r.note,
  hasImage: r.has_image,
  needsReview: r.needs_review,
  createdAt: new Date(r.created_at).toISOString(),
  tallyPushedAt: r.tally_pushed_at ? new Date(r.tally_pushed_at).toISOString() : null,
});

/* ---------- local file fallback ---------- */

const dir = process.env.VERCEL
  ? path.join(os.tmpdir(), "receipts-data")
  : path.join(process.cwd(), ".data");

const fileFor = (key: string) =>
  path.join(dir, key.replace(/[^a-z0-9_-]/gi, "_") + ".json");

async function readFile<T>(key: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(fileFor(key), "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeFile(key: string, value: unknown): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fileFor(key), JSON.stringify(value), "utf8");
}

const removeFile = (key: string) => fs.rm(fileFor(key), { force: true });

const fileEmployees = async () => (await readFile<Employee[]>("employees")) ?? [];
// Expenses saved before currencies existed have none: they take the default.
const fileExpenses = async () =>
  ((await readFile<Expense[]>("expenses")) ?? []).map((e) => ({
    ...e,
    currency: isCurrency(e.currency) ? e.currency : HOME_CURRENCY,
  }));

const newestFirst = (a: Expense, b: Expense) =>
  (b.date + b.createdAt).localeCompare(a.date + a.createdAt);

/* ---------- employees ---------- */

export async function getEmployees(): Promise<Employee[]> {
  if (!sql) return fileEmployees();
  const q = await db();
  const rows = await q<EmployeeRow[]>`
    select id, name, pin, created_at from receipts.employees order by created_at, name`;
  return rows.map(toEmployee);
}

export async function addEmployee(e: Employee): Promise<void> {
  if (!sql) return writeFile("employees", [...(await fileEmployees()), e]);
  const q = await db();
  await q`
    insert into receipts.employees (id, name, pin, created_at)
    values (${e.id}, ${e.name}, ${e.pin}, ${e.createdAt})`;
}

/** Removes a team member with their expenses and receipt photos. False if not found. */
export async function removeEmployee(id: string): Promise<boolean> {
  if (!sql) {
    const employees = await fileEmployees();
    if (!employees.some((e) => e.id === id)) return false;
    const expenses = await fileExpenses();
    await Promise.all(
      expenses
        .filter((e) => e.employeeId === id && e.hasImage)
        .map((e) => removeFile(`img_${e.id}`)),
    );
    await writeFile("expenses", expenses.filter((e) => e.employeeId !== id));
    await writeFile("employees", employees.filter((e) => e.id !== id));
    return true;
  }
  const q = await db();
  const rows = await q`delete from receipts.employees where id = ${id} returning id`;
  return rows.length > 0;
}

/* ---------- expenses ---------- */

const EXPENSE_COLUMNS = `id, employee_id, merchant, description, category, amount,
  currency, date::text as date, note, has_image, needs_review, created_at, tally_pushed_at`;

/** All expenses, newest first. Pass an employee id to get only theirs. */
export async function getExpenses(employeeId?: string): Promise<Expense[]> {
  if (!sql) {
    const all = await fileExpenses();
    return (employeeId ? all.filter((e) => e.employeeId === employeeId) : all).sort(newestFirst);
  }
  const q = await db();
  const rows = employeeId
    ? await q<ExpenseRow[]>`
        select ${q.unsafe(EXPENSE_COLUMNS)} from receipts.expenses
        where employee_id = ${employeeId} order by date desc, created_at desc`
    : await q<ExpenseRow[]>`
        select ${q.unsafe(EXPENSE_COLUMNS)} from receipts.expenses
        order by date desc, created_at desc`;
  return rows.map(toExpense);
}

export async function getExpense(id: string): Promise<Expense | null> {
  if (!sql) return (await fileExpenses()).find((e) => e.id === id) ?? null;
  const q = await db();
  const rows = await q<ExpenseRow[]>`
    select ${q.unsafe(EXPENSE_COLUMNS)} from receipts.expenses where id = ${id}`;
  return rows[0] ? toExpense(rows[0]) : null;
}

export async function addExpense(e: Expense, image: string | null): Promise<void> {
  if (!sql) {
    if (image) await writeFile(`img_${e.id}`, { d: image });
    return writeFile("expenses", [e, ...(await fileExpenses())]);
  }
  const q = await db();
  await q.begin(async (tx) => {
    await tx`
      insert into receipts.expenses
        (id, employee_id, merchant, description, category, amount, currency, date,
         note, has_image, needs_review, created_at, tally_pushed_at)
      values
        (${e.id}, ${e.employeeId}, ${e.merchant}, ${e.description}, ${e.category},
         ${e.amount}, ${e.currency}, ${e.date}, ${e.note}, ${e.hasImage}, ${e.needsReview},
         ${e.createdAt}, ${e.tallyPushedAt})`;
    if (image) {
      await tx`
        insert into receipts.receipt_images (expense_id, data_url)
        values (${e.id}, ${image})`;
    }
  });
}

/** Saves the editable details of an expense. */
export async function updateExpense(e: Expense): Promise<void> {
  if (!sql) {
    const all = await fileExpenses();
    return writeFile("expenses", all.map((x) => (x.id === e.id ? e : x)));
  }
  const q = await db();
  await q`
    update receipts.expenses set
      merchant = ${e.merchant}, description = ${e.description},
      category = ${e.category}, amount = ${e.amount}, currency = ${e.currency},
      date = ${e.date},
      note = ${e.note}, needs_review = ${e.needsReview}
    where id = ${e.id}`;
}

export async function deleteExpense(id: string): Promise<void> {
  if (!sql) {
    await removeFile(`img_${id}`);
    return writeFile("expenses", (await fileExpenses()).filter((e) => e.id !== id));
  }
  const q = await db();
  await q`delete from receipts.expenses where id = ${id}`;
}

/** Marks expenses as sent to Tally. */
export async function markPushed(ids: string[], at: string): Promise<void> {
  if (ids.length === 0) return;
  if (!sql) {
    const sent = new Set(ids);
    const all = await fileExpenses();
    return writeFile(
      "expenses",
      all.map((e) => (sent.has(e.id) ? { ...e, tallyPushedAt: at } : e)),
    );
  }
  const q = await db();
  await q`update receipts.expenses set tally_pushed_at = ${at} where id in ${q(ids)}`;
}

export async function getImage(id: string): Promise<string | null> {
  if (!sql) return (await readFile<{ d: string }>(`img_${id}`))?.d ?? null;
  const q = await db();
  const rows = await q<{ data_url: string }[]>`
    select data_url from receipts.receipt_images where expense_id = ${id}`;
  return rows[0]?.data_url ?? null;
}

/* ---------- settings ---------- */

async function getSetting<T>(key: string): Promise<T | null> {
  if (!sql) return readFile<T>(`settings_${key}`);
  const q = await db();
  const rows = await q<{ value: T }[]>`
    select value from receipts.settings where key = ${key}`;
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: object): Promise<void> {
  if (!sql) return writeFile(`settings_${key}`, value);
  const q = await db();
  await q`
    insert into receipts.settings (key, value) values (${key}, ${q.json(value as never)})
    on conflict (key) do update set value = excluded.value`;
}

async function deleteSetting(key: string): Promise<void> {
  if (!sql) return removeFile(`settings_${key}`);
  const q = await db();
  await q`delete from receipts.settings where key = ${key}`;
}

export const getTallySettings = () => getSetting<TallySettings>("tally");
export const saveTallySettings = (s: TallySettings) => setSetting("tally", s);
export const clearTallySettings = () => deleteSetting("tally");

export const getPendingSignIn = () => getSetting<PendingSignIn>("tally_signin");
export const savePendingSignIn = (p: PendingSignIn) => setSetting("tally_signin", p);
export const clearPendingSignIn = () => deleteSetting("tally_signin");

/* ---------- health ---------- */

/** Whether a database is configured and answering. */
export async function storageHealth(): Promise<"connected" | "not connected" | "error"> {
  if (!sql) return "not connected";
  try {
    const q = await db();
    await q`select 1`;
    return "connected";
  } catch (error) {
    console.error("Database check failed:", error);
    return "error";
  }
}
