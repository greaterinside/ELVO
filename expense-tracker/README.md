# Receipts

Expense logging for a small team. A team member photographs a receipt and adds a
note; AI reads it and logs the expense under their name. An admin sees everyone's
spend by week or month and pushes it to Tally with one button.

## Signing in

The app starts empty. Sign in on the Admin tab first; the password is
`demo-admin` until you set `ADMIN_PASSWORD`. Then add each team member and their
PIN in the Team tab. They sign in with their name and that PIN.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Data is kept in the `.data` folder on your machine.

## Put it on Vercel

1. From this folder run `npx vercel` and follow the prompts (or push to GitHub and import the repo at vercel.com/new).
2. Connect Supabase, the database. Either add **Supabase** from the Storage tab of the Vercel project (it sets `POSTGRES_URL` for you), or copy the "Transaction pooler" connection string from an existing Supabase project into a `DATABASE_URL` environment variable. The tables are created automatically, in a schema named `receipts`. Without a database the data resets.
3. In Settings > Environment Variables add `ADMIN_PASSWORD`, `SESSION_SECRET` and `ANTHROPIC_API_KEY` (see `.env.example`).
4. Redeploy with `npx vercel --prod`.

## What each setting switches on

| Setting | Without it | With it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | People type the amount themselves | Receipt photos are read automatically |
| Supabase (`POSTGRES_URL` or `DATABASE_URL`) | Data on Vercel can reset | Data is kept, and visible in Supabase under the `receipts` schema |
| Tally connection (Admin > Settings) | Push marks expenses as sent | Push creates vouchers in Tally through your MCP server |
| `TALLY_MCP_URL` (optional) | The admin types the Tally MCP server address once | Connect Tally is a single button with nothing to type |
| `TALLY_URL` (optional) | Not used | Used instead when no MCP server is connected: posts vouchers to Tally's HTTP gateway |

## Tally

Each expense becomes a Journal voucher: the category ledger (Meals, Travel, and
so on) is debited and the employee's ledger is credited. Those ledgers must
already exist in the Tally company.

**Currency.** The default currency is UAE dirhams (AED, shown as `Dhs`). It is
set in two lines of `lib/types.ts` (`HOME_CURRENCY` and `HOME_CURRENCY_NAME`).
A receipt in another currency is logged in that currency, exactly as printed
(a US receipt shows `$`, not `Dhs`), and totals are shown per currency. Tally
vouchers are in dirhams, so such an expense is left out of the push and the
Tally file until an admin changes its amount and currency to dirhams.

**Connecting Tally.** In Admin > Settings, press **Connect Tally**. The app
finds the Tally MCP server's own sign-in page and sends the admin there; they
sign in, and come back connected. Nothing is copied or pasted. This is the MCP
standard's sign-in flow (OAuth), the same one behind "Connect" buttons in AI
apps.

- Set `TALLY_MCP_URL` to your Tally MCP server's address and the admin sees
  only the button. Without it, they type the server address once, then press
  the button.
- A server that needs no sign-in is connected straight away.
- A server that only gives out access tokens can still be connected under
  "Connect with an access token instead".

Tally is desktop software with no hosted sign-in of its own, so the MCP server
is a separate piece that sits next to Tally (several third-party ones exist).
It must be reachable from the internet over HTTPS, because the push runs from
the cloud, not from your office network.

**How the push works.** The expenses are handed to Claude together with the MCP
server's tools, and Claude creates one voucher per expense with whatever tools
that server provides. Only the expenses Tally confirms are marked "In Tally";
the rest stay unsent with the reason shown. This needs `ANTHROPIC_API_KEY`.

"Download Tally file" gives the same vouchers as an XML file you can import by
hand (Import Data > Vouchers).

## Where things are

- `app/me` is the team member screen, `app/admin` the admin panel, `app/sign-in.tsx` the sign-in.
- `app/api` holds the server routes; `lib/ai.ts` reads receipts, `lib/tally.ts` builds the Tally file, `lib/store.ts` is storage.

## Known limits of this first version

- PINs and the admin password are simple demo-grade sign-ins, and PINs are stored as plain text.
- Receipt photos are stored in the database as compressed images, which is fine for about 20 people.
