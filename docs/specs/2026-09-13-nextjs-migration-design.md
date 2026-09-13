# Next.js migration — design

**Date:** 2026-09-13
**Status:** awaiting review
**Scope:** sub-project 1 of 3. Grouped XIRR and the Groq helper get their own specs.

## Goal

Ship frontend and backend as one Vercel deployment. Today the repo is a Vite SPA
plus a separate Express server, which needs two processes and a host that runs
Node continuously. After this, `vercel deploy` is the whole deployment story.

This migration adds **no new user-facing behaviour**. Same features, same
numbers, one deployable. That constraint is what makes it verifiable: the 20
existing calculation tests must pass unchanged throughout.

## Why this is first

The migration relocates every file and changes how the backend is expressed.
Building grouped XIRR or the AI helper before it would mean building them twice.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Router | App Router | What Vercel recommends; Pages Router is the pattern Next.js is moving away from |
| Data flow | Keep client-side | `Sheet.jsx` owns all state today. Moving to RSC is a separate, bigger change — not bundled into an infrastructure move. |
| NAV cache | Memory-only, per instance | Holds the "nothing stored durably" line taken for AMFI compliance. See "Known trade-offs". |
| Rate limiting | In-memory, documented as weak | No new infra. Still stops a naive loop. |
| CSV handoff | `sessionStorage` | `location.state` does not exist in Next.js; this also fixes refresh wiping data |

## Target structure

```
app/
  layout.jsx              root layout, metadata, globals.css
  page.jsx                Uploader route  ("use client")
  sheet/page.jsx          Sheet route     ("use client")
  globals.css             from frontend/src/index.css
  api/nav/route.js        GET handler — replaces backend/{server,routes,controllers}
components/
  Uploader.jsx  Sheet.jsx  PortfolioSummary.jsx  TableFilters.jsx  ErrorBoundary.jsx
lib/
  calculateUtils.js       moved verbatim from frontend/src/utils/
  calculateUtils.test.js  moved verbatim — the migration's safety net
  amfi.js                 AMFI parser + snapshot cache, extracted from navControllers.js
public/
  sample.csv
next.config.mjs           security headers (replaces helmet)
package.json              single, at root — replaces the two that exist today
vitest.config.js
```

`backend/` and `frontend/` are deleted once parity is confirmed.

## Module boundaries

**`lib/calculateUtils.js`** — pure functions, no I/O, no React. Unchanged by this
migration. Public surface: `computeRow`, `xirr`, `parseRowDate`, `detectDateOrder`,
`yearsBetween`, and the formatters. This is the only module that decides what a
number means, and it stays that way.

**`lib/amfi.js`** — owns everything about AMFI: the URL, the header-mapped
parser, the snapshot cache, conditional GET, and scheme matching. Exports
`getSnapshot()` and `lookup(index, query)`. Knows nothing about HTTP or React.
Extracting this from the controller is what makes the route handler trivial and
the parser independently testable — which it is not today.

**`app/api/nav/route.js`** — HTTP only: validate input, call `lib/amfi.js`, shape
the response, set headers. No parsing logic.

**Components** — unchanged in behaviour. Each gets `"use client"` because all five
use `useState`/`useEffect`.

## Express → Next mapping

| Today | After | Note |
|---|---|---|
| `cors()` | removed | Same origin; nothing to allow |
| `helmet()` | `headers()` in `next.config.mjs` | CSP, nosniff, frame-ancestors |
| `morgan` | Vercel logs | Query-string redaction is preserved by not logging URLs ourselves |
| `express-rate-limit` | in-memory limiter in the route handler | Weaker — see trade-offs |
| `express.static(dist)` | Next's own static serving | Removed entirely |
| SPA fallback `/{*splat}` | file-system routing | Removed entirely |
| graceful shutdown | n/a | No long-lived process |

## Data flow

1. `app/page.jsx` — user picks a CSV. PapaParse runs **in the browser**; nothing
   uploaded. Parsed rows written to `sessionStorage` under `mf:rows`.
2. Navigate to `/sheet`.
3. `app/sheet/page.jsx` reads `sessionStorage`, builds rows, prices what it can.
4. `GET /api/nav?schemes=…` with deduped names.
5. Route handler → `lib/amfi.js` → cached snapshot (or conditional GET to AMFI).
6. Response joined **by echoed scheme name**, never by array index.
7. `computeRow()` prices every row. Same function for load and edit.

`sessionStorage` holds the user's own financial data in their own browser, is
cleared when the tab closes, and never reaches the server. Amounts and folio
numbers stay client-side exactly as they do today.

## Known trade-offs

**Cold starts re-download 1.5 MB.** Next's docs state the default cache handler
does no in-memory caching for route handlers, and that memory is discarded on
instance teardown. A cold lambda has no ETag, so it cannot revalidate — it must
pull the full file (~1s). Warm instances serve from memory in ~2 ms and
revalidate with 0-byte 304s. Accepted: Vercel keeps instances warm under any real
traffic, and this preserves the compliance posture.

**Rate limiting counts per instance.** With N warm instances the effective limit
is roughly N× the configured one. Accepted as a speed bump. If this ever needs to
be real, Upstash Redis is ~20 lines. Documented in the README rather than left as
a false assurance.

**No streaming/RSC benefits.** Components stay client-rendered, so this migration
buys deployment simplicity, not speed. Moving NAV fetching server-side is a
possible follow-up, deliberately out of scope.

## Testing

The migration is a refactor, so the test strategy is **parity, not new coverage**:

1. `lib/calculateUtils.test.js` — 20 tests, must pass unchanged at every step.
   If these break, the calculation layer was touched, which it should not be.
2. New `lib/amfi.test.js` — extracting the parser finally makes it testable.
   Cover: header-mapped column resolution, throwing when a column disappears,
   plan/option matching, ambiguous results returning candidates rather than
   guessing. Fixture: a trimmed real `NAVAll.txt`.
3. Route handler smoke test against the dev server: the nine schemes from the
   user's console must all return 200 with numeric NAVs.
4. End-to-end parity: `public/sample.csv` through the running app must produce
   the same portfolio totals as today — invested ₹1,98,000, value ₹2,90,494,
   XIRR 10.53%, 1 row excluded. Any drift means the port changed a number.
5. `npm run build` must succeed and `next lint` must be clean.

## Migration order

Each step ends runnable, so a break is attributable.

1. Scaffold Next.js at root; single `package.json`; wire vitest.
2. Move `lib/calculateUtils.js` + tests. **Run tests — must be green.**
3. Extract `lib/amfi.js` from `navControllers.js`; add `lib/amfi.test.js`.
4. `app/api/nav/route.js`; verify the nine schemes return real NAVs.
5. Port components with `"use client"`; swap router state for `sessionStorage`.
6. `next.config.mjs` headers; in-memory rate limiter.
7. End-to-end parity check against `sample.csv`.
8. Delete `backend/` and `frontend/`; rewrite README for the new layout.
9. `vercel deploy`.

## Out of scope

- Grouped XIRR by folio + scheme — sub-project 2
- Groq AI helper — sub-project 3
- Server-side NAV fetching / RSC
- TypeScript
- Any change to how a number is computed

## Open question

The Render deployment currently serving this app, and the AMFI written-approval
question, are unresolved from earlier. Migration does not change that position
either way — but "deploy to Vercel" makes it live in a second place, so it should
be settled before step 9.
