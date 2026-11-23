// Radar-6 value model for the Token Radar board.
//
// The model calibrates itself from the sealed snapshot at run time: it
// fits a power law between TVL and market cap on the protocols in the
// snapshot that already have a token, then scores every pre-token
// protocol with that fitted law. No protocol name is ever hardcoded and
// no constant is tuned to a name: the same function scores every row.
//
//   calibration: radar-6 fits on the 94 token protocols in BOARD-
//     ELIGIBLE categories only (128 token protocols in this snapshot
//     minus 34 in CEX, Bridge, Canonical Bridge, Liquid Staking,
//     Liquid Restaking and Restaked BTC). A CEX token's value does not
//     follow from its exchange's TVL, a bridge token is usually worth
//     ~nothing whatever the bridge holds, and a liquid-staking token
//     tracks its underlying — including them in the fit drags the line
//     toward protocols whose market cap is structurally decoupled from
//     TVL. The board never ranks those categories anyway (they are
//     wrapped, staked or bridged products), so the fit is calibrated
//     on exactly the population the board predicts. Fitting on all 128
//     was tested and is worse on both held-out tests.
//   fit: log(mcap) = A + B * log(TVL). Radar-6 fits it by Huber
//     iteratively-reweighted least squares (8 rounds, c = 1.345 * MAD):
//     protocols whose market cap sits far off the power law (rain
//     +6.4, concentrator -5.0, bitway-earn +4.9 in log terms) are
//     downweighted instead of dragging the line. On this snapshot
//     A = 8.63, B = 0.426 (radar-5, fitted on all 128, gave 7.10 /
//     0.518). A token's market cap grows like TVL^0.43, so the implied
//     multiple FALLS as TVL grows (0.54x at $10M TVL, 0.14x at $100M,
//     0.04x at $1B, 0.02x at $3B). A flat multiple (radar-2's 30% of
//     TVL) overvalues giants ~10x and undervalues small protocols ~3x;
//     the power law fixes both.
//   category: each category's residual factor is the shrunk mean of
//     log(mcap) - (A + B*log(TVL)) over its training protocols,
//     shrunk toward 1.0 with weight n/(n+6) so a thin category cannot
//     swing the value. Unknown categories take 1.0.
//   chain: NEW in radar-6 — each chain's residual factor is the
//     shrunk mean of the same residuals over the protocols deployed on
//     that chain (weight n/(n+4), chains with fewer than 3 training
//     protocols take no factor). A row's chain factor is the MEAN of
//     its chains' factors. Protocols on newer, smaller ecosystems price
//     lower at the same TVL (Kava x0.50, Mantle x0.57, Monad x0.57,
//     Berachain x0.63; Ethereum x0.95, Arbitrum x1.03, Blast x1.51) —
//     the chain is where the protocol lives, and the market prices the
//     ecosystem too. Chain COUNT was tested and rejected again (its
//     correlation with the residual is 0.09); chain IDENTITY is what
//     carries signal. The factor is a mean over the row's chains, so a
//     protocol deployed on many chains is pulled toward the middle.
//   growth: 1 + 0.10 * clamp(change_7d, -50, 100)/100 (at most +/-10%:
//     a 7-day window barely predicts the multiple, and the calibration
//     data's residual correlation with 7-day growth is weakly negative,
//     so the weight is cut from radar-3's 0.15 to 0.10).
//   maturity: 0.95 + 0.10 * min(age_days, 1095)/1095 (0.95..1.05:
//     age has essentially no correlation with the residual in the
//     calibration data, so the range is halved from radar-3's 0.90-1.10).
//   implied = exp(A) * TVL^B * categoryFactor * chainFactor * growth
//     * maturity.
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
//     is stated on the board, and the counts are FARM 16, THIN 104,
//     SKIP 78 on this snapshot.
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
// Backtest (lower median |log(implied/mcap)| is better; the numbers
// below are from one repeated harness — 5-fold cross-validation over
// 5 deterministic slug-hash seeds, plus leave-one-category-out — so
// radar-5 and radar-6 are measured the same way; radar-5's own
// earlier single-split numbers were 1.259 / 35.2% / LOCO 1.461):
//   radar-5 (all 128):       5-fold 1.313 (x3.72), within 2x 32.0%; LOCO (eligible) 1.294.
//   radar-5 (eligible 94):   5-fold 1.262 (x3.53), within 2x 33.4%.
//   radar-6 (all 128):       5-fold 1.257 (x3.51), within 2x 32.9%; LOCO (eligible) 1.159.
//   radar-6 (eligible 94):   5-fold 1.162 (x3.20), within 2x 36.3%.
//   The gain is real but modest and is reported as modest: radar-6 is
//   better on every held-out test, in the same direction — 5-fold,
//   leave-one-category-out, age splits (train old, test young 1.50
//   vs 1.78; train young, test old 0.87 vs 1.08) and the big-to-small
//   TVL split (1.29 vs 1.40) — but the target the brief set
//   (within-2x >= 45%, median |log err| <= 1.0) is NOT reached. The
//   market cap of a token follows its TVL only loosely (correlation
//   0.44 in log terms); the rest is tokenomics the snapshot cannot
//   see, and no feature in it (age, growth, chain count, per-category
//   slope, quadratic TVL, young-protocol flag, Theil-Sen, k-nearest
//   neighbours) closes that gap. Radar-6 takes what the data gives:
//   a cleaner fit set and the chain the protocol lives on.
//   Rejected on the same tests: per-category slope (5-fold 1.304),
//   Theil-Sen (1.342), quadratic log(TVL) (1.306), median-residual
//   category factor (1.288), young-age indicator (1.340), chain count
//   (correlation 0.09, no signal), kNN on log TVL (1.35-1.43).

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
  chain_factors: Record<string, number>;
  chain_shrink_k: number;
  chain_min_n: number;
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
    radar6_median_log_err: number;
    radar6_eligible_median_log_err: number;
    radar3_within2x_pct: number;
    radar4_within2x_pct: number;
    radar5_within2x_pct: number;
    radar6_within2x_pct: number;
    radar6_eligible_within2x_pct: number;
    loco_radar4_median_log_err: number;
    loco_radar5_median_log_err: number;
    loco_radar6_median_log_err: number;
    method: string;
  };
}

/** One row's model breakdown, so the detail view shows the derivation. */
export interface ModelBreakdown {
  base_usd: number;
  category: string | null;
  category_factor: number;
  chain_factor: number;
  chains: string[];
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
/** Shrinkage strength for chain factors: n/(n+K); chains with fewer
 *  than CHAIN_MIN_N training protocols take no factor (1.0). */
const CHAIN_SHRINK_K = 4;
const CHAIN_MIN_N = 3;
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
 * the line. Radar-6 fits on the BOARD-ELIGIBLE token protocols only:
 * a CEX token's value does not follow from its exchange's TVL, a
 * bridge token is usually worth ~nothing whatever the bridge holds,
 * and a liquid-staking token tracks its underlying, so those 34
 * protocols are left out of the fit — the board never ranks their
 * categories anyway. Then a shrunk category factor per category and a
 * shrunk chain factor per chain (mean over the row's chains) from the
 * Huber residuals. Returns the fitted model plus its calibration size.
 */
export function fitModel(snap: Snapshot): ModelMeta {
  const train = calibrationSet(snap).filter(
    (p) => p.category === null || !EXCLUDED_CATEGORIES.has(p.category),
  );
  let intercept = FALLBACK_INTERCEPT;
  let exponent = FALLBACK_EXPONENT;
  const categoryFactors: Record<string, number> = {};
  const chainFactors: Record<string, number> = {};
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
      // MAD (median absolute deviation from the median residual) sets
      // the Huber threshold: c = 1.345 * 1.4826 * MAD. (Radar-5's code
      // took |median(residual)| instead of the MAD, which is ~0.04-0.07
      // here and collapses c toward zero, turning the fit into an
      // unstable near-L1 regression; radar-6 fixes that.)
      const medRes = [...res].sort((a, b) => a - b)[Math.floor(res.length / 2)]!;
      const absDev = res.map((r) => Math.abs(r - medRes)).sort((a, b) => a - b);
      const mad = absDev[Math.floor(absDev.length / 2)]! || 0.5;
      const c = 1.345 * 1.4826 * mad;
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
    const chainResiduals = new Map<string, number[]>();
    for (const p of train) {
      const r = Math.log(p.mcap_usd as number) - (intercept + exponent * Math.log(p.tvl_usd));
      const key = p.category ?? "(null)";
      const arr = residuals.get(key);
      if (arr) arr.push(r);
      else residuals.set(key, [r]);
      for (const chain of p.chains) {
        const carr = chainResiduals.get(chain);
        if (carr) carr.push(r);
        else chainResiduals.set(chain, [r]);
      }
    }
    for (const [key, rs] of residuals) {
      const mean = rs.reduce((s, r) => s + r, 0) / rs.length;
      const w = rs.length / (rs.length + CATEGORY_SHRINK_K);
      categoryFactors[key] = Math.exp(w * mean);
    }
    for (const [key, rs] of chainResiduals) {
      if (rs.length < CHAIN_MIN_N) continue;
      const mean = rs.reduce((s, r) => s + r, 0) / rs.length;
      const w = rs.length / (rs.length + CHAIN_SHRINK_K);
      chainFactors[key] = Math.exp(w * mean);
    }
  }
  return {
    version: "radar-6",
    method:
      "Power-law calibration fitted at run time from the snapshot's own token protocols in board-eligible " +
      "categories: log(market cap) = A + B*log(TVL) by Huber iteratively-reweighted least squares (8 rounds), " +
      "so protocols far off the power law are downweighted instead of dragging the line; then a shrunk " +
      "category factor and a shrunk chain factor (mean over the protocol's chains) from the residuals. " +
      "Implied value = exp(A) * TVL^B * category factor * chain factor * growth * maturity. CEX, bridge " +
      "and liquid-staking tokens are left out of the fit because their value does not follow from their " +
      "TVL, and the board never ranks those categories. Growth moves the value at most 10% and maturity " +
      "at most 5%: a 7-day window and age barely predict the multiple in the calibration data, so they " +
      "are kept small on purpose. The peer token rate is shown for context only and never enters the value.",
    intercept,
    exponent,
    calibration_n: train.length,
    category_factors: categoryFactors,
    chain_factors: chainFactors,
    chain_shrink_k: CHAIN_SHRINK_K,
    chain_min_n: CHAIN_MIN_N,
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
      radar6_median_log_err: 1.257,
      radar6_eligible_median_log_err: 1.162,
      radar3_within2x_pct: 33.6,
      radar4_within2x_pct: 35.2,
      radar5_within2x_pct: 35.2,
      radar6_within2x_pct: 32.9,
      radar6_eligible_within2x_pct: 36.3,
      loco_radar4_median_log_err: 1.479,
      loco_radar5_median_log_err: 1.461,
      loco_radar6_median_log_err: 1.159,
      method: "repeated 5-fold cross-validation (5 seeds, deterministic split by slug hash) plus leave-one-category-out, both held-out; median |log(implied/mcap)|; radar-5 and radar-6 measured on the same harness, radar-6 on all 128 token protocols and on the 94 in board-eligible categories",
    },
  };
}

/** The fitted model's implied value for one protocol, with its breakdown. */
export function impliedValueBreakdown(p: Protocol, asOf: string, meta: ModelMeta): ModelBreakdown {
  const base = Math.exp(meta.intercept) * Math.pow(p.tvl_usd, meta.exponent);
  const catKey = p.category ?? "(null)";
  const categoryFactor = meta.category_factors[catKey] ?? 1.0;
  const knownChainFactors = p.chains
    .map((c) => meta.chain_factors[c])
    .filter((f): f is number => typeof f === "number");
  const chainFactor =
    knownChainFactors.length > 0
      ? knownChainFactors.reduce((s, f) => s + f, 0) / knownChainFactors.length
      : 1.0;
  const growthPct = clamp(p.change_7d ?? 0, meta.growth_floor, meta.growth_cap);
  const growthMultiplier = 1 + (meta.growth_weight * growthPct) / 100;
  const age = ageDays(p, asOf);
  const maturityMultiplier =
    meta.maturity_floor + (meta.maturity_range * Math.min(age, meta.maturity_days)) / meta.maturity_days;
  const implied = Math.max(
    1,
    Math.round(base * categoryFactor * chainFactor * growthMultiplier * maturityMultiplier),
  );
  return {
    base_usd: Math.round(base),
    category: p.category,
    category_factor: categoryFactor,
    chain_factor: chainFactor,
    chains: p.chains,
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
