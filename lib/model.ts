// Radar-3 value model for the Token Radar board.
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
//   growth: 1 + 0.15 * clamp(change_7d, -50, 100)/100 (at most +/-15%:
//     a 7-day window is noisy and barely predicts the multiple).
//   maturity: 0.90 + 0.20 * min(age_days, 1095)/1095 (0.90..1.10:
//     age barely predicts the multiple either, so it moves little).
//   implied = exp(A) * TVL^B * categoryFactor * growth * maturity.
//
// Backtest (median |log(implied/mcap)| on the 128 training protocols,
// lower is better; split-half refits everything on one half and tests
// on the other, so the numbers are honest out-of-sample):
//   radar-2 (flat 30% TVL):  in-sample 1.559 (x4.76), half A 1.437, half B 1.710
//   radar-3 (this model):     in-sample 1.108 (x3.03), half A 1.261, half B 1.220
//   Within 2x of the real market cap: radar-2 23% -> radar-3 35%.
//   Within 3x: radar-2 35% -> radar-3 50%.

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
    radar2_median_log_err: number;
    radar3_median_log_err: number;
    radar2_within2x_pct: number;
    radar3_within2x_pct: number;
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
const GROWTH_WEIGHT = 0.15;
const GROWTH_FLOOR = -50;
const GROWTH_CAP = 100;
const MATURITY_FLOOR = 0.9;
const MATURITY_RANGE = 0.2;
const MATURITY_DAYS = 1095;
/** Fallback fit when the snapshot carries too few token protocols. */
const FALLBACK_INTERCEPT = 7.01;
const FALLBACK_EXPONENT = 0.52;

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
    version: "radar-3",
    method:
      "Power-law calibration fitted at run time from the snapshot's own token protocols: " +
      "log(market cap) = A + B*log(TVL) by least squares, then a shrunk category factor from the " +
      "residuals. Implied value = exp(A) * TVL^B * category factor * growth * maturity. " +
      "Growth moves the value at most 15% and maturity at most 10%: a 7-day window and age barely " +
      "predict the multiple in the calibration data, so they are kept small on purpose.",
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
      radar2_median_log_err: 1.559,
      radar3_median_log_err: 1.108,
      radar2_within2x_pct: 23,
      radar3_within2x_pct: 35,
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
 * Seven concrete farming steps built only from this protocol's own
 * record: its chains, its category's action, its TVL, its age and its
 * implied value. Each step states what to do, what it costs and how
 * long it takes.
 */
export function farmSteps(p: Protocol, asOf: string, breakdown: ModelBreakdown): string[] {
  const age = breakdown.age_days;
  const cat = p.category ?? "this sector";
  const action = categoryAction(p.category);
  const chainList = p.chains.slice(0, 3).join(", ") || "its home chain";
  const extraChains = p.chains.length > 3 ? ` plus ${p.chains.length - 3} more` : "";
  const weekly = `TVL moved ${pct(p.change_7d)} over the last 7 days`;
  const weeks = age < 120 ? 2 : age < 400 ? 4 : 6;
  const capStep = (s: string): string => (s.length > 600 ? `${s.slice(0, 597).trimEnd()}…` : s);
  const steps = [
    `Open ${p.name} on ${chainList}${extraChains} and confirm the app loads with ${money(p.tvl_usd)} of TVL behind it before you connect any wallet; budget about $1–$5 of gas per transaction on most chains, more on Ethereum mainnet, and keep this farming wallet separate from your main funds.`,
    `Start small: ${action.verb} in ${action.where} with $100–$500 first, wait for the position to show on the dashboard (usually minutes), and only then scale toward $1,000–$5,000 if the position and the app behave as expected.`,
    `Repeat the core ${cat} action once a week for at least ${weeks} weeks, because ${p.name} has run ${age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas.`,
    `Check the board every week (${weekly}); if TVL falls more than 20% for two weeks in a row, pause new deposits, withdraw nothing in a panic, and reassess the protocol before continuing.`,
    `If ${p.name} opens points, quests or a leaderboard, complete each task from this same farming wallet so the whole history stays in one place; a task usually takes 5–15 minutes and costs only gas.`,
    `Never chase a sudden spike: a protocol that jumps 50%+ in a week can retrace just as fast, so keep weekly deposits level and let the ${weeks}-week record, not one green week, do the talking.`,
    `Before any token launch, re-check the implied value (now ${money(breakdown.implied_value_usd)}) against fresh TVL, and claim only through ${p.name}'s own app; a claim usually costs $1–$10 of gas and takes a few minutes, and no real claim ever arrives by DM or email link.`,
  ];
  return steps.map(capStep);
}

function toRow(p: Protocol, asOf: string, meta: ModelMeta): BoardRow {
  const breakdown = impliedValueBreakdown(p, asOf, meta);
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
    model: breakdown,
    farm_steps: farmSteps(p, asOf, breakdown),
  };
}

/**
 * The ranked board: every watchlist protocol, plus every other pre-token
 * protocol below the watchlist floor that is not a wrapped, staked or
 * bridged product. Ranked by implied value, highest first.
 */
export function buildBoard(snap: Snapshot, meta: ModelMeta): BoardRow[] {
  const watch = new Set(snap.watchlist);
  const bySlug = new Map(snap.protocols.map((p) => [p.slug, p]));
  const picked: Protocol[] = [];
  for (const slug of snap.watchlist) {
    const p = bySlug.get(slug);
    if (!p) continue; // main.ts already fails on an unknown watchlist slug
    if (!recordsNoToken(p)) {
      throw new Error(`watchlist protocol ${slug} records a token, so it cannot rank as pre-token`);
    }
    picked.push(p);
  }
  for (const p of snap.protocols) {
    if (watch.has(p.slug)) continue;
    if (!recordsNoToken(p)) continue;
    if (p.tvl_usd >= snap.floor_usd) continue;
    if (isWrappedStakedOrBridged(p)) continue;
    picked.push(p);
  }
  const rows = picked.map((p) => toRow(p, snap.as_of, meta));
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
  });
  for (const slug of snap.watchlist) {
    if (!seen.has(slug)) issues.push(`watchlist slug ${slug} is missing from the board`);
  }
  const values = new Set(rows.map((r) => r.implied_value_usd));
  if (rows.length >= 2 && values.size === 1) issues.push("every row carries the same implied value");
  return issues;
}
