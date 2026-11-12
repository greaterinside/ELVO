export const CATEGORIES = [
  "Travel",
  "Meals",
  "Fuel",
  "Lodging",
  "Office supplies",
  "Client entertainment",
  "Phone and internet",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Currencies an expense can be in. The company's own currency comes first. */
export const CURRENCIES = [
  "AED",
  "INR",
  "USD",
  "EUR",
  "GBP",
  "SGD",
  "AUD",
  "CAD",
  "JPY",
  "CNY",
  "HKD",
  "THB",
  "MYR",
  "SAR",
  "CHF",
  "LKR",
  "NPR",
  "BDT",
] as const;

export type Currency = (typeof CURRENCIES)[number];

/**
 * The company's own currency: UAE dirhams. It is the default for a new
 * expense, the one totals lead with, and the only one sent to Tally.
 * To change it, change these two lines.
 */
export const HOME_CURRENCY: Currency = "AED";
export const HOME_CURRENCY_NAME = "dirhams";

export const isCurrency = (value: unknown): value is Currency =>
  (CURRENCIES as readonly unknown[]).includes(value);

export type Employee = {
  id: string;
  name: string;
  pin: string;
  createdAt: string;
};

export type Expense = {
  id: string;
  employeeId: string;
  merchant: string;
  description: string;
  category: Category;
  amount: number;
  /** The currency the amount is in, as printed on the receipt. Never converted. */
  currency: Currency;
  /** Local calendar date of the expense, YYYY-MM-DD */
  date: string;
  note: string;
  hasImage: boolean;
  /** True when the details still need a person to fill them in */
  needsReview: boolean;
  createdAt: string;
  tallyPushedAt: string | null;
};

/**
 * Sign-in state for an MCP server that has its own sign-in page (OAuth).
 * Written and read only by lib/mcp-oauth.ts; never sent to the browser.
 */
export type McpOAuthState = {
  redirectUrl: string;
  client?: object;
  tokens?: object;
  discovery?: object;
  codeVerifier?: string;
  state?: string;
  /** When the access token runs out, in ms since 1970. Null if the server did not say. */
  expiresAt?: number | null;
};

/** The Tally MCP server the admin connected in Settings. Kept on the server. */
export type TallySettings = {
  mcpUrl: string;
  company: string;
  /** Tool names the server offered when the connection was last checked */
  tools: string[];
  checkedAt: string;
  /** Access token typed in by hand. Empty when signed in, or when none is needed. */
  token: string;
  /** Set when the admin connected by signing in on the server's own page. */
  oauth: McpOAuthState | null;
};

/** A sign-in that has been started but not finished yet. */
export type PendingSignIn = {
  mcpUrl: string;
  company: string;
  oauth: McpOAuthState;
  startedAt: number;
};

/** What the browser is allowed to see of the Tally connection. */
export type TallyStatus = {
  connected: boolean;
  mcpUrl: string;
  company: string;
  /** How the app gets in: signed in, a typed access token, or an open server */
  method: "signin" | "token" | "open" | null;
  tools: string[];
};

export type Session =
  | { role: "admin" }
  | { role: "employee"; employeeId: string };
