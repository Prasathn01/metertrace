/* MeterTrace frontend — talks to the backend API only. No data is stored in the browser except the login session token. */
(() => {
  "use strict";

  // ---------- config ----------
  const FUNCTION_URL = "https://ruzshsoreacoigngpxnt.supabase.co/functions/v1/api";
  const isLocal = !location.protocol.startsWith("http") || /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const API = isLocal ? FUNCTION_URL : "/api"; // on Vercel, /api/* is proxied to the backend

  const TYPE_LABEL = { EM: "Electromechanical", E_PRE: "Electronic, before 2004", E_POST: "Electronic, 2004 or later" };
  const TYPE_SHORT = { EM: "Electromech.", E_PRE: "Electronic <2004", E_POST: "Electronic 2004+" };
  const MATERIALS = ["copper", "brass", "plastic", "pcb", "battery", "hazardous"];
  const MAT_LABEL = { copper: "Copper", brass: "Brass", plastic: "Plastic", pcb: "Circuit boards", battery: "Batteries", hazardous: "Hazardous residue (to safe disposal)" };
  const ROLE_LABEL = { installer: "Installer", store: "DISCOM Store Officer", recycler: "Recycler", regulator: "Regulator (SPCB)" };
  const ROUTE_LABEL = { reuse: "Reuse", refurbish: "Refurbish", recycle: "Recycle" };
  const KIND_LABEL = {
    REMOVAL: "Removal", STORE_RECEIPT: "Store receipt", SORT: "Sorting", BATCH: "Disposal batch",
    RECYCLER_RECEIPT: "Recycler receipt", RECOVERY: "Material recovery", CORRECTION: "Correction",
    RECYCLER_STATUS: "Recycler status", ALERT_STATUS: "Alert status", SETTINGS_CHANGE: "Settings change",
    USER_CREATED: "User account created", USER_STATUS: "User access changed", USER_PASSWORD: "Password changed",
  };
  const KIND_ROLE = { REMOVAL: "installer", STORE_RECEIPT: "store", SORT: "store", BATCH: "store", RECYCLER_RECEIPT: "recycler", RECOVERY: "recycler" };
  const CORRECTABLE = {
    REMOVAL: ["date", "district", "division", "meter_type", "count", "condition"],
    STORE_RECEIPT: ["date", "count"],
    SORT: ["date", "route", "count"],
    BATCH: ["date", "count", "weight_kg", "price_per_kg"],
    RECYCLER_RECEIPT: ["date", "count", "weight_kg"],
    RECOVERY: ["date", ...MATERIALS],
  };
  // Sidebar navigation per role: [group label, [[tab id, label, icon], ...]]
  const ICON = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    sort: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    truck: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    scale: '<path d="M12 3v18M5 7h14"/><path d="M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0z"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    bell: '<path d="M6 9a6 6 0 0112 0c0 6 3 8 3 8H3s3-2 3-8"/><path d="M10 21a2 2 0 004 0"/>',
    factory: '<path d="M3 21V10l6 4V10l6 4V6h6v15z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 016 5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ""}</svg>`;
  const COMMON = ["Records", [["records", "Records & integrity", "shield"], ["report", "Printable report", "file"], ["account", "My account", "user"]]];
  const NAV = {
    installer: [["Field work", [["log", "Log removal", "plus"], ["lots", "My lots", "list"]]], COMMON],
    store: [["Overview", [["overview", "Store overview", "home"]]],
      ["Workflow", [["receive", "1. Receive lots", "inbox"], ["sort", "2. Sort lots", "sort"], ["batch", "3. Create batch", "truck"], ["batches", "Batches", "box"]]],
      ["Checks", [["recon", "Reconciliation", "scale"]]], COMMON],
    recycler: [["Workflow", [["incoming", "1. Confirm receipt", "inbox"], ["recovery", "2. Record recovery", "factory"], ["mybatches", "My batches", "box"]]], COMMON],
    regulator: [["Monitoring", [["dashboard", "Dashboard", "chart"], ["alerts", "Alerts & review", "bell"], ["recon", "Reconciliation", "scale"], ["lots", "Lots & batches", "list"]]],
      ["Administration", [["recyclers", "Recyclers", "factory"], ["users", "Users & access", "users"], ["settings", "Settings", "gear"]]], COMMON],
  };
  const TABS = Object.fromEntries(Object.entries(NAV).map(([role, groups]) => [role, groups.flatMap(([, items]) => items.map(([id, label]) => [id, label]))]));
  const DEMO_USERS = [
    ["installer", "installer@metertrace.demo", "Logs meters removed in the field"],
    ["store", "store@metertrace.demo", "Receives, sorts and creates disposal batches"],
    ["recycler", "recycler@metertrace.demo", "GreenCore E-Recyclers: confirms receipt, records recovery"],
    ["regulator", "regulator@metertrace.demo", "Approves recyclers, reviews alerts, sees all states"],
  ];

  // ---------- state ----------
  const S = { token: null, user: null, data: null, flash: null };
  try { const s = JSON.parse(localStorage.getItem("mt-session") || "null"); if (s) { S.token = s.token; S.user = s.user; } } catch (_) { /* storage blocked */ }

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const main = $("#main");
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const n0 = (v) => (v === null || v === undefined || isNaN(v) ? "–" : Number(v).toLocaleString("en-IN"));
  const kg = (v) => (v === null || v === undefined || isNaN(v) ? "–" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 }) + " kg");
  const rs = (v) => "₹" + Number(v || 0).toLocaleString("en-IN");
  const pct = (v) => (v === null || v === undefined || isNaN(v) ? "–" : `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`);
  const dt = (s) => (s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "–");
  const dtime = (s) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const today = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); };
  const gapCell = (v) => `<td class="num ${v > 0 ? "gap" : ""}">${v > 0 ? "−" + n0(v) : "0"}</td>`;

  function toast(msg, bad = false) {
    const t = $("#toast");
    t.textContent = msg; t.className = "toast show" + (bad ? " bad" : "");
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = "toast"), 3200);
  }
  function setFlash(type, html) { S.flash = { type, html }; }
  function takeFlash() { const f = S.flash; S.flash = null; return f ? `<div class="notice ${f.type}">${f.html}</div>` : ""; }

  function saveSession() { try { localStorage.setItem("mt-session", JSON.stringify({ token: S.token, user: S.user })); } catch (_) { /* ignore */ } }
  function clearSession() { S.token = null; S.user = null; S.data = null; try { localStorage.removeItem("mt-session"); } catch (_) { /* ignore */ } }

  async function api(path, body) {
    let res;
    try {
      res = await fetch(API + path, {
        method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", ...(S.token ? { "x-session": S.token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error("Cannot reach the server. Check your internet connection and try again.");
    }
    let data;
    try { data = await res.json(); } catch (_) { data = { error: `Unexpected server response (${res.status})` }; }
    if (res.status === 401 && S.token && path !== "/login") {
      clearSession(); setFlash("warn", "Your session has expired. Please log in again."); location.hash = "#/login";
    }
    if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
    return data;
  }

  // modal
  function openModal(title, html, onReady) {
    $("#modalTitle").textContent = title; $("#modalBody").innerHTML = html; $("#modalBack").hidden = false;
    onReady && onReady($("#modalBody"));
    const f = $("#modalBody input, #modalBody select, #modalBody textarea"); f && f.focus();
  }
  function closeModal() { $("#modalBack").hidden = true; $("#modalBody").innerHTML = ""; }
  $("#modalClose").onclick = closeModal;
  $("#modalBack").addEventListener("click", (e) => { if (e.target.id === "modalBack") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modalBack").hidden) closeModal(); });

  // ---------- header / sidebar ----------
  const initials = (name) => String(name || "?").replace(/^(Dr\.?|Mr\.?|Ms\.?)\s+/i, "").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  function renderHeader(view) {
    const h = $("#headerRight");
    const inApp = S.user && view === "app";
    $("#menuBtn").hidden = !inApp;
    if (S.user) {
      h.innerHTML = `
        ${inApp ? `<a class="nav-link nav-hide-md" href="#/public">Public dashboard</a>` : `<a class="nav-link nav-hide-md ${view === "public" ? "active" : ""}" href="#/public">Public dashboard</a><a class="btn sm" href="#/app">My dashboard</a>`}
        <a class="user-chip" href="#/app/account" style="text-decoration:none" title="My account"><span class="avatar">${esc(initials(S.user.name))}</span>
          <span class="who"><b>${esc(S.user.name)}</b><span>${esc(ROLE_LABEL[S.user.role])}</span></span></a>
        <button class="btn ghost sm" id="logoutBtn">Log out</button>`;
      $("#logoutBtn").onclick = async () => { try { await api("/logout", {}); } catch (_) { /* ignore */ } clearSession(); setFlash("ok", "You have been logged out."); location.hash = "#/login"; };
    } else {
      h.innerHTML = `<a class="nav-link nav-hide-md ${view === "public" ? "active" : ""}" href="#/public">Public dashboard</a>
        <a class="nav-link nav-hide-sm" href="#/public" data-scroll="how">How it works</a>
        <a class="nav-link nav-hide-sm" href="#/public" data-scroll="meter">Inside a meter</a>
        <a class="btn sm" href="#/login">Official login</a>`;
    }
  }
  function renderTabs(active) {
    const nav = $("#tabs"), shell = $("#shell");
    if (!S.user || !active) { nav.innerHTML = ""; shell.classList.remove("has-nav"); return; }
    shell.classList.add("has-nav");
    const openAlerts = (S.data?.alerts || []).filter((a) => a.status === "open").length;
    nav.innerHTML = NAV[S.user.role].map(([group, items]) => `<div class="nav-group"><div class="nav-label">${esc(group)}</div>
      ${items.map(([id, label, ic]) => `<a href="#/app/${id}" class="${id === active ? "active" : ""}" ${id === active ? 'aria-current="page"' : ""}>${svg(ic)}<span>${esc(label)}</span>${id === "alerts" && openAlerts ? `<span class="count">${openAlerts}</span>` : ""}</a>`).join("")}</div>`).join("") +
      `<div class="side-foot"><div style="margin-bottom:8px">${esc(S.user.org)}</div><button class="btn ghost sm" id="resetBtn" title="Restore the original sample data" style="width:100%">Reset demo data</button></div>`;
    $("#resetBtn").onclick = resetDemo;
  }
  // mobile drawer
  function closeDrawer() { $("#tabs").classList.remove("open"); $(".nav-scrim")?.remove(); $("#menuBtn").setAttribute("aria-expanded", "false"); }
  $("#menuBtn").onclick = () => {
    const nav = $("#tabs");
    if (nav.classList.contains("open")) return closeDrawer();
    nav.classList.add("open"); $("#menuBtn").setAttribute("aria-expanded", "true");
    const s = document.createElement("div"); s.className = "nav-scrim"; s.onclick = closeDrawer; document.body.appendChild(s);
  };
  // text size (accessibility)
  const applyTs = (n) => { document.documentElement.style.setProperty("--fs", [13.5, 15, 17][n + 1] + "px"); try { localStorage.setItem("mt-ts", n); } catch (_) { /* ignore */ } };
  try { const t = Number(localStorage.getItem("mt-ts")); if (t) applyTs(t); } catch (_) { /* ignore */ }
  $$(".ts").forEach((b) => (b.onclick = () => applyTs(Number(b.dataset.ts))));
  // in-page section links (e.g. "How it works") that live on the public page
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-scroll]"); if (!a) return;
    e.preventDefault();
    const go = () => document.getElementById(a.dataset.scroll)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!/^#\/?(public)?$/.test(location.hash)) { location.hash = "#/public"; setTimeout(go, 700); } else go();
  });

  async function resetDemo() {
    if (!confirm("Reset all data to the original sample records? Anything added during this demo will be removed.")) return;
    const b = $("#resetBtn"); if (b) { b.disabled = true; b.textContent = "Resetting…"; }
    try { const r = await api("/demo/reset", {}); setFlash("ok", `Demo data restored: ${r.records} sample records loaded.`); S.data = null; route(); }
    catch (e) { toast(e.message, true); }
    finally { if (b) { b.disabled = false; b.textContent = "Reset demo data"; } }
  }

  // ---------- router ----------
  async function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    const view = parts[0] === "login" ? "login" : parts[0] === "app" ? "app" : "public";
    closeDrawer();
    renderHeader(view);
    try {
      if (parts[0] === "login") { renderTabs(); return renderLogin(); }
      if (parts[0] === "app") {
        if (!S.token) { location.hash = "#/login"; return; }
        const tabs = TABS[S.user.role];
        const tab = tabs.some((t) => t[0] === parts[1]) ? parts[1] : tabs[0][0];
        if (!S.data) { main.innerHTML = `<div class="loading">Loading data from the server…</div>`; await loadState(); }
        renderTabs(tab);
        await PAGES[tab]();
        return;
      }
      renderTabs();
      return renderPublic();
    } catch (e) {
      main.innerHTML = `<div class="notice bad"><b>Something went wrong</b>${esc(e.message)}</div><button class="btn" onclick="location.reload()">Reload</button>`;
    }
  }
  window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });
  async function loadState() { S.data = await api("/state"); return S.data; }
  async function refresh() { await loadState(); await route(); }

  async function submitRecord(body, btn) {
    if (btn) { btn.disabled = true; btn._t = btn.textContent; btn.textContent = "Saving…"; }
    try {
      const res = await api("/records", body);
      if (res.flags && res.flags.length) {
        setFlash("warn", `<b>${esc(res.message)} Flagged for Regulator review:</b>${res.flags.map((f) => `• ${esc(f.rule_label)} — ${esc(f.detail)}`).join("<br>")}`);
      } else setFlash("ok", esc(res.message));
      await refresh();
      return res;
    } catch (e) {
      setFlash(e.status === 403 ? "bad" : "warn", `<b>${e.status === 403 ? "Not allowed" : "Could not save"}</b>${esc(e.message)}`);
      await refresh();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = btn._t; }
    }
  }

  // ---------- shared widgets ----------
  function kpis(t) {
    return `<div class="kpis">
      <div class="kpi"><div class="k">Meters removed</div><div class="v">${n0(t.removed)}</div><div class="s">logged by installers</div></div>
      <div class="kpi ok"><div class="k">Reused</div><div class="v">${n0(t.reuse)}</div><div class="s">working meters redeployed</div></div>
      <div class="kpi ok"><div class="k">Refurbished</div><div class="v">${n0(t.refurbish)}</div><div class="s">sent for repair</div></div>
      <div class="kpi ok"><div class="k">Recycled</div><div class="v">${n0(t.recycler_received ?? t.recycled)}</div><div class="s">received by registered recyclers</div></div>
      <div class="kpi info"><div class="k">In process</div><div class="v">${n0(t.pending)}</div><div class="s">moving between steps</div></div>
      <div class="kpi bad"><div class="k">Unaccounted</div><div class="v">${n0(t.unaccounted)}</div><div class="s">${pct(t.unaccounted_pct)} of removed</div></div>
      <div class="kpi warn"><div class="k">Fully traced</div><div class="v">${pct(t.traced_pct)}</div><div class="s">reached reuse, refurbish or recycler</div></div>
    </div>`;
  }

  function bars(rows, labelFn, valFn, extraFn, cls = "") {
    const max = Math.max(1, ...rows.map(valFn));
    if (!rows.length) return `<div class="empty">No data</div>`;
    return `<div class="bars">${rows.map((r) => `<div class="bar-row"><span class="name" title="${esc(labelFn(r))}">${esc(labelFn(r))}</span>
      <div class="bar-track"><div class="bar-fill ${cls}" style="width:${(valFn(r) / max) * 100}%"></div></div>
      <span class="val">${extraFn(r)}</span></div>`).join("")}</div>`;
  }

  function flowChart(f) {
    const arrow = (lost, label = "unaccounted") => `<div class="flow-arrow"><span class="ar">→</span>${lost > 0 ? `<span class="lost">−${n0(lost)}</span><span class="lost">${label}</span>` : `<span class="ok0">no loss</span>`}</div>`;
    const box = (v, l, end) => `<div class="flow-box ${end ? "end" : ""}"><div class="fv">${n0(v)}</div><div class="fl">${l}</div></div>`;
    return `<div class="flow" role="img" aria-label="Flow of meters from removal to recycling">
      <div class="flow-step">${box(f.removed, "Removed")}</div>
      ${arrow(f.lost_receipt)}
      <div class="flow-step">${box(f.received, "Received at store")}</div>
      ${arrow(f.lost_sort)}
      <div class="flow-step">${box(f.sorted, "Sorted")}
        <div class="flow-side"><div>Reuse <b>${n0(f.reuse)}</b></div><div>Refurbish <b>${n0(f.refurbish)}</b></div><div>Recycle <b>${n0(f.recycle)}</b></div></div></div>
      ${arrow(f.lost_dispatch)}
      <div class="flow-step">${box(f.dispatched, "Dispatched to recycler")}</div>
      ${arrow(f.lost_recycler)}
      <div class="flow-step">${box(f.recycler_received, "Received by recycler")}</div>
      <div class="flow-arrow"><span class="ar">→</span><span class="ok0">${n0(Math.max(0, f.recycler_received - f.closed))} awaiting recovery entry</span></div>
      <div class="flow-step">${box(f.closed, "Recycled, batch closed", true)}</div>
    </div>
    <div class="legend"><span>Red numbers are meters that left one step but never arrived at the next.</span><span>Meters still moving between steps are counted as "in process", not lost.</span></div>`;
  }

  function reconTable(divs, totals) {
    if (!divs?.length) return `<div class="empty">No divisions yet</div>`;
    const row = (d, foot) => `<tr class="${d.unaccounted > 0 && !foot ? "flagged" : ""}">
      ${foot ? `<td colspan="2">All divisions</td>` : `<td>${esc(d.state)}</td><td>${esc(d.division)}</td>`}
      <td class="num">${n0(d.removed)}</td><td class="num">${n0(d.received)}</td>${gapCell(d.gap_receipt)}
      <td class="num">${n0(d.sorted)}</td>${gapCell(d.gap_sort)}
      <td class="num">${n0(d.dispatched)}</td>${gapCell(d.gap_dispatch)}
      <td class="num">${n0(d.recycler_received)}</td>${gapCell(d.gap_recycler)}
      <td class="num ${d.unaccounted ? "gap" : ""}">${n0(d.unaccounted)}</td><td class="num ${d.unaccounted ? "gap" : ""}">${pct(d.unaccounted_pct)}</td>
      <td class="num ${d.excess ? "excess" : ""}">${d.excess ? "+" + n0(d.excess) : "0"}</td>
      <td class="num">${n0(d.pending)}</td>
      <td class="num">${kg(d.expected_kg)}</td><td class="num">${kg(d.weighed_kg)}</td>
      <td class="num ${Math.abs(d.weight_diff_pct) > (S.data?.settings?.tolerance_pct ?? 10) ? "gap" : ""}">${d.weight_diff_pct > 0 ? "+" : ""}${pct(d.weight_diff_pct)}</td>
    </tr>`;
    return `<div class="table-wrap"><table>
      <thead><tr><th>State</th><th>Division</th><th class="num">Removed</th><th class="num">At store</th><th class="num">Gap</th><th class="num">Sorted</th><th class="num">Gap</th>
      <th class="num">Dispatched</th><th class="num">Gap*</th><th class="num">At recycler</th><th class="num">Gap</th>
      <th class="num">Unaccounted</th><th class="num">%</th><th class="num">Excess†</th><th class="num">In process</th>
      <th class="num">Expected wt</th><th class="num">Weighed wt</th><th class="num">Wt diff</th></tr></thead>
      <tbody>${divs.map((d) => row(d)).join("")}</tbody>
      ${totals ? `<tfoot>${row(totals, true)}</tfoot>` : ""}
    </table></div>
    <p class="muted">Each "Gap" compares one step with the next, only for lots that have reached the next step. *Dispatch gap compares meters sorted for recycling with meters put in batches.
    †Excess means a later step reported <i>more</i> meters than the step before, which is irregular and is flagged. Expected weight = meters dispatched × average weight per meter type (see Settings).</p>`;
  }

  function rankingTable(states) {
    return `<div class="table-wrap"><table>
      <thead><tr><th>Rank</th><th>State</th><th class="num">Removed</th><th class="num">Reused</th><th class="num">Refurbished</th><th class="num">Recycled</th><th class="num">In process</th><th class="num">Unaccounted</th><th class="num">Fully traced</th></tr></thead>
      <tbody>${states.map((s) => `<tr><td><b>${s.rank}</b></td><td>${esc(s.state)}</td><td class="num">${n0(s.removed)}</td><td class="num">${n0(s.reuse)}</td><td class="num">${n0(s.refurbish)}</td>
        <td class="num">${n0(s.recycler_received ?? s.recycled)}</td><td class="num">${n0(s.pending)}</td>
        <td class="num ${s.unaccounted ? "gap" : ""}">${n0(s.unaccounted)} (${pct(s.unaccounted_pct)})</td><td class="num"><b>${pct(s.traced_pct)}</b></td></tr>`).join("")}</tbody>
    </table></div>`;
  }

  const statusPill = (s) => `<span class="pill ${s === "open" ? "bad" : s === "under_review" ? "warn" : "ok"}">${s === "under_review" ? "Under review" : s === "open" ? "Open" : "Closed"}</span>`;
  function alertsTable(alerts, editable) {
    if (!alerts.length) return `<div class="empty">No alerts</div>`;
    return `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Rule</th><th>What was found</th><th>Where</th><th>Raised</th><th>Status</th><th>Condition</th><th>Note</th>${editable ? "<th>Action</th>" : ""}</tr></thead>
      <tbody>${alerts.map((a) => `<tr class="${a.status === "open" ? "flagged" : ""}">
        <td>${a.id}</td><td><b>${esc(a.rule_label)}</b></td><td>${esc(a.detail)}</td>
        <td>${esc(a.division || "")}${a.state ? `<div class="muted">${esc(a.state)}</div>` : ""}</td>
        <td class="nowrap">${dtime(a.created_at)}</td><td>${statusPill(a.status)}</td>
        <td>${a.active ? `<span class="pill bad">Still present</span>` : `<span class="pill grey">Cleared by later record</span>`}</td>
        <td>${esc(a.note || "")}</td>
        ${editable ? `<td class="nowrap"><select data-alert="${a.id}" aria-label="Status for alert ${a.id}">
            <option value="open" ${a.status === "open" ? "selected" : ""}>Open</option>
            <option value="under_review" ${a.status === "under_review" ? "selected" : ""}>Under review</option>
            <option value="closed" ${a.status === "closed" ? "selected" : ""}>Closed</option></select>
          <button class="btn sm" data-alert-save="${a.id}">Save</button></td>` : ""}
      </tr>`).join("")}</tbody></table></div>`;
  }

  function leadCard(lead) {
    return `<div class="card"><h2>Lead risk: pre-2004 meters</h2>
      <p class="muted">Electronic meters made before 2004 may contain lead solder. They must reach a registered recycler, not reuse.</p>
      <div class="kpis" style="margin-bottom:0">
        <div class="kpi warn"><div class="k">Handled</div><div class="v">${n0(lead.removed)}</div></div>
        <div class="kpi ok"><div class="k">At registered recycler</div><div class="v">${n0(lead.at_recycler)}</div></div>
        <div class="kpi bad"><div class="k">Sent to reuse (flagged)</div><div class="v">${n0(lead.reuse)}</div></div>
        <div class="kpi info"><div class="k">Still in process</div><div class="v">${n0(lead.in_pipeline)}</div></div>
      </div></div>`;
  }

  function materialsCard(m) {
    return `<div class="card"><h2>Materials recovered & scrap value</h2>
      <div class="table-wrap"><table><thead><tr><th>Material</th><th class="num">Estimated*</th><th class="num">Recorded by recyclers</th></tr></thead>
      <tbody>${MATERIALS.map((k) => `<tr><td>${MAT_LABEL[k]}</td><td class="num">${kg(m.estimated[k])}</td><td class="num">${kg(m.recorded[k])}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Estimated material value</td><td class="num">${rs(m.estimated_value_rs)}</td><td class="num">${rs(m.recorded_value_rs)}</td></tr>
      <tr><td>Scrap sale value (batches sold)</td><td class="num" colspan="2">${rs(m.sale_value_rs)}</td></tr></tfoot></table></div>
      <p class="muted">*Estimated = weight received by recyclers × material content per meter type × scrap price (Settings). Illustrative values, verify before use.</p></div>`;
  }

  function lotsTable(lots, opts = {}) {
    if (!lots.length) return `<div class="empty">No lots</div>`;
    return `<div class="table-wrap"><table>
      <thead><tr><th>Lot</th><th>Removed</th><th>State / division</th><th>Meter type</th><th>Condition</th><th class="num">Removed</th><th class="num">At store</th><th>Route</th><th>Batch</th><th>Status</th></tr></thead>
      <tbody>${lots.map((l) => `<tr>
        <td class="nowrap"><b>${esc(l.id)}</b>${l.corrected_by?.length ? ` <span class="pill info" title="Corrected by record #${l.corrected_by.join(", #")}">corrected</span>` : ""}</td>
        <td class="nowrap">${dt(l.date)}</td><td>${esc(l.division)}<div class="muted">${esc(l.district)}, ${esc(l.state)}</div></td>
        <td>${esc(TYPE_SHORT[l.meter_type])}</td><td>${esc(l.condition)}</td>
        <td class="num">${n0(l.count)}</td><td class="num ${l.receipt && l.receipt.count < l.count ? "gap" : ""}">${l.receipt ? n0(l.receipt.count) : "–"}</td>
        <td>${l.sort ? `${ROUTE_LABEL[l.sort.route]} (${n0(l.sort.count)})` : "–"}</td><td>${esc(l.batch || "–")}</td>
        <td><span class="pill ${l.stage >= 6 ? "ok" : l.stage === 1 ? "grey" : "info"}">${esc(l.status)}</span></td></tr>`).join("")}</tbody></table></div>`;
  }

  function batchesTable(batches) {
    if (!batches.length) return `<div class="empty">No batches</div>`;
    const tol = S.data?.settings?.tolerance_pct ?? 10;
    const st = { in_transit: ["info", "In transit"], received: ["warn", "At recycler"], closed: ["ok", "Closed"] };
    return `<div class="table-wrap"><table>
      <thead><tr><th>Batch</th><th>Date</th><th>Division</th><th>Lots</th><th class="num">Meters</th><th class="num">Expected wt</th><th class="num">Weighed wt</th><th class="num">Diff</th><th>Buyer</th><th class="num">₹/kg</th><th class="num">Value</th><th class="num">Recycler got</th><th class="num">Recovered</th><th>Status</th></tr></thead>
      <tbody>${batches.map((b) => `<tr>
        <td class="nowrap"><b>${esc(b.id)}</b></td><td class="nowrap">${dt(b.date)}</td><td>${esc(b.division)}</td><td class="mono">${esc((b.lots || []).join(", "))}</td>
        <td class="num ${b.count > b.available ? "excess" : ""}">${n0(b.count)}</td><td class="num">${kg(b.expected_kg)}</td><td class="num">${kg(b.weight_kg)}</td>
        <td class="num ${Math.abs(b.weight_diff_pct) > tol ? "gap" : ""}">${b.weight_diff_pct > 0 ? "+" : ""}${pct(b.weight_diff_pct)}</td>
        <td>${esc(b.buyer_name)}</td><td class="num">${n0(b.price_per_kg)}</td><td class="num">${rs(b.value_rs)}</td>
        <td class="num">${b.receipt ? `${n0(b.receipt.count)}<div class="muted">${kg(b.receipt.weight_kg)}</div>` : "–"}</td>
        <td class="num">${b.recovery ? kg(b.recovery.total) : "–"}</td>
        <td><span class="pill ${st[b.status][0]}">${st[b.status][1]}</span></td></tr>`).join("")}</tbody></table></div>`;
  }

  function divisionsFrom(lots) {
    const m = new Map();
    for (const l of lots) { const k = `${l.state}|${l.division}`; if (!m.has(k)) m.set(k, { state: l.state, district: l.district, division: l.division }); }
    return [...m.values()];
  }

  // ---------- INSIDE A METER (public education section) ----------
  // Composition = share of meter weight (illustrative, same defaults as the Settings page). "Other" = steel, glass, aluminium, misc.
  const METER_TYPES = [
    {
      key: "EM", name: "Electromechanical (induction) meter", era: "Older analogue meters with a spinning disc", weight: "about 1.8 kg",
      how: "Current and voltage coils create magnetic fields that spin an aluminium disc. A gear train turns the number dials that show units (kWh) used.",
      parts: [["Aluminium disc", "spins in proportion to the power drawn"], ["Voltage (shunt) coil", "many turns of thin copper wire"], ["Current (series) coil", "a few turns of thick copper wire"],
        ["Braking magnet", "permanent magnet that steadies the disc speed"], ["Register & gear train", "brass/steel gears and number dials"], ["Frame, base & cover", "cast metal frame, Bakelite base, glass or plastic cover"], ["Terminal block", "brass terminals and screws for the wires"]],
      mix: { copper: 12, brass: 5, plastic: 30, pcb: 0, battery: 0, hazardous: 0.5 },
      risk: "Mostly metal: copper, brass and steel are valuable and easy to recycle. Few hazards.",
    },
    {
      key: "E_PRE", name: "Electronic meter, made before 2004", era: "Early static meters with a circuit board", weight: "about 1.2 kg",
      how: "Sensors measure current and voltage; a metering chip calculates energy and shows it on an LCD. No moving parts.",
      parts: [["Printed circuit board (PCB)", "fibreglass board with copper tracks and chips"], ["Current sensor", "shunt resistor or small current transformer"], ["Metering IC & microcontroller", "calculates kWh and stores readings"],
        ["LCD display", "shows the reading"], ["Backup battery", "small lithium cell for the clock and memory"], ["Power supply", "transformer or capacitor circuit"], ["Plastic case & terminal block", "polycarbonate or ABS body, brass terminals"]],
      mix: { copper: 5, brass: 3, plastic: 50, pcb: 15, battery: 2, hazardous: 3 },
      risk: "Solder from this period usually contains LEAD. Must go to a registered recycler — never reuse or informal scrap.",
      lead: true,
    },
    {
      key: "E_POST", name: "Electronic meter, 2004 or later", era: "Modern static meters (smart meters add a modem)", weight: "about 0.9 kg",
      how: "Same principle as other electronic meters, with lead-free solder in most cases. Smart meters add a communication module and a relay for remote connect/disconnect.",
      parts: [["PCB with metering SoC", "single chip that measures and calculates"], ["Shunt / current transformer", "measures current"], ["LCD & optical port", "display and a port for reading data"],
        ["Lithium battery", "keeps the clock running during power cuts"], ["Communication module", "RF / GPRS / NB-IoT modem (smart meters)"], ["Relay", "switches supply on/off remotely (smart meters)"], ["Plastic case & terminal block", "flame-retardant plastic, brass terminals"]],
      mix: { copper: 5, brass: 3, plastic: 55, pcb: 16, battery: 3, hazardous: 1 },
      risk: "Lithium batteries can catch fire if crushed and must be removed first. Circuit boards contain recoverable copper, gold and silver.",
    },
  ];
  const MIX_COLORS = { copper: "#c26a2d", brass: "#c9a227", plastic: "#5b8def", pcb: "#13804a", battery: "#7a3fb8", hazardous: "#b42318", other: "#a9b4c4" };
  const MIX_LABEL = { copper: "Copper", brass: "Brass", plastic: "Plastic", pcb: "Circuit board", battery: "Battery", hazardous: "Hazardous", other: "Steel, glass & other" };
  function meterSection() {
    const bar = (mix) => {
      const parts = Object.entries(mix).filter(([, v]) => v > 0);
      const other = Math.max(0, 100 - parts.reduce((a, [, v]) => a + v, 0));
      const all = [...parts, ["other", other]];
      return `<div class="mix-bar" role="img" aria-label="Material share: ${all.map(([k, v]) => `${MIX_LABEL[k]} ${v}%`).join(", ")}">${all.map(([k, v]) => `<span style="width:${v}%;background:${MIX_COLORS[k]}" title="${MIX_LABEL[k]} ${v}%"></span>`).join("")}</div>
        <div class="mix-legend">${all.map(([k, v]) => `<span><i style="background:${MIX_COLORS[k]}"></i>${MIX_LABEL[k]} ${v}%</span>`).join("")}</div>`;
    };
    return `<section class="section" id="meter">
      <div class="section-head"><div><div class="eyebrow">Know what is being removed</div><h2>Inside an electricity meter</h2>
        <p>An electricity meter measures the energy (kilowatt-hours, kWh) a home or shop uses. Three kinds are being removed in the smart-meter rollout. Here is what each is made of, and why it must reach a registered recycler.</p></div></div>
      <div class="meters">${METER_TYPES.map((m) => `<article class="meter-card ${m.lead ? "lead" : ""}">
        <div class="mc-head"><span class="mc-ic">${meterIcon(m.key)}</span><div><h3>${m.name}</h3><div class="muted">${m.era} · ${m.weight}</div></div></div>
        <p class="mc-how">${m.how}</p>
        <div class="mc-label">Main components</div>
        <ul class="parts">${m.parts.map(([p, d]) => `<li><b>${p}</b><span>${d}</span></li>`).join("")}</ul>
        <div class="mc-label">What it is made of <span class="muted">(share of weight, illustrative)</span></div>
        ${bar(m.mix)}
        <div class="mc-risk ${m.lead ? "bad" : ""}">${m.lead ? "⚠ " : ""}${m.risk}</div>
      </article>`).join("")}</div>
      <p class="muted" style="margin-top:10px">Material shares are illustrative values for this demonstration — verify before use. Regulators can edit them on the Settings page.</p>
    </section>`;
  }
  function meterIcon(k) {
    // simple line drawings: disc meter vs digital meter
    return k === "EM"
      ? `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="8" y="4" width="32" height="40" rx="5"/><rect x="14" y="10" width="20" height="8" rx="1.5"/><path d="M17 14h2M22 14h2M27 14h2"/><ellipse cx="24" cy="29" rx="10" ry="3.5"/><path d="M24 25.5v7"/><path d="M14 39h20"/></svg>`
      : `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="8" y="4" width="32" height="40" rx="5"/><rect x="13" y="10" width="22" height="10" rx="1.5"/><path d="M17 15h3M22 15h3M27 15h4"/><rect x="15" y="25" width="18" height="10" rx="1.5"/><path d="M19 25v-2M24 25v-2M29 25v-2M19 37v-2M24 37v-2M29 37v-2"/><circle cx="35" cy="40" r="1.2" fill="currentColor"/></svg>`;
  }

  // ---------- PUBLIC ----------
  async function renderPublic() {
    main.innerHTML = `<div class="loading"><span class="spinner"></span>Loading public dashboard…</div>`;
    const d = await api("/public");
    const p = d.portal || { by_role: {} };
    const STEPS = [
      ["Removal", "Installer logs each lot of old meters taken off consumers' walls: place, meter type, count, condition.", "Installer"],
      ["Store receipt", "DISCOM store counts what actually arrived. Any shortfall becomes unaccounted.", "Store officer"],
      ["Sorting", "Each lot goes to one route: Reuse (working meters), Refurbish, or Recycle.", "Store officer"],
      ["Disposal batch", "Recycle lots are weighed and sold — only to a recycler approved by the Regulator.", "Store officer"],
      ["Recycler receipt", "The recycler confirms the count and weight that reached its facility.", "Recycler"],
      ["Recovery", "Copper, brass, plastic, circuit boards and batteries recovered; hazardous waste sent for safe disposal.", "Recycler"],
    ];
    const ROLE_INFO = [
      ["installer", "Installers", "Meter installation contractors who log meters removed in the field.", "plus"],
      ["store", "DISCOM store officers", "Receive, sort and dispatch meters from power-company stores.", "box"],
      ["recycler", "Recycler staff", "Staff of registered recyclers who confirm receipt and recovery.", "factory"],
      ["regulator", "Regulators", "State Pollution Control Board officers who approve recyclers and review alerts.", "shield"],
    ];
    main.innerHTML = `${takeFlash()}
      <section class="hero">
        <div class="eyebrow">Smart-meter rollout · RDSS · e-waste</div>
        <h1>Every removed electricity meter, traced to a registered recycler.</h1>
        <p>India is replacing about 25 crore conventional meters with smart meters by March 2028. Each one removed is e-waste — most contain a circuit board and battery, and pre-2004 meters may contain lead.
        MeterTrace follows every lot from the consumer's premises to recycling and shows exactly where meters go missing.</p>
        <div class="btn-row"><a class="btn white lg" href="#/login">Official login</a><a class="btn light lg" href="#/public" data-scroll="how">How it works</a></div>
        <div class="hero-stats">
          <div class="hero-stat"><div class="v">${n0(d.totals.removed)}</div><div class="k">meters removed</div></div>
          <div class="hero-stat"><div class="v">${pct(d.totals.traced_pct)}</div><div class="k">fully traced</div></div>
          <div class="hero-stat"><div class="v">${n0(d.totals.recycled)}</div><div class="k">at registered recyclers</div></div>
          <div class="hero-stat alert"><div class="v">${n0(d.totals.unaccounted)}</div><div class="k">unaccounted (${pct(d.totals.unaccounted_pct)})</div></div>
        </div>
      </section>

      <section class="section" id="how">
        <div class="section-head"><div><div class="eyebrow">What this portal does</div><h2>How MeterTrace works</h2>
          <p>Six steps, each recorded by the person responsible for it. Nothing moves without a record.</p></div></div>
        <div class="steps">${STEPS.map(([t, txt, who], i) => `<div class="step"><div class="num">${i + 1}</div><h3>${t}</h3><p>${txt}</p><span class="who">${who}</span></div>`).join("")}</div>
        <div class="checks">
          <div class="check"><div class="ic" style="background:var(--bad-soft);color:var(--bad)">${svg("scale")}</div><div><h3>Finds missing meters</h3><p>Counts are compared at every step, by division and state. Gaps show as unaccounted meters in number and percent.</p></div></div>
          <div class="check"><div class="ic" style="background:var(--warn-soft);color:var(--warn)">${svg("bell")}</div><div><h3>Flags irregular records</h3><p>Eight automatic checks — weight mismatches, lead meters sent for reuse, missing battery removal — go to the Regulator's review queue.</p></div></div>
          <div class="check"><div class="ic" style="background:var(--ok-soft);color:var(--ok)">${svg("shield")}</div><div><h3>Records cannot be faked quietly</h3><p>Records are append-only and hash-chained. Any change made behind the scenes is detected by "Verify records".</p></div></div>
        </div>
      </section>

      ${meterSection()}

      <section class="section" id="users">
        <div class="section-head"><div><div class="eyebrow">Portal at a glance</div><h2>Who uses MeterTrace</h2>
          <p>Each organisation logs in with its own account and sees only its part of the process. The public sees this summary.</p></div></div>
        <div class="roles">${ROLE_INFO.map(([r, t, txt, ic]) => `<div class="role-card"><div class="rc-top"><span class="rc-ic">${svg(ic)}</span><span class="rc-n">${n0(p.by_role[r] || 0)}</span></div><h3>${t}</h3><p>${txt}</p></div>`).join("")}</div>
        <div class="usage-strip">
          <div><b>${n0(p.users_total)}</b><span>active user accounts</span></div>
          <div><b>${n0(p.organisations)}</b><span>organisations on the portal</span></div>
          <div><b>${n0(p.recyclers_approved)} / ${n0(p.recyclers_registered)}</b><span>recyclers approved / registered</span></div>
          <div><b>${n0(p.states)} · ${n0(p.divisions)}</b><span>states · divisions covered</span></div>
          <div><b>${n0(p.records)}</b><span>tamper-evident records</span></div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><div><div class="eyebrow">Public dashboard</div><h2>State-wise status</h2><p>Ranked by the share of removed meters that are fully traced.</p></div>
          <button class="btn ghost no-print" onclick="print()">Print</button></div>
        <div class="kpis">
          <div class="kpi"><div class="k">Meters removed</div><div class="v">${n0(d.totals.removed)}</div></div>
          <div class="kpi ok"><div class="k">Reused or refurbished</div><div class="v">${n0(d.totals.reuse + d.totals.refurbish)}</div></div>
          <div class="kpi ok"><div class="k">Recycled</div><div class="v">${n0(d.totals.recycled)}</div></div>
          <div class="kpi bad"><div class="k">Unaccounted</div><div class="v">${n0(d.totals.unaccounted)}</div><div class="s">${pct(d.totals.unaccounted_pct)} of removed</div></div>
          <div class="kpi warn"><div class="k">Pre-2004 (lead risk)</div><div class="v">${n0(d.totals.pre2004)}</div></div>
        </div>
        <div class="card tight"><div class="card-head"><h2>State ranking</h2></div>${rankingTable(d.states)}</div>
        <div class="grid g2">
          <div class="card"><h2>Unaccounted meters by state</h2>${bars(d.states.slice().sort((a, b) => b.unaccounted - a.unaccounted), (s) => s.state, (s) => s.unaccounted, (s) => `${n0(s.unaccounted)} (${pct(s.unaccounted_pct)})`)}</div>
          <div class="card tight"><div class="card-head"><h2>Approved recyclers</h2><span class="muted">Only these may buy old meters</span></div>
            <div class="table-wrap"><table><thead><tr><th>Recycler</th><th>State</th><th>Registration no.</th></tr></thead>
            <tbody>${d.approved_recyclers.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.state)}</td><td class="mono">${esc(r.reg_no)}</td></tr>`).join("")}</tbody></table></div></div>
        </div>
        <p class="muted">Updated ${dtime(d.updated)}${p.last_activity ? ` · last record ${dtime(p.last_activity)}` : ""}. Division-level detail is available to the State Pollution Control Board.</p>
      </section>`;
  }

  // ---------- LOGIN ----------
  function renderLogin() {
    if (S.token) { location.hash = `#/app/${TABS[S.user.role][0][0]}`; return; }
    main.innerHTML = `${takeFlash()}<div class="login-wrap">
      <div class="login-side">
        <div class="eyebrow" style="color:#ffc27f">Authorised users only</div>
        <h2>Secure access to MeterTrace</h2>
        <p>Sign in with the email and password issued to you by the portal administrator. Each role sees its own dashboard.</p>
        <ul>
          <li><span class="tick">✓</span><span><b>Installers</b>log meters removed in the field</span></li>
          <li><span class="tick">✓</span><span><b>DISCOM store officers</b>receive, sort and dispatch meters</span></li>
          <li><span class="tick">✓</span><span><b>Recyclers</b>confirm receipt and record materials recovered</span></li>
          <li><span class="tick">✓</span><span><b>Regulators (SPCB)</b>approve recyclers, review alerts, manage users</span></li>
        </ul>
      </div>
      <form class="login-form" id="loginForm">
        <h1>Sign in</h1><p class="muted">Use your official email ID.</p>
        <div class="field"><label for="email">Email ID</label><input id="email" type="email" autocomplete="username" placeholder="name@organisation" required></div>
        <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>
        <div id="loginErr"></div>
        <button class="btn" type="submit">Sign in</button>
        <p class="muted" style="margin-top:14px">No account? Ask your portal administrator (Regulator) to create one under <b>Users &amp; access</b>.</p>
      </form>
    </div>
    <div class="card tight"><div class="card-head"><div><h2>Demo accounts</h2><p class="muted" style="margin:2px 0 0">For the demonstration. Password for all: <b class="mono">demo123</b></p></div></div>
      <div class="table-wrap"><table class="demo-users"><thead><tr><th>Role</th><th>Email ID</th><th>What they do</th><th></th></tr></thead>
      <tbody>${DEMO_USERS.map(([role, email, what]) => `<tr><td><b>${ROLE_LABEL[role]}</b></td><td class="mono">${email}</td><td>${what}</td>
        <td><button class="btn sm" data-demo="${email}">Use</button></td></tr>`).join("")}</tbody></table></div>
      <p class="muted" style="padding:10px 20px 16px;margin:0">Other recycler logins: sahyadri@, ganga@, kaveri@metertrace.demo (same password).</p>
    </div>`;
    const doLogin = async (email, password, btn) => {
      btn.disabled = true;
      try {
        const r = await api("/login", { email, password });
        S.token = r.token; S.user = r.user; S.data = null; saveSession();
        location.hash = `#/app/${TABS[r.user.role][0][0]}`;
      } catch (e) { $("#loginErr").innerHTML = `<div class="notice bad" style="margin-top:12px">${esc(e.message)}</div>`; }
      finally { btn.disabled = false; }
    };
    $("#loginForm").onsubmit = (e) => { e.preventDefault(); doLogin($("#email").value, $("#pw").value, e.submitter || $("#loginForm button")); };
    $$("[data-demo]").forEach((b) => (b.onclick = () => { $("#email").value = b.dataset.demo; $("#pw").value = "demo123"; doLogin(b.dataset.demo, "demo123", b); }));
  }

  // ---------- INSTALLER ----------
  const PAGES = {};
  PAGES.log = async () => {
    const d = S.data;
    const known = divisionsFrom(d.lots);
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>Step 1 · Log meters removed</h1><p>Record a lot of old meters removed during smart meter installation.</p></div></div>
      <form class="card" id="remForm">
        <div class="fields">
          <div class="field"><label for="f-date">Date removed</label><input type="date" id="f-date" value="${today()}" max="${today()}" required></div>
          <div class="field"><label for="f-state">State</label><select id="f-state" required><option value="">Choose…</option>${d.states.map((s) => `<option>${esc(s)}</option>`).join("")}</select></div>
          <div class="field"><label for="f-district">District</label><input type="text" id="f-district" list="dl-district" required></div>
          <div class="field"><label for="f-division">Division</label><input type="text" id="f-division" list="dl-division" required></div>
          <div class="field"><label for="f-type">Meter type</label><select id="f-type" required><option value="">Choose…</option>${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
          <div class="field"><label for="f-count">Number of meters</label><input type="number" id="f-count" min="1" step="1" required></div>
          <div class="field"><label for="f-cond">Condition</label><select id="f-cond" required><option value="">Choose…</option><option value="working">Working</option><option value="faulty">Faulty</option><option value="damaged">Damaged</option></select></div>
        </div>
        <datalist id="dl-district">${[...new Set(known.map((k) => k.district))].map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
        <datalist id="dl-division">${known.map((k) => `<option value="${esc(k.division)}">`).join("")}</datalist>
        <p class="muted" id="leadHint" hidden>Pre-2004 electronic meters may contain lead. They will be tracked as lead-risk.</p>
        <div class="form-actions"><button class="btn" type="submit">Save removal record</button><span class="muted">A lot ID is assigned automatically. Saved records cannot be edited — use a correction.</span></div>
      </form>
      <div class="card tight"><div class="card-head"><h2>My recent lots</h2><a href="#/app/lots">See all</a></div>${lotsTable(d.lots.slice(-5).reverse())}</div>`;
    $("#f-type").onchange = (e) => ($("#leadHint").hidden = e.target.value !== "E_PRE");
    $("#remForm").onsubmit = (e) => {
      e.preventDefault();
      submitRecord({ kind: "REMOVAL", payload: {
        date: $("#f-date").value, state: $("#f-state").value, district: $("#f-district").value, division: $("#f-division").value,
        meter_type: $("#f-type").value, count: $("#f-count").value, condition: $("#f-cond").value,
      } }, e.submitter);
    };
  };
  PAGES.lots = async () => {
    const d = S.data;
    const title = S.user.role === "installer" ? "My lots" : "All lots and batches";
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>${title}</h1><p>${d.lots.length} lots. Status updates as the store and recyclers add their records.</p></div></div>
      <div class="card tight"><div class="card-head"><h2>Lots</h2></div>${lotsTable(d.lots.slice().reverse())}</div>
      ${S.user.role === "regulator" ? `<div class="card tight"><div class="card-head"><h2>Disposal batches</h2></div>${batchesTable(d.batches.slice().reverse())}</div>` : ""}`;
  };

  // ---------- STORE ----------
  PAGES.overview = async () => {
    const d = S.data;
    const awaitingR = d.lots.filter((l) => !l.receipt).length, awaitingS = d.lots.filter((l) => l.receipt && !l.sort).length;
    const awaitingB = d.lots.filter((l) => l.sort?.route === "recycle" && !l.batch).length;
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>Store overview</h1><p>Meters received, sorted and dispatched from DISCOM stores.</p></div></div>
      ${kpis(d.totals)}
      <div class="grid g3">${[["receive", "1. Receive lots", awaitingR, "lots awaiting store receipt", "inbox"], ["sort", "2. Sort lots", awaitingS, "lots in store, not sorted", "sort"], ["batch", "3. Create batch", awaitingB, "recycle lots awaiting dispatch", "truck"]]
        .map(([id, t, n, s, ic]) => `<a class="card" href="#/app/${id}"><div class="role-card" style="border:0;box-shadow:none;padding:0"><div class="rc-top"><span class="rc-ic">${svg(ic)}</span><span class="rc-n">${n}</span></div><h3>${t}</h3><p>${s} →</p></div></a>`).join("")}
      </div>
      <div class="card"><h2>Flow of meters</h2>${flowChart(d.flow)}</div>
      <div class="card tight"><div class="card-head"><h2>Open alerts</h2><span class="muted">Reviewed by the Regulator</span></div>${alertsTable(d.alerts.filter((a) => a.status !== "closed"), false)}</div>`;
  };

  PAGES.receive = async () => {
    const lots = S.data.lots.filter((l) => !l.receipt);
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>Step 2 · Confirm store receipt</h1><p>Count the meters that actually arrived at the store. Any shortfall becomes "unaccounted".</p></div></div>
      <div class="card tight"><div class="table-wrap"><table>
        <thead><tr><th>Lot</th><th>Removed on</th><th>Division</th><th>Type</th><th class="num">Removed</th><th>Received on</th><th>Count received</th><th></th></tr></thead>
        <tbody>${lots.length ? lots.map((l) => `<tr data-lot="${esc(l.id)}"><td><b>${esc(l.id)}</b></td><td>${dt(l.date)}</td><td>${esc(l.division)}<div class="muted">${esc(l.state)}</div></td>
          <td>${esc(TYPE_SHORT[l.meter_type])}</td><td class="num">${n0(l.count)}</td>
          <td><input type="date" value="${today()}" max="${today()}" aria-label="Date received"></td>
          <td><input type="number" min="0" step="1" value="${l.count}" aria-label="Count received"></td>
          <td><button class="btn sm" data-act="receive">Confirm</button></td></tr>`).join("") : `<tr><td colspan="8" class="empty">No lots awaiting receipt.</td></tr>`}</tbody></table></div></div>`;
    $$("[data-act=receive]").forEach((b) => (b.onclick = () => {
      const tr = b.closest("tr"); const [date, count] = $$("input", tr).map((i) => i.value);
      submitRecord({ kind: "STORE_RECEIPT", ref: tr.dataset.lot, payload: { date, count } }, b);
    }));
  };

  PAGES.sort = async () => {
    const lots = S.data.lots.filter((l) => l.receipt && !l.sort);
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>Step 3 · Sort lots</h1><p>Send each lot to one route: <b>Reuse</b> (working meters for areas not yet covered), <b>Refurbish</b>, or <b>Recycle</b>.</p></div></div>
      <div class="notice info">Pre-2004 electronic meters may contain lead and should go to Recycle. Routing them to Reuse is allowed but is flagged to the Regulator.</div>
      <div class="card tight"><div class="table-wrap"><table>
        <thead><tr><th>Lot</th><th>Received</th><th>Division</th><th>Type</th><th>Condition</th><th class="num">At store</th><th>Route</th><th>Count</th><th>Date</th><th></th></tr></thead>
        <tbody>${lots.length ? lots.map((l) => `<tr data-lot="${esc(l.id)}" data-type="${l.meter_type}"><td><b>${esc(l.id)}</b></td><td>${dt(l.receipt.date)}</td><td>${esc(l.division)}</td>
          <td>${esc(TYPE_SHORT[l.meter_type])}${l.meter_type === "E_PRE" ? ` <span class="pill warn">lead risk</span>` : ""}</td><td>${esc(l.condition)}</td><td class="num">${n0(l.receipt.count)}</td>
          <td><select aria-label="Route"><option value="">Choose…</option><option value="reuse">Reuse</option><option value="refurbish">Refurbish</option><option value="recycle">Recycle</option></select></td>
          <td><input type="number" min="0" step="1" value="${l.receipt.count}" aria-label="Count sorted"></td>
          <td><input type="date" value="${today()}" max="${today()}" aria-label="Date sorted"></td>
          <td><button class="btn sm" data-act="sort">Save</button></td></tr>`).join("") : `<tr><td colspan="10" class="empty">No lots waiting to be sorted.</td></tr>`}</tbody></table></div></div>`;
    $$("[data-act=sort]").forEach((b) => (b.onclick = () => {
      const tr = b.closest("tr"); const route = $("select", tr).value; const [count, date] = $$("input", tr).map((i) => i.value);
      if (!route) return toast("Choose a route first", true);
      if (tr.dataset.type === "E_PRE" && route === "reuse" && !confirm("Pre-2004 meters may contain lead. Sending them to Reuse will be flagged to the Regulator. Continue?")) return;
      submitRecord({ kind: "SORT", ref: tr.dataset.lot, payload: { route, count, date } }, b);
    }));
  };

  PAGES.batch = async () => {
    const d = S.data;
    const cands = d.lots.filter((l) => l.sort?.route === "recycle" && !l.batch);
    const groups = new Map();
    for (const l of cands) { const k = `${l.state}|${l.division}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); }
    const keys = [...groups.keys()];
    const W = d.settings.avg_weight;
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>Step 4 · Create disposal batch</h1><p>Group recycle lots from one division, weigh them, and sell only to a Regulator-approved recycler.</p></div></div>
      ${keys.length ? `<form class="card" id="batchForm">
        <div class="fields">
          <div class="field"><label for="b-div">Division</label><select id="b-div">${keys.map((k) => `<option value="${esc(k)}">${esc(k.split("|")[1])} (${esc(k.split("|")[0])}) – ${groups.get(k).length} lot(s)</option>`).join("")}</select></div>
        </div>
        <div id="lotPick" style="margin-top:12px"></div>
        <div class="fields" style="margin-top:12px">
          <div class="field"><label for="b-date">Dispatch date</label><input type="date" id="b-date" value="${today()}" max="${today()}" required></div>
          <div class="field"><label for="b-count">Meters in batch</label><input type="number" id="b-count" min="1" step="1" required></div>
          <div class="field"><label for="b-kg">Weighed weight (kg)</label><input type="number" id="b-kg" min="0.1" step="0.1" required><span class="hint" id="b-exp"></span></div>
          <div class="field"><label for="b-buyer">Buyer</label><select id="b-buyer" required>
            <option value="">Choose…</option>
            ${d.recyclers.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}${r.status !== "approved" ? ` — NOT APPROVED (${esc(r.status)})` : ""}</option>`).join("")}
            <option value="OTHER">Other buyer (not on list)…</option></select></div>
          <div class="field" id="otherWrap" hidden><label for="b-other">Other buyer name</label><input type="text" id="b-other"></div>
          <div class="field"><label for="b-price">Sale price (₹ per kg)</label><input type="number" id="b-price" min="0" step="0.5" required></div>
        </div>
        <div class="form-actions"><button class="btn" type="submit">Create batch</button><span class="muted">Sales to buyers not approved by the Regulator are blocked and reported.</span></div>
      </form>` : `<div class="card empty">No lots are waiting for dispatch. Sort lots to "Recycle" first.</div>`}
      <div class="card tight"><div class="card-head"><h2>Recent batches</h2><a href="#/app/batches">All batches</a></div>${batchesTable(d.batches.slice(-5).reverse())}</div>`;
    if (!keys.length) return;
    const pick = () => {
      const lots = groups.get($("#b-div").value) || [];
      $("#lotPick").innerHTML = `<div class="lbl" style="font-size:13px;font-weight:600;color:var(--ink-2)">Lots to include</div>
        <div class="table-wrap"><table><thead><tr><th></th><th>Lot</th><th>Type</th><th class="num">Sorted for recycling</th><th class="num">Expected weight</th></tr></thead>
        <tbody>${lots.map((l) => `<tr><td><input type="checkbox" checked value="${esc(l.id)}" data-c="${l.sort.count}" data-w="${l.sort.count * (W[l.meter_type] || 1)}" aria-label="Include ${esc(l.id)}"></td>
          <td>${esc(l.id)}</td><td>${esc(TYPE_SHORT[l.meter_type])}</td><td class="num">${n0(l.sort.count)}</td><td class="num">${kg(l.sort.count * (W[l.meter_type] || 1))}</td></tr>`).join("")}</tbody></table></div>`;
      $$("#lotPick input").forEach((c) => (c.onchange = calc)); calc();
    };
    const calc = () => {
      const sel = $$("#lotPick input:checked");
      const c = sel.reduce((a, i) => a + +i.dataset.c, 0), w = sel.reduce((a, i) => a + +i.dataset.w, 0);
      $("#b-count").value = c || "";
      $("#b-exp").textContent = c ? `Expected about ${kg(Math.round(w * 10) / 10)} (tolerance ±${d.settings.tolerance_pct}%)` : "";
    };
    $("#b-div").onchange = pick; pick();
    $("#b-buyer").onchange = (e) => ($("#otherWrap").hidden = e.target.value !== "OTHER");
    $("#batchForm").onsubmit = (e) => {
      e.preventDefault();
      const lots = $$("#lotPick input:checked").map((i) => i.value);
      if (!lots.length) return toast("Select at least one lot", true);
      const buyer = $("#b-buyer").value;
      submitRecord({ kind: "BATCH", payload: {
        date: $("#b-date").value, lots, count: $("#b-count").value, weight_kg: $("#b-kg").value,
        buyer_id: buyer, buyer_name: buyer === "OTHER" ? $("#b-other").value : "", price_per_kg: $("#b-price").value,
      } }, e.submitter);
    };
  };

  PAGES.batches = async () => {
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>Disposal batches</h1><p>Expected weight = meters × average weight per type. Differences beyond ±${S.data.settings.tolerance_pct}% are flagged.</p></div></div>
      <div class="card tight">${batchesTable(S.data.batches.slice().reverse())}</div>`;
  };

  PAGES.recon = async () => {
    const d = S.data;
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>Reconciliation by division</h1><p>Removed → received at store → sorted → dispatched → received by recycler. Gaps are unaccounted meters.</p></div>
      <button class="btn ghost no-print" onclick="print()">Print</button></div>
      <div class="card tight">${reconTable(d.divisions, d.totals)}</div>
      <div class="grid g2">
        <div class="card"><h2>Unaccounted meters by state</h2>${bars(d.state_summary.slice().sort((a, b) => b.unaccounted - a.unaccounted), (s) => s.state, (s) => s.unaccounted, (s) => `${n0(s.unaccounted)} (${pct(s.unaccounted_pct)})`)}</div>
        <div class="card"><h2>Unaccounted meters by division</h2>${bars(d.divisions.filter((x) => x.unaccounted > 0).sort((a, b) => b.unaccounted - a.unaccounted), (x) => x.division, (x) => x.unaccounted, (x) => `${n0(x.unaccounted)} (${pct(x.unaccounted_pct)})`)}</div>
      </div>`;
  };

  // ---------- RECYCLER ----------
  PAGES.incoming = async () => {
    const bs = S.data.batches.filter((b) => b.status === "in_transit");
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>Step 5 · Confirm receipt</h1><p>Count and weigh each batch when it arrives at your facility.</p></div></div>
      <div class="card tight"><div class="table-wrap"><table>
        <thead><tr><th>Batch</th><th>Dispatched</th><th>From</th><th class="num">Meters sent</th><th class="num">Weight sent</th><th>Received on</th><th>Meters received</th><th>Weight received (kg)</th><th></th></tr></thead>
        <tbody>${bs.length ? bs.map((b) => `<tr data-b="${esc(b.id)}"><td><b>${esc(b.id)}</b></td><td>${dt(b.date)}</td><td>${esc(b.division)}<div class="muted">${esc(b.state)}</div></td>
          <td class="num">${n0(b.count)}</td><td class="num">${kg(b.weight_kg)}</td>
          <td><input type="date" value="${today()}" max="${today()}" aria-label="Date received"></td>
          <td><input type="number" min="0" step="1" value="${b.count}" aria-label="Meters received"></td>
          <td><input type="number" min="0" step="0.1" value="${b.weight_kg}" aria-label="Weight received"></td>
          <td><button class="btn sm" data-act="rr">Confirm</button></td></tr>`).join("") : `<tr><td colspan="9" class="empty">No batches in transit to you.</td></tr>`}</tbody></table></div></div>`;
    $$("[data-act=rr]").forEach((b) => (b.onclick = () => {
      const tr = b.closest("tr"); const [date, count, weight_kg] = $$("input", tr).map((i) => i.value);
      submitRecord({ kind: "RECYCLER_RECEIPT", ref: tr.dataset.b, payload: { date, count, weight_kg } }, b);
    }));
  };

  PAGES.recovery = async () => {
    const d = S.data; const bs = d.batches.filter((b) => b.status === "received");
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>Step 6 · Record materials recovered</h1><p>Recording recovery closes the batch.</p></div></div>
      ${bs.length ? `<form class="card" id="recForm">
        <div class="fields"><div class="field"><label for="r-b">Batch</label><select id="r-b">${bs.map((b) => `<option value="${esc(b.id)}">${esc(b.id)} — ${n0(b.receipt.count)} meters, ${kg(b.receipt.weight_kg)}</option>`).join("")}</select></div>
          <div class="field"><label for="r-date">Date</label><input type="date" id="r-date" value="${today()}" max="${today()}" required></div></div>
        <div id="r-est" class="muted" style="margin:10px 0"></div>
        <div class="fields">${MATERIALS.map((m) => `<div class="field"><label for="r-${m}">${MAT_LABEL[m]} (kg)</label><input type="number" id="r-${m}" min="0" step="0.1" ${m === "battery" ? "" : 'value="0"'}>${m === "battery" ? `<span class="hint">Batteries must be removed from electronic meters. Leaving this blank or 0 will be flagged.</span>` : ""}</div>`).join("")}</div>
        <div class="form-actions"><button class="btn" type="submit">Save and close batch</button><span class="muted">Total recovered cannot sensibly exceed the batch weight — that is flagged.</span></div>
      </form>` : `<div class="card empty">No received batches awaiting a recovery entry.</div>`}
      <div class="card tight"><div class="card-head"><h2>My batches</h2></div>${batchesTable(d.batches.slice().reverse())}</div>`;
    if (!bs.length) return;
    const showEst = () => {
      const b = bs.find((x) => x.id === $("#r-b").value);
      const C = d.settings.content;
      const est = MATERIALS.map((m) => [m, b.types.reduce((a, t) => a + b.receipt.weight_kg * (b.mix[t] || 0) * ((C[t]?.[m] || 0) / 100), 0)]);
      $("#r-est").innerHTML = `Meter types: ${b.types.map((t) => TYPE_SHORT[t]).join(", ")}. Typical yield for ${kg(b.receipt.weight_kg)}: ` +
        est.map(([m, v]) => `${MAT_LABEL[m].split(" (")[0]} ≈ ${kg(Math.round(v))}`).join(" · ");
    };
    $("#r-b").onchange = showEst; showEst();
    $("#recForm").onsubmit = (e) => {
      e.preventDefault();
      const payload = { date: $("#r-date").value };
      for (const m of MATERIALS) payload[m] = $(`#r-${m}`).value;
      submitRecord({ kind: "RECOVERY", ref: $("#r-b").value, payload }, e.submitter);
    };
  };

  PAGES.mybatches = async () => {
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>My batches</h1><p>Batches sold to ${esc(S.user.org)}.</p></div></div>
      <div class="card tight">${batchesTable(S.data.batches.slice().reverse())}</div>
      ${S.data.alerts.length ? `<div class="card tight"><div class="card-head"><h2>Alerts on my batches</h2></div>${alertsTable(S.data.alerts, false)}</div>` : ""}`;
  };

  // ---------- REGULATOR ----------
  PAGES.dashboard = async () => {
    const d = S.data;
    const open = d.alerts.filter((a) => a.status === "open");
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>State Pollution Control Board dashboard</h1><p>All states. Updated ${dtime(new Date().toISOString())}.</p></div>
      <div class="btn-row no-print"><a class="btn ghost" href="#/app/alerts">${open.length} open alert(s)</a><button class="btn ghost" onclick="print()">Print</button></div></div>
      ${kpis(d.totals)}
      <div class="card"><h2>Flow of meters: removal to recycling</h2>${flowChart(d.flow)}</div>
      <div class="grid g2">
        <div class="card"><h2>Unaccounted meters by state</h2>${bars(d.state_summary.slice().sort((a, b) => b.unaccounted - a.unaccounted), (s) => s.state, (s) => s.unaccounted, (s) => `${n0(s.unaccounted)} (${pct(s.unaccounted_pct)})`)}</div>
        <div class="card"><h2>Unaccounted meters by division</h2>${bars(d.divisions.filter((x) => x.unaccounted > 0).sort((a, b) => b.unaccounted - a.unaccounted), (x) => `${x.division}`, (x) => x.unaccounted, (x) => `${n0(x.unaccounted)} (${pct(x.unaccounted_pct)})`)}</div>
      </div>
      <div class="card tight"><div class="card-head"><h2>State ranking by % of meters fully traced</h2></div>${rankingTable(d.state_summary)}
        <div style="padding:12px 18px">${bars(d.state_summary, (s) => s.state, (s) => s.traced_pct, (s) => pct(s.traced_pct), "green")}</div></div>
      <div class="grid g2">${leadCard(d.lead)}${materialsCard(d.materials)}</div>
      <div class="card tight"><div class="card-head"><h2>Open alerts</h2><a href="#/app/alerts">Review all</a></div>${alertsTable(open.slice(0, 6), false)}</div>`;
  };

  PAGES.alerts = async () => {
    const d = S.data;
    const editable = S.user.role === "regulator";
    const counts = { open: 0, under_review: 0, closed: 0 }; d.alerts.forEach((a) => counts[a.status]++);
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>Review queue</h1><p>Irregular records found automatically by the server. Every status change is itself recorded in the ledger.</p></div></div>
      <div class="kpis"><div class="kpi bad"><div class="k">Open</div><div class="v">${counts.open}</div></div><div class="kpi warn"><div class="k">Under review</div><div class="v">${counts.under_review}</div></div><div class="kpi ok"><div class="k">Closed</div><div class="v">${counts.closed}</div></div></div>
      <div class="card"><h3>Rules checked on every new record</h3><div class="legend" style="margin:0">${Object.values(d.rules).map((r) => `<span class="pill grey">${esc(r)}</span>`).join("")}</div></div>
      <div class="card tight">${alertsTable(d.alerts, editable)}</div>`;
    $$("[data-alert-save]").forEach((b) => (b.onclick = async () => {
      const id = b.dataset.alertSave; const status = $(`[data-alert="${id}"]`).value;
      const note = prompt("Note for this status change (optional):", "") ?? "";
      b.disabled = true;
      try { await api(`/alerts/${id}/status`, { status, note }); setFlash("ok", `Alert #${id} set to ${status.replace("_", " ")}.`); await refresh(); }
      catch (e) { toast(e.message, true); b.disabled = false; }
    }));
  };

  PAGES.recyclers = async () => {
    const d = S.data;
    const pillFor = (s) => `<span class="pill ${s === "approved" ? "ok" : s === "pending" ? "warn" : "bad"}">${s}</span>`;
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>Registered recyclers</h1><p>Store officers can only sell batches to recyclers marked <b>approved</b>.</p></div></div>
      <div class="card tight"><div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>State</th><th>Registration no.</th><th class="num">Capacity (t/yr)</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>${d.recyclers.map((r) => `<tr><td>${esc(r.id)}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.state)}</td><td class="mono">${esc(r.reg_no)}</td><td class="num">${n0(r.capacity_tpa)}</td><td>${pillFor(r.status)}</td>
        <td class="nowrap">${r.status !== "approved" ? `<button class="btn sm" data-rs="${esc(r.id)}" data-to="approved">Approve</button>` : ""}
          ${r.status !== "suspended" ? `<button class="btn sm danger" data-rs="${esc(r.id)}" data-to="suspended">Suspend</button>` : ""}</td></tr>`).join("")}</tbody></table></div></div>
      <form class="card" id="addRec"><h2>Register a new recycler</h2><div class="fields">
        <div class="field"><label for="n-name">Name</label><input type="text" id="n-name" required></div>
        <div class="field"><label for="n-state">State</label><select id="n-state" required>${d.states.map((s) => `<option>${esc(s)}</option>`).join("")}</select></div>
        <div class="field"><label for="n-reg">Registration no.</label><input type="text" id="n-reg" required></div>
        <div class="field"><label for="n-cap">Capacity (tonnes/yr)</label><input type="number" id="n-cap" min="0" step="1" value="0"></div></div>
        <div class="form-actions"><button class="btn" type="submit">Register (pending)</button></div></form>`;
    $$("[data-rs]").forEach((b) => (b.onclick = async () => {
      const reason = prompt(`Reason for setting ${b.dataset.rs} to ${b.dataset.to}:`, b.dataset.to === "approved" ? "Inspection and documents verified" : "");
      if (reason === null) return;
      b.disabled = true;
      try { const r = await api(`/recyclers/${b.dataset.rs}/status`, { status: b.dataset.to, reason }); setFlash("ok", esc(r.message)); await refresh(); }
      catch (e) { toast(e.message, true); b.disabled = false; }
    }));
    $("#addRec").onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await api("/recyclers", { name: $("#n-name").value, state: $("#n-state").value, reg_no: $("#n-reg").value, capacity_tpa: $("#n-cap").value }); setFlash("ok", esc(r.message)); await refresh(); }
      catch (err) { toast(err.message, true); }
    };
  };

  PAGES.settings = async () => {
    const s = S.data.settings;
    const types = Object.keys(TYPE_LABEL);
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>Settings</h1><p>Used for expected weights, material estimates, scrap value and two of the irregularity rules.</p></div></div>
      <div class="notice warn"><b>Illustrative values, verify before use.</b>These defaults are placeholders for demonstration, not measured or official figures.</div>
      <form id="setForm">
        <div class="card"><h2>Average weight per meter (kg)</h2><div class="fields">${types.map((t) => `<div class="field"><label for="w-${t}">${TYPE_LABEL[t]}</label><input type="number" step="0.01" min="0.01" id="w-${t}" value="${s.avg_weight[t]}"></div>`).join("")}</div></div>
        <div class="card tight"><div class="card-head"><h2>Material content (% of meter weight)</h2></div><div class="table-wrap"><table><thead><tr><th>Meter type</th>${MATERIALS.map((m) => `<th>${MAT_LABEL[m].split(" (")[0]}</th>`).join("")}</tr></thead>
          <tbody>${types.map((t) => `<tr><td><b>${TYPE_LABEL[t]}</b></td>${MATERIALS.map((m) => `<td><input type="number" step="0.1" min="0" max="100" id="c-${t}-${m}" value="${s.content[t][m]}" aria-label="${TYPE_LABEL[t]} ${m} %"></td>`).join("")}</tr>`).join("")}</tbody></table></div>
          <p class="muted" style="padding:0 18px">The rest of the weight is steel, glass and other parts not tracked here.</p></div>
        <div class="card"><h2>Scrap price (₹ per kg)</h2><div class="fields">${MATERIALS.map((m) => `<div class="field"><label for="p-${m}">${MAT_LABEL[m].split(" (")[0]}</label><input type="number" step="1" min="0" id="p-${m}" value="${s.price[m]}"></div>`).join("")}</div></div>
        <div class="card"><h2>Rule thresholds</h2><div class="fields">
          <div class="field"><label for="tol">Weight tolerance (± %)</label><input type="number" step="0.5" min="0" max="100" id="tol" value="${s.tolerance_pct}"><span class="hint">Weighed vs expected weight beyond this is flagged.</span></div>
          <div class="field"><label for="days">Storage day limit</label><input type="number" step="1" min="1" id="days" value="${s.store_days_limit}"><span class="hint">Lots held in store longer than this are flagged.</span></div></div></div>
        <div class="form-actions"><button class="btn" type="submit">Save settings</button><span class="muted">Changes apply to all dashboards immediately and are logged in the ledger.</span></div>
      </form>`;
    $("#setForm").onsubmit = async (e) => {
      e.preventDefault();
      const v = (id) => $("#" + id).value;
      const settings = { avg_weight: {}, content: {}, price: {}, tolerance_pct: v("tol"), store_days_limit: v("days") };
      for (const t of types) { settings.avg_weight[t] = v(`w-${t}`); settings.content[t] = {}; for (const m of MATERIALS) settings.content[t][m] = v(`c-${t}-${m}`); }
      for (const m of MATERIALS) settings.price[m] = v(`p-${m}`);
      const b = e.submitter; b.disabled = true;
      try { await api("/settings", { settings }); setFlash("ok", "Settings saved. Dashboards and rules now use the new values."); await refresh(); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    };
  };

  // ---------- RECORDS & INTEGRITY (all roles) ----------
  function summarize(r) {
    const p = r.payload || {};
    switch (r.kind) {
      case "REMOVAL": return `${n0(p.count)} × ${TYPE_SHORT[p.meter_type] || p.meter_type}, ${p.condition}, ${p.division} (${p.state}), removed ${dt(p.date)}`;
      case "STORE_RECEIPT": return `${n0(p.count)} received at store on ${dt(p.date)}`;
      case "SORT": return `${n0(p.count)} sent to ${ROUTE_LABEL[p.route] || p.route} on ${dt(p.date)}`;
      case "BATCH": return `${n0(p.count)} meters, ${kg(p.weight_kg)} → ${p.buyer_name} @ ₹${p.price_per_kg}/kg; lots ${(p.lots || []).join(", ")}; ${dt(p.date)}`;
      case "RECYCLER_RECEIPT": return `${n0(p.count)} meters, ${kg(p.weight_kg)} received on ${dt(p.date)}`;
      case "RECOVERY": return MATERIALS.map((m) => `${MAT_LABEL[m].split(" (")[0]} ${p[m] === null || p[m] === undefined ? "—" : p[m]}`).join(", ") + ` (kg), ${dt(p.date)}`;
      case "CORRECTION": { const { reason, ...f } = p; return `Corrects record #${r.corrects}: ${Object.entries(f).map(([k, v]) => `${k} → ${v}`).join(", ")}. Reason: "${reason}"`; }
      case "RECYCLER_STATUS": return `${p.from || "new"} → ${p.to}${p.reason ? `: ${p.reason}` : ""}`;
      case "ALERT_STATUS": return `${p.from} → ${p.to}${p.note ? `: ${p.note}` : ""}`;
      case "SETTINGS_CHANGE": return `Tolerance ±${p.tolerance_pct}%, storage limit ${p.store_days_limit} days`;
      case "USER_CREATED": return `${p.name} (${p.email}) added as ${ROLE_LABEL[p.role] || p.role}, ${p.org}`;
      case "USER_STATUS": return `${p.name}: access ${p.active ? "restored" : "deactivated"}`;
      case "USER_PASSWORD": return "Password changed by the account holder";
      default: return JSON.stringify(p);
    }
  }

  PAGES.records = async () => {
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><h1>Records & integrity</h1><p>Every record is append-only. Each one stores the SHA-256 hash of the record before it, forming a chain.</p></div></div>
      <div class="card"><h2>Check the record chain</h2>
        <p class="muted">The server recalculates every hash from the stored data. If anyone changed a record directly in the database, its hash no longer matches.</p>
        <div class="btn-row"><button class="btn" id="verifyBtn">Verify records</button>
          <button class="btn warnb" id="tamperBtn">Demo: tamper with a record</button>
          <button class="btn ghost" id="untamperBtn">Undo tamper</button></div>
        <div id="verifyOut" style="margin-top:12px"></div></div>
      <div class="card tight"><div class="card-head"><h2>Ledger</h2><span class="muted" id="ledgerCount"></span></div><div id="ledger"><div class="loading">Loading records…</div></div></div>`;
    $("#verifyBtn").onclick = verify;
    $("#tamperBtn").onclick = async () => {
      if (!confirm("DEMO ONLY: this changes one stored record directly in the database (bypassing the app), as a dishonest insider might. Then press 'Verify records' to see it detected. Continue?")) return;
      try {
        const r = await api("/demo/tamper", {});
        $("#verifyOut").innerHTML = r.already ? `<div class="notice warn">Record #${r.seq} is already tampered. Press Verify records.</div>` :
          `<div class="notice warn"><b>Record #${r.seq} (${esc(r.ref)}) was changed in the database.</b>Removed count edited from ${n0(r.old_count)} to ${n0(r.new_count)} — this would hide ${n0(r.old_count - r.new_count)} missing meters. Now press <b>Verify records</b>.</div>`;
        S.data = null; await loadState(); loadLedger();
      } catch (e) { toast(e.message, true); }
    };
    $("#untamperBtn").onclick = async () => {
      try { const r = await api("/demo/untamper", {}); $("#verifyOut").innerHTML = `<div class="notice info">${r.restored ? `Restored ${r.restored} tampered record(s) to their original values.` : "Nothing to undo."} Press Verify records to recheck.</div>`; await loadState(); loadLedger(); }
      catch (e) { toast(e.message, true); }
    };
    loadLedger();
  };

  async function verify() {
    const b = $("#verifyBtn"); b.disabled = true; b.textContent = "Checking…";
    try {
      const r = await api("/verify", {});
      const chain = (n, broken) => `<div class="chain" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<span class="${broken && i + 1 === broken ? "broken" : broken && i + 1 > broken ? "after" : ""}" title="#${i + 1}"></span>`).join("")}</div>`;
      $("#verifyOut").innerHTML = r.ok
        ? `<div class="notice ok"><b>All ${n0(r.total)} records verified.</b>Every hash matches its contents and links to the record before it. Latest hash: <span class="mono">${esc(r.last_hash.slice(0, 16))}…</span>${chain(r.total)}</div>`
        : `<div class="notice bad"><b>Chain broken at record #${r.broken_seq} (${esc(KIND_LABEL[r.kind] || r.kind)}, ${esc(r.ref)}).</b>${esc(r.reason)}. ${r.checked - 1} record(s) before it are intact.
           ${r.stored_hash ? `<br>Stored hash: <span class="mono">${esc(r.stored_hash.slice(0, 16))}…</span> · Recalculated: <span class="mono">${esc(r.recomputed_hash.slice(0, 16))}…</span>` : ""}${chain(r.total, r.broken_seq)}</div>`;
    } catch (e) { toast(e.message, true); }
    finally { b.disabled = false; b.textContent = "Verify records"; }
  }

  async function loadLedger() {
    const box = $("#ledger"); if (!box) return;
    try {
      const { records } = await api("/ledger");
      $("#ledgerCount").textContent = `${records.length} record(s), newest first`;
      const corrected = new Map();
      records.forEach((r) => { if (r.kind === "CORRECTION") corrected.set(Number(r.corrects), [...(corrected.get(Number(r.corrects)) || []), r.seq]); });
      box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>#</th><th>Saved</th><th>Type</th><th>Lot / batch</th><th>By</th><th>Details</th><th>Previous hash</th><th>This hash</th><th></th></tr></thead>
        <tbody>${records.map((r) => {
          const canCorrect = CORRECTABLE[r.kind] && KIND_ROLE[r.kind] === S.user.role;
          const cb = corrected.get(Number(r.seq));
          return `<tr><td><b>${r.seq}</b></td><td class="nowrap">${dtime(r.created_at)}</td>
            <td>${esc(KIND_LABEL[r.kind] || r.kind)}${cb ? `<div><span class="pill info">corrected by #${cb.join(", #")}</span></div>` : ""}</td>
            <td class="nowrap">${esc(r.ref)}</td><td>${esc(r.created_by_name)}</td><td>${esc(summarize(r))}</td>
            <td class="mono" title="${esc(r.prev_hash)}">${esc(r.prev_hash.slice(0, 10))}…</td><td class="mono" title="${esc(r.hash)}">${esc(r.hash.slice(0, 10))}…</td>
            <td>${canCorrect ? `<button class="btn sm ghost" data-correct="${r.seq}">Correct</button>` : ""}</td></tr>`;
        }).join("")}</tbody></table></div>`;
      $$("[data-correct]").forEach((b) => (b.onclick = () => correctionModal(records.find((x) => String(x.seq) === b.dataset.correct))));
    } catch (e) { box.innerHTML = `<div class="notice bad">${esc(e.message)}</div>`; }
  }

  function correctionModal(r) {
    const p = r.payload;
    const input = (k) => {
      const v = p[k] ?? "";
      if (k === "date") return `<input type="date" name="${k}" value="${esc(v)}" max="${today()}">`;
      if (k === "route") return `<select name="${k}">${Object.entries(ROUTE_LABEL).map(([a, b]) => `<option value="${a}" ${a === v ? "selected" : ""}>${b}</option>`).join("")}</select>`;
      if (k === "meter_type") return `<select name="${k}">${Object.entries(TYPE_LABEL).map(([a, b]) => `<option value="${a}" ${a === v ? "selected" : ""}>${b}</option>`).join("")}</select>`;
      if (k === "condition") return `<select name="${k}">${["working", "faulty", "damaged"].map((a) => `<option ${a === v ? "selected" : ""}>${a}</option>`).join("")}</select>`;
      if (k === "district" || k === "division") return `<input type="text" name="${k}" value="${esc(v)}">`;
      return `<input type="number" name="${k}" step="${k === "count" ? 1 : 0.1}" min="0" value="${esc(v)}">`;
    };
    openModal(`Correct record #${r.seq}`, `
      <p class="muted">The original record #${r.seq} (${esc(KIND_LABEL[r.kind])}, ${esc(r.ref)}) stays unchanged. A new correction record is added and linked to it. Change only what was wrong.</p>
      <form id="corrForm"><div class="fields">${CORRECTABLE[r.kind].map((k) => `<div class="field"><label>${esc(MAT_LABEL[k] ? MAT_LABEL[k].split(" (")[0] + " (kg)" : k.replace("_", " "))}</label>${input(k)}</div>`).join("")}</div>
        <div class="field" style="margin-top:12px"><label for="c-reason">Reason for correction</label><textarea id="c-reason" rows="2" required minlength="5"></textarea></div>
        <div class="form-actions"><button class="btn" type="submit">Save correction</button><button class="btn ghost" type="button" id="corrCancel">Cancel</button></div></form>`, (root) => {
      $("#corrCancel", root).onclick = closeModal;
      $("#corrForm", root).onsubmit = async (e) => {
        e.preventDefault();
        const payload = { reason: $("#c-reason", root).value };
        $$("[name]", root).forEach((el) => { if (String(el.value) !== String(p[el.name] ?? "")) payload[el.name] = el.value; });
        if (Object.keys(payload).length < 2) return toast("Change at least one value", true);
        const b = e.submitter; b.disabled = true;
        try { const res = await api("/records", { kind: "CORRECTION", corrects: r.seq, payload }); closeModal(); setFlash("ok", esc(res.message)); await refresh(); }
        catch (err) { toast(err.message, true); b.disabled = false; }
      };
    });
  }

  // ---------- USERS & ACCESS (Regulator) ----------
  PAGES.users = async () => {
    main.innerHTML = `<div class="loading"><span class="spinner"></span>Loading users…</div>`;
    const { users, recyclers } = await api("/users");
    const by = { installer: 0, store: 0, recycler: 0, regulator: 0 };
    users.filter((u) => u.active).forEach((u) => by[u.role]++);
    const week = Date.now() - 7 * 86400000;
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><div class="crumbs">Administration</div><h1>Users &amp; access</h1>
      <p>Create login accounts (email ID + password) for installers, store officers, recyclers and regulators. Every change is recorded in the ledger.</p></div></div>
      <div class="kpis">
        <div class="kpi"><div class="k">Active accounts</div><div class="v">${users.filter((u) => u.active).length}</div><div class="s">${users.filter((u) => !u.active).length} deactivated</div></div>
        <div class="kpi info"><div class="k">Installers</div><div class="v">${by.installer}</div></div>
        <div class="kpi info"><div class="k">Store officers</div><div class="v">${by.store}</div></div>
        <div class="kpi info"><div class="k">Recycler staff</div><div class="v">${by.recycler}</div></div>
        <div class="kpi info"><div class="k">Regulators</div><div class="v">${by.regulator}</div></div>
        <div class="kpi ok"><div class="k">Signed in last 7 days</div><div class="v">${users.filter((u) => u.last_login && Date.parse(u.last_login) > week).length}</div></div>
      </div>
      <form class="card" id="newUser"><h2>Create an account</h2>
        <div class="fields">
          <div class="field"><label for="u-name">Full name</label><input type="text" id="u-name" required></div>
          <div class="field"><label for="u-email">Email ID (used to sign in)</label><input type="email" id="u-email" required></div>
          <div class="field"><label for="u-role">Role</label><select id="u-role" required><option value="">Choose…</option>${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
          <div class="field"><label for="u-org">Organisation</label><input type="text" id="u-org" placeholder="e.g. UPPCL Lucknow Store" required></div>
          <div class="field" id="u-recWrap" hidden><label for="u-rec">Works for recycler</label><select id="u-rec">${recyclers.map((r) => `<option value="${esc(r.id)}">${esc(r.name)} (${esc(r.status)})</option>`).join("")}</select></div>
          <div class="field"><label for="u-pw">Initial password</label><div class="btn-row" style="flex-wrap:nowrap"><input type="text" id="u-pw" minlength="8" required autocomplete="off"><button type="button" class="btn ghost sm" id="u-gen">Generate</button></div><span class="hint">At least 8 characters with letters and numbers. Share it with the person securely.</span></div>
        </div>
        <div class="form-actions"><button class="btn" type="submit">Create account</button></div>
      </form>
      <div class="card tight"><div class="card-head"><h2>All accounts (${users.length})</h2></div><div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email ID</th><th>Role</th><th>Organisation</th><th class="num">Records</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead>
        <tbody>${users.map((u) => `<tr><td><b>${esc(u.name)}</b>${u.demo ? ` <span class="pill grey">demo</span>` : ""}${u.id === S.user.id ? ` <span class="pill info">you</span>` : ""}</td>
          <td class="mono">${esc(u.email)}</td><td>${esc(ROLE_LABEL[u.role])}</td><td>${esc(u.org)}</td><td class="num">${n0(u.records)}</td>
          <td class="nowrap">${u.last_login ? dtime(u.last_login) : `<span class="muted">never</span>`}</td>
          <td>${u.active ? `<span class="pill ok">Active</span>` : `<span class="pill bad">Deactivated</span>`}</td>
          <td>${u.id === S.user.id ? "" : `<button class="btn sm ${u.active ? "ghost" : ""}" data-uact="${esc(u.id)}" data-to="${u.active ? 0 : 1}">${u.active ? "Deactivate" : "Reactivate"}</button>`}</td></tr>`).join("")}</tbody>
      </table></div></div>`;
    $("#u-role").onchange = (e) => ($("#u-recWrap").hidden = e.target.value !== "recycler");
    $("#u-gen").onclick = () => {
      const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; const r = crypto.getRandomValues(new Uint32Array(10));
      $("#u-pw").value = "Mt-" + [...r].map((x) => a[x % a.length]).join("") + "7";
    };
    $("#newUser").onsubmit = async (e) => {
      e.preventDefault(); const b = e.submitter; b.disabled = true;
      try {
        const r = await api("/users", { name: $("#u-name").value, email: $("#u-email").value, role: $("#u-role").value, org: $("#u-org").value, recycler_id: $("#u-rec").value, password: $("#u-pw").value });
        setFlash("ok", esc(r.message)); await PAGES.users();
      } catch (err) { toast(err.message, true); b.disabled = false; }
    };
    $$("[data-uact]").forEach((b) => (b.onclick = async () => {
      const to = b.dataset.to === "1";
      if (!to && !confirm("Deactivate this account? The person will be signed out and cannot log in until reactivated.")) return;
      b.disabled = true;
      try { const r = await api(`/users/${b.dataset.uact}/status`, { active: to }); setFlash("ok", esc(r.message)); await PAGES.users(); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    }));
  };

  // ---------- MY ACCOUNT (all roles) ----------
  PAGES.account = async () => {
    const u = S.user;
    const demo = DEMO_USERS.some(([, email]) => email === u.email) || /^(sahyadri|ganga|kaveri)@metertrace\.demo$/.test(u.email);
    main.innerHTML = `${takeFlash()}<div class="page-head"><div><div class="crumbs">Records</div><h1>My account</h1><p>Your profile and sign-in details.</p></div></div>
      <div class="grid g2">
        <div class="card"><div class="profile"><span class="avatar">${esc(initials(u.name))}</span><div><h2 style="margin:0">${esc(u.name)}</h2><div class="muted">${esc(ROLE_LABEL[u.role])}</div></div></div>
          <dl class="dl"><dt>Email ID</dt><dd class="mono">${esc(u.email)}</dd><dt>Organisation</dt><dd>${esc(u.org)}</dd><dt>Role</dt><dd>${esc(ROLE_LABEL[u.role])}</dd>
          ${u.recycler_id ? `<dt>Recycler ID</dt><dd>${esc(u.recycler_id)}</dd>` : ""}
          <dt>Previous sign-in</dt><dd>${u.previous_login ? dtime(u.previous_login) : "First sign-in"}</dd></dl>
          <p class="muted" style="margin-top:14px">What you can do: ${esc({ installer: "log meter removals and correct your own records.", store: "receive, sort and batch lots, and see reconciliation.", recycler: "confirm receipt and record recovery for batches sold to your organisation.", regulator: "see all states, review alerts, approve recyclers, manage users and settings." }[u.role])}</p></div>
        <form class="card" id="pwForm"><h2>Change password</h2>
          ${demo ? `<div class="notice info">Demo accounts keep the password shown on the login page, so the demo keeps working for everyone.</div>` : ""}
          <div class="field"><label for="pw-cur">Current password</label><input type="password" id="pw-cur" autocomplete="current-password" required ${demo ? "disabled" : ""}></div>
          <div class="field" style="margin-top:12px"><label for="pw-new">New password</label><input type="password" id="pw-new" autocomplete="new-password" minlength="8" required ${demo ? "disabled" : ""}><span class="hint">At least 8 characters, with letters and numbers.</span></div>
          <div class="field" style="margin-top:12px"><label for="pw-new2">Confirm new password</label><input type="password" id="pw-new2" autocomplete="new-password" required ${demo ? "disabled" : ""}></div>
          <div class="form-actions"><button class="btn" type="submit" ${demo ? "disabled" : ""}>Change password</button></div>
        </form>
      </div>`;
    $("#pwForm").onsubmit = async (e) => {
      e.preventDefault();
      if ($("#pw-new").value !== $("#pw-new2").value) return toast("The new passwords do not match", true);
      const b = e.submitter; b.disabled = true;
      try { const r = await api("/password", { current: $("#pw-cur").value, new: $("#pw-new").value }); setFlash("ok", esc(r.message)); await PAGES.account(); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    };
  };

  // ---------- REPORT (print-friendly, per role) ----------
  PAGES.report = async () => {
    const d = S.data, u = S.user;
    const head = `<div class="report-head"><h1>MeterTrace report — ${esc(ROLE_LABEL[u.role])}</h1>
      <div class="muted">${esc(u.name)}, ${esc(u.org)} · generated ${dtime(new Date().toISOString())} · demonstration data</div></div>
      <div class="btn-row no-print" style="margin-bottom:14px"><button class="btn" onclick="print()">Print / save as PDF</button></div>`;
    let body = "";
    if (u.role === "installer") {
      const by = (f) => d.lots.filter(f).reduce((a, l) => a + l.count, 0);
      body = `<div class="kpis"><div class="kpi"><div class="k">Lots logged</div><div class="v">${d.lots.length}</div></div>
        <div class="kpi"><div class="k">Meters removed</div><div class="v">${n0(by(() => true))}</div></div>
        <div class="kpi warn"><div class="k">Pre-2004 meters</div><div class="v">${n0(by((l) => l.meter_type === "E_PRE"))}</div></div>
        <div class="kpi info"><div class="k">Awaiting store receipt</div><div class="v">${n0(by((l) => !l.receipt))}</div></div></div>
        <div class="card tight"><div class="card-head"><h2>Lots logged</h2></div>${lotsTable(d.lots)}</div>`;
    } else if (u.role === "recycler") {
      const rec = d.batches.filter((b) => b.receipt);
      const totals = Object.fromEntries(MATERIALS.map((m) => [m, d.batches.reduce((a, b) => a + (b.recovery?.[m] || 0), 0)]));
      body = `<div class="kpis"><div class="kpi"><div class="k">Batches bought</div><div class="v">${d.batches.length}</div></div>
        <div class="kpi"><div class="k">Meters received</div><div class="v">${n0(rec.reduce((a, b) => a + b.receipt.count, 0))}</div></div>
        <div class="kpi"><div class="k">Weight received</div><div class="v">${kg(rec.reduce((a, b) => a + b.receipt.weight_kg, 0))}</div></div>
        <div class="kpi ok"><div class="k">Batches closed</div><div class="v">${d.batches.filter((b) => b.recovery).length}</div></div></div>
        <div class="card tight"><div class="card-head"><h2>Batches</h2></div>${batchesTable(d.batches)}</div>
        <div class="card"><h2>Materials recovered (all batches)</h2><div class="table-wrap"><table><tbody>${MATERIALS.map((m) => `<tr><td>${MAT_LABEL[m]}</td><td class="num">${kg(totals[m])}</td></tr>`).join("")}</tbody></table></div></div>`;
    } else {
      body = `${kpis(d.totals)}
        <div class="card"><h2>Flow of meters</h2>${flowChart(d.flow)}</div>
        <div class="card tight"><div class="card-head"><h2>Reconciliation by division</h2></div>${reconTable(d.divisions, d.totals)}</div>
        ${u.role === "regulator" ? `<div class="card tight"><div class="card-head"><h2>State ranking</h2></div>${rankingTable(d.state_summary)}</div>
          <div class="grid g2">${leadCard(d.lead)}${materialsCard(d.materials)}</div>` : `<div class="card tight"><div class="card-head"><h2>Batches</h2></div>${batchesTable(d.batches)}</div>`}
        <div class="card tight"><div class="card-head"><h2>Alerts (${d.alerts.length})</h2></div>${alertsTable(d.alerts, false)}</div>
        ${u.role === "regulator" ? `<div class="card tight"><div class="card-head"><h2>Recyclers</h2></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>State</th><th>Reg. no.</th><th>Status</th></tr></thead><tbody>${d.recyclers.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.state)}</td><td class="mono">${esc(r.reg_no)}</td><td>${esc(r.status)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
    }
    main.innerHTML = head + body;
  };

  route();
})();
