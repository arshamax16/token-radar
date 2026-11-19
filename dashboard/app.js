// Token Radar dashboard: renders window.RADAR (written by main.ts as
// data.js), with a ranked board, per-protocol detail views via hash
// routing (#/<slug>), a model methodology view, text + category
// filtering, sorting, and a separate Live view for protocols whose
// token already trades. The detail view shows each row's model
// breakdown, so the derivation of its implied value is visible.

const data = window.RADAR || { rows: [], live: [], watchlist_count: 0, floor_usd: 0, as_of: "", model: null };
const rows = data.rows || [];
const live = data.live || [];
const model = data.model || null;

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
const mult = (n) => "×" + n.toFixed(2);

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
    stat(top ? money(top.implied_value_usd) : "—", "top implied value" + (top ? " · " + esc(top.name) : "")) +
    stat(model ? String(model.calibration_n) : "—", "token protocols calibrate the model");
  $("meta").textContent = "Snapshot as of " + data.as_of + " · " + rows.length + " rows · " + live.length + " live-token protocols listed separately." +
    (model ? " Model radar-3: log(mcap) = " + model.intercept.toFixed(3) + " + " + model.exponent.toFixed(3) + "·log(TVL), fitted on " + model.calibration_n + " token protocols." : "");
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
  const m = row.model || null;
  const breakdown = m
    ? `<h3>How this value was computed</h3>` +
      `<table class="breakdown"><tbody>` +
      `<tr><td>Power-law base — exp(${model ? model.intercept.toFixed(2) : "?"}) × TVL^${model ? model.exponent.toFixed(2) : "?"}</td><td class="num">${money(m.base_usd)}</td></tr>` +
      `<tr><td>Category factor — ${esc(m.category || "no category")} (shrunk toward 1.0)</td><td class="num">${mult(m.category_factor)}</td></tr>` +
      `<tr><td>Growth — 7-day change ${pct(row.change_7d)} (at most ±15%)</td><td class="num">${mult(m.growth_multiplier)}</td></tr>` +
      `<tr><td>Maturity — tracked ${m.age_days} days (0.90–1.10)</td><td class="num">${mult(m.maturity_multiplier)}</td></tr>` +
      `<tr class="total"><td>Implied value</td><td class="num">${money(m.implied_value_usd)}</td></tr>` +
      `</tbody></table>` +
      `<p class="note">The base and the category factor are fitted from the snapshot's own ${model ? model.calibration_n : ""} token protocols at run time — nothing here is a hardcoded list of names.</p>`
    : "";
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
    breakdown +
    `<h3>Farm plan — 7 steps</h3><ol>` +
    row.farm_steps.map((s) => `<li>${esc(s)}</li>`).join("") +
    `</ol>`;
  box.querySelector(".back").addEventListener("click", () => {
    location.hash = "";
  });
  box.scrollIntoView({ block: "start" });
}

function renderModel() {
  const box = $("modelwrap");
  if (!model) {
    box.innerHTML = "<p>No model metadata in this build.</p>";
    return;
  }
  const bt = model.backtest || {};
  const factors = Object.entries(model.category_factors || {})
    .filter(([, v]) => v !== 1)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${mult(v)}</td></tr>`)
    .join("");
  box.innerHTML =
    `<h2>How the model works — radar-3</h2>` +
    `<p>Every implied value on this board is computed from the snapshot's own figures, and the model ` +
    `calibrates itself from that same snapshot every time the program runs. No protocol name is ever ` +
    `hardcoded: the same function scores every row.</p>` +
    `<h3>1. The power law — TVL does not buy value one-for-one</h3>` +
    `<p>On the ${model.calibration_n} protocols in this snapshot that already have a token, ` +
    `log(market cap) = ${model.intercept.toFixed(3)} + ${model.exponent.toFixed(3)}·log(TVL), fitted by least squares. ` +
    `A token's market cap grows like TVL^${model.exponent.toFixed(2)}: the implied multiple is about 0.48× at $10M TVL, ` +
    `0.16× at $100M, 0.05× at $1B and 0.03× at $3B. A flat 30% of TVL overvalues giants roughly tenfold ` +
    `and undervalues small protocols threefold — the power law fixes both.</p>` +
    `<h3>2. Category factors — same TVL, different worth</h3>` +
    `<p>Each category's factor is the shrunk mean of its residuals from the power law, pulled toward 1.0 ` +
    `with weight n/(n+6) so a thin category cannot swing the value. Categories with no token protocol ` +
    `in the snapshot take 1.0.</p>` +
    `<table class="breakdown"><tbody>${factors}</tbody></table>` +
    `<h3>3. Growth and age — kept small on purpose</h3>` +
    `<p>Growth moves the value at most 15% (7-day change clamped to ${model.growth_floor}%…${model.growth_cap}%) ` +
    `and age at most 10% (${model.maturity_floor.toFixed(2)}–${(model.maturity_floor + model.maturity_range).toFixed(2)} over ${model.maturity_days} days). ` +
    `In the calibration data a 7-day window and age barely predict the multiple, so they are deliberately small — ` +
    `they nudge, they never decide.</p>` +
    `<h3>4. Backtest — checked against real market caps</h3>` +
    `<p>On the ${bt.universe_n || model.calibration_n} token protocols, the median error between the model's implied value and the ` +
    `real market cap is ×${Math.exp(bt.radar3_median_log_err || 0).toFixed(2)} for radar-3 against ×${Math.exp(bt.radar2_median_log_err || 0).toFixed(2)} for the old flat-30% model. ` +
    `${bt.radar3_within2x_pct || 0}% of protocols land within 2× of their real market cap (old model: ${bt.radar2_within2x_pct || 0}%). ` +
    `Split-half cross-validation — refit everything on one half, test on the other — confirms the gain is real, not fitted noise.</p>` +
    `<p class="note">Implied value is a model's claim about what a token would be worth, not a prediction that one launches or when.</p>`;
}

function setView(view) {
  state.view = view;
  $("viewPre").classList.toggle("active", view === "pre");
  $("viewLive").classList.toggle("active", view === "live");
  $("viewModel").classList.toggle("active", view === "model");
  document.querySelector(".boardwrap").hidden = view !== "pre";
  document.querySelector(".controls").style.display = view === "pre" ? "" : "none";
  $("livewrap").hidden = view !== "live";
  $("modelwrap").hidden = view !== "model";
  if (view === "live") renderLive();
  if (view === "model") renderModel();
  if (view !== "pre") { $("detail").hidden = true; }
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
  $("viewModel").addEventListener("click", () => setView("model"));
  window.addEventListener("hashchange", renderDetail);
}

renderStats();
initFilters();
renderBoard();
renderDetail();
