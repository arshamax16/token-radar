// Token Radar dashboard: renders window.RADAR (written by main.ts as
// data.js), with a ranked board, per-protocol detail views via hash
// routing (#/<slug>), text + category filtering, sorting, and a separate
// Live view for protocols whose token already trades.

const data = window.RADAR || { rows: [], live: [], watchlist_count: 0, floor_usd: 0, as_of: "" };
const rows = data.rows || [];
const live = data.live || [];

const $ = (id) => document.getElementById(id);
const money = (n) => {
  if (n == null) return "—";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + String(n);
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (n) => (n == null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(1) + "%");
const pctClass = (n) => (n == null ? "" : n >= 0 ? "pos" : "neg");

const state = { view: "pre", q: "", cat: "", sort: "implied" };

function filtered() {
  const q = state.q.trim().toLowerCase();
  let list = rows.filter((r) => {
    if (state.cat && r.category !== state.cat) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))) return false;
    return true;
  });
  const by = {
    implied: (a, b) => b.implied_value_usd - a.implied_value_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    age: (a, b) => b.age_days - a.age_days,
    growth: (a, b) => (b.change_7d ?? -999) - (a.change_7d ?? -999),
    name: (a, b) => a.name.localeCompare(b.name),
  }[state.sort];
  return list.sort(by);
}

function renderStats() {
  const top = rows[0];
  $("stats").innerHTML =
    stat(rows.length, "pre-token protocols ranked") +
    stat(String(data.watchlist_count || 0), "watchlist protocols covered") +
    stat(money(data.floor_usd), "watchlist floor (TVL)") +
    stat(top ? money(top.implied_value_usd) : "—", "top implied value" + (top ? " · " + esc(top.name) : ""));
  $("meta").textContent = "Snapshot as of " + data.as_of + " · " + rows.length + " rows · " + live.length + " live-token protocols listed separately.";
}
function stat(value, label) {
  return `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}

function renderBoard() {
  const list = filtered();
  $("countLine").textContent = list.length + " of " + rows.length + " shown";
  $("rows").innerHTML = list
    .map(
      (r) => `<tr data-slug="${esc(r.slug)}"><td class="num">${r.rank}</td>` +
        `<td><b>${esc(r.name)}</b><span class="sub">${esc(r.slug)}</span></td>` +
        `<td>${esc(r.category || "—")}</td>` +
        `<td class="num">${money(r.tvl_usd)}</td>` +
        `<td class="num ${pctClass(r.change_7d)}">${pct(r.change_7d)}</td>` +
        `<td>${esc(r.chains.slice(0, 3).join(", "))}${r.chains.length > 3 ? " +" + (r.chains.length - 3) : ""}</td>` +
        `<td class="num">${r.age_days}d</td>` +
        `<td class="num implied">${money(r.implied_value_usd)}</td></tr>`,
    )
    .join("");
  $("empty").hidden = list.length > 0;
  document.querySelectorAll("#rows tr").forEach((tr) => {
    tr.addEventListener("click", () => {
      location.hash = "#/" + tr.dataset.slug;
    });
  });
}

function renderLive() {
  $("liveRows").innerHTML = live
    .map(
      (p) => `<tr><td><b>${esc(p.name)}</b><span class="sub">${esc(p.slug)}</span></td>` +
        `<td>${esc(p.category || "—")}</td>` +
        `<td class="num">${money(p.tvl_usd)}</td>` +
        `<td class="num">${money(p.mcap_usd)}</td>` +
        `<td>${esc(p.symbol || "—")}</td></tr>`,
    )
    .join("");
}

function renderDetail() {
  const box = $("detail");
  const slug = location.hash.startsWith("#/") ? decodeURIComponent(location.hash.slice(2)) : "";
  const row = rows.find((r) => r.slug === slug);
  if (!row) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML =
    `<button class="back" type="button">← Back to the board</button>` +
    `<h2>#${row.rank} ${esc(row.name)}</h2>` +
    `<div class="facts"><span>Implied value <b>${money(row.implied_value_usd)}</b></span>` +
    `<span>TVL <b>${money(row.tvl_usd)}</b></span>` +
    `<span>7-day change <b>${pct(row.change_7d)}</b></span>` +
    `<span>Tracked <b>${row.age_days} days</b></span>` +
    `<span>Chains <b>${esc(row.chains.join(", "))}</b></span>` +
    `<span>Category <b>${esc(row.category || "—")}</b></span></div>` +
    `<h3>Farm plan — 7 steps</h3><ol>` +
    row.farm_steps.map((s) => `<li>${esc(s)}</li>`).join("") +
    `</ol>`;
  box.querySelector(".back").addEventListener("click", () => {
    location.hash = "";
  });
  box.scrollIntoView({ block: "start" });
}

function setView(view) {
  state.view = view;
  $("viewPre").classList.toggle("active", view === "pre");
  $("viewLive").classList.toggle("active", view === "live");
  document.querySelector(".boardwrap").hidden = view !== "pre";
  document.querySelector(".controls").style.display = view === "pre" ? "" : "none";
  $("livewrap").hidden = view !== "live";
  if (view === "live") renderLive();
}

function initFilters() {
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  $("cat").innerHTML = `<option value="">All categories</option>` + cats.map((c) => `<option>${esc(c)}</option>`).join("");
  const params = new URLSearchParams(location.search);
  if (params.get("q")) state.q = params.get("q");
  if (params.get("cat")) state.cat = params.get("cat");
  if (params.get("sort")) state.sort = params.get("sort");
  $("q").value = state.q;
  $("cat").value = state.cat;
  $("sort").value = state.sort;
  $("q").addEventListener("input", (e) => { state.q = e.target.value; renderBoard(); });
  $("cat").addEventListener("change", (e) => { state.cat = e.target.value; renderBoard(); });
  $("sort").addEventListener("change", (e) => { state.sort = e.target.value; renderBoard(); });
  $("clear").addEventListener("click", () => {
    state.q = ""; state.cat = ""; state.sort = "implied";
    $("q").value = ""; $("cat").value = ""; $("sort").value = "implied";
    renderBoard();
  });
  $("viewPre").addEventListener("click", () => setView("pre"));
  $("viewLive").addEventListener("click", () => setView("live"));
  window.addEventListener("hashchange", renderDetail);
}

renderStats();
initFilters();
renderBoard();
renderDetail();
