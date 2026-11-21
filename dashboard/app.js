// Token Radar dashboard: renders window.RADAR (board + live tokens + model).
// Ranked board with per-protocol detail views via hash routing (#/<slug>),
// a model methodology view, text + category + verdict filtering, sorting,
// and a separate Live view for protocols whose token already trades.
// The detail view shows each row's model breakdown, its peer token rate,
// its farm verdict and a 7-step farm plan.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const money = (n) => {
  if (n === null || n === undefined) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
};
const pct = (n) => (n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mult = (n) => `×${n.toFixed(2)}`;

const verdictCount = R.rows.reduce((acc, r) => { acc[r.verdict] = (acc[r.verdict] || 0) + 1; return acc; }, {});

function renderStats() {
  const top = R.rows[0];
  $("stats").innerHTML = [
    [R.rows.length, "pre-token protocols ranked"],
    [R.watchlist_count, "watchlist protocols covered"],
    [money(R.floor_usd), "watchlist floor (TVL)"],
    [top ? money(top.implied_value_usd) : "—", "top implied value" + (top ? " · " + top.name : "")],
    [R.model.calibration_n, "token protocols calibrate the model"],
    [verdictCount.FARM || 0, "rows carry a FARM verdict"],
  ].map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("");
  $("meta").textContent = `Snapshot ${R.as_of} · ${R.source} · model ${R.model.version} · fitted at run time from the snapshot's own token protocols.`;
}

const state = { q: "", cat: "", verdict: "", sort: "implied" };

function chainsShort(chains) {
  if (chains.length <= 3) return chains.join(", ");
  return `${chains.slice(0, 3).join(", ")} +${chains.length - 3}`;
}
function verdictBadge(v) {
  const cls = v === "FARM" ? "farm" : v === "THIN" ? "thin" : "skip";
  return `<span class="badge ${cls}">${v}</span>`;
}
function filtered() {
  const q = state.q.trim().toLowerCase();
  let list = R.rows.filter((r) => {
    if (state.cat && r.category !== state.cat) return false;
    if (state.verdict && r.verdict !== state.verdict) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))) return false;
    return true;
  });
  const by = {
    implied: (a, b) => b.implied_value_usd - a.implied_value_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    age: (a, b) => b.age_days - a.age_days,
    growth: (a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9),
    name: (a, b) => a.name.localeCompare(b.name),
  }[state.sort];
  return list.sort(by);
}
function renderBoard() {
  const list = filtered();
  $("countLine").textContent = `${list.length} of ${R.rows.length} shown`;
  $("rows").innerHTML = list.map((r) => `
    <tr data-slug="${esc(r.slug)}">
      <td class="num">${r.rank}</td>
      <td><b>${esc(r.name)}</b><span class="sub">${esc(r.slug)}</span></td>
      <td>${esc(r.category || "—")}</td>
      <td class="num">${money(r.tvl_usd)}</td>
      <td class="num ${r.change_7d === null ? "" : r.change_7d >= 0 ? "pos" : "neg"}">${pct(r.change_7d)}</td>
      <td>${esc(chainsShort(r.chains))}</td>
      <td>${verdictBadge(r.verdict)}</td>
      <td class="num implied">${money(r.implied_value_usd)}</td>
    </tr>`).join("");
  $("empty").hidden = list.length > 0;
  document.querySelectorAll("#rows tr").forEach((tr) =>
    tr.addEventListener("click", () => { location.hash = `#/${tr.dataset.slug}`; }));
}
function renderLive() {
  $("liveRows").innerHTML = R.live.map((p) => `
    <tr>
      <td><b>${esc(p.name)}</b><span class="sub">${esc(p.slug)}</span></td>
      <td>${esc(p.category || "—")}</td>
      <td class="num">${money(p.tvl_usd)}</td>
      <td class="num">${money(p.mcap_usd)}</td>
      <td>${esc(p.symbol || "—")}</td>
    </tr>`).join("");
}
function verdictText(r) {
  if (r.verdict === "FARM") return "FARM — implied value ≥ $20M and 7-day change ≥ −10%. A steady position is worth building.";
  if (r.verdict === "THIN") return "THIN — implied value ≥ $5M and 7-day change ≥ −25%. Keep the position small and the cost low.";
  return "SKIP — below the FARM and THIN thresholds. Treat any position as a small experiment, not a farm.";
}
function renderDetail(scrollIntoView) {
  const box = $("detail");
  const slug = location.hash.startsWith("#/") ? decodeURIComponent(location.hash.slice(2)) : "";
  const row = R.rows.find((r) => r.slug === slug);
  if (!row) { box.hidden = true; box.innerHTML = ""; return; }
  const m = row.model;
  const peers = R.rows.filter((x) => x.category === row.category).length;
  box.hidden = false;
  box.innerHTML = `
    <button class="back" type="button">← Back to the board</button>
    <h2>#${row.rank} ${esc(row.name)}</h2>
    <div class="facts">
      <span>Implied value <b>${money(row.implied_value_usd)}</b></span>
      <span>TVL <b>${money(row.tvl_usd)}</b></span>
      <span>7-day change <b>${pct(row.change_7d)}</b></span>
      <span>Tracked <b>${row.age_days} days</b></span>
      <span>Verdict <b>${verdictBadge(row.verdict)}</b></span>
    </div>
    <p>Chains ${esc(row.chains.join(", "))} · Category ${esc(row.category || "—")}</p>
    <h3>How this value was computed</h3>
    <table class="breakdown"><tbody>
      <tr><td>Power-law base — exp(${R.model.intercept.toFixed(2)}) × TVL^${R.model.exponent.toFixed(2)}</td><td class="num">${money(m.base_usd)}</td></tr>
      <tr><td>Category factor — ${esc(m.category || "no category")} (shrunk toward 1.0)</td><td class="num">${mult(m.category_factor)}</td></tr>
      <tr><td>Growth — 7-day change ${pct(row.change_7d)} (at most ±10%)</td><td class="num">${mult(m.growth_multiplier)}</td></tr>
      <tr><td>Maturity — tracked ${m.age_days} days (0.95–1.05)</td><td class="num">${mult(m.maturity_multiplier)}</td></tr>
      <tr class="total"><td>Implied value</td><td class="num">${money(m.implied_value_usd)}</td></tr>
    </tbody></table>
    <p class="note">The base and the category factor are fitted from the snapshot's own ${R.model.calibration_n} token protocols at run time — nothing here is a hardcoded list of names.</p>
    <p class="note">Peer token rate for ${esc(row.category || "this category")}: ${Math.round(row.peer_token_rate * 100)}% of the ${peers} protocols in this category in this snapshot already record a token. Shown for context only — it never enters the implied value.</p>
    <h3>Farm verdict — ${row.verdict}</h3>
    <p class="verdict-line">${verdictText(row)}</p>
    <h3>Farm plan — 7 steps</h3>
    <ol>${row.farm_steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`;
  box.querySelector(".back").addEventListener("click", () => { location.hash = ""; });
  // Scroll only when the user opened the detail by clicking a row (a
  // hash change). On an initial deep-link load the page stays at the
  // top, showing the header and the start of the detail.
  if (scrollIntoView) {
    requestAnimationFrame(() => box.scrollIntoView({ block: "start" }));
  }
}
function renderModel() {
  const box = $("modelwrap");
  const bt = R.model.backtest;
  const factors = Object.entries(R.model.category_factors)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${mult(v)}</td></tr>`).join("");
  box.innerHTML = `
    <h2>How the model works — radar-4</h2>
    <p>${esc(R.model.method)}</p>
    <h3>1. The power law — TVL does not buy value one-for-one</h3>
    <p>On the ${R.model.calibration_n} protocols in this snapshot that already have a token,
    log(market cap) = ${R.model.intercept.toFixed(3)} + ${R.model.exponent.toFixed(3)} × log(TVL),
    fitted by least squares. A token's market cap grows like TVL^${R.model.exponent.toFixed(2)}:
    the implied multiple is about 0.48× at $10M of TVL, 0.16× at $100M, 0.05× at $1B and 0.03× at $3B.
    A flat 30% of TVL would overvalue the giants roughly tenfold and undervalue small protocols threefold —
    the power law fixes both.</p>
    <h3>2. Category factors — same TVL, different worth</h3>
    <p>Each category's factor is the shrunk mean of its residuals from the power law, pulled toward 1.0
    with weight n/(n+6) so a thin category cannot swing the value. Categories with no token protocol
    in the snapshot take 1.0.</p>
    <table class="breakdown"><tbody>${factors}</tbody></table>
    <h3>3. Growth and maturity — kept small on purpose</h3>
    <p>Growth moves the value at most 10% (7-day change clamped to ${R.model.growth_floor}%…${R.model.growth_cap}%)
    and age at most 5% (${R.model.maturity_floor.toFixed(2)}–${(R.model.maturity_floor + R.model.maturity_range).toFixed(2)} over ${R.model.maturity_days} days).
    In the calibration data a 7-day window barely predicts the multiple (and its correlation with the residual is
    weakly negative), and age has essentially no correlation, so the weights were cut from radar-3's 15% and 10%
    to 10% and 5%. Chain count was tested and rejected: its correlation with the residual is 0.09.</p>
    <h3>4. Peer token rate — shown, never multiplied</h3>
    <p>For each category the board shows the share of the snapshot's protocols in that category that already
    record a token (for example Risk Curators 13%, Dexes 74%, Lending 79%). It is a descriptive fact about
    the category, not a launch guess, and it never enters the implied value.</p>
    <h3>5. Farm verdicts — a rule, not a feeling</h3>
    <p>FARM means implied value ≥ $20M and 7-day change ≥ −10% (${verdictCount.FARM || 0} rows).
    THIN means implied value ≥ $5M and 7-day change ≥ −25% (${verdictCount.THIN || 0} rows).
    Everything else is SKIP (${verdictCount.SKIP || 0} rows). The rule is stated on the board so anyone
    can check it against a row.</p>
    <h3>6. Backtest — ${bt.method}</h3>
    <p>Median |log(implied/market cap)| on held-out folds: radar-3 ${bt.radar3_median_log_err} (×${Math.exp(bt.radar3_median_log_err).toFixed(2)}),
    radar-4 ${bt.radar4_median_log_err} (×${Math.exp(bt.radar4_median_log_err).toFixed(2)}). Within 2× of the real market cap:
    radar-3 ${bt.radar3_within2x_pct}%, radar-4 ${bt.radar4_within2x_pct}%. The gain is small — the honest read is
    that growth and age carry almost no signal, and the power law plus the shrunk category factor do the work.</p>
    <h3>7. Coverage — every rankable pre-token protocol</h3>
    <p>The board ranks ${R.rows.length} protocols: the ${R.watchlist_count} on the watchlist plus every other rankable
    pre-token protocol, above or below the ${money(R.floor_usd)} floor. Wrapped, staked and bridged products are
    excluded because they already have a token in another form — their "launch" is not a new token. Tokens that
    already trade live on a separate view and are never mixed into the ranking.</p>
    <p class="note">Nothing here predicts whether or when a token launches. The implied value is what a token
    would be worth if this protocol's record stayed as it is, priced the way the market prices the protocols
    that already have one.</p>`;
}
function setView(view) {
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
  const cats = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
  $("cat").innerHTML = `<option value="">All categories</option>` + cats.map((c) => `<option>${esc(c)}</option>`).join("");
  const params = new URLSearchParams(location.search);
  if (params.get("q")) state.q = params.get("q");
  if (params.get("cat")) state.cat = params.get("cat");
  if (params.get("verdict")) state.verdict = params.get("verdict");
  if (params.get("sort")) state.sort = params.get("sort");
  $("q").value = state.q;
  $("cat").value = state.cat;
  $("verdict").value = state.verdict;
  $("sort").value = state.sort;
  $("q").addEventListener("input", (e) => { state.q = e.target.value; renderBoard(); });
  $("cat").addEventListener("change", (e) => { state.cat = e.target.value; renderBoard(); });
  $("verdict").addEventListener("change", (e) => { state.verdict = e.target.value; renderBoard(); });
  $("sort").addEventListener("change", (e) => { state.sort = e.target.value; renderBoard(); });
  $("clear").addEventListener("click", () => {
    state.q = ""; state.cat = ""; state.verdict = ""; state.sort = "implied";
    $("q").value = ""; $("cat").value = ""; $("verdict").value = ""; $("sort").value = "implied";
    renderBoard();
  });
  $("viewPre").addEventListener("click", () => setView("pre"));
  $("viewLive").addEventListener("click", () => setView("live"));
  $("viewModel").addEventListener("click", () => setView("model"));
  window.addEventListener("hashchange", () => renderDetail(true));
}

renderStats();
initFilters();
renderBoard();
renderDetail(false);
