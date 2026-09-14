# Mutual Fund Returns Calculator

Upload a CSV of your Indian mutual fund transactions and see current value,
absolute return, per-transaction CAGR and portfolio XIRR. NAVs come from AMFI.

Not affiliated with or endorsed by any AMC. Not investment advice.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
```

One process serves both the UI and the API.

```bash
npm run build && npm start   # production
npm test                     # 210 tests
npm run lint
```

Deploys to Vercel with no configuration.

## Layout

```
app/
  page.jsx              upload screen
  sheet/page.jsx        results table
  glossary/page.jsx     every formula, written out
  api/nav/route.js      NAV lookup
  api/insights/route.js AI helper (optional)
components/             client components
lib/
  calculateUtils.js     all the maths, pure, no React, no I/O
  amfi.js               AMFI fetch, parse, cache, scheme matching
  grouping.js           folio + scheme grouping, XIRR per holding
  ter.js                expense ratio, display only, never in a calculation
  xlsx.js               minimal XLSX reader, no dependency
  pii.js                personal data scrubbing
  csvSession.js         upload to sheet handoff
  columnOrder.js        drag-to-reorder, persisted per table
  sorting.js  motion.js  miniMarkdown.js  rateLimit.js
middleware.js           HTTP Basic Auth over the whole app
```

`lib/calculateUtils.js` is the only module that decides what a number means and
`lib/amfi.js` is the only one that knows about AMFI. Keep it that way: the bugs
this project has had all came from those concerns spreading across call sites.

Your CSV never leaves the browser. PapaParse runs client-side, rows live in
`sessionStorage`, and only scheme names are sent to the server.

## CSV format

| Column | Required | Meaning |
|---|---|---|
| `SchemeName` | yes | Fund name, matched against AMFI |
| `Date` | yes | Purchase date |
| `NAV` | yes | NAV you bought at |
| `Amount` | yes | Amount invested |
| `FolioNo` | no | Shown and filterable |
| `Type` | no | Transaction type, filterable |

Dates may be `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD` or `11-Sep-2026`. The
order is detected across the whole column; if every row is ambiguous the app
says so and assumes `DD/MM/YYYY`.

## How the numbers work

See `/glossary` in the running app for the full write-up. In short:

```
units        = amount / purchaseNAV
currentValue = units * currentNAV
CAGR %       = ((currentNAV / purchaseNAV) ^ (1 / years) - 1) * 100
```

Value is always `units * NAV` and never reconstructed from CAGR. Day count is a
flat 365, matching Excel and Google Sheets, so CAGR and XIRR reconcile with a
spreadsheet and with each other.

Per-row CAGR is not additive; use XIRR. Expense ratio is already inside NAV, so
never subtract it again. Figures are unrealised and exclude exit load and tax.

## Table columns

Every table's columns can be reordered by dragging the grip beside a heading,
or with Alt plus the left and right arrow keys when the grip has focus. Drag
and drop has no keyboard equivalent of its own, so without the second path the
feature would not exist for keyboard users at all.

Widths resize by dragging the right edge of a heading, or with the arrow keys
when that handle has focus (Shift for larger steps). Double clicking it resets
that one column. Widths are clamped to a readable range, so a column cannot be
dragged to nothing or made wide enough to push the rest off screen.

The dropdown above each table shows and hides columns. Order is preserved
while hidden, so unhiding returns a column to where it was rather than
appending it, and the last visible column cannot be hidden.

All three are saved in `localStorage` per table. Order is stored as column
**keys**, not positions, and visibility as the *hidden* set: a layout saved
today survives a column being added, removed or renamed tomorrow, and a newly
shipped column defaults to visible rather than being hidden by an old
preference. One reset control clears order, widths and visibility together.

## Expense ratio

The TER column comes from AMFI's daily Format 7E file, mandated by SEBI Master
Circular para 11.2.2. It is joined to your holdings by scheme name using the
same normaliser the NAV matcher uses, which covers about 99% of currently
priced schemes; anything it cannot match shows nothing rather than a guess.

**It is display only.** NAV is already net of expenses (para 9.2.3: expenses
accrue into the NAV daily), so every return here is already after fees.
Subtracting TER again would double-count it. `lib/ter.js` is the only module
that knows about it and `lib/calculateUtils.js` must never import it; there is
a test asserting exactly that.

Fetched separately from NAV so a slow or failed TER lookup cannot delay or
break pricing. AMFI's file fills in over several days, so the most recent
well-populated date is used rather than today, and that date is shown.

**Exit load is deliberately absent.** SEBI imposes no disclosure format for it,
AMFI publishes nothing, and it exists only as prose in ~1,900 scheme documents
whose correct application depends on each transaction's purchase date. A
hand-maintained approximation shown to the decimal point would be worse than
its absence.

## Privacy

The AI helper is optional and user-invoked. Before anything is sent:

- **Folio numbers never leave the browser.** Holdings go as `H1`, `H2`.
- **Rupee amounts are off by default.** Percentages answer almost every
  question without revealing what the portfolio is worth. Opt in per session.
- **Free text is scrubbed** for PAN, Aadhaar, IFSC, email, phone and account
  numbers, on the client and again on the server so a tampered request cannot
  bypass it.
- **Failure reasons are reduced to fixed phrases**, because the UI version
  interpolates raw cell content from your file.
- The exact contents of the request are shown in the UI before you send.

## Data source and AMFI terms

AMFI's `NAVAll.txt`. AMFI is the body mandated to publish daily NAVs. SEBI does
not publish a NAV feed, and CAMS/KFintech closed third-party API access to
investor data in September 2025.

To keep the footprint small: nothing is written to disk, the snapshot is
revalidated with a conditional GET (a 0-byte 304 when unchanged), only the
schemes in a request are returned and capped at 200, responses are marked
`private, no-store`, every response carries AMFI attribution, and the client
identifies itself via `AMFI_USER_AGENT`.

**Unresolved:** AMFI's terms grant a "personal and non-commercial" licence and
restrict transmitting or publishing. That is about *how you deploy this*, not
cache duration. Running it privately is the case the licence describes; hosting
it publicly is in tension with it regardless of the measures above. Their terms
name written approval as the remedy. Not a legal opinion.

## Environment

All optional except Basic Auth in production.

| Variable | Default | Purpose |
|---|---|---|
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | none | Required in production; unset means the app returns 503 rather than exposing itself |
| `GROQ_API_KEY` | none | Enables the AI helper; absent, it reports itself unconfigured |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq deprecates models without notice |
| `NAV_REVALIDATE_MS` | `3600000` | AMFI snapshot revalidation interval |
| `AMFI_USER_AGENT` | generic | Put a real contact here before deploying publicly |
| `RATE_LIMIT_PER_MINUTE` | `30` | Per serverless instance, so a speed bump rather than a limit |

**Known gap:** rate limiting applies to the API routes, not to Basic Auth
attempts, so login guesses are unlimited. Use a long random password.
