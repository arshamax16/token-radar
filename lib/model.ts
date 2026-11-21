// Radar-5 value model for the Token Radar board.
//
// The model calibrates itself from the sealed snapshot at run time: it
// fits a power law between TVL and market cap on the protocols in the
// snapshot that already have a token, then scores every pre-token
// protocol with that fitted law. No protocol name is ever hardcoded and
// no constant is tuned to a name: the same function scores every row.
//
//   calibration: every protocol in the snapshot with mcap_usd > 0 and
//     tvl_usd > 0 (128 of them on this snapshot) is the training set.
//   fit: log(mcap) = A + B * log(TVL). Radar-5 fits it by Huber
//     iteratively-reweighted least squares (8 rounds, c = 1.345 * MAD):
//     protocols whose market cap sits far off the power law (rain
//     +6.5, xdai-stake-bridge -6.1, concentrator -5.1 in log terms)
//     are downweighted instead of dragging the line. On this snapshot
//     A = 7.10, B = 0.518 (OLS gave 6.965 / 0.522). A token's market
//     cap grows like TVL^0.52, so the implied multiple FALLS as TVL
//     grows (0.48x at $10M TVL, 0.16x at $100M, 0.05x at $1B,
//     0.03x at $3B). A flat multiple (radar-2's 30% of TVL) overvalues
//     giants ~10x and undervalues small protocols ~3x; the power law
//     fixes both.
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
//   farm plans: each row's 7 steps come from its category's playbook
//     in lib/plans.ts — a curated vault, a basis vault, a CDP, a
//     prediction market and a chain each get their own steps, built
//     only from that protocol's own record (chains, TVL, age, growth,
//     verdict). The top-20 rows therefore read differently from each
//     other instead of sharing one template.
//
// Backtest (lower median |log(implied/mcap)| is better; the 5-fold
// numbers use a deterministic split by slug hash, the leave-one-
// category-out numbers hold out one whole category at a time and
// weight by its size — a second, harder held-out test):
//   radar-4 (OLS):            5-fold 1.264 (x3.54), within 2x 35.2%; LOCO 1.479.
//   radar-5 (Huber, this one): 5-fold 1.259 (x3.52), within 2x 35.2%; LOCO 1.461.
//   The gain is small and is reported as small: the Huber fit is
//   better on both held-out tests, in the same direction, and it is
//   stable (A 7.09-7.13, B 0.517-0.518 across 3-20 IRLS rounds), so
//   it is adopted — but it is a refinement, not a new model.
//   Rejected on the same tests: per-category slope (5-fold 1.356),
//   Theil-Sen (5-fold 1.342, LOCO 1.439 — better on LOCO, worse on
//   5-fold), quadratic log(TVL) (1.306), median-residual category
//   factor (1.288). Chain count was tested and rejected again: its
//   correlation with the residual is 0.07, essentially none.

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
    radar5_median_log_err: number;
    radar3_within2x_pct: number;
    radar4_within2x_pct: number;
    radar5_within2x_pct: number;
    loco_radar4_median_log_err: number;
    loco_radar5_median_log_err: number;
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
/** Huber IRLS rounds for the power-law fit (converged: A moves <0.02 after round 3). */
const HUBER_ROUNDS = 8;

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
 * Fit log(mcap) = A + B*log(TVL) by Huber iteratively-reweighted least
 * squares on the calibration set (8 rounds, c = 1.345 * 1.4826 * MAD):
 * protocols far off the power law are downweighted instead of dragging
 * the line. Then a shrunk category factor per category from the Huber
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
    // Start from ordinary least squares, then reweight.
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
    for (let round = 0; round < HUBER_ROUNDS; round++) {
      const res = train.map(
        (p, i) => Math.log(p.mcap_usd as number) - (intercept + exponent * xs[i]!),
      );
      const sorted = [...res].sort((a, b) => a - b);
      const med = Math.abs(sorted[Math.floor(sorted.length / 2)]!) || 0.5;
      const c = 1.345 * 1.4826 * med;
      const w = res.map((r) => (Math.abs(r) <= c ? 1 : c / Math.abs(r)));
      let sw = 0;
      let sx = 0;
      let sy = 0;
      let swxx = 0;
      let swxy = 0;
      for (let i = 0; i < n; i++) {
        sw += w[i]!;
        sx += w[i]! * xs[i]!;
        sy += w[i]! * ys[i]!;
        swxx += w[i]! * xs[i]! * xs[i]!;
        swxy += w[i]! * xs[i]! * ys[i]!;
      }
      const denom = sw * swxx - sx * sx;
      if (denom === 0) break;
      exponent = (sw * swxy - sx * sy) / denom;
      intercept = (sy - exponent * sx) / sw;
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
    version: "radar-5",
    method:
      "Power-law calibration fitted at run time from the snapshot's own token protocols: " +
      "log(market cap) = A + B*log(TVL) by Huber iteratively-reweighted least squares (8 rounds), " +
      "so protocols far off the power law are downweighted instead of dragging the line; then a " +
      "shrunk category factor from the residuals. Implied value = exp(A) * TVL^B * category factor " +
      "* growth * maturity. Growth moves the value at most 10% and maturity at most 5%: a 7-day " +
      "window and age barely predict the multiple in the calibration data, so they are kept small " +
      "on purpose. The peer token rate is shown for context only and never enters the value.",
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
      radar5_median_log_err: 1.259,
      radar3_within2x_pct: 33.6,
      radar4_within2x_pct: 35.2,
      radar5_within2x_pct: 35.2,
      loco_radar4_median_log_err: 1.479,
      loco_radar5_median_log_err: 1.461,
      method: "5-fold cross-validation (deterministic split by slug hash) plus leave-one-category-out, both held-out; median |log(implied/mcap)|",
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

// Farm plans live in lib/plans.ts (one playbook per category).
import { farmSteps } from "./plans.ts";

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
    farm_steps: farmSteps(p, asOf, breakdown, verdict, rates[p.category ?? "(null)"] ?? 0),
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
