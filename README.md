# MeterTrace — Old Electricity Meter Tracking Portal

**Live:** https://metertrace.vercel.app

India is replacing about 25 crore conventional electricity meters with smart meters under the Revamped Distribution Sector Scheme (RDSS, deadline March 2028). Every installation removes one old meter, and most removed meters are e-waste: they contain a circuit board and a battery, and pre-2004 meters may contain lead. No public system tracks where they end up.

MeterTrace tracks every lot of removed meters from the consumer's premises to a **registered recycler**. It shows where meters go missing and blocks sales to unapproved buyers.

> Demonstration build with sample data. Names, organisations and figures are illustrative.

## What it does

| Step | Who records it | What is recorded |
|---|---|---|
| 1. Removal | Installer | date, state, district, division, meter type, count, condition |
| 2. Store receipt | DISCOM store officer | count actually received |
| 3. Sorting | Store officer | route: reuse / refurbish / recycle |
| 4. Disposal batch | Store officer | count, weighed kg, buyer, ₹/kg (**only Regulator-approved recyclers**) |
| 5. Recycler receipt | Recycler | count and kg received |
| 6. Recovery | Recycler | kg of copper, brass, plastic, circuit boards, batteries, hazardous residue |

- **Reconciliation:** every division is compared across removed → store → sorted → dispatched → recycler. The gap at each step is shown as *unaccounted meters* (number and %), and expected weight is compared with weighed weight.
- **8 automatic irregularity rules:** received > dispatched, dispatch > stock, out-of-order dates, weight outside tolerance, held in store too long, pre-2004 meters routed to reuse, batch closed without battery removal, recovered > batch weight. Each one raises an alert in the Regulator's review queue (open / under review / closed).
- **Data integrity:** records are append-only. PostgreSQL itself rejects UPDATE and DELETE, and corrections are new records linked to the original. Each record stores the SHA-256 hash of the previous one, and **Verify records** finds the first broken link. A demo button tampers with a record so the check can be shown.
- **Roles:** Installer, Store Officer, Recycler and Regulator, each with their own dashboard, plus a public page with no login. The Regulator can create and deactivate user accounts.
- **Dashboards:** totals, flow chart, unaccounted meters by state and division, lead-risk count, materials and ₹ scrap value, state ranking, and print-friendly reports for each role.
- **Inside a meter (public page):** what electromechanical and electronic meters are made of (components, material shares, hazards such as lead solder and lithium batteries) and why each must reach a registered recycler.

## Stack (all free tier)

| Layer | Technology | Where it runs |
|---|---|---|
| Frontend | Plain HTML, CSS and JavaScript (no framework, no build step) | Vercel (static hosting) |
| API / backend | TypeScript on Deno: a Supabase **Edge Function** | Supabase (Mumbai, ap-south-1) |
| Database | PostgreSQL 17 with triggers, PL/pgSQL functions and row-level security | Supabase |
| Proxy | Vercel rewrite: `/api/*` → Edge Function | Vercel |

```
Browser ──► metertrace.vercel.app (HTML/CSS/JS)
               │  fetch("/api/...")  + x-session token
               ▼
        Vercel rewrite /api/* ──► Supabase Edge Function "api" (TypeScript)
                                    • login & sessions, role checks
                                    • validation, 8 irregularity rules
                                    • reconciliation, dashboards, user admin
                                    │  service-role access only
                                    ▼
                                 PostgreSQL
                                    • records: append-only, hash-chained
                                    • triggers block UPDATE/DELETE
                                    • RLS on: browsers have no direct table access
```

## Project structure

```
metertrace/
├── public/                      Frontend (served by Vercel)
│   ├── index.html               Page shell: header, sidebar, footer
│   ├── style.css                Government-portal theme, responsive and print styles
│   └── app.js                   All pages: public, login, the 4 role dashboards, users, reports
├── supabase/
│   ├── functions/api/index.ts   Backend API (every endpoint, rule and calculation)
│   └── schema.sql               Database: tables, hash chain, append-only triggers, security
├── presentation/
│   └── MeterTrace-Presentation.pptx   19-slide project presentation (with speaker notes)
├── vercel.json                  Hosting config: /api proxy, security headers
└── README.md
```

## API endpoints

| Method | Path | Who |
|---|---|---|
| GET | `/api/public` | anyone: state summary and portal stats |
| POST | `/api/login`, `/api/logout` | anyone / signed-in |
| GET | `/api/state` | signed-in: dashboard data, scoped to the role |
| GET | `/api/ledger` | signed-in: records with hashes |
| POST | `/api/records` | the correct role only: REMOVAL, STORE_RECEIPT, SORT, BATCH, RECYCLER_RECEIPT, RECOVERY, CORRECTION |
| POST | `/api/verify` | signed-in: recheck the hash chain |
| POST | `/api/password` | signed-in: change own password |
| GET/POST | `/api/users`, `/api/users/:id/status` | Regulator: user accounts |
| POST | `/api/recyclers`, `/api/recyclers/:id/status` | Regulator: approve or suspend recyclers |
| POST | `/api/alerts/:id/status` | Regulator: review queue |
| POST | `/api/settings` | Regulator: weights, material %, prices, thresholds |
| POST | `/api/demo/reset`, `/api/demo/tamper`, `/api/demo/untamper` | signed-in (demo only) |

## Trying it out

Open the [live portal](https://metertrace.vercel.app). The public dashboard needs no login. For the role dashboards, the login page offers sample accounts for each role. All data is sample data, and anyone signed in can restore it with **Reset demo data**.

## Run or deploy it yourself

1. **Database:** create a Supabase project and run `supabase/schema.sql` in the SQL editor.
2. **API:** deploy `supabase/functions/api/index.ts` as an Edge Function named `api`, with JWT verification **off** (the function does its own login). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to it automatically.
3. **Frontend:** in `vercel.json` and `public/app.js` (`FUNCTION_URL`), replace the project ref `ruzshsoreacoigngpxnt` with your own. Then run `vercel deploy --prod` from this folder.
4. **Local preview:** serve `public/` with any static server (for example `npx http-server public`). On localhost the app calls the Edge Function URL directly.

No secret keys are stored in this repository.

## Settings disclaimer

Average meter weights, material content and scrap prices are **illustrative values. Verify them before use.** They can be edited on the Settings page.
