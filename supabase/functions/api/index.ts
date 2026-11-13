// MeterTrace API — Supabase Edge Function (Deno)
// All business logic lives here: auth, role checks, validation, irregularity rules,
// reconciliation and dashboards. The database only stores the append-only, hash-chained ledger.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// ---------- constants ----------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-session, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const STATES: Record<string, string> = {
  "Uttar Pradesh": "UP", "Maharashtra": "MH", "Bihar": "BR", "Madhya Pradesh": "MP", "Tamil Nadu": "TN",
};
const TYPES: Record<string, string> = {
  EM: "Electromechanical",
  E_PRE: "Electronic (before 2004)",
  E_POST: "Electronic (2004 or later)",
};
const CONDITIONS = ["working", "faulty", "damaged"];
const ROUTES = ["reuse", "refurbish", "recycle"];
const MATERIALS = ["copper", "brass", "plastic", "pcb", "battery", "hazardous"];
const KIND_ROLE: Record<string, string> = {
  REMOVAL: "installer", STORE_RECEIPT: "store", SORT: "store", BATCH: "store",
  RECYCLER_RECEIPT: "recycler", RECOVERY: "recycler",
};
const CORRECTABLE: Record<string, string[]> = {
  REMOVAL: ["date", "district", "division", "meter_type", "count", "condition"],
  STORE_RECEIPT: ["date", "count"],
  SORT: ["date", "route", "count"],
  BATCH: ["date", "count", "weight_kg", "price_per_kg"],
  RECYCLER_RECEIPT: ["date", "count", "weight_kg"],
  RECOVERY: ["date", ...MATERIALS],
};
const RULES: Record<string, string> = {
  received_exceeds_dispatched: "Received more than was sent",
  dispatch_exceeds_stock: "Dispatch larger than stock",
  date_order: "Date earlier than previous step",
  weight_mismatch: "Weight outside tolerance",
  store_overdue: "Held in store too long",
  pre2004_reuse: "Pre-2004 (lead) meters sent to Reuse",
  no_battery_entry: "Batch closed without battery removal",
  recovered_exceeds_batch: "Recovered more than batch weight",
  blocked_buyer: "Sale to unapproved buyer blocked",
};

const DEFAULT_SETTINGS = {
  avg_weight: { EM: 1.8, E_PRE: 1.2, E_POST: 0.9 },
  content: {
    EM: { copper: 12, brass: 5, plastic: 30, pcb: 0, battery: 0, hazardous: 0.5 },
    E_PRE: { copper: 5, brass: 3, plastic: 50, pcb: 15, battery: 2, hazardous: 3 },
    E_POST: { copper: 5, brass: 3, plastic: 55, pcb: 16, battery: 3, hazardous: 1 },
  },
  price: { copper: 700, brass: 450, plastic: 30, pcb: 180, battery: 50, hazardous: 0 },
  tolerance_pct: 10,
  store_days_limit: 30,
};

const DEFAULT_RECYCLERS = [
  { id: "REC-01", name: "GreenCore E-Recyclers, Noida", state: "Uttar Pradesh", reg_no: "UPPCB/EW/2021/0142", capacity_tpa: 6000, status: "approved" },
  { id: "REC-02", name: "Sahyadri Metal Recovery, Pune", state: "Maharashtra", reg_no: "MPCB/EW/2019/0388", capacity_tpa: 9000, status: "approved" },
  { id: "REC-03", name: "Ganga E-Waste Solutions, Patna", state: "Bihar", reg_no: "BSPCB/EW/2022/0057", capacity_tpa: 3500, status: "approved" },
  { id: "REC-04", name: "Narmada Recycling Works, Indore", state: "Madhya Pradesh", reg_no: "MPPCB/EW/2026/0011", capacity_tpa: 4000, status: "pending" },
  { id: "REC-05", name: "Kaveri Green Tech, Chennai", state: "Tamil Nadu", reg_no: "TNPCB/EW/2020/0216", capacity_tpa: 7500, status: "approved" },
  { id: "REC-06", name: "QuickScrap Traders, Thane", state: "Maharashtra", reg_no: "— (licence cancelled)", capacity_tpa: 0, status: "suspended" },
];

// ---------- helpers ----------
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "content-type": "application/json" } });
const r1 = (n: number) => Math.round(n * 10) / 10;
const todayISO = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST date
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const dAgo = (n: number) => new Date(Date.now() + 5.5 * 3600e3 - n * 86400000).toISOString().slice(0, 10);
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

async function sha256hex(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

// ---------- data loading ----------
async function loadAll() {
  const [rec, set, rcy, al, us] = await Promise.all([
    db.from("records").select("*").order("seq").range(0, 9999),
    db.from("settings").select("data").eq("id", 1).maybeSingle(),
    db.from("recyclers").select("*").order("id"),
    db.from("alerts").select("*").order("id"),
    db.from("users").select("id,email,name,role,org,recycler_id,active,last_login,created_at,created_by").order("created_at"),
  ]);
  return {
    records: must(rec) as any[],
    settings: ((must(set) as any)?.data ?? DEFAULT_SETTINGS) as typeof DEFAULT_SETTINGS,
    recyclers: must(rcy) as any[],
    alerts: must(al) as any[],
    users: must(us) as any[],
  };
}

// ---------- the core: derive lots, batches, rules, reconciliation ----------
function buildState(records: any[], settings: typeof DEFAULT_SETTINGS) {
  const eff = new Map<number, any>();
  const correctedBy = new Map<number, number[]>();
  for (const r of records) {
    if (r.kind === "CORRECTION") {
      const base = eff.get(Number(r.corrects));
      if (!base) continue;
      const { reason: _reason, ...fields } = r.payload;
      eff.set(Number(r.corrects), { ...base, ...fields });
      const list = correctedBy.get(Number(r.corrects)) ?? [];
      list.push(Number(r.seq));
      correctedBy.set(Number(r.corrects), list);
    } else eff.set(Number(r.seq), { ...r.payload });
  }

  const lots = new Map<string, any>();
  const batches = new Map<string, any>();
  const meta = (r: any) => ({ seq: Number(r.seq), corrected_by: correctedBy.get(Number(r.seq)) ?? [] });

  for (const r of records) {
    if (!KIND_ROLE[r.kind]) continue;
    const p = eff.get(Number(r.seq));
    if (r.kind === "REMOVAL") {
      lots.set(r.ref, { id: r.ref, ...p, count: num(p.count), created_by: r.created_by, ...meta(r), receipt: null, sort: null, batch: null });
    } else if (r.kind === "STORE_RECEIPT") {
      const l = lots.get(r.ref);
      if (l && !l.receipt) l.receipt = { ...p, count: num(p.count), ...meta(r) };
    } else if (r.kind === "SORT") {
      const l = lots.get(r.ref);
      if (l && !l.sort) l.sort = { ...p, count: num(p.count), ...meta(r) };
    } else if (r.kind === "BATCH") {
      batches.set(r.ref, {
        id: r.ref, ...p, count: num(p.count), weight_kg: num(p.weight_kg), price_per_kg: num(p.price_per_kg),
        ...meta(r), receipt: null, recovery: null,
      });
      for (const id of p.lots ?? []) { const l = lots.get(id); if (l && !l.batch) l.batch = r.ref; }
    } else if (r.kind === "RECYCLER_RECEIPT") {
      const b = batches.get(r.ref);
      if (b && !b.receipt) b.receipt = { ...p, count: num(p.count), weight_kg: num(p.weight_kg), ...meta(r) };
    } else if (r.kind === "RECOVERY") {
      const b = batches.get(r.ref);
      if (b && !b.recovery) {
        const rec: any = { ...p, ...meta(r) };
        for (const m of MATERIALS) rec[m] = p[m] === undefined || p[m] === null || p[m] === "" ? null : num(p[m]);
        rec.total = r1(MATERIALS.reduce((a, m) => a + (rec[m] || 0), 0));
        b.recovery = rec;
      }
    }
  }

  const W = settings.avg_weight as Record<string, number>;
  const C = settings.content as Record<string, Record<string, number>>;
  const tol = Number(settings.tolerance_pct);
  const lim = Number(settings.store_days_limit);
  const today = todayISO();

  // batch derived fields
  for (const b of batches.values()) {
    const bl = (b.lots ?? []).map((id: string) => lots.get(id)).filter(Boolean);
    b.state = bl[0]?.state; b.district = bl[0]?.district; b.division = bl[0]?.division;
    b.available = bl.reduce((a: number, l: any) => a + (l.sort?.route === "recycle" ? l.sort.count : 0), 0);
    const csum = bl.reduce((a: number, l: any) => a + (l.sort?.count ?? 0), 0);
    const wsum = bl.reduce((a: number, l: any) => a + (l.sort?.count ?? 0) * (W[l.meter_type] ?? 1), 0);
    b.avg_w = csum ? wsum / csum : 1;
    b.mix = {} as Record<string, number>;
    for (const l of bl) b.mix[l.meter_type] = (b.mix[l.meter_type] ?? 0) + (csum ? (l.sort?.count ?? 0) / csum : 0);
    b.types = Object.keys(b.mix);
    b.expected_kg = r1(b.count * b.avg_w);
    b.weight_diff_pct = b.expected_kg ? r1(((b.weight_kg - b.expected_kg) / b.expected_kg) * 100) : 0;
    b.value_rs = Math.round(b.weight_kg * b.price_per_kg);
    b.last_sort_date = bl.map((l: any) => l.sort?.date).filter(Boolean).sort().pop() ?? null;
    b.status = b.recovery ? "closed" : b.receipt ? "received" : "in_transit";
    b.pre2004 = bl.filter((l: any) => l.meter_type === "E_PRE").reduce((a: number, l: any) => a + (l.sort?.count ?? 0), 0);
  }

  // lot status label
  for (const l of lots.values()) {
    const b = l.batch ? batches.get(l.batch) : null;
    if (!l.receipt) l.status = "Awaiting store receipt";
    else if (!l.sort) l.status = "In store, not sorted";
    else if (l.sort.route === "reuse") l.status = "Sent for reuse";
    else if (l.sort.route === "refurbish") l.status = "Sent for refurbishment";
    else if (!b) l.status = "Awaiting dispatch";
    else l.status = b.status === "closed" ? "Recycled (closed)" : b.status === "received" ? "At recycler" : "Dispatched to recycler";
    l.stage = !l.receipt ? 1 : !l.sort ? 2 : l.sort.route !== "recycle" ? 6 : !b ? 3 : !b.receipt ? 4 : !b.recovery ? 5 : 6;
  }

  // ---- irregularity rules ----
  const flags: any[] = [];
  const add = (rule: string, ref: string, detail: string, loc: any) =>
    flags.push({ rule, ref, detail, state: loc?.state ?? null, division: loc?.division ?? null });

  for (const l of lots.values()) {
    if (l.receipt) {
      if (l.receipt.count > l.count)
        add("received_exceeds_dispatched", `${l.id}:store`, `${l.id}: store received ${l.receipt.count} meters but only ${l.count} were removed`, l);
      if (l.receipt.date < l.date)
        add("date_order", `${l.id}:receipt`, `${l.id}: store receipt dated ${l.receipt.date}, before removal on ${l.date}`, l);
      const exit = l.sort && l.sort.route !== "recycle" ? l.sort.date : l.batch ? batches.get(l.batch)?.date : null;
      const held = daysBetween(l.receipt.date, exit ?? today);
      if (held > lim)
        add("store_overdue", l.id, `${l.id}: held in store ${held} days${exit ? "" : " and still there"} (limit ${lim})`, l);
    }
    if (l.sort) {
      if (l.receipt && l.sort.date < l.receipt.date)
        add("date_order", `${l.id}:sort`, `${l.id}: sorted on ${l.sort.date}, before store receipt on ${l.receipt.date}`, l);
      if (l.receipt && l.sort.count > l.receipt.count)
        add("received_exceeds_dispatched", `${l.id}:sort`, `${l.id}: ${l.sort.count} meters sorted but only ${l.receipt.count} received`, l);
      if (l.meter_type === "E_PRE" && l.sort.route === "reuse")
        add("pre2004_reuse", l.id, `${l.id}: ${l.sort.count} pre-2004 meters (may contain lead) routed to Reuse`, l);
    }
  }
  for (const b of batches.values()) {
    if (b.count > b.available)
      add("dispatch_exceeds_stock", b.id, `${b.id}: batch of ${b.count} meters but only ${b.available} were sorted for recycling`, b);
    if (b.last_sort_date && b.date < b.last_sort_date)
      add("date_order", b.id, `${b.id}: batch dated ${b.date}, before sorting on ${b.last_sort_date}`, b);
    if (Math.abs(b.weight_diff_pct) > tol)
      add("weight_mismatch", b.id, `${b.id}: weighed ${b.weight_kg} kg vs expected ${b.expected_kg} kg (${b.weight_diff_pct > 0 ? "+" : ""}${b.weight_diff_pct}%, limit ±${tol}%)`, b);
    if (b.receipt) {
      if (b.receipt.count > b.count)
        add("received_exceeds_dispatched", `${b.id}:recycler`, `${b.id}: recycler received ${b.receipt.count} meters but only ${b.count} were dispatched`, b);
      if (b.receipt.date < b.date)
        add("date_order", `${b.id}:recv`, `${b.id}: recycler receipt dated ${b.receipt.date}, before dispatch on ${b.date}`, b);
      const rd = b.weight_kg ? r1(((b.receipt.weight_kg - b.weight_kg) / b.weight_kg) * 100) : 0;
      if (Math.abs(rd) > tol)
        add("weight_mismatch", `${b.id}:recv`, `${b.id}: recycler weighed ${b.receipt.weight_kg} kg vs ${b.weight_kg} kg dispatched (${rd > 0 ? "+" : ""}${rd}%)`, b);
    }
    if (b.recovery) {
      const elec = b.types.some((t: string) => t !== "EM");
      if (elec && !(b.recovery.battery > 0))
        add("no_battery_entry", b.id, `${b.id}: batch with electronic meters closed with no battery removal recorded`, b);
      const base = b.receipt?.weight_kg ?? b.weight_kg;
      if (b.recovery.total > base)
        add("recovered_exceeds_batch", b.id, `${b.id}: ${b.recovery.total} kg of material recovered from a batch weighing ${base} kg`, b);
      if (b.receipt && b.recovery.date < b.receipt.date)
        add("date_order", `${b.id}:recovery`, `${b.id}: recovery dated ${b.recovery.date}, before recycler receipt on ${b.receipt.date}`, b);
    }
  }

  // ---- reconciliation per division ----
  const divs = new Map<string, any>();
  const D = (x: any) => {
    const k = `${x.state}|${x.division}`;
    if (!divs.has(k)) divs.set(k, {
      state: x.state, district: x.district, division: x.division,
      removed: 0, received: 0, sorted: 0, reuse: 0, refurbish: 0, recycle: 0, dispatched: 0, recycler_received: 0,
      gap_receipt: 0, gap_sort: 0, gap_dispatch: 0, gap_recycler: 0, excess: 0, pending: 0,
      expected_kg: 0, weighed_kg: 0, pre2004: 0,
    });
    return divs.get(k);
  };
  for (const l of lots.values()) {
    const d = D(l);
    d.removed += l.count;
    if (l.meter_type === "E_PRE") d.pre2004 += l.count;
    if (!l.receipt) { d.pending += l.count; continue; }
    d.received += l.receipt.count;
    const g1 = l.count - l.receipt.count; if (g1 > 0) d.gap_receipt += g1; else d.excess += -g1;
    if (!l.sort) { d.pending += l.receipt.count; continue; }
    d.sorted += l.sort.count;
    const g2 = l.receipt.count - l.sort.count; if (g2 > 0) d.gap_sort += g2; else d.excess += -g2;
    d[l.sort.route] += l.sort.count;
    if (l.sort.route === "recycle" && !l.batch) d.pending += l.sort.count;
  }
  for (const b of batches.values()) {
    if (!b.state) continue;
    const d = D(b);
    d.dispatched += b.count;
    const g3 = b.available - b.count; if (g3 > 0) d.gap_dispatch += g3; else d.excess += -g3;
    d.expected_kg += b.expected_kg; d.weighed_kg += b.weight_kg;
    if (!b.receipt) { d.pending += b.count; continue; }
    d.recycler_received += b.receipt.count;
    const g4 = b.count - b.receipt.count; if (g4 > 0) d.gap_recycler += g4; else d.excess += -g4;
  }
  const finish = (d: any) => {
    d.unaccounted = d.gap_receipt + d.gap_sort + d.gap_dispatch + d.gap_recycler;
    d.unaccounted_pct = d.removed ? r1((d.unaccounted / d.removed) * 100) : 0;
    d.traced = d.reuse + d.refurbish + d.recycler_received;
    d.traced_pct = d.removed ? r1((Math.min(d.traced, d.removed) / d.removed) * 100) : 0;
    d.expected_kg = r1(d.expected_kg); d.weighed_kg = r1(d.weighed_kg);
    d.weight_diff_pct = d.expected_kg ? r1(((d.weighed_kg - d.expected_kg) / d.expected_kg) * 100) : 0;
    return d;
  };
  const divisions = [...divs.values()].map(finish).sort((a, b) => a.state.localeCompare(b.state) || a.division.localeCompare(b.division));

  const sumKeys = ["removed", "received", "sorted", "reuse", "refurbish", "recycle", "dispatched", "recycler_received",
    "gap_receipt", "gap_sort", "gap_dispatch", "gap_recycler", "excess", "pending", "expected_kg", "weighed_kg", "pre2004"];
  const agg = (list: any[], base: any) => { for (const d of list) for (const k of sumKeys) base[k] = (base[k] ?? 0) + d[k]; return finish(base); };
  const states = Object.keys(STATES).map((s) => agg(divisions.filter((d) => d.state === s), { state: s }))
    .filter((s) => s.removed > 0)
    .sort((a, b) => b.traced_pct - a.traced_pct);
  states.forEach((s, i) => (s.rank = i + 1));
  const totals = agg(divisions, {});

  // ---- materials & value ----
  const est: Record<string, number> = Object.fromEntries(MATERIALS.map((m) => [m, 0]));
  const actual: Record<string, number> = Object.fromEntries(MATERIALS.map((m) => [m, 0]));
  let sale_value = 0, closed_meters = 0;
  for (const b of batches.values()) {
    sale_value += b.value_rs;
    if (!b.receipt) continue;
    for (const t of b.types) for (const m of MATERIALS) est[m] += b.receipt.weight_kg * (b.mix[t] ?? 0) * ((C[t]?.[m] ?? 0) / 100);
    if (b.recovery) { closed_meters += b.receipt.count; for (const m of MATERIALS) actual[m] += b.recovery[m] || 0; }
  }
  const P = settings.price as Record<string, number>;
  const value = (o: Record<string, number>) => Math.round(MATERIALS.reduce((a, m) => a + o[m] * (P[m] ?? 0), 0));
  for (const m of MATERIALS) { est[m] = r1(est[m]); actual[m] = r1(actual[m]); }

  // ---- lead risk ----
  const lead = { removed: 0, at_recycler: 0, reuse: 0, unaccounted: 0, in_pipeline: 0 };
  for (const l of lots.values()) {
    if (l.meter_type !== "E_PRE") continue;
    lead.removed += l.count;
    if (l.receipt) lead.unaccounted += Math.max(0, l.count - l.receipt.count);
    if (l.sort?.route === "reuse") lead.reuse += l.sort.count;
    const b = l.batch ? batches.get(l.batch) : null;
    if (b?.receipt) lead.at_recycler += l.sort.count;
    else if (l.stage < 6) lead.in_pipeline += l.sort?.count ?? l.receipt?.count ?? l.count;
  }

  const flow = {
    removed: totals.removed, received: totals.received, sorted: totals.sorted,
    reuse: totals.reuse, refurbish: totals.refurbish, recycle: totals.recycle,
    dispatched: totals.dispatched, recycler_received: totals.recycler_received, closed: closed_meters,
    lost_receipt: totals.gap_receipt, lost_sort: totals.gap_sort, lost_dispatch: totals.gap_dispatch, lost_recycler: totals.gap_recycler,
  };

  return {
    lots: [...lots.values()], batches: [...batches.values()], flags, divisions, states, totals, flow, lead,
    materials: { estimated: est, recorded: actual, estimated_value_rs: value(est), recorded_value_rs: value(actual), sale_value_rs: sale_value },
  };
}

// ---------- alerts sync ----------
// Insert only alerts that do not exist yet (keeps alert numbers sequential; existing status is never overwritten)
async function syncAlerts(flags: any[]) {
  if (!flags.length) return 0;
  const existing = must(await db.from("alerts").select("rule,ref")) as any[];
  const have = new Set(existing.map((a) => `${a.rule}|${a.ref}`));
  const rows: any[] = [];
  for (const f of flags) {
    const k = `${f.rule}|${f.ref}`;
    if (have.has(k)) continue;
    have.add(k);
    rows.push({ rule: f.rule, ref: f.ref, detail: f.detail, state: f.state, division: f.division });
  }
  if (rows.length) must(await db.from("alerts").upsert(rows, { onConflict: "rule,ref", ignoreDuplicates: true }));
  return rows.length;
}

// ---------- auth ----------
async function getUser(req: Request) {
  const token = req.headers.get("x-session");
  if (!token) return null;
  const s = must(await db.from("sessions").select("user_id,expires_at").eq("token", token).maybeSingle()) as any;
  if (!s || Date.parse(s.expires_at) < Date.now()) return null;
  const u = must(await db.from("users").select("id,email,name,role,org,recycler_id,active,last_login").eq("id", s.user_id).maybeSingle()) as any;
  return u && u.active ? u : null;
}
const DEMO_IDS = new Set(["u-installer", "u-store", "u-rec1", "u-regulator", "u-rec2", "u-rec3", "u-rec5"]);
const ROLES = ["installer", "store", "recycler", "regulator"];
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
function newSalt() { return [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, "0")).join(""); }
function checkPassword(pw: string) {
  if (pw.length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, "Password must contain letters and numbers.");
}

// Who uses the portal (public numbers only: counts, never names or emails)
function portalStats(users: any[], recyclers: any[], records: any[], st: ReturnType<typeof buildState>) {
  const active = users.filter((u) => u.active);
  const by: Record<string, number> = { installer: 0, store: 0, recycler: 0, regulator: 0 };
  for (const u of active) by[u.role] = (by[u.role] ?? 0) + 1;
  const weekAgo = Date.now() - 7 * 86400000;
  return {
    users_total: active.length,
    by_role: by,
    organisations: new Set(active.map((u) => u.org)).size,
    recyclers_registered: recyclers.length,
    recyclers_approved: recyclers.filter((r) => r.status === "approved").length,
    states: st.states.length,
    divisions: st.divisions.length,
    records: records.length,
    lots: st.lots.length,
    batches: st.batches.length,
    active_7d: active.filter((u) => u.last_login && Date.parse(u.last_login) > weekAgo).length,
    last_activity: records.length ? records[records.length - 1].created_at : null,
  };
}
function requireRole(user: any, ...roles: string[]) {
  if (!user) throw new HttpError(401, "Please log in first.");
  if (roles.length && !roles.includes(user.role))
    throw new HttpError(403, `Only ${roles.map(roleName).join(" / ")} can do this. You are logged in as ${roleName(user.role)}.`);
}
const roleName = (r: string) => ({ installer: "Installer", store: "Store Officer", recycler: "Recycler", regulator: "Regulator" } as any)[r] ?? r;

async function append(items: any[]) {
  return must(await db.rpc("mt_append", { p_items: items })) as any[];
}

// ---------- validation for new records ----------
function validateRecord(kind: string, body: any, user: any, st: ReturnType<typeof buildState>, recyclers: any[]) {
  const p = body.payload ?? {};
  const today = todayISO();
  const errs: string[] = [];
  const needDate = () => {
    if (!isDate(p.date)) errs.push("Enter a valid date.");
    else if (p.date > today) errs.push("Date cannot be in the future.");
  };
  const needCount = (k = "count", allowZero = false) => {
    const n = num(p[k]);
    if (!Number.isInteger(n) || n < (allowZero ? 0 : 1)) errs.push(`${k === "count" ? "Count" : k} must be a whole number${allowZero ? "" : " above 0"}.`);
    else p[k] = n;
  };
  const needKg = (k: string, label: string, allowZero = false) => {
    const n = num(p[k]);
    if (!isFinite(n) || n < 0 || (!allowZero && n === 0)) errs.push(`${label} must be a number${allowZero ? " (0 or more)" : " above 0"}.`);
    else p[k] = r1(n);
  };
  const lot = (id: string) => st.lots.find((l) => l.id === id);
  const batch = (id: string) => st.batches.find((b) => b.id === id);
  let ref = body.ref;

  if (kind === "REMOVAL") {
    needDate(); needCount();
    if (!STATES[p.state]) errs.push("Choose a state.");
    for (const k of ["district", "division"]) if (!p[k] || String(p[k]).trim().length < 2) errs.push(`Enter the ${k}.`);
    if (!TYPES[p.meter_type]) errs.push("Choose a meter type.");
    if (!CONDITIONS.includes(p.condition)) errs.push("Choose the condition.");
    p.district = String(p.district ?? "").trim(); p.division = String(p.division ?? "").trim();
    if (!errs.length) {
      const code = STATES[p.state];
      const n = st.lots.filter((l) => l.id.startsWith(`LOT-${code}-`)).length + 1;
      ref = `LOT-${code}-${String(n).padStart(3, "0")}`;
    }
  } else if (kind === "STORE_RECEIPT") {
    const l = lot(ref);
    if (!l) errs.push("Choose a lot.");
    else if (l.receipt) errs.push(`${ref} was already received. Use a correction record to change it.`);
    needDate(); needCount("count", true);
  } else if (kind === "SORT") {
    const l = lot(ref);
    if (!l) errs.push("Choose a lot.");
    else if (!l.receipt) errs.push(`${ref} has not been received at the store yet.`);
    else if (l.sort) errs.push(`${ref} was already sorted. Use a correction record to change it.`);
    if (!ROUTES.includes(p.route)) errs.push("Choose a route: Reuse, Refurbish or Recycle.");
    needDate();
    if (p.count === undefined || p.count === "") p.count = l?.receipt?.count;
    needCount("count", true);
  } else if (kind === "BATCH") {
    const ids: string[] = Array.isArray(p.lots) ? p.lots : [];
    if (!ids.length) errs.push("Select at least one lot sorted for recycling.");
    const ls = ids.map(lot);
    ls.forEach((l, i) => {
      if (!l) errs.push(`Lot ${ids[i]} not found.`);
      else if (l.sort?.route !== "recycle") errs.push(`${l.id} is not sorted for recycling.`);
      else if (l.batch) errs.push(`${l.id} is already in batch ${l.batch}.`);
    });
    const divsSet = new Set(ls.filter(Boolean).map((l: any) => `${l.state}|${l.division}`));
    if (divsSet.size > 1) errs.push("All lots in a batch must come from the same division.");
    needDate(); needCount(); needKg("weight_kg", "Weighed weight"); needKg("price_per_kg", "Sale price per kg", true);
    // buyer check happens separately (it must block AND raise an alert)
    if (!errs.length) {
      const code = STATES[(ls[0] as any).state];
      const n = st.batches.filter((b) => b.id.startsWith(`B-${code}-`)).length + 1;
      ref = `B-${code}-${String(n).padStart(2, "0")}`;
    }
  } else if (kind === "RECYCLER_RECEIPT") {
    const b = batch(ref);
    if (!b) errs.push("Choose a batch.");
    else if (b.buyer_id !== user.recycler_id) errs.push(`Batch ${ref} was not sold to your organisation.`);
    else if (b.receipt) errs.push(`${ref} was already received. Use a correction record to change it.`);
    needDate(); needCount("count", true); needKg("weight_kg", "Weight received");
  } else if (kind === "RECOVERY") {
    const b = batch(ref);
    if (!b) errs.push("Choose a batch.");
    else if (b.buyer_id !== user.recycler_id) errs.push(`Batch ${ref} was not sold to your organisation.`);
    else if (!b.receipt) errs.push(`Confirm receipt of ${ref} first.`);
    else if (b.recovery) errs.push(`Recovery for ${ref} is already recorded. Use a correction record to change it.`);
    needDate();
    for (const m of MATERIALS) {
      if (p[m] === undefined || p[m] === null || p[m] === "") { if (m === "battery") p[m] = null; else p[m] = 0; continue; }
      needKg(m, m, true);
    }
  } else {
    errs.push("Unknown record type.");
  }
  if (errs.length) throw new HttpError(400, errs.join(" "));
  return { ref, payload: p, recyclers };
}

// ---------- demo seed ----------
type Lot = [string, string, string, string, string, number, string, number, [number, number] | null, [number, string, number] | null];
function seedItems() {
  const S = { up: "Uttar Pradesh", mh: "Maharashtra", br: "Bihar", mp: "Madhya Pradesh", tn: "Tamil Nadu" };
  // id, state, district, division, type, count, condition, removed(days ago), receipt[daysAgo,count], sort[daysAgo,route,count]
  const lots: Lot[] = [
    ["LOT-UP-001", S.up, "Lucknow", "Lucknow Central", "E_POST", 1200, "faulty", 95, [92, 1200], [88, "recycle", 1200]],
    ["LOT-UP-002", S.up, "Lucknow", "Lucknow Central", "EM", 800, "faulty", 90, [87, 760], [85, "recycle", 760]],
    ["LOT-UP-003", S.up, "Lucknow", "Lucknow Central", "E_POST", 500, "working", 80, [78, 500], [75, "reuse", 500]],
    ["LOT-UP-004", S.up, "Kanpur Nagar", "Kanpur Urban", "E_PRE", 600, "working", 70, [68, 600], [60, "reuse", 600]], // IRREGULAR: pre-2004 to reuse
    ["LOT-UP-005", S.up, "Kanpur Nagar", "Kanpur Urban", "E_POST", 900, "faulty", 60, [58, 900], [55, "recycle", 900]],
    ["LOT-UP-006", S.up, "Kanpur Nagar", "Kanpur Urban", "EM", 400, "faulty", 6, null, null],
    ["LOT-MH-001", S.mh, "Pune", "Pune Urban", "E_POST", 1500, "faulty", 100, [97, 1500], [94, "recycle", 1500]],
    ["LOT-MH-002", S.mh, "Pune", "Pune Urban", "E_PRE", 700, "faulty", 75, [73, 700], [70, "refurbish", 700]],
    ["LOT-MH-003", S.mh, "Nagpur", "Nagpur City", "EM", 1100, "faulty", 65, [62, 1050], [58, "recycle", 1050]],
    ["LOT-MH-004", S.mh, "Nagpur", "Nagpur City", "E_POST", 650, "working", 30, [28, 650], [26, "reuse", 650]],
    ["LOT-BR-001", S.br, "Patna", "Patna East", "E_POST", 1000, "faulty", 110, [105, 1000], [100, "recycle", 1000]],
    ["LOT-BR-002", S.br, "Patna", "Patna East", "EM", 1400, "damaged", 100, [96, 1250], null], // IRREGULAR: held in store
    ["LOT-BR-003", S.br, "Gaya", "Gaya Urban", "E_PRE", 900, "faulty", 55, [57, 900], [50, "recycle", 900]], // IRREGULAR: receipt before removal
    ["LOT-MP-001", S.mp, "Bhopal", "Bhopal City", "E_POST", 1300, "faulty", 85, [82, 1300], [78, "recycle", 1300]],
    ["LOT-MP-002", S.mp, "Bhopal", "Bhopal City", "EM", 600, "faulty", 25, [24, 600], [20, "recycle", 600]],
    ["LOT-MP-003", S.mp, "Indore", "Indore West", "E_POST", 950, "faulty", 50, [48, 900], [45, "recycle", 900]],
    ["LOT-TN-001", S.tn, "Chennai", "Chennai North", "E_POST", 1600, "faulty", 95, [92, 1600], [90, "recycle", 1600]],
    ["LOT-TN-002", S.tn, "Chennai", "Chennai North", "E_POST", 800, "working", 45, [43, 800], [40, "reuse", 800]],
    ["LOT-TN-003", S.tn, "Coimbatore", "Coimbatore Urban", "EM", 700, "faulty", 35, [33, 700], [30, "recycle", 700]],
    ["LOT-TN-004", S.tn, "Coimbatore", "Coimbatore Urban", "E_PRE", 500, "faulty", 4, null, null],
  ];
  const recyclerUser: Record<string, string> = { "REC-01": "u-rec1", "REC-02": "u-rec2", "REC-03": "u-rec3", "REC-05": "u-rec5" };
  const rname = (id: string) => DEFAULT_RECYCLERS.find((r) => r.id === id)!.name;
  // id, lots, daysAgo, count, kg, buyer, price, receipt[daysAgo,count,kg], recovery
  const batches: [string, string[], number, number, number, string, number, [number, number, number] | null, Record<string, number | null> & { d?: number } | null][] = [
    ["B-UP-01", ["LOT-UP-001", "LOT-UP-002"], 70, 1960, 2420, "REC-01", 62, [66, 1960, 2410], { d: 50, copper: 180, brass: 70, plastic: 900, pcb: 160, battery: 30, hazardous: 12 }],
    ["B-UP-02", ["LOT-UP-005"], 50, 900, 1150, "REC-01", 60, [47, 900, 1140], null], // IRREGULAR: weight +42%
    ["B-MH-01", ["LOT-MH-001"], 85, 1500, 1365, "REC-02", 64, [80, 1560, 1370], { d: 60, copper: 70, brass: 40, plastic: 700, pcb: 210, battery: null, hazardous: 8 }], // IRREGULAR: received>dispatched, no battery
    ["B-MH-02", ["LOT-MH-003"], 54, 1200, 2150, "REC-02", 58, [50, 1200, 2140], { d: 35, copper: 260, brass: 110, plastic: 600, pcb: 0, battery: 0, hazardous: 5 }], // IRREGULAR: dispatch > stock
    ["B-BR-01", ["LOT-BR-001"], 90, 1000, 905, "REC-03", 55, [86, 1000, 900], { d: 70, copper: 45, brass: 25, plastic: 500, pcb: 140, battery: 28, hazardous: 9 }],
    ["B-BR-02", ["LOT-BR-003"], 45, 880, 1050, "REC-03", 57, [40, 880, 1045], { d: 30, copper: 60, brass: 30, plastic: 520, pcb: 180, battery: 35, hazardous: 290 }], // IRREGULAR: recovered > batch
    ["B-MP-01", ["LOT-MP-001"], 72, 1300, 1180, "REC-01", 61, [68, 1300, 1175], null],
    ["B-MP-02", ["LOT-MP-003"], 40, 900, 820, "REC-01", 60, null, null],
    ["B-TN-01", ["LOT-TN-001"], 80, 1600, 1450, "REC-05", 66, [76, 1600, 1448], { d: 60, copper: 75, brass: 45, plastic: 760, pcb: 230, battery: 45, hazardous: 12 }],
    ["B-TN-02", ["LOT-TN-003"], 25, 700, 1255, "REC-05", 59, [22, 700, 1250], null],
  ];

  const items: any[] = [];
  const it = (kind: string, ref: string, payload: any, by: string, role: string) => items.push({ kind, ref, payload, by, role });
  // emit in roughly chronological order of business date so the ledger reads naturally
  const events: { t: number; f: () => void }[] = [];
  for (const [id, state, district, division, type, count, cond, rd, rc, so] of lots) {
    events.push({ t: rd, f: () => it("REMOVAL", id, { date: dAgo(rd), state, district, division, meter_type: type, count, condition: cond }, "u-installer", "installer") });
    // ledger order must follow the workflow even when a business date is (deliberately) out of order
    const tRc = rc ? Math.min(rc[0], rd) - 0.1 : rd;
    if (rc) events.push({ t: tRc, f: () => it("STORE_RECEIPT", id, { date: dAgo(rc[0]), count: rc[1] }, "u-store", "store") });
    if (so) events.push({ t: Math.min(so[0], tRc) - 0.2, f: () => it("SORT", id, { date: dAgo(so[0]), route: so[1], count: so[2] }, "u-store", "store") });
  }
  for (const [id, bl, bd, count, kg, buyer, price, rr, rec] of batches) {
    events.push({ t: bd - 0.3, f: () => it("BATCH", id, { date: dAgo(bd), lots: bl, count, weight_kg: kg, buyer_id: buyer, buyer_name: rname(buyer), price_per_kg: price }, "u-store", "store") });
    if (rr) events.push({ t: rr[0] - 0.4, f: () => it("RECYCLER_RECEIPT", id, { date: dAgo(rr[0]), count: rr[1], weight_kg: rr[2] }, recyclerUser[buyer], "recycler") });
    if (rec) {
      const { d, ...m } = rec;
      events.push({ t: (d as number) - 0.5, f: () => it("RECOVERY", id, { date: dAgo(d as number), ...m }, recyclerUser[buyer], "recycler") });
    }
  }
  events.sort((a, b) => b.t - a.t).forEach((e) => e.f());
  return items;
}

async function resetDemo() {
  must(await db.rpc("mt_demo_wipe"));
  must(await db.from("recyclers").delete().neq("id", ""));
  must(await db.from("recyclers").insert(DEFAULT_RECYCLERS));
  must(await db.from("settings").upsert({ id: 1, data: DEFAULT_SETTINGS }));
  const items = seedItems();
  const created = await append(items);
  // one correction example: installer fixes a typing error in LOT-UP-002's removal count
  const rec = created.find((r) => r.kind === "REMOVAL" && r.ref === "LOT-UP-002");
  if (rec) await append([{ kind: "CORRECTION", ref: "LOT-UP-002", corrects: rec.seq, payload: { reason: "Typing error in field app: 780 meters were removed, not 800", count: 780 }, by: "u-installer", role: "installer" }]);
  const all = await loadAll();
  const st = buildState(all.records, all.settings);
  await syncAlerts(st.flags);
  // give the alert list some variety in status
  must(await db.from("alerts").update({ status: "under_review", note: "Weighbridge slip requested from Kanpur store", updated_at: new Date().toISOString() }).eq("rule", "weight_mismatch").eq("ref", "B-UP-02"));
  must(await db.from("alerts").update({ status: "closed", note: "Clerical date error confirmed by Gaya division; no meters missing", updated_at: new Date().toISOString() }).eq("rule", "date_order").eq("ref", "LOT-BR-003:receipt"));
  return { records: created.length + 1 };
}

// ---------- response shaping ----------
function scopeFor(user: any, st: ReturnType<typeof buildState>, alerts: any[], flags: any[], recyclers: any[], settings: any) {
  const active = new Set(flags.map((f) => `${f.rule}|${f.ref}`));
  const al = alerts.map((a) => ({ ...a, rule_label: RULES[a.rule] ?? a.rule, active: a.rule === "blocked_buyer" ? true : active.has(`${a.rule}|${a.ref}`) }))
    .sort((a, b) => (a.status === "closed" ? 1 : 0) - (b.status === "closed" ? 1 : 0) || b.id - a.id);
  const base = { settings, recyclers, types: TYPES, rules: RULES, states: Object.keys(STATES), today: todayISO() };
  if (user.role === "installer") {
    const lots = st.lots.filter((l) => l.created_by === user.id);
    return { ...base, lots, batches: [], alerts: [] };
  }
  if (user.role === "recycler") {
    const batches = st.batches.filter((b) => b.buyer_id === user.recycler_id);
    const ids = new Set(batches.map((b) => b.id));
    return { ...base, lots: [], batches, alerts: al.filter((a) => ids.has(a.ref.split(":")[0])) };
  }
  return {
    ...base, lots: st.lots, batches: st.batches, alerts: al,
    divisions: st.divisions, state_summary: st.states, totals: st.totals, flow: st.flow, lead: st.lead, materials: st.materials,
  };
}

// ---------- router ----------
async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*?\/api(?=\/|$)/, "") || "/";
  const method = req.method;
  const body = method === "POST" ? await req.json().catch(() => ({})) : {};

  if (path === "/health") return json({ ok: true, version: "1.2.0", time: new Date().toISOString() });

  // public, no login
  if (path === "/public" && method === "GET") {
    let all = await loadAll();
    if (!all.records.length) { await resetDemo(); all = await loadAll(); }
    const st = buildState(all.records, all.settings);
    return json({
      updated: new Date().toISOString(),
      totals: { removed: st.totals.removed, traced_pct: st.totals.traced_pct, unaccounted: st.totals.unaccounted, unaccounted_pct: st.totals.unaccounted_pct, reuse: st.totals.reuse, refurbish: st.totals.refurbish, recycled: st.totals.recycler_received, pre2004: st.totals.pre2004 },
      states: st.states.map((s) => ({ state: s.state, rank: s.rank, removed: s.removed, reuse: s.reuse, refurbish: s.refurbish, recycled: s.recycler_received, pending: s.pending, unaccounted: s.unaccounted, unaccounted_pct: s.unaccounted_pct, traced_pct: s.traced_pct })),
      approved_recyclers: all.recyclers.filter((r) => r.status === "approved").map((r) => ({ name: r.name, state: r.state, reg_no: r.reg_no })),
      portal: portalStats(all.users, all.recyclers, all.records, st),
    });
  }

  if (path === "/login" && method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const u = must(await db.from("users").select("*").eq("email", email).maybeSingle()) as any;
    if (!u || (await sha256hex(u.salt + String(body.password ?? ""))) !== u.pw_hash) throw new HttpError(401, "Wrong email or password.");
    if (!u.active) throw new HttpError(403, "This account has been deactivated. Contact the portal administrator.");
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    must(await db.from("sessions").insert({ token, user_id: u.id, expires_at: new Date(Date.now() + 12 * 3600e3).toISOString() }));
    const last = u.last_login;
    await db.from("users").update({ last_login: new Date().toISOString() }).eq("id", u.id);
    const { salt: _s, pw_hash: _p, ...user } = u;
    return json({ token, user: { ...user, previous_login: last } });
  }

  const user = await getUser(req);

  if (path === "/logout" && method === "POST") {
    const token = req.headers.get("x-session");
    if (token) await db.from("sessions").delete().eq("token", token);
    return json({ ok: true });
  }
  if (path === "/me") { requireRole(user); return json({ user }); }

  if (path === "/state" && method === "GET") {
    requireRole(user);
    let all = await loadAll();
    if (!all.records.length) { await resetDemo(); all = await loadAll(); }
    const st = buildState(all.records, all.settings);
    const added = await syncAlerts(st.flags);
    const alerts = added ? (must(await db.from("alerts").select("*").order("id")) as any[]) : all.alerts;
    return json({ user, ...scopeFor(user, st, alerts, st.flags, all.recyclers, all.settings), new_alerts: added });
  }

  if (path === "/ledger" && method === "GET") {
    requireRole(user);
    const all = await loadAll();
    const names = Object.fromEntries(all.users.map((u) => [u.id, u.name]));
    let recs = all.records;
    if (user.role === "installer") recs = recs.filter((r) => r.created_by === user.id);
    if (user.role === "recycler") {
      const st = buildState(all.records, all.settings);
      const mine = new Set(st.batches.filter((b) => b.buyer_id === user.recycler_id).map((b) => b.id));
      recs = recs.filter((r) => mine.has(r.ref) || r.created_by === user.id);
    }
    return json({ records: recs.slice().reverse().map((r) => ({ ...r, created_by_name: names[r.created_by] ?? r.created_by })) });
  }

  if (path === "/records" && method === "POST") {
    requireRole(user);
    const kind = String(body.kind ?? "");
    const all = await loadAll();
    const st = buildState(all.records, all.settings);

    if (kind === "CORRECTION") {
      const orig = all.records.find((r) => Number(r.seq) === Number(body.corrects));
      if (!orig || !CORRECTABLE[orig.kind]) throw new HttpError(400, "Choose a valid record to correct.");
      requireRole(user, KIND_ROLE[orig.kind]);
      if (user.role === "recycler") {
        const b = st.batches.find((x) => x.id === orig.ref);
        if (b?.buyer_id !== user.recycler_id) throw new HttpError(403, "You can only correct records for your own batches.");
      }
      const p = body.payload ?? {};
      if (!p.reason || String(p.reason).trim().length < 5) throw new HttpError(400, "Give a reason for the correction (at least 5 characters).");
      const fields: any = { reason: String(p.reason).trim() };
      for (const k of CORRECTABLE[orig.kind]) {
        if (p[k] === undefined || p[k] === "" || p[k] === null) continue;
        if (k === "date") { if (!isDate(p[k])) throw new HttpError(400, "Corrected date is not valid."); fields[k] = p[k]; }
        else if (k === "route") { if (!ROUTES.includes(p[k])) throw new HttpError(400, "Corrected route is not valid."); fields[k] = p[k]; }
        else if (k === "meter_type") { if (!TYPES[p[k]]) throw new HttpError(400, "Corrected meter type is not valid."); fields[k] = p[k]; }
        else if (k === "condition") { if (!CONDITIONS.includes(p[k])) throw new HttpError(400, "Corrected condition is not valid."); fields[k] = p[k]; }
        else if (k === "district" || k === "division") fields[k] = String(p[k]).trim();
        else { const n = num(p[k]); if (!isFinite(n) || n < 0) throw new HttpError(400, `Corrected ${k} must be 0 or more.`); fields[k] = k === "count" ? Math.round(n) : r1(n); }
      }
      if (Object.keys(fields).length < 2) throw new HttpError(400, "Change at least one value.");
      const [created] = await append([{ kind: "CORRECTION", ref: orig.ref, corrects: Number(orig.seq), payload: fields, by: user.id, role: user.role }]);
      const after = buildState([...all.records, created], all.settings);
      await syncAlerts(after.flags);
      return json({ record: created, message: `Correction saved as record #${created.seq}, linked to record #${orig.seq}.` });
    }

    if (!KIND_ROLE[kind]) throw new HttpError(400, "Unknown record type.");
    requireRole(user, KIND_ROLE[kind]);
    const v = validateRecord(kind, body, user, st, all.recyclers);

    if (kind === "BATCH") {
      const buyer = all.recyclers.find((r) => r.id === v.payload.buyer_id);
      if (!buyer || buyer.status !== "approved") {
        const name = (buyer?.name ?? String(v.payload.buyer_name ?? "").trim()) || "Unlisted buyer";
        const why = buyer ? `its status is "${buyer.status}"` : "it is not registered with the Regulator";
        const lot0 = st.lots.find((l) => l.id === v.payload.lots[0]);
        must(await db.from("alerts").insert({
          rule: "blocked_buyer", ref: `${v.ref}:${Date.now()}`,
          detail: `${user.name} tried to sell ${v.payload.count} meters (${v.payload.weight_kg} kg) to ${name}; blocked because ${why}`,
          state: lot0?.state ?? null, division: lot0?.division ?? null,
        }));
        throw new HttpError(403, `Blocked: ${name} is not on the Regulator-approved recycler list (${why}). The attempt has been reported to the Regulator.`);
      }
      v.payload.buyer_name = buyer.name;
    }

    const [created] = await append([{ kind, ref: v.ref, payload: v.payload, by: user.id, role: user.role }]);
    const after = buildState([...all.records, created], all.settings);
    const fresh = after.flags.filter((f) => !st.flags.some((o) => o.rule === f.rule && o.ref === f.ref));
    await syncAlerts(after.flags);
    return json({
      record: created,
      message: `Saved as record #${created.seq} (${v.ref}).`,
      flags: fresh.map((f) => ({ ...f, rule_label: RULES[f.rule] })),
    });
  }

  if (path === "/verify" && method === "POST") {
    requireRole(user);
    const res = must(await db.rpc("mt_verify")) as any;
    return json(res);
  }

  if (path === "/demo/tamper" && method === "POST") {
    requireRole(user);
    const res = must(await db.rpc("mt_demo_tamper")) as any;
    return json(res);
  }
  if (path === "/demo/untamper" && method === "POST") {
    requireRole(user);
    const n = must(await db.rpc("mt_demo_untamper")) as any;
    return json({ restored: n });
  }
  if (path === "/demo/reset" && method === "POST") {
    requireRole(user);
    const res = await resetDemo();
    return json({ ok: true, ...res });
  }

  // ---- own account ----
  if (path === "/password" && method === "POST") {
    requireRole(user);
    if (DEMO_IDS.has(user.id)) throw new HttpError(400, "Demo accounts keep the password shown on the login page. Create your own account to change passwords.");
    const u = must(await db.from("users").select("salt,pw_hash").eq("id", user.id).single()) as any;
    if ((await sha256hex(u.salt + String(body.current ?? ""))) !== u.pw_hash) throw new HttpError(400, "Current password is wrong.");
    const pw = String(body.new ?? "");
    checkPassword(pw);
    const salt = newSalt();
    must(await db.from("users").update({ salt, pw_hash: await sha256hex(salt + pw) }).eq("id", user.id));
    const token = req.headers.get("x-session");
    await db.from("sessions").delete().eq("user_id", user.id).neq("token", token ?? "");
    await append([{ kind: "USER_PASSWORD", ref: user.id, payload: { note: "Password changed by the user" }, by: user.id, role: user.role }]);
    return json({ ok: true, message: "Password changed. Other sessions have been signed out." });
  }

  // ---- user management (Regulator / administrator) ----
  if (path === "/users" && method === "GET") {
    requireRole(user, "regulator");
    const all = await loadAll();
    const counts: Record<string, number> = {};
    for (const r of all.records) counts[r.created_by] = (counts[r.created_by] ?? 0) + 1;
    return json({
      users: all.users.map((u) => ({ ...u, records: counts[u.id] ?? 0, demo: DEMO_IDS.has(u.id) })),
      recyclers: all.recyclers.map((r) => ({ id: r.id, name: r.name, status: r.status })),
    });
  }
  if (path === "/users" && method === "POST") {
    requireRole(user, "regulator");
    const name = String(body.name ?? "").trim(), email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? ""), org = String(body.org ?? "").trim(), pw = String(body.password ?? "");
    if (name.length < 3) throw new HttpError(400, "Enter the person's full name.");
    if (!isEmail(email)) throw new HttpError(400, "Enter a valid email address.");
    if (!ROLES.includes(role)) throw new HttpError(400, "Choose a role.");
    if (org.length < 3) throw new HttpError(400, "Enter the organisation.");
    checkPassword(pw);
    let recycler_id: string | null = null;
    if (role === "recycler") {
      const r = must(await db.from("recyclers").select("id,name").eq("id", String(body.recycler_id ?? "")).maybeSingle()) as any;
      if (!r) throw new HttpError(400, "Choose which registered recycler this person works for.");
      recycler_id = r.id;
    }
    const exists = must(await db.from("users").select("id").eq("email", email).maybeSingle());
    if (exists) throw new HttpError(400, "An account with this email already exists.");
    const id = "u-" + crypto.randomUUID().slice(0, 8);
    const salt = newSalt();
    must(await db.from("users").insert({ id, email, name, role, org, recycler_id, salt, pw_hash: await sha256hex(salt + pw), created_by: user.id }));
    await append([{ kind: "USER_CREATED", ref: id, payload: { name, email, role, org, recycler_id }, by: user.id, role: user.role }]);
    return json({ ok: true, message: `Account created for ${name} (${email}) as ${roleName(role)}. Share the password with them securely.` });
  }
  const usM = path.match(/^\/users\/([\w-]+)\/status$/);
  if (usM && method === "POST") {
    requireRole(user, "regulator");
    if (usM[1] === user.id) throw new HttpError(400, "You cannot deactivate your own account.");
    const u = must(await db.from("users").select("id,name,active").eq("id", usM[1]).maybeSingle()) as any;
    if (!u) throw new HttpError(404, "User not found.");
    const active = !!body.active;
    must(await db.from("users").update({ active }).eq("id", u.id));
    if (!active) await db.from("sessions").delete().eq("user_id", u.id);
    await append([{ kind: "USER_STATUS", ref: u.id, payload: { name: u.name, active }, by: user.id, role: user.role }]);
    return json({ ok: true, message: `${u.name} is now ${active ? "active" : "deactivated"}.` });
  }

  // ---- regulator actions ----
  const recM = path.match(/^\/recyclers\/([\w-]+)\/status$/);
  if (recM && method === "POST") {
    requireRole(user, "regulator");
    const status = String(body.status);
    if (!["approved", "pending", "suspended"].includes(status)) throw new HttpError(400, "Invalid status.");
    const r = must(await db.from("recyclers").select("*").eq("id", recM[1]).maybeSingle()) as any;
    if (!r) throw new HttpError(404, "Recycler not found.");
    must(await db.from("recyclers").update({ status }).eq("id", r.id));
    await append([{ kind: "RECYCLER_STATUS", ref: r.id, payload: { from: r.status, to: status, reason: String(body.reason ?? "") }, by: user.id, role: user.role }]);
    return json({ ok: true, message: `${r.name} is now ${status}.` });
  }
  if (path === "/recyclers" && method === "POST") {
    requireRole(user, "regulator");
    const name = String(body.name ?? "").trim(), state = String(body.state ?? ""), reg_no = String(body.reg_no ?? "").trim();
    if (name.length < 3 || !STATES[state] || reg_no.length < 3) throw new HttpError(400, "Enter name, state and registration number.");
    const list = must(await db.from("recyclers").select("id")) as any[];
    const id = `REC-${String(list.length + 1).padStart(2, "0")}`;
    must(await db.from("recyclers").insert({ id, name, state, reg_no, capacity_tpa: Math.max(0, Math.round(num(body.capacity_tpa) || 0)), status: "pending" }));
    await append([{ kind: "RECYCLER_STATUS", ref: id, payload: { from: null, to: "pending", reason: "Registered" }, by: user.id, role: user.role }]);
    return json({ ok: true, message: `${name} registered as ${id} (pending approval).` });
  }
  const alM = path.match(/^\/alerts\/(\d+)\/status$/);
  if (alM && method === "POST") {
    requireRole(user, "regulator");
    const status = String(body.status);
    if (!["open", "under_review", "closed"].includes(status)) throw new HttpError(400, "Invalid status.");
    const a = must(await db.from("alerts").select("*").eq("id", alM[1]).maybeSingle()) as any;
    if (!a) throw new HttpError(404, "Alert not found.");
    must(await db.from("alerts").update({ status, note: String(body.note ?? a.note ?? ""), updated_at: new Date().toISOString() }).eq("id", a.id));
    await append([{ kind: "ALERT_STATUS", ref: `ALERT-${a.id}`, payload: { from: a.status, to: status, note: String(body.note ?? "") }, by: user.id, role: user.role }]);
    return json({ ok: true });
  }
  if (path === "/settings" && method === "POST") {
    requireRole(user, "regulator");
    const s = body.settings ?? {};
    const clean: any = { avg_weight: {}, content: {}, price: {} };
    for (const t of Object.keys(TYPES)) {
      const w = num(s.avg_weight?.[t]); if (!(w > 0)) throw new HttpError(400, `Average weight for ${TYPES[t]} must be above 0.`);
      clean.avg_weight[t] = w; clean.content[t] = {};
      let sum = 0;
      for (const m of MATERIALS) {
        const v = num(s.content?.[t]?.[m]); if (!(v >= 0)) throw new HttpError(400, `Material % for ${TYPES[t]} / ${m} must be 0 or more.`);
        clean.content[t][m] = v; sum += v;
      }
      if (sum > 100) throw new HttpError(400, `Material % for ${TYPES[t]} adds up to ${sum}%, more than 100%.`);
    }
    for (const m of MATERIALS) { const v = num(s.price?.[m]); if (!(v >= 0)) throw new HttpError(400, `Price for ${m} must be 0 or more.`); clean.price[m] = v; }
    const tol = num(s.tolerance_pct), days = num(s.store_days_limit);
    if (!(tol >= 0 && tol <= 100)) throw new HttpError(400, "Weight tolerance must be 0–100%.");
    if (!(Number.isInteger(days) && days >= 1)) throw new HttpError(400, "Storage day limit must be a whole number of days.");
    clean.tolerance_pct = tol; clean.store_days_limit = days;
    must(await db.from("settings").upsert({ id: 1, data: clean }));
    await append([{ kind: "SETTINGS_CHANGE", ref: "settings", payload: { tolerance_pct: tol, store_days_limit: days }, by: user.id, role: user.role }]);
    return json({ ok: true, settings: clean });
  }

  throw new HttpError(404, `No such endpoint: ${method} ${path}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    return await handle(req);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    const msg = (e as any)?.message ?? String(e);
    return json({ error: `Server error: ${msg}` }, 500);
  }
});
