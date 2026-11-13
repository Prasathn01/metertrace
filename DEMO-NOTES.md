# MeterTrace — demo logins and 5-minute viva script

**Live site:** https://metertrace.vercel.app
**Redeploy after changes:** run `vercel deploy --prod` in the `metertrace` folder (needs the Vercel CLI logged in)
**Backend API:** `https://ruzshsoreacoigngpxnt.supabase.co/functions/v1/api` (the site calls it as `/api/...`)

## Your administrator account

Email ID: `admin@metertrace.demo` (role: Regulator / Portal Administrator). The password is kept in `ADMIN-LOGIN.local.md` on your computer and is deliberately **not** in the repository.

This account is **not** shown on the login page. It can do everything the Regulator can, plus **Users & access**, where you create accounts (email ID + password) for anyone: installers, store officers, recycler staff and regulators. You can also deactivate them. You can change this password under **My account**. Keep it private.

## Demo logins (password for all: `demo123`)

| Role | Email | Dashboard |
|---|---|---|
| Installer (meter contractor) | installer@metertrace.demo | Log removal, My lots |
| DISCOM Store Officer | store@metertrace.demo | Receive → Sort → Create batch, Reconciliation |
| Recycler (GreenCore, Noida) | recycler@metertrace.demo | Confirm receipt → Record recovery |
| Regulator (SPCB) | regulator@metertrace.demo | Dashboard, Alerts, Recyclers, Settings |
| Public | no login | Public summary (home page) |

Other recycler logins: sahyadri@, ganga@, kaveri@metertrace.demo.
The login screen has a **Use** button next to each account, so there's no typing during the viva.

**Before the viva:** log in as anyone and click **Reset demo data** (top right). This gives 81 clean sample records and 8 alerts, one for each rule.

## Architecture (one-line answer for "how does it work?")

Browser (HTML/CSS/JS on Vercel) → `/api/*` → Supabase Edge Function (all business logic: login, role checks, 8 rules, reconciliation) → PostgreSQL (append-only, hash-chained `records` table). Everything runs on free tiers.

## Five-minute script

**0:00 — Public page (no login).** Open the site.
"25 crore old meters are being removed under RDSS and nobody tracks where they go." Scroll through:
- **How MeterTrace works**: the 6 steps and who records each one.
- **Who uses MeterTrace**: live count of user accounts by role, organisations, approved recyclers, states and divisions covered, and number of tamper-evident records.
- **State-wise status**: "Bihar is last: 150 meters in Patna East vanished between removal and the store."

**0:40 — Installer.** Log in → *Use* Installer. Log a removal: Bihar / Patna / Patna East, Electronic 2004+, 250 meters, faulty → **Save**.
"Every lot gets an ID automatically. The server saves it as a new record with a SHA-256 hash of the record before it."

**1:20 — Store Officer.** Log out → *Use* Store Officer.
1. **1. Receive** → confirm the new lot but type 240 instead of 250 → *10 unaccounted meters appear in reconciliation.*
2. **2. Sort** → pick LOT-TN-004 (a pre-2004 lot) → choose **Reuse** → the system warns, and the record is **flagged** to the Regulator (lead risk).
3. **3. Create batch** → pick the buyer **QuickScrap Traders (NOT APPROVED)** → **Blocked**, and the attempt is reported. Then choose **GreenCore** → saved.
4. **Reconciliation** tab → "Removed → store → sorted → dispatched → recycler, with the gap at every step in number and %, plus expected vs weighed weight."

**2:30 — Recycler.** Log out → *Use* Recycler. **1. Confirm receipt** → confirm B-MP-02. **2. Record recovery** → enter materials but leave **Batteries** blank → saved and **flagged** "closed without battery removal".

**3:10 — Regulator.** Log out → *Use* Regulator.
- **Dashboard**: totals, flow chart (red = meters lost between steps), unaccounted by state and division, lead-risk count, materials and ₹ scrap value, state ranking.
- **Alerts**: all 8 rules have fired at least once; change one to *Under review*. The status change itself goes into the ledger.
- **Recyclers**: approve *Narmada Recycling Works* → now the store can sell to it.
- **Settings**: shows "illustrative values, verify before use"; changing tolerance re-runs the rules.
- **Users & access** (log in as admin@ for this): create a login for a new store officer live. Show it appears in the list and in the public "Who uses MeterTrace" count. Deactivate it, and that person can no longer sign in.

**4:10 — Integrity (the key point).** **Records & integrity** tab:
1. **Verify records** → "All N records verified" (green chain).
2. **Demo: tamper with a record** → this edits LOT-BR-002 directly in the database, changing 1,400 → 1,250 to hide 150 missing meters.
3. **Verify records** → **"Chain broken at record #4"**: stored vs recalculated hash shown.
4. **Undo tamper** → verify again → green.
"Nobody can edit or delete records. The database itself refuses UPDATE and DELETE. Mistakes are fixed by a *correction* record linked to the original (see record LOT-UP-002: 800 corrected to 780)."

**4:45 — Report.** **Report** tab → **Print / save as PDF**: a clean printable report for each role.

## The 8 irregularity rules (all present in the sample data)

| Rule | Sample record |
|---|---|
| Received more than was sent | B-MH-01: recycler got 1,560 of 1,500 |
| Dispatch larger than stock | B-MH-02: 1,200 dispatched, 1,050 sorted |
| Date earlier than previous step | LOT-BR-003: store receipt before removal (alert closed) |
| Weight outside tolerance | B-UP-02: 1,150 kg vs 810 kg expected (alert under review) |
| Held in store too long | LOT-BR-002: 96 days, limit 30 |
| Pre-2004 meters sent to Reuse | LOT-UP-004 |
| Batch closed without battery removal | B-MH-01 |
| Recovered more than batch weight | B-BR-02: 1,115 kg from 1,045 kg |
| Sale to unapproved buyer (blocked) | try it live with QuickScrap Traders |

## Likely viva questions

- **Why can't the store just delete a bad record?** A trigger in PostgreSQL rejects UPDATE/DELETE on `records`. Corrections are new rows with `corrects = <old seq>`.
- **What does the hash chain prove?** Each record's hash covers its own data and the previous hash. Changing any old record breaks its hash and every link after it, and Verify finds the first broken one.
- **Who enforces roles?** The server. Each request carries a session token; the API checks the role before saving (try an Installer creating a batch: 403).
- **Free-tier limits?** Supabase pauses a free project after about 7 days without use. Open the site a day before the viva.
