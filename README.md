# Mutual Fund Returns Calculator

Upload a CSV of your Indian mutual fund transactions and see current value,
absolute return, per-transaction CAGR and a portfolio XIRR. Current NAVs come
from AMFI.

Not affiliated with or endorsed by any AMC. Not investment advice.

## Running it

```bash
npm install                 # backend deps
npm install --prefix frontend

npm run dev                 # backend on :3000 (nodemon)
npm run dev --prefix frontend   # frontend on :5173 (vite)
```

The frontend talks to `http://localhost:3000` in development and to its own
origin in production.

Production:

```bash
npm run build               # installs both halves and builds the frontend
NODE_ENV=production npm start
```

`NODE_ENV=production` is **required** — the server only serves `frontend/dist`
when it is set. Without it the API works and every page returns 404.

## CSV format

| Column | Required | Meaning |
|---|---|---|
| `SchemeName` | yes | Fund name, matched against AMFI |
| `Date` | yes | Purchase date |
| `NAV` | yes | NAV you bought at |
| `Amount` | yes | Amount invested |
| `FolioNo` | no | Shown and filterable |
| `Type` | no | Transaction type, filterable |

Header matching ignores case and spacing, so `Scheme Name` and `schemename`
both work.

```csv
FolioNo,Date,SchemeName,Type,NAV,Amount
12345678,13/09/2021,SBI Contra Fund - Direct Plan - Growth,Purchase,65.2716,10000
```

Dates may be `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD` or `11-Sep-2026`. The
order is detected across the whole column; if every row is ambiguous the app
says so and assumes `DD/MM/YYYY`.

## How the numbers are computed

```
units            = amount / purchaseNAV
currentValue     = units * currentNAV
absoluteGain     = currentValue - amount
absoluteReturn % = (currentNAV / purchaseNAV - 1) * 100
CAGR %           = ((currentNAV / purchaseNAV) ^ (1 / years) - 1) * 100
```

Value is always `units × NAV` and is never reconstructed from CAGR.

- **CAGR is suppressed below one year.** Annualising a few weeks of growth
  produces a meaningless number, so the app shows absolute return instead.
- **Per-row CAGR is not additive.** Use the portfolio XIRR for an overall
  figure — averaging annualised rates across different holding periods
  describes nothing real.
- **Expense ratio is already in NAV.** Do not subtract it again.
- Figures are unrealised and exclude exit load and tax.
- Purchase NAV comes from your file and is not verified against the NAV
  actually published that day.

Rows that cannot be priced show `—` with a reason and are excluded from totals
rather than counted as zero.

## Data source and AMFI terms

AMFI's `NAVAll.txt`. AMFI is the body mandated to publish daily NAVs — SEBI does
not publish a NAV feed, and CAMS/KFintech closed third-party API access to
investor data in September 2025.

### What this app does to keep its footprint small

AMFI's [Terms of Use](https://www.amfiindia.com/terms-of-use) grant "a
non-exclusive, personal, non-transferable, non-sublicensable, limited and
revocable right" for "personal and non-commercial use only", state that you
"may not publicly perform, publicly display, transmit, publish... or create
derivative works based on anything available through the Site", and that "You
shall not store electronically any significant portion of any part of the
Site."

Accordingly:

- **Nothing is written to disk.** The NAV index lives in process memory only and
  is rebuilt from scratch on restart. There is no database, no file cache, no
  snapshot committed to the repo.
- **Conditional GET, not repeated downloads.** AMFI supports
  `If-Modified-Since`/`ETag` and returns a 0-byte `304` when nothing has
  changed, so a revalidation costs ~44 ms and no data transfer instead of
  re-pulling 1.5 MB. Tune with `NAV_REVALIDATE_MS`.
- **Only what was asked for is returned.** The API answers with the specific
  schemes in the request and is capped at 200 per call, so it cannot be walked
  to mirror the dataset. There is no bulk endpoint.
- **Responses are marked `Cache-Control: private, no-store`** so intermediaries
  do not retain them, and every response carries AMFI attribution.
- **The client identifies itself** via `AMFI_USER_AGENT`, so AMFI can see who is
  calling and contact or block the deployment.
- `robots.txt` on amfiindia.com disallows only `/admin/`, `/login/` and
  `/search/`, so `/spages/` is permitted to automated clients.

### What code cannot settle

The restriction that actually bites is **"personal and non-commercial use"** and
the bar on transmitting or publishing. That is a question about *how you deploy
this*, not about cache duration — no TTL makes a public, third-party-facing
deployment personal use.

- **Running it locally for your own portfolio** is the case the licence
  plainly describes.
- **Hosting it publicly for others** is in tension with that wording regardless
  of the measures above. AMFI's terms name the remedy themselves: written
  approval. Ask AMFI before deploying publicly, or get legal advice.

This is not a legal opinion, and none of the above should be read as one.

The file's column order **has changed before** (it gained `Plan` and `Option`,
shifting NAV from index 4 to 6, which silently broke every calculation). The
parser therefore resolves columns from the header row and throws if an expected
column is missing, so the next change fails loudly.

Matching requires scheme name, plan and option to agree. If more than one
scheme matches, the API returns `ambiguous` rather than guessing — a Regular
NAV shown against a Direct holding is a confidently wrong number.

## Environment

See `.env.example`. All variables are optional except in production.

## Tests

```bash
npm test        # vitest, from the repo root
```

`frontend/src/utils/calculateUtils.test.js` pins the arithmetic: the doubled
holding case, sub-1-year suppression, date parsing, and XIRR.
