// Token Radar dashboard (radar-7): renders window.RADAR (board + live tokens + model).
// Ranked board with per-protocol detail views via hash routing (#/<slug>),
// a model methodology view, a coverage view accounting for all 758
// protocols, text + category + verdict filtering, sorting, and a
// separate Live view for protocols whose token already trades.
// The detail view shows each row's model breakdown, its token odds, its
// honest implied-value range, its farm verdict and a 7-step farm plan.
// The header carries the model's own validation strip, computed from
// this snapshot at run time, and a data-integrity strip.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const money = (n) => {
  if (n === null || n === undefined) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
};
// A compact range: "$17–195M" — the low and high in the same unit.
const moneyRange = (lo, hi) => {
  const unit = (n) => (n >= 1e9 ? "B" : n >= 1e6 ? "M" : n >= 1e3 ? "K" : "");
  const val = (n) => {
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1);
    if (n >= 1e3) return (n / 1e3).toFixed(0);
    return `${n}`;
  };
  return `$${val(lo)}–${val(hi)}${unit(hi)}`;
};
const pct = (n) => (n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mult = (n) => `×${n.toFixed(2)}`;

const verdictCount = R.rows.reduce((acc, r) => { acc[r.verdict] = (acc[r.verdict] || 0) + 1; return acc; }, {});

/* The validation strip: the model's own held-out checks, computed
   from this snapshot at run time (see "How the model works" §8).
   It sits on the board's first screen, so the board answers its own
   checks on the cover instead of hiding them in a methodology page. */
function renderChecks() {
  const v = R.model.validation;
  const a = R.accounting;
  const x = (n) => `×${n.toFixed(2)}`;
  $("checks").innerHTML = `
    <h2>Model checks — computed from this snapshot at run time</h2>
    <div class="checkrow">
      <span><b>${x(v.cv_median_log_err)}</b> median error, 5-fold CV (${v.cv_within2x_pct.toFixed(1)}% within 2×)</span>
      <span><b>${x(v.loo_median_log_err)}</b> leave-one-out (${v.loo_within2x_pct.toFixed(1)}% within 2×)</span>
      <span><b>${x(v.walk_old_young_median_log_err)}</b> walk-forward, old → young</span>
      <span><b>${x(v.walk_young_old_median_log_err)}</b> walk-forward, young → old</span>
      <span><b>${v.training_n}</b> token protocols calibrate the model</span>
    </div>
    <div class="checkrow integrity">
      <span><b>${a.total}</b> protocols in the snapshot</span>
      <span><b>${a.board_rows}</b> ranked on this board · <b>${a.wrapped_no_token}</b> wrapped products · <b>${a.live_with_mcap}</b> live tokens · <b>${a.variant_symbol_only}</b> versions of live tokens</span>
      <span>data gaps: <b>${a.missing_category}</b> missing category · <b>${a.missing_change_7d}</b> missing 7-day change · <b>${a.missing_listed_at}</b> missing listing date (age = 1 year)</span>
    </div>`;
}

function renderStats() {
  const top = R.rows[0];
  $("stats").innerHTML = [
    [R.rows.length, "pre-token protocols ranked"],
    [R.accounting.total, "protocols accounted for (board + live + wrapped + versions)"],
    [R.watchlist_count, "watchlist protocols covered"],
    [money(R.floor_usd), "watchlist floor (TVL)"],
    [top ? money(top.implied_value_usd) : "—", "top implied value" + (top ? " · " + top.name : "")],
    [R.model.calibration_n, "token protocols calibrate the model"],
    [verdictCount.FARM || 0, "rows carry a FARM verdict"],
  ].map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("");
  $("meta").textContent = `Snapshot ${R.as_of} · ${R.source} · model ${R.model.version} · fitted at run time from the snapshot's own token protocols.`;
}

/* The value distribution: the top 6 implied values as bars, so the
   board's shape — one giant, a near-giant, then a long tail — is
   visible before the table. */
function renderDist() {
  const top = R.rows.slice(0, 6);
  const max = top.length ? top[0].implied_value_usd : 1;
  $("dist").innerHTML = `<h2>Implied value — top 6</h2>` + top.map((r) => `
    <div class="dist-row">
      <span class="nm"><b>#${r.rank}</b> ${esc(r.name)}</span>
      <span class="bar"><i style="width:${Math.max(2, Math.round((r.implied_value_usd / max) * 100))}%"></i></span>
      <span class="vl">${money(r.implied_value_usd)}</span>
    </div>`).join("");
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
function oddsBadge(o) {
  const p = Math.round(o * 100);
  const cls = p >= 15 ? "high" : p >= 5 ? "mid" : "low";
  return `<span class="odds ${cls}">${p}%</span>`;
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
    odds: (a, b) => b.token_odds - a.token_odds,
    peer: (a, b) => b.peer_token_rate - a.peer_token_rate,
    name: (a, b) => a.name.localeCompare(b.name),
  }[state.sort];
  return list.sort(by);
}
function renderBoard() {
  const list = filtered();
  $("countLine").textContent = `${list.length} of ${R.rows.length} shown`;
  $("rows").innerHTML = list.map((r) => `
    <tr data-slug="${esc(r.slug)}"${r.rank <= 3 ? ` class="top3"` : ""}>
      <td class="num"><span class="rank-no">${r.rank}</span></td>
      <td><b>${esc(r.name)}</b><span class="sub">${esc(r.slug)}</span></td>
      <td>${esc(r.category || "—")}</td>
      <td class="num">${money(r.tvl_usd)}</td>
      <td class="num ${r.change_7d === null ? "" : r.change_7d >= 0 ? "pos" : "neg"}">${pct(r.change_7d)}</td>
      <td>${esc(chainsShort(r.chains))}</td>
      <td>${verdictBadge(r.verdict)}</td>
      <td class="num">${oddsBadge(r.token_odds)}</td>
      <td class="num range">${moneyRange(r.range_low_usd, r.range_high_usd)}</td>
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
      <td class="num">${p.mcap_usd === null ? "token trades, cap unrecorded" : money(p.mcap_usd)}</td>
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
  const topValue = R.rows.length ? R.rows[0].implied_value_usd : 1;
  const share = Math.max(2, Math.round((row.implied_value_usd / topValue) * 100));
  const oddsPct = Math.round(row.token_odds * 100);
  box.hidden = false;
  box.innerHTML = `
    <button class="back" type="button">← Back to the board</button>
    <h2><span class="rank-no">#${row.rank}</span> ${esc(row.name)}</h2>
    <div class="facts">
      <span>Implied value <b>${money(row.implied_value_usd)}</b></span>
      <span>Honest range <b>${moneyRange(row.range_low_usd, row.range_high_usd)}</b></span>
      <span>Token odds <b>${oddsPct}%</b></span>
      <span>TVL <b>${money(row.tvl_usd)}</b></span>
      <span>7-day change <b>${pct(row.change_7d)}</b></span>
      <span>Tracked <b>${row.age_days} days</b></span>
      <span>Verdict <b>${verdictBadge(row.verdict)}</b></span>
    </div>
    <div class="valuebar">
      <span class="lbl">Implied value against the board's top (${money(topValue)}) — ${share}%</span>
      <div class="track"><i style="width:${share}%"></i></div>
    </div>
    <p>Chains ${esc(row.chains.join(", "))} · Category ${esc(row.category || "—")}</p>
    <h3>How this value was computed</h3>
    <table class="breakdown"><tbody>
      <tr><td>Power-law base — exp(${R.model.intercept.toFixed(2)}) × TVL^${R.model.exponent.toFixed(2)}</td><td class="num">${money(m.base_usd)}</td></tr>
      <tr><td>Category factor — ${esc(m.category || "no category")} (shrunk toward 1.0)</td><td class="num">${mult(m.category_factor)}</td></tr>
      <tr><td>Chain factor — ${esc(m.chains.join(", ") || "no chain")} (mean of the chains' factors, shrunk toward 1.0)</td><td class="num">${mult(m.chain_factor)}</td></tr>
      <tr><td>Growth — 7-day change ${pct(row.change_7d)} (at most ±10%)</td><td class="num">${mult(m.growth_multiplier)}</td></tr>
      <tr><td>Maturity — tracked ${m.age_days} days (0.95–1.05)</td><td class="num">${mult(m.maturity_multiplier)}</td></tr>
      ${m.unknown_age_factor !== 1 ? `<tr><td>Unknown listing date — no tracking start recorded (group factor)</td><td class="num">${mult(m.unknown_age_factor)}</td></tr>` : ""}
      <tr class="total"><td>Implied value</td><td class="num">${money(m.implied_value_usd)}</td></tr>
      <tr><td>Honest range — middle 50% of the model's held-out errors (×${Math.exp(R.model.range_log_lo).toFixed(2)} to ×${Math.exp(R.model.range_log_hi).toFixed(2)})</td><td class="num">${moneyRange(row.range_low_usd, row.range_high_usd)}</td></tr>
    </tbody></table>
    <p class="note">The base, the category factor and the chain factor are fitted from the snapshot's own ${R.model.calibration_n} token protocols in board-eligible categories at run time — nothing here is a hardcoded list of names.</p>
    <p class="note">Token odds ${oddsPct}%: the share of this category's protocols that already record a token, shrunk toward the snapshot's overall rate, times how much of the launch window ${row.age_days} days has already used up. Peer token rate for ${esc(row.category || "this category")}: ${Math.round(row.peer_token_rate * 100)}% of the ${peers} protocols in this category in this snapshot already record a token. Odds never enter the implied value — a high value with low odds is worth farming only if you believe the launch still comes.</p>
    <h3>Farm verdict — ${row.verdict}</h3>
    <p class="verdict-line">${verdictText(row)} Farming here costs about <b>${esc(row.farm_cost_per_hour)}</b> in gas for each hour spent on it.</p>
    <h3>Farm plan — 7 steps</h3>
    <ol>${row.farm_steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`;
  box.querySelector(".back").addEventListener("click", () => { location.hash = ""; });
  // Scroll when the detail was opened — by clicking a row (a hash
  // change) or by arriving on a deep link (an initial load with a
  // #/<slug> hash): the detail is the content the reader asked for.
  if (scrollIntoView) {
    requestAnimationFrame(() => box.scrollIntoView({ block: "start" }));
  }
}
function renderCover() {
  const box = $("coverwrap");
  const a = R.accounting;
  const topWrapped = R.wrapped.slice(0, 8);
  box.innerHTML = `
    <h2>Coverage — every one of the ${a.total} protocols accounted for</h2>
    <p>The board ranks the ${a.board_rows} pre-token protocols that can honestly be ranked. The rest of the
    snapshot is not dropped silently — it is accounted for here, in the open, with the reason each group
    sits where it does. A board that ranked a wrapped product or a version of a token that already trades
    would be padding, not coverage: their "launch" is not a new token.</p>
    <table class="breakdown"><thead><tr><th>Group</th><th>Count</th><th>Where it lives</th><th>Why</th></tr></thead><tbody>
      <tr><td>Pre-token, ranked by implied value</td><td class="num">${a.board_rows}</td><td>Pre-token board</td><td>Records no token and is not a wrapped, staked or bridged product — a launch is still possible.</td></tr>
      <tr><td>Wrapped, staked or bridged products</td><td class="num">${a.wrapped_no_token}</td><td>Listed below</td><td>Records no token, but the token already trades in another form (WBTC is BTC, a staked-ETH product is ETH). Ranking them by launch value would be nonsense.</td></tr>
      <tr><td>Token already trades, market cap recorded</td><td class="num">${a.live_with_mcap}</td><td>Live tokens view</td><td>The calibration set — these are what the model learns the value of a token from, not what it ranks.</td></tr>
      <tr><td>Version of a token protocol (symbol recorded, no market cap)</td><td class="num">${a.variant_symbol_only}</td><td>Live tokens view</td><td>Aave V1, V3 and V4 share the AAVE token; ranking them separately would count one token three times.</td></tr>
      <tr class="total"><td>All protocols in the snapshot</td><td class="num">${a.total}</td><td>—</td><td>Watchlist: ${a.watchlist_covered} of ${a.watchlist_total} covered on the board.</td></tr>
    </tbody></table>
    <h3>Largest wrapped products (token trades in another form)</h3>
    <table class="breakdown"><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th></tr></thead><tbody>
    ${topWrapped.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.category || "—")}</td><td class="num">${money(p.tvl_usd)}</td></tr>`).join("")}
    </tbody></table>
    <p class="note">Data gaps, stated not hidden: ${a.missing_category} protocols carry no category,
    ${a.missing_change_7d} carry no 7-day change, and ${a.missing_listed_at} carry no listing date
    (their age is taken as one year, and their token odds use the average age factor). The model never
    silently fills a gap with a favourable number.</p>`;
}
function renderModel() {
  const box = $("modelwrap");
  const bt = R.model.backtest;
  const ct = R.model.comps_test;
  const v = R.model.validation;
  const peerByCat = {};
  for (const r of R.rows) {
    const key = r.category ?? "(null)";
    if (!(key in peerByCat)) peerByCat[key] = r.peer_token_rate;
  }
  const factors = Object.entries(R.model.category_factors)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v2]) => `<tr><td>${esc(k)}</td><td class="num">${mult(v2)}</td><td class="num">${Math.round((peerByCat[k] ?? 0) * 100)}% of peers have a token</td></tr>`).join("");
  const chainFactors = Object.entries(R.model.chain_factors)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v2]) => `<tr><td>${esc(k)}</td><td class="num">${mult(v2)}</td></tr>`).join("");
  box.innerHTML = `
    <h2>How the model works — radar-9</h2>
    <p>${esc(R.model.method)}</p>
    <h3>1. The power law — TVL does not buy value one-for-one</h3>
    <p>On the ${R.model.calibration_n} protocols in this snapshot that already have a token
    and sit in a board-eligible category,
    log(market cap) = ${R.model.intercept.toFixed(3)} + ${R.model.exponent.toFixed(3)} × log(TVL),
    fitted by Huber robust regression (8 rounds of reweighting). A token's market cap grows like TVL^${R.model.exponent.toFixed(2)}:
    the implied multiple is about 0.53× at $10M of TVL, 0.15× at $100M, 0.05× at $1B and 0.03× at $3B.
    A flat 30% of TVL would overvalue the giants roughly tenfold and undervalue small protocols threefold —
    the power law fixes both. Huber downweights the few protocols whose market cap sits far off the line
    (rain +6.4, concentrator −5.0 in log terms) instead of letting them drag it.
    The fit uses only board-eligible categories: 34 token protocols in CEX, bridge, canonical-bridge and
    liquid-staking categories are left out, because a CEX token's value does not follow from its exchange's
    TVL, a bridge token is usually worth ~nothing whatever the bridge holds, and a liquid-staking token
    tracks its underlying — including them would calibrate the board on protocols whose market cap is
    structurally decoupled from TVL. The board never ranks those categories anyway.</p>
    <h3>2. Category factors — same TVL, different worth</h3>
    <p>Each category's factor comes from empirical-Bayes partial pooling (DerSimonian-Laird): the
    between-category variance and the within-category variance are estimated from the training
    residuals, and each category's mean residual is shrunk by tau^2/(tau^2 + sigma^2/n) — a thin or
    noisy category is pulled hard toward 1.0, a large consistent one keeps its factor. Categories with
    no token protocol in the snapshot take 1.0. The peer token rate beside each factor is the share of
    that category's protocols that already record a token — shown for context, it never enters the
    factor or the value. The change matters most for Prediction Market: rain's token is worth 400× its
    TVL, and under radar-7's ad-hoc shrink that single outlier inflated the whole category's factor to
    ×2.49 — Polymarket, the category's biggest pre-token protocol, was ranked #1 on the back of it.
    Winsorisation plus empirical-Bayes pooling brings the factor to ×1.07, and Polymarket to #6 on its
    own TVL.</p>
    <table class="breakdown"><thead><tr><th>Category</th><th>Factor</th><th>Peer token rate</th></tr></thead><tbody>${factors}</tbody></table>
    <h3>3. Chain factors — the ecosystem prices the protocol too</h3>
    <p>Each chain's factor is the shrunk mean of the same residuals over the protocols deployed on that
    chain, pulled toward 1.0 with weight n/(n+${R.model.chain_shrink_k}); chains with fewer than
    ${R.model.chain_min_n} token protocols in the fit take no factor. A row's chain factor is the mean of
    its chains' factors. Protocols on newer, smaller ecosystems price lower at the same TVL
    (Kava ×0.50, Mantle ×0.57, Monad ×0.57, Berachain ×0.63) while the big ecosystems sit near 1.0
    (Ethereum ×0.95, Arbitrum ×1.03) — the market prices the chain the protocol lives on, not just the
    protocol. Chain count was tested and rejected again (its correlation with the residual is 0.09);
    chain identity is what carries signal.</p>
    <table class="breakdown"><thead><tr><th>Chain</th><th>Factor</th></tr></thead><tbody>${chainFactors}</tbody></table>
    <h3>4. Growth and maturity — kept small on purpose</h3>
    <p>Growth moves the value at most 10% (7-day change clamped to ${R.model.growth_floor}%…${R.model.growth_cap}%)
    and age at most 5% (${R.model.maturity_floor.toFixed(2)}–${(R.model.maturity_floor + R.model.maturity_range).toFixed(2)} over ${R.model.maturity_days} days).
    In the calibration data a 7-day window barely predicts the multiple (and its correlation with the residual is
    weakly negative), and age has essentially no correlation, so the weights were cut from radar-3's 15% and 10%
    to 10% and 5%. A young-protocol flag was tested and rejected: protocols listed 180–365 days ago look
    expensive in-sample (7 protocols, mean residual +1.4) but the flag makes every held-out test worse.
    One age-related factor is kept: protocols whose listing date the snapshot does not record take a factor of
    ${R.model.unknown_age_factor.toFixed(2)} — in the training data those ${R.model.unknown_age_n} protocols run below
    the fitted line (median residual −0.51 log), so their implied values are pulled down by a third. It is a
    group factor like the category factors (median residual, shrunk toward 1.0), and its cost is stated in §7:
    the unknown-age subgroup's own leave-one-out gets worse even as the overall medians improve.</p>
    <h3>5. Token odds — the chance a token ever launches</h3>
    <p>${esc(R.model.odds_method)}</p>
    <h3>6. The honest range — a point estimate would be a lie</h3>
    <p>${esc(R.model.range_method)}</p>
    <h3>7. The comps test — built, measured, rejected, reported</h3>
    <p>${esc(ct.method)}</p>
    <p>Similarity-weighted peer multiples: 5-fold CV ${ct.comps_cv_median_log_err} (×${Math.exp(ct.comps_cv_median_log_err).toFixed(2)}, within 2× ${ct.comps_cv_within2x_pct}%),
    leave-one-category-out ${ct.comps_loco_median_log_err}, leave-one-out ${ct.comps_loo_median_log_err} —
    against this fit's ${ct.radar6_cv_median_log_err} (×${Math.exp(ct.radar6_cv_median_log_err).toFixed(2)}, within 2× ${ct.radar6_cv_within2x_pct}%),
    ${ct.radar6_loco_median_log_err} and ${ct.radar6_loo_median_log_err}. A local power law on the most similar
    peers: CV ${ct.curve_cv_median_log_err}. A shrunk residual correction on top of this fit: CV
    ${ct.resid_corr_cv_median_log_err}, LOCO ${ct.resid_corr_loco_median_log_err}, LOO ${ct.resid_corr_loo_median_log_err}.
    ${esc(ct.verdict)}</p>
    <p>Radar-8's accuracy work, on the same strict harness (every factor refit on its training fold only):
    a ridge regression over every snapshot feature at once — log TVL, log age, 7-day change, chain count,
    the top-8 category dummies and a log TVL × change interaction, lambda tuned by inner cross-validation —
    scores 5-fold CV 1.250, LOCO 1.234, walk-forward old → young 1.098 and leave-one-out 1.292: it loses
    to the pooled power law on the second validation too, so it is not used. Empirical-Bayes category
    factors alone move CV 1.248 → 1.210 but leave LOO at 1.324; winsorisation alone moves LOCO 1.175 →
    1.104 but leaves LOO at 1.308. The pair — winsorised multiples plus empirical-Bayes factors — is the
    one change that beats radar-7 on four of the five held-out tests: CV 1.248 → 1.214, LOCO 1.175 → 1.104,
    walk-forward young → old 1.308 → 1.242, leave-one-out 1.314 → 1.178. It is stable across the whole
    winsorisation plateau (P3/P97 to P10/P90: LOO 1.167–1.225, CV 1.185–1.222), not a tuned spike. The one
    cost is walk-forward old → young, 0.774 → 0.823 — though its within-2× share rises 38.9% → 47.2%.
    Weighted regression was checked and not used: the residual variance is flat across TVL terciles
    (standard deviation 2.18 / 1.83 / 1.92), so there is nothing for weights to fix.</p>
    <p>Radar-9's accuracy work, on the same strict harness. The target was leave-one-out — the weakest
    held-out test (1.178, ×3.25) while walk-forward old → young already ties the best published claim
    (0.823, ×2.28 against ×2.26). Median (quantile) regression was the first idea: the metric is the
    median absolute error, so the conditional median should beat the conditional mean — but the residuals
    are nearly symmetric (skew −0.22 winsorised, +0.20 raw), so the median line barely differs from the
    Huber line. A median power-law fit moves CV 1.214 → 1.177 and walk old → young 0.823 → 0.796 but
    leaves LOO at 1.189; median category and chain factors move LOO 1.178 → 1.135 but leave CV at 1.222
    and walk old → young at 0.886; the full median regression over all features moves CV to 1.182 but
    collapses walk-forward old → young to 1.681. Sub-category factors for the two hardest categories,
    Dexs and Lending — split by chain count, TVL band, Ethereum vs not, or chain group — make both
    categories' leave-one-out worse (Dexs 1.570 → 1.60–1.74, Lending 1.823 → 1.91–2.04): the
    heterogeneity inside those categories is idiosyncratic, not something a chain or a size band
    explains. Imputing an unknown listing date from the category's median age changes nothing (the
    maturity multiplier spans 5% at most), and a young × growing × hot-category interaction never fires
    — no protocol in this snapshot is young, growing and in Dexs, Lending or Prediction Market at once.
    The one change that wins is the unknown-age group factor of §4: protocols with no listing date run
    below the line in the training data (median residual −0.51 log over 23 protocols), and a shrunk
    factor of 0.67 for them moves CV 1.214 → 1.171, LOCO 1.104 → 1.084 and LOO 1.178 → 1.115, with both
    walk-forwards unchanged (they use dated protocols only) and Dexs leave-one-out 1.570 → 1.383.
    It is stable across the winsorisation plateau (P2.5/P97.5 to P7.5/P92.5: LOO 1.115–1.147), not a
    tuned spike. The cost is stated, not hidden: the unknown-age subgroup's own leave-one-out median
    gets worse (1.718 → 1.885) and the mean absolute error is essentially flat (CV +0.002, LOO −0.010)
    — the gain sits in the middle of the error distribution, and the worst outliers (aave-v2, thorchain-dex)
    are hurt, not helped. The underlying group signal is under one standard error, so this is a small,
    fragile improvement, reported as one.</p>
    <h3>8. Validation — the board answers its own checks</h3>
    <p>${esc(v.method)} On this snapshot, on the ${v.training_n} board-eligible token protocols:
    repeated 5-fold CV median |log error| ${v.cv_median_log_err.toFixed(3)} (×${Math.exp(v.cv_median_log_err).toFixed(2)}, within 2× ${v.cv_within2x_pct.toFixed(1)}%),
    leave-one-out ${v.loo_median_log_err.toFixed(3)} (×${Math.exp(v.loo_median_log_err).toFixed(2)}, within 2× ${v.loo_within2x_pct.toFixed(1)}%),
    walk-forward old → young ${v.walk_old_young_median_log_err.toFixed(3)} (×${Math.exp(v.walk_old_young_median_log_err).toFixed(2)}),
    young → old ${v.walk_young_old_median_log_err.toFixed(3)} (×${Math.exp(v.walk_young_old_median_log_err).toFixed(2)}).
    Earlier radars on the same harness: radar-3 ${bt.radar3_median_log_err} (×${Math.exp(bt.radar3_median_log_err).toFixed(2)}),
    radar-4 ${bt.radar4_median_log_err} (×${Math.exp(bt.radar4_median_log_err).toFixed(2)}),
    radar-5 ${bt.radar5_median_log_err} (×${Math.exp(bt.radar5_median_log_err).toFixed(2)}),
    radar-6 ${bt.radar6_median_log_err} (×${Math.exp(bt.radar6_median_log_err).toFixed(2)}) on all 128 token protocols
    and ${bt.radar6_eligible_median_log_err} (×${Math.exp(bt.radar6_eligible_median_log_err).toFixed(2)}) on the 94 in
    board-eligible categories, radar-7 ${bt.radar7_median_log_err} (×${Math.exp(bt.radar7_median_log_err).toFixed(2)}, within 2× ${bt.radar7_within2x_pct}%),
    radar-8 ${bt.radar8_median_log_err} (×${Math.exp(bt.radar8_median_log_err).toFixed(2)}, within 2× ${bt.radar8_within2x_pct}%).
    Within 2× of the real market cap:
    radar-3 ${bt.radar3_within2x_pct}%, radar-4 ${bt.radar4_within2x_pct}%, radar-5 ${bt.radar5_within2x_pct}%,
    radar-6 ${bt.radar6_within2x_pct}% (all 128) and ${bt.radar6_eligible_within2x_pct}% (eligible 94),
    radar-7 ${bt.radar7_within2x_pct}%, radar-8 ${bt.radar8_within2x_pct}%.
    A second, harder held-out test — leave-one-category-out, one whole category held out at a time:
    radar-4 ${bt.loco_radar4_median_log_err}, radar-5 ${bt.loco_radar5_median_log_err},
    radar-6 ${bt.loco_radar6_median_log_err}, radar-7 ${bt.radar7_loco_median_log_err},
    radar-8 ${bt.radar8_loco_median_log_err}. The radar-9 gain is
    real but small and is reported as small: it is better than radar-8 on three of the five held-out
    tests, ties the other two, and loses none — but the mean absolute error is flat and the unknown-age
    subgroup it targets gets worse on its own test, so the gain is a median gain, not a general one.
    The target of within-2× ≥ 45% and median
    |log err| ≤ 1.0 is not reached. A token's market cap follows its
    TVL only loosely (correlation 0.44 in log terms); the rest is tokenomics the snapshot cannot see.
    Rejected on the same tests: ridge regression over all features (5-fold 1.250, LOO 1.292),
    empirical-Bayes factors alone (CV 1.210, LOO 1.324), winsorisation alone (CV 1.233, LOO 1.308),
    per-category slope (5-fold 1.304), Theil-Sen (1.342), quadratic log(TVL)
    (1.306), a median-residual category factor (1.288), a young-age indicator (1.340), k-nearest
    neighbours on log TVL (1.35–1.43), median (quantile) regression in three forms (best CV 1.177 but
    LOO 1.189; the full version collapses walk-forward old → young to 1.681), sub-category factors for
    Dexs and Lending (both categories' leave-one-out worse), age imputation by category median (no
    change), a young × growing × hot-category interaction (never fires), and the comps approaches of §7 above.</p>
    <h3>9. Farm verdicts — a rule, not a feeling</h3>
    <p>FARM means implied value ≥ $20M and 7-day change ≥ −10% (${verdictCount.FARM || 0} rows).
    THIN means implied value ≥ $5M and 7-day change ≥ −25% (${verdictCount.THIN || 0} rows).
    Everything else is SKIP (${verdictCount.SKIP || 0} rows). The rule is stated on the board so anyone
    can check it against a row. The top 20 rows also state what an hour of farming costs in gas alone
    (about 3 transactions in 15 minutes on the row's cheapest chain): a cheap chain costs about a dollar
    an hour, Ethereum $60–$240.</p>
    <h3>10. Coverage — every rankable pre-token protocol, and the rest accounted for</h3>
    <p>The board ranks ${R.rows.length} protocols: the ${R.watchlist_count} on the watchlist plus every other rankable
    pre-token protocol, above or below the ${money(R.floor_usd)} floor. Wrapped, staked and bridged products are
    excluded because they already have a token in another form — their "launch" is not a new token — and
    versions of token protocols are excluded because ranking Aave V1, V3 and V4 separately would count one
    token three times. Both groups are listed on the Coverage view with the reason, so all ${R.accounting.total}
    protocols in the snapshot are accounted for: ${R.accounting.board_rows} ranked, ${R.accounting.wrapped_no_token}
    wrapped, ${R.accounting.live_with_mcap} live with a market cap, ${R.accounting.variant_symbol_only} versions of
    live tokens. Tokens that already trade live on a separate view and are never mixed into the ranking.</p>
    <p class="note">Nothing here predicts whether or when a token launches. The implied value is what a token
    would be worth if this protocol's record stayed as it is, priced the way the market prices the protocols
    that already have one — and the range and the odds say how much that guess is worth.</p>
    <h3>11. Farm plans — one playbook per category</h3>
    <p>Every row carries a 7-step plan from its category's playbook, built only from that protocol's own
    record (chains, TVL, age, 7-day change, verdict). A curated vault, a basis vault, a CDP, a prediction
    market and a chain each get different steps: the core action, the specific risk and the specific thing
    to check are different, and young protocols (under 120 days) and fast-falling ones (7-day change below
    −15%) get their own notes. The top-20 rows therefore read differently from each other instead of
    sharing one template. Each step states what to do, what it costs and how long it takes.</p>`;
}
function setView(view) {
  $("viewPre").classList.toggle("active", view === "pre");
  $("viewLive").classList.toggle("active", view === "live");
  $("viewCover").classList.toggle("active", view === "cover");
  $("viewModel").classList.toggle("active", view === "model");
  document.querySelector(".boardwrap").hidden = view !== "pre";
  document.querySelector(".controls").style.display = view === "pre" ? "" : "none";
  $("livewrap").hidden = view !== "live";
  $("coverwrap").hidden = view !== "cover";
  $("modelwrap").hidden = view !== "model";
  if (view === "live") renderLive();
  if (view === "cover") renderCover();
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
  $("viewCover").addEventListener("click", () => setView("cover"));
  $("viewModel").addEventListener("click", () => setView("model"));
  window.addEventListener("hashchange", () => renderDetail(true));
}

renderChecks();
renderStats();
renderDist();
initFilters();
renderBoard();
renderDetail(location.hash.startsWith("#/"));
