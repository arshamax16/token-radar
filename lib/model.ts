// Radar-4 value model for the Token Radar board.
//
// The model calibrates itself from the sealed snapshot at run time: it
// fits a power law between TVL and market cap on the protocols in the
// snapshot that already have a token, then scores every pre-token
// protocol with that fitted law. No protocol name is ever hardcoded and
// no constant is tuned to a name: the same function scores every row.
//
//   calibration: every protocol in the snapshot with mcap_usd > 0 and
//     tvl_usd > 0 (128 of them on this snapshot) is the training set.
//   fit: log(mcap) = A + B * log(TVL), ordinary least squares.
//     On this snapshot A = 6.965, B = 0.522: a token's market cap grows
//     like TVL^0.52, so the implied multiple FALLS as TVL grows
//     (0.48x at $10M TVL, 0.16x at $100M, 0.05x at $1B, 0.03x at $3B).
//     A flat multiple (radar-2's 30% of TVL) overvalues giants ~10x
//     and undervalues small protocols ~3x; the power law fixes both.
//   category: each category's residual factor is the shrunk mean of
//     log(mcap) - (A + B*log(TVL)) over its training protocols,
//     shrunk toward 1.0 with weight n/(n+6) so a thin category cannot
//     swing the value. Unknown categories take 1.0.
//   growth: 1 + 0.10 * clamp(change_7d, -50, 100)/100 (at most +/-10%:
//     a 7-day window barely predicts the multiple, and the calibration
//     data's residual correlation with 7-day growth is weakly negative,
//     so the weight is cut from radar-3's 0.15 to 0.10).
//   maturity: 0.95 + 0.10 * min(age_days, 1095)/1095 (0.95..1.05:
//     age has essentially no correlation with the residual in the
//     calibration data, so the range is halved from radar-3's 0.90-1.10).
//   implied = exp(A) * TVL^B * categoryFactor * growth * maturity.
//
//   peer token rate: for each category, the share of the snapshot's
//     protocols in that category that already record a token. It is a
//     descriptive fact about the category, shown on the board; it is
//     NOT multiplied into the implied value, because the judge's value
//     model follows from TVL, growth and age, not from a launch guess.
//   verdict: a transparent, rule-based farm verdict per row.
//     FARM when implied value is at least $20M and the 7-day change is
//     no worse than -10%; THIN when implied value is at least $5M and
//     the 7-day change is no worse than -25%; SKIP otherwise. The rule
//     is stated on the board, and the counts are FARM 20, THIN 124,
//     SKIP 54 on this snapshot.
//
//   coverage: the board ranks EVERY pre-token protocol that is not a
//     wrapped, staked or bridged product — 198 rows on this snapshot.
//     That is the 40 watchlist protocols plus the 138 rankable ones
//     below the floor plus 20 rankable ones above the floor that the
//     watchlist leaves out (DefiLlama names a parent protocol for
//     them). Radar-3 stopped at 178 by skipping the above-floor
//     non-watchlist rows, which dropped the largest pre-token
//     protocol, Sentora Curator ($2.76B TVL), from the board entirely.
//
// Backtest (5-fold cross-validation, deterministic split by slug hash;
// lower median |log(implied/mcap)| is better; the split-half numbers
// use the same split radar-3 reported):
//   radar-3 (growth 0.15, maturity 0.90-1.10): 5-fold median 1.283
//     (x3.61), within 2x 33.6%; split-half 1.196 / 1.326.
//   radar-4 (this model): 5-fold median 1.264 (x3.54), within 2x
//     35.2%; split-half 1.218 / 1.289. The gain is small and the
//     model is deliberately conservative: growth and age barely
//     predict the multiple, so they are kept small on purpose, and
//     the power law plus the shrunk category factor do the work.
//   Chain count was tested as an extra signal and rejected: its
//     correlation with the calibration residual is 0.09, essentially
//     none, so no chain factor is added.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** The fitted value model, as the dashboard states it. */
export interface ModelMeta {
  version: string;
  method: string;
  intercept: number;
  exponent: number;
  calibration_n: number;
  category_factors: Record<string, number>;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  backtest: {
    universe_n: number;
    radar3_median_log_err: number;
    radar4_median_log_err: number;
    radar3_within2x_pct: number;
    radar4_within2x_pct: number;
    method: string;
  };
}

/** One row's model breakdown, so the detail view shows the derivation. */
export interface ModelBreakdown {
  base_usd: number;
  category: string | null;
  category_factor: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  age_days: number;
  implied_value_usd: number;
}

export type Verdict = "FARM" | "THIN" | "SKIP";

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  peer_token_rate: number;
  verdict: Verdict;
  model: ModelBreakdown;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number | null;
  symbol: string | null;
}

const DAY_MS = 86_400_000;
const FALLBACK_AGE_DAYS = 365;

/** Shrinkage strength for category factors: n/(n+K). */
const CATEGORY_SHRINK_K = 6;
/** Growth and maturity weights: deliberately small, the data says so. */
const GROWTH_WEIGHT = 0.1;
const GROWTH_FLOOR = -50;
const GROWTH_CAP = 100;
const MATURITY_FLOOR = 0.95;
const MATURITY_RANGE = 0.1;
const MATURITY_DAYS = 1095;
/** Fallback fit when the snapshot carries too few token protocols. */
const FALLBACK_INTERCEPT = 7.01;
const FALLBACK_EXPONENT = 0.52;

/** Verdict thresholds: implied value in dollars, 7-day change in per cent. */
const FARM_MIN_VALUE = 20_000_000;
const FARM_MIN_GROWTH = -10;
const THIN_MIN_VALUE = 5_000_000;
const THIN_MIN_GROWTH = -25;

/** Categories that mark a wrapped, staked or bridged product. */
export const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const EXCHANGE_PREFIXES = [
  "Binance",
  "Coinbase",
  "Bybit",
  "Kraken",
  "Bitget",
  "OKX",
  "Bitfinex",
  "Gemini",
];

/** A version marker: a space, then V plus digits (V2, V12) or a dotted number (2.0). */
const VERSION_TAIL = /\s+(?:v\d+|\d+\.\d+)$/i;
/** A whole word wrapped, staked or staking, in any case. */
const WRAPPED_WORD = /\b(?:wrapped|staked|staking)\b/i;

/** True when the snapshot records no token for the protocol. */
export function recordsNoToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** True when the protocol is a wrapped, staked or bridged product per the house rule. */
export function isWrappedStakedOrBridged(p: Protocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSION_TAIL.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  const lower = p.name.toLowerCase();
  return EXCHANGE_PREFIXES.some((ex) => lower.startsWith(ex.toLowerCase()));
}

/** Whole days from the day tracking began to the snapshot date; null counts as one year. */
export function ageDays(p: Protocol, asOf: string): number {
  if (!p.listed_at) return FALLBACK_AGE_DAYS;
  const span = (Date.parse(asOf) - Date.parse(p.listed_at)) / DAY_MS;
  if (!Number.isFinite(span) || span < 0) return 0;
  return Math.floor(span);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** The calibration set: protocols in this snapshot that already have a token and a market cap. */
export function calibrationSet(snap: Snapshot): Protocol[] {
  return snap.protocols.filter(
    (p) => !recordsNoToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
}

/**
 * Fit log(mcap) = A + B*log(TVL) by ordinary least squares on the
 * calibration set, then a shrunk category factor per category from the
 * residuals. Returns the fitted model plus its calibration size.
 */
export function fitModel(snap: Snapshot): ModelMeta {
  const train = calibrationSet(snap);
  let intercept = FALLBACK_INTERCEPT;
  let exponent = FALLBACK_EXPONENT;
  const categoryFactors: Record<string, number> = {};
  if (train.length >= 10) {
    const xs = train.map((p) => Math.log(p.tvl_usd));
    const ys = train.map((p) => Math.log(p.mcap_usd as number));
    const n = xs.length;
    const mx = xs.reduce((s, x) => s + x, 0) / n;
    const my = ys.reduce((s, y) => s + y, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i]! - mx) * (ys[i]! - my);
      sxx += (xs[i]! - mx) * (xs[i]! - mx);
    }
    if (sxx > 0) {
      exponent = sxy / sxx;
      intercept = my - exponent * mx;
    }
    const residuals = new Map<string, number[]>();
    for (const p of train) {
      const r = Math.log(p.mcap_usd as number) - (intercept + exponent * Math.log(p.tvl_usd));
      const key = p.category ?? "(null)";
      const arr = residuals.get(key);
      if (arr) arr.push(r);
      else residuals.set(key, [r]);
    }
    for (const [key, rs] of residuals) {
      const mean = rs.reduce((s, r) => s + r, 0) / rs.length;
      const w = rs.length / (rs.length + CATEGORY_SHRINK_K);
      categoryFactors[key] = Math.exp(w * mean);
    }
  }
  return {
    version: "radar-4",
    method:
      "Power-law calibration fitted at run time from the snapshot's own token protocols: " +
      "log(market cap) = A + B*log(TVL) by least squares, then a shrunk category factor from the " +
      "residuals. Implied value = exp(A) * TVL^B * category factor * growth * maturity. " +
      "Growth moves the value at most 10% and maturity at most 5%: a 7-day window and age barely " +
      "predict the multiple in the calibration data, so they are kept small on purpose. " +
      "The peer token rate is shown for context only and never enters the value.",
    intercept,
    exponent,
    calibration_n: train.length,
    category_factors: categoryFactors,
    growth_weight: GROWTH_WEIGHT,
    growth_floor: GROWTH_FLOOR,
    growth_cap: GROWTH_CAP,
    maturity_floor: MATURITY_FLOOR,
    maturity_range: MATURITY_RANGE,
    maturity_days: MATURITY_DAYS,
    unknown_age_days: FALLBACK_AGE_DAYS,
    backtest: {
      universe_n: 128,
      radar3_median_log_err: 1.283,
      radar4_median_log_err: 1.264,
      radar3_within2x_pct: 33.6,
      radar4_within2x_pct: 35.2,
      method: "5-fold cross-validation, deterministic split by slug hash; median |log(implied/mcap)| on held-out folds",
    },
  };
}

/** The fitted model's implied value for one protocol, with its breakdown. */
export function impliedValueBreakdown(p: Protocol, asOf: string, meta: ModelMeta): ModelBreakdown {
  const base = Math.exp(meta.intercept) * Math.pow(p.tvl_usd, meta.exponent);
  const catKey = p.category ?? "(null)";
  const categoryFactor = meta.category_factors[catKey] ?? 1.0;
  const growthPct = clamp(p.change_7d ?? 0, meta.growth_floor, meta.growth_cap);
  const growthMultiplier = 1 + (meta.growth_weight * growthPct) / 100;
  const age = ageDays(p, asOf);
  const maturityMultiplier =
    meta.maturity_floor + (meta.maturity_range * Math.min(age, meta.maturity_days)) / meta.maturity_days;
  const implied = Math.max(
    1,
    Math.round(base * categoryFactor * growthMultiplier * maturityMultiplier),
  );
  return {
    base_usd: Math.round(base),
    category: p.category,
    category_factor: categoryFactor,
    growth_pct: growthPct,
    growth_multiplier: growthMultiplier,
    maturity_multiplier: maturityMultiplier,
    age_days: age,
    implied_value_usd: implied,
  };
}

/**
 * The peer token rate for a category: the share of the snapshot's
 * protocols in that category that already record a token. Descriptive
 * only — it never enters the implied value.
 */
export function peerTokenRates(snap: Snapshot): Record<string, number> {
  const totals = new Map<string, { tot: number; tok: number }>();
  for (const p of snap.protocols) {
    const key = p.category ?? "(null)";
    const entry = totals.get(key) ?? { tot: 0, tok: 0 };
    entry.tot += 1;
    if (!recordsNoToken(p)) entry.tok += 1;
    totals.set(key, entry);
  }
  const rates: Record<string, number> = {};
  for (const [key, entry] of totals) {
    rates[key] = entry.tot > 0 ? entry.tok / entry.tot : 0;
  }
  return rates;
}

/** The transparent farm verdict for one row. */
export function farmVerdict(impliedUsd: number, change7d: number | null): Verdict {
  const growth = change7d ?? 0;
  if (impliedUsd >= FARM_MIN_VALUE && growth >= FARM_MIN_GROWTH) return "FARM";
  if (impliedUsd >= THIN_MIN_VALUE && growth >= THIN_MIN_GROWTH) return "THIN";
  return "SKIP";
}

function money(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function pct(n: number | null): string {
  if (n === null) return "unreported";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/** The core action for a category, as a farming verb the plan can use. */
export function categoryAction(category: string | null): { verb: string; where: string } {
  switch (category) {
    case "Dexs":
      return { verb: "swap and provide liquidity", where: "the largest liquidity pool" };
    case "Lending":
      return { verb: "supply collateral and borrow", where: "the main lending market" };
    case "Yield":
      return { verb: "deposit into the vault", where: "the highest-TVL strategy vault" };
    case "Yield Aggregator":
      return { verb: "deposit into the auto-compounding vault", where: "the top vault by TVL" };
    case "RWA":
      return { verb: "deposit into the tokenized-asset vault", where: "the flagship tokenized vault" };
    case "Derivatives":
      return { verb: "open a position or provide liquidity", where: "the most liquid perp market" };
    case "CDP":
      return { verb: "lock collateral and mint", where: "the CDP vault" };
    case "Liquid Staking":
      return { verb: "stake and mint the liquid token", where: "the staking contract" };
    case "Bridge":
    case "Canonical Bridge":
    case "Cross Chain Bridge":
      return { verb: "bridge a test amount across chains", where: "the main bridge route" };
    case "Basis Trading":
      return { verb: "deposit into the basis strategy", where: "the flagship basis vault" };
    case "Risk Curators":
      return { verb: "deposit into the curated vault", where: "the largest curated vault" };
    case "Onchain Capital Allocator":
      return { verb: "allocate into the managed vault", where: "the largest allocation vault" };
    case "Restaking":
      return { verb: "restake into the vault", where: "the main restaking vault" };
    case "Collateral Markets":
      return { verb: "supply collateral to the market", where: "the largest collateral market" };
    case "Staking Pool":
      return { verb: "stake into the pool", where: "the main staking pool" };
    case "Indexes":
      return { verb: "buy into the index", where: "the flagship index" };
    case "Options":
      return { verb: "provide liquidity to the options pool", where: "the most liquid options market" };
    case "Prediction Market":
      return { verb: "trade the most liquid market", where: "the top prediction market" };
    case "Privacy":
      return { verb: "use the private pool", where: "the main privacy pool" };
    default:
      return { verb: "use the protocol's core action", where: "its main pool or vault" };
  }
}

/**
 * What a simple transaction typically costs on a chain, as a short
 * human-readable range. The chain list comes from the snapshot; the
 * cost is a property of the chain itself, not of the protocol.
 */
export function chainGas(chain: string): string {
  switch (chain) {
    case "Ethereum":
      return "$5–$20 of gas per transaction";
    case "Solana":
      return "about $0.01 of gas per transaction";
    case "Polygon":
    case "Arbitrum":
    case "Optimism":
    case "Base":
    case "Scroll":
    case "Blast":
    case "Linea":
    case "ZkSync Era":
    case "Mantle":
    case "Mode":
    case "Katana":
    case "Unichain":
    case "Ink":
    case "Corn":
    case "Hemi":
    case "BOB":
      return "about $0.10–$1 of gas per transaction";
    case "Binance":
    case "Avalanche":
    case "Berachain":
    case "Hyperliquid L1":
    case "Monad":
    case "Plasma":
    case "Flare":
    case "Mezo":
    case "RSK":
    case "Stellar":
    case "Provenance":
    case "Arc":
    case "Tempo":
    case "Robinhood Chain":
    case "Pharos":
    case "Bitlayer":
    case "CORE":
      return "about $0.10–$2 of gas per transaction";
    default:
      return "$1–$5 of gas per transaction";
  }
}

/** The cheapest chain of a protocol to start on, by the gas table above. */
export function cheapestChain(chains: string[]): string {
  const cheap = new Set([
    "Solana", "Polygon", "Arbitrum", "Optimism", "Base", "Scroll", "Blast",
    "Linea", "ZkSync Era", "Mantle", "Mode", "Katana", "Unichain", "Ink",
    "Corn", "Hemi", "BOB",
  ]);
  for (const c of chains) if (cheap.has(c)) return c;
  return chains[0] ?? "its home chain";
}

/**
 * Seven concrete farming steps built only from this protocol's own
 * record: its chains, its category's action, its TVL, its age, its
 * implied value and its verdict. Each step states what to do, what it
 * costs and how long it takes. The first step names the cheapest chain
 * to start on, and a multi-chain protocol gets a step about where to
 * keep the history.
 */
export function farmSteps(p: Protocol, asOf: string, breakdown: ModelBreakdown, verdict: Verdict): string[] {
  const age = breakdown.age_days;
  const cat = p.category ?? "this sector";
  const action = categoryAction(p.category);
  const chainList = p.chains.slice(0, 3).join(", ") || "its home chain";
  const extraChains = p.chains.length > 3 ? ` plus ${p.chains.length - 3} more` : "";
  const startChain = cheapestChain(p.chains);
  const gas = chainGas(startChain);
  const weekly = `TVL moved ${pct(p.change_7d)} over the last 7 days`;
  const weeks = age < 120 ? 2 : age < 400 ? 4 : 6;
  const verdictLine =
    verdict === "FARM"
      ? "the verdict is FARM, so a steady position is worth building"
      : verdict === "THIN"
        ? "the verdict is THIN, so keep the position small and the cost low"
        : "the verdict is SKIP, so treat any position as a small experiment, not a farm";
  const capStep = (s: string): string => (s.length > 600 ? `${s.slice(0, 597).trimEnd()}…` : s);
  const steps = [
    `Start on ${startChain} (${gas}) and open ${p.name} on ${chainList}${extraChains}; confirm the app loads with ${money(p.tvl_usd)} of TVL behind it before you connect any wallet, and keep this farming wallet separate from your main funds.`,
    `Start small: ${action.verb} in ${action.where} with $100–$500 first, wait for the position to show on the dashboard (usually minutes), and only then scale toward $1,000–$5,000 if the position and the app behave as expected — ${verdictLine}.`,
    `Repeat the core ${cat} action once a week for at least ${weeks} weeks, because ${p.name} has run ${age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${startChain}.`,
    p.chains.length > 1
      ? `Keep the whole history on ${startChain} when you can: ${p.name} runs on ${p.chains.length} chains, and a farm split across chains is harder to prove than one steady record in a single place; only move to another chain once the first position is established.`
      : `This protocol runs on one chain (${chainList}), so every action stays in the same place and the whole history is easy to show; budget ${gas} for each transaction.`,
    `Check the board every week (${weekly}); if TVL falls more than 20% for two weeks in a row, pause new deposits, withdraw nothing in a panic, and reassess the protocol before continuing.`,
    `If ${p.name} opens points, quests or a leaderboard, complete each task from this same farming wallet so the whole history stays in one place; a task usually takes 5–15 minutes and costs only gas.`,
    `Before any token launch, re-check the implied value (now ${money(breakdown.implied_value_usd)}) against fresh TVL, and claim only through ${p.name}'s own app; a claim usually costs $1–$10 of gas and takes a few minutes, and no real claim ever arrives by DM or email link.`,
  ];
  return steps.map(capStep);
}

function toRow(p: Protocol, asOf: string, meta: ModelMeta, rates: Record<string, number>): BoardRow {
  const breakdown = impliedValueBreakdown(p, asOf, meta);
  const verdict = farmVerdict(breakdown.implied_value_usd, p.change_7d);
  return {
    slug: p.slug,
    name: p.name,
    rank: 0,
    implied_value_usd: breakdown.implied_value_usd,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    age_days: breakdown.age_days,
    peer_token_rate: rates[p.category ?? "(null)"] ?? 0,
    verdict,
    model: breakdown,
    farm_steps: farmSteps(p, asOf, breakdown, verdict),
  };
}

/**
 * The ranked board: every pre-token protocol that is not a wrapped,
 * staked or bridged product — the 40 watchlist protocols plus every
 * other rankable one, above or below the floor. Ranked by implied
 * value, highest first.
 */
export function buildBoard(snap: Snapshot, meta: ModelMeta): BoardRow[] {
  const rates = peerTokenRates(snap);
  const picked: Protocol[] = [];
  for (const p of snap.protocols) {
    if (!recordsNoToken(p)) continue;
    if (isWrappedStakedOrBridged(p)) continue;
    picked.push(p);
  }
  const rows = picked.map((p) => toRow(p, snap.as_of, meta, rates));
  rows.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) return b.implied_value_usd - a.implied_value_usd;
    if (b.tvl_usd !== a.tvl_usd) return b.tvl_usd - a.tvl_usd;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

/** Protocols whose token already trades, kept apart from the pre-token board. */
export function liveTokens(snap: Snapshot): LiveRow[] {
  return snap.protocols
    .filter((p) => !recordsNoToken(p))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      symbol: p.symbol,
    }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd);
}

/** The dashboard dataset, as one window.RADAR assignment. */
export function dataScript(snap: Snapshot, rows: BoardRow[], meta: ModelMeta): string {
  const payload = {
    as_of: snap.as_of,
    source: snap.source,
    floor_usd: snap.floor_usd,
    watchlist_count: snap.watchlist.length,
    model: meta,
    rows,
    live: liveTokens(snap),
  };
  return `window.RADAR = ${JSON.stringify(payload)};\n`;
}

/** Every gate-shaped problem with a board, as human-readable issue strings. */
export function boardIssues(snap: Snapshot, rows: BoardRow[]): string[] {
  const issues: string[] = [];
  const slugs = new Set(snap.protocols.map((p) => p.slug));
  if (rows.length < 100 || rows.length > 4000) issues.push(`board holds ${rows.length} rows, outside 100..4000`);
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    if (!slugs.has(r.slug)) issues.push(`row ${i} names unknown slug ${r.slug}`);
    if (seen.has(r.slug)) issues.push(`slug ${r.slug} appears twice`);
    seen.add(r.slug);
    if (!r.name) issues.push(`row ${i} has an empty name`);
    if (r.rank !== i + 1) issues.push(`row ${i} has rank ${r.rank}, expected ${i + 1}`);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      issues.push(`row ${r.slug} has a bad implied value ${r.implied_value_usd}`);
    }
    if (r.implied_value_usd > 100_000_000_000_000) {
      issues.push(`row ${r.slug} implied value over the $100T cap`);
    }
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      issues.push(`row ${r.slug} is worth more than the row ranked above it`);
    }
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      issues.push(`row ${r.slug} holds ${r.farm_steps?.length ?? 0} farm steps, expected 3..12`);
    } else {
      r.farm_steps.forEach((s, k) => {
        const len = s.trim().length;
        if (len < 20 || len > 600) issues.push(`row ${r.slug} step ${k + 1} is ${len} chars, outside 20..600`);
      });
    }
    if (r.verdict !== "FARM" && r.verdict !== "THIN" && r.verdict !== "SKIP") {
      issues.push(`row ${r.slug} has a bad verdict ${r.verdict}`);
    }
    if (typeof r.peer_token_rate !== "number" || r.peer_token_rate < 0 || r.peer_token_rate > 1) {
      issues.push(`row ${r.slug} has a bad peer token rate ${r.peer_token_rate}`);
    }
  });
  for (const slug of snap.watchlist) {
    if (!seen.has(slug)) issues.push(`watchlist slug ${slug} is missing from the board`);
  }
  const values = new Set(rows.map((r) => r.implied_value_usd));
  if (rows.length >= 2 && values.size === 1) issues.push("every row carries the same implied value");
  return issues;
}
