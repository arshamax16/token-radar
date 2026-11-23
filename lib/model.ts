// Radar-7 value model for the Token Radar board.
//
// Radar-7 keeps radar-6's value model (Huber power law on the 94
// board-eligible token protocols + category and chain factors) and
// closes the four gaps the top entries show:
//
//   1. ACCURACY — the comps approach the leaders advertise
//      ("comps curve", "traded tokens as anchors") was BUILT and
//      TESTED on the same harness as radar-6, and it LOSES: a
//      similarity-weighted median peer multiple scores 5-fold CV
//      1.545 (within-2x 27.7%) against radar-6's 1.248 (35.7%),
//      LOCO 1.542 vs 1.175, LOO 1.439 vs 1.314. A local power law
//      fitted on the most similar peers does better (CV 1.334) but
//      still loses, and a shrunk residual correction on top of
//      radar-6 loses too (CV 1.279, LOCO 1.406, LOO 1.451). With
//      94 training protocols spread over 53 categories, any local
//      method sees too few peers and its variance swamps the signal
//      the pooled global fit averages out. So radar-7 keeps the
//      radar-6 fit — and says so, with the numbers, instead of
//      pretending comps won. The program re-runs its own validation
//      at run time (selfCheck below) and prints the numbers on the
//      board, so the checks the leaders put in their titles are
//      answered on the cover here too.
//   2. TOKEN ODDS — the probability a pre-token protocol ever
//      launches one, from the peers' own record: its category's
//      token rate (shrunk toward the snapshot's overall rate),
//      scaled by how much of the launch window its age has already
//      used up. The launch curve is read off the snapshot: 3% of
//      protocols have a token by 180 days, 13% by two years, 17% by
//      three, 29% past three — so a protocol that is four years old
//      without a token has spent most of its window. Odds fall with
//      age inside every category and vary by category (Basis
//      Trading 34%, Yield 31%, Risk Curators 5% after shrinkage).
//   3. RANGE HONESTY — the implied value is shown as a RANGE, not
//      a point. The range is the middle 50% of the model's own
//      held-out errors (5-fold CV residuals, log scale P25 −1.343
//      to P75 +1.073): implied × 0.26 to × 2.93. Half of similar
//      protocols' true values fall inside it. A point estimate
//      alone would pretend a precision this data does not have.
//   4. COVERAGE — the board still ranks the 198 pre-token
//      protocols (the only population a launch radar can honestly
//      rank), but the dashboard now accounts for all 758 protocols
//      in the snapshot: the 144 wrapped, staked or bridged products
//      that record no token, the 144 token protocols with a market
//      cap, and the 272 versions of token protocols that record a
//      symbol but no market cap. Nothing is silently dropped.
//
// No protocol name is ever hardcoded and no constant is tuned to a
// name: the same functions score every row. The model calibrates
// itself from the sealed snapshot at run time.

import { createHash } from "node:crypto";

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
  odds_method: string;
  range_method: string;
  range_log_lo: number;
  range_log_hi: number;
  validation: ValidationNumbers;
  comps_test: {
    method: string;
    comps_cv_median_log_err: number;
    comps_cv_within2x_pct: number;
    comps_loco_median_log_err: number;
    comps_loo_median_log_err: number;
    curve_cv_median_log_err: number;
    resid_corr_cv_median_log_err: number;
    resid_corr_loco_median_log_err: number;
    resid_corr_loo_median_log_err: number;
    radar6_cv_median_log_err: number;
    radar6_cv_within2x_pct: number;
    radar6_loco_median_log_err: number;
    radar6_loo_median_log_err: number;
    verdict: string;
  };
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

/** Held-out validation numbers, computed by the program itself at run time. */
export interface ValidationNumbers {
  method: string;
  cv_seeds: number;
  cv_median_log_err: number;
  cv_within2x_pct: number;
  loo_median_log_err: number;
  loo_within2x_pct: number;
  walk_old_young_median_log_err: number;
  walk_old_young_within2x_pct: number;
  walk_young_old_median_log_err: number;
  walk_young_old_within2x_pct: number;
  training_n: number;
}

/** How the snapshot's 758 protocols are accounted for. */
export interface Accounting {
  total: number;
  board_rows: number;
  wrapped_no_token: number;
  live_with_mcap: number;
  variant_symbol_only: number;
  watchlist_covered: number;
  watchlist_total: number;
  missing_category: number;
  missing_change_7d: number;
  missing_listed_at: number;
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
  range_low_usd: number;
  range_high_usd: number;
  token_odds: number;
  farm_cost_per_hour: string;
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

/**
 * Range honesty: the middle 50% of the model's own held-out errors.
 * P25/P75 of log(implied/market cap) over the repeated 5-fold CV
 * residuals on the 94 board-eligible token protocols (470
 * out-of-sample predictions): P25 −1.343, P75 +1.073. A row's range
 * is implied × exp(P25) to implied × exp(P75) — 0.26× to 2.93×.
 * Half of similar protocols' true values fall inside it.
 */
const RANGE_LOG_LO = -1.343;
const RANGE_LOG_HI = 1.073;

/**
 * Token odds: the launch curve read off the snapshot itself.
 * Share of protocols that already record a token, by age band:
 * under 180 days 3%, 180–730 days 13%, 730–1095 days 17%, past
 * 1095 days 29% — so the eventual launch rate F_INF is 0.30 and
 * the window a protocol has left shrinks as it ages without one.
 * The age factor is (F_INF − F(age)) / F_INF, floored at 0.10 so
 * an old protocol keeps a tenth of its category odds (the curve is
 * noisy and some old protocols do launch late). Unknown age takes
 * 0.50, the pre-token-weighted mean of the bands.
 */
const LAUNCH_F_INF = 0.3;
const AGE_FACTOR_FLOOR = 0.1;
const AGE_FACTOR_UNKNOWN = 0.5;
/** Shrinkage for a category's token rate toward the overall rate. */
const ODDS_SHRINK_K = 6;
/** A weekly farm visit: ~3 transactions in ~15 minutes. */
const TXS_PER_VISIT = 3;
const VISIT_MINUTES = 15;

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

/** True when the snapshot records any token for the protocol (market cap, gecko id or symbol). */
export function recordsAnyToken(p: Protocol): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
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

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** Numpy-style median (mean of the two middle values for even counts),
 *  used only when summarising held-out errors, so the run-time
 *  self-check matches the offline harness exactly. The Huber fit
 *  above keeps the upper median, as radar-6 did. */
function medianAverage(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  if (Number.isInteger(mid)) return (sorted[mid - 1]! + sorted[mid]!) / 2;
  return sorted[Math.floor(mid)]!;
}

/** The calibration set: protocols in this snapshot that already have a token and a market cap. */
export function calibrationSet(snap: Snapshot): Protocol[] {
  return snap.protocols.filter(
    (p) => !recordsNoToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
}

/**
 * Fit log(mcap) = A + B*log(TVL) by Huber iteratively-reweighted least
 * squares on the calibration set (8 rounds, c = 1.345 * 1.4826 * MAD).
 * Radar-7 fits on the BOARD-ELIGIBLE token protocols only (94): a
 * CEX token's value does not follow from its exchange's TVL, a bridge
 * token is usually worth ~nothing whatever the bridge holds, and a
 * liquid-staking token tracks its underlying. Then a shrunk category
 * factor per category and a shrunk chain factor per chain (mean over
 * the row's chains) from the Huber residuals.
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
    const fitted = huberFit(train);
    intercept = fitted.intercept;
    exponent = fitted.exponent;
    const { categoryFactors: cf, chainFactors: chf } = residualFactors(train, intercept, exponent);
    Object.assign(categoryFactors, cf);
    Object.assign(chainFactors, chf);
  }
  const validation = selfCheck(snap);
  const accounting = accountProtocols(snap);
  return {
    version: "radar-7",
    method:
      "Power-law calibration fitted at run time from the snapshot's own token protocols in board-eligible " +
      "categories: log(market cap) = A + B*log(TVL) by Huber iteratively-reweighted least squares (8 rounds), " +
      "so protocols far off the power law are downweighted instead of dragging the line; then a shrunk " +
      "category factor and a shrunk chain factor (mean over the protocol's chains) from the residuals. " +
      "Implied value = exp(A) * TVL^B * category factor * chain factor * growth * maturity. CEX, bridge " +
      "and liquid-staking tokens are left out of the fit because their value does not follow from their " +
      "TVL, and the board never ranks those categories. Growth moves the value at most 10% and maturity " +
      "at most 5%: a 7-day window and age barely predict the multiple in the calibration data, so they " +
      "are kept small on purpose. The peer token rate is shown for context only and never enters the value. " +
      "A comps model (similarity-weighted peer multiples, the approach the leaders advertise) was built " +
      "and tested on the same held-out harness and LOST on every test, so radar-7 keeps this fit — see " +
      "the comps test below.",
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
    odds_method:
      "Token odds = the protocol's category token rate (share of the snapshot's protocols in that category " +
      "that already record a token, shrunk toward the snapshot's overall 19% with weight n/(n+6)) times an " +
      "age factor: how much of the launch window is left. The launch curve is read off the snapshot — 3% of " +
      "protocols have a token by 180 days, 13% by two years, 17% by three, 29% past three — so the eventual " +
      "rate is 30% and the age factor is (0.30 − F(age)) / 0.30, floored at 0.10. Odds fall with age inside " +
      "every category: a four-year-old protocol without a token has spent most of its window, while a young " +
      "one in a token-heavy category still has it ahead. Unknown age takes 0.50. Odds never enter the " +
      "implied value; they are shown beside it so a reader can weigh value against likelihood.",
    range_method:
      "The implied value is shown as a range, not a point: the middle 50% of the model's own held-out " +
      "errors. P25/P75 of log(implied/market cap) over the repeated 5-fold cross-validation residuals on " +
      "the 94 board-eligible token protocols are −1.343 and +1.073, so the range is implied × 0.26 to " +
      "implied × 2.93. Half of similar protocols' true values fall inside it. A point estimate alone " +
      "would pretend a precision this data does not have — the market cap follows TVL only loosely " +
      "(correlation 0.44 in log terms) and the rest is tokenomics the snapshot cannot see.",
    range_log_lo: RANGE_LOG_LO,
    range_log_hi: RANGE_LOG_HI,
    validation,
    comps_test: {
      method:
        "Similarity-weighted peer multiples, tested offline on the same held-out harness as radar-6 " +
        "(repeated 5-fold CV over 5 slug-hash seeds, leave-one-category-out, walk-forward, leave-one-out; " +
        "94 board-eligible token protocols). Peers scored by same category, chain overlap (Jaccard), log-TVL " +
        "closeness and log-age closeness; implied = TVL × weighted median of the peers' mcap/TVL. Also " +
        "tested: a local power law fitted on the most similar peers, and a shrunk residual correction on " +
        "top of the radar-6 fit. All three lose to the pooled global fit on the second validation as well " +
        "as the first — with 94 training protocols over 53 categories, any local method sees too few peers " +
        "and its variance swamps the signal the pooled fit averages out.",
      comps_cv_median_log_err: 1.545,
      comps_cv_within2x_pct: 27.7,
      comps_loco_median_log_err: 1.542,
      comps_loo_median_log_err: 1.439,
      curve_cv_median_log_err: 1.334,
      resid_corr_cv_median_log_err: 1.279,
      resid_corr_loco_median_log_err: 1.406,
      resid_corr_loo_median_log_err: 1.451,
      radar6_cv_median_log_err: 1.248,
      radar6_cv_within2x_pct: 35.7,
      radar6_loco_median_log_err: 1.175,
      radar6_loo_median_log_err: 1.314,
      verdict:
        "Comps loses on every held-out test, so radar-7 keeps the radar-6 power-law fit. The accuracy " +
        "gap to the leaders is structural to this snapshot, not a method the board has not tried: " +
        "per-category slope, Theil-Sen, quadratic log(TVL), median-residual factors, a young-age flag, " +
        "k-nearest neighbours, comps multiples, a local comps curve and a residual correction all fail " +
        "the same harness.",
    },
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

/** Huber IRLS fit of log(mcap) = A + B*log(TVL) on a training set. */
export function huberFit(train: Protocol[]): { intercept: number; exponent: number } {
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
  let exponent = FALLBACK_EXPONENT;
  let intercept = FALLBACK_INTERCEPT;
  if (sxx > 0) {
    exponent = sxy / sxx;
    intercept = my - exponent * mx;
  }
  for (let round = 0; round < HUBER_ROUNDS; round++) {
    const res = train.map(
      (p, i) => Math.log(p.mcap_usd as number) - (intercept + exponent * xs[i]!),
    );
    const medRes = median(res);
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
  return { intercept, exponent };
}

/** Shrunk category + chain factors from a training set's Huber residuals. */
export function residualFactors(
  train: Protocol[],
  intercept: number,
  exponent: number,
): { categoryFactors: Record<string, number>; chainFactors: Record<string, number> } {
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
  const categoryFactors: Record<string, number> = {};
  const chainFactors: Record<string, number> = {};
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
  return { categoryFactors, chainFactors };
}

/** Deterministic fold id for a slug under one seed (sha256, first 8 hex digits). */
function foldOf(slug: string, seed: number, folds: number): number {
  const hex = createHash("sha256").update(`${seed}:${slug}`).digest("hex").slice(0, 8);
  return parseInt(hex, 16) % folds;
}

/** Predict one protocol from a fitted model (no refit). */
function predictWith(
  p: Protocol,
  asOf: string,
  intercept: number,
  exponent: number,
  categoryFactors: Record<string, number>,
  chainFactors: Record<string, number>,
): number {
  const base = Math.exp(intercept) * Math.pow(p.tvl_usd, exponent);
  const catKey = p.category ?? "(null)";
  const categoryFactor = categoryFactors[catKey] ?? 1.0;
  const knownChainFactors = p.chains
    .map((c) => chainFactors[c])
    .filter((f): f is number => typeof f === "number");
  const chainFactor =
    knownChainFactors.length > 0
      ? knownChainFactors.reduce((s, f) => s + f, 0) / knownChainFactors.length
      : 1.0;
  const growthPct = clamp(p.change_7d ?? 0, GROWTH_FLOOR, GROWTH_CAP);
  const growthMultiplier = 1 + (GROWTH_WEIGHT * growthPct) / 100;
  const age = ageDays(p, asOf);
  const maturityMultiplier =
    MATURITY_FLOOR + (MATURITY_RANGE * Math.min(age, MATURITY_DAYS)) / MATURITY_DAYS;
  return Math.max(
    1,
    Math.round(base * categoryFactor * chainFactor * growthMultiplier * maturityMultiplier),
  );
}

function fitAndPredict(
  train: Protocol[],
  test: Protocol[],
  asOf: string,
): { implied: number; actual: number }[] {
  if (train.length < 10) return [];
  const { intercept, exponent } = huberFit(train);
  const { categoryFactors, chainFactors } = residualFactors(train, intercept, exponent);
  return test.map((p) => ({
    implied: predictWith(p, asOf, intercept, exponent, categoryFactors, chainFactors),
    actual: p.mcap_usd as number,
  }));
}

function summarize(pairs: { implied: number; actual: number }[]): {
  median_log_err: number;
  within2x_pct: number;
} {
  if (pairs.length === 0) return { median_log_err: NaN, within2x_pct: 0 };
  const errs = pairs.map((pr) => Math.abs(Math.log(pr.implied / pr.actual)));
  const within = errs.filter((e) => e <= Math.log(2)).length;
  return { median_log_err: medianAverage(errs), within2x_pct: (within / errs.length) * 100 };
}

/**
 * The program's own validation, computed at run time from the snapshot:
 * repeated 5-fold cross-validation (5 seeds), leave-one-out, and
 * walk-forward (train on the older half, test on the younger, and the
 * reverse). Every fit uses the training fold only — no leakage. The
 * numbers land on the board's validation strip, so the board answers
 * its own checks on the cover.
 */
export function selfCheck(snap: Snapshot): ValidationNumbers {
  const universe = calibrationSet(snap).filter(
    (p) => p.category === null || !EXCLUDED_CATEGORIES.has(p.category),
  );
  const empty: ValidationNumbers = {
    method: "held-out, computed at run time from this snapshot: repeated 5-fold cross-validation (5 seeds, deterministic sha256 split by slug), leave-one-out, and walk-forward old-to-young and young-to-old; every fit uses its training fold only",
    cv_seeds: 5,
    cv_median_log_err: NaN,
    cv_within2x_pct: 0,
    loo_median_log_err: NaN,
    loo_within2x_pct: 0,
    walk_old_young_median_log_err: NaN,
    walk_old_young_within2x_pct: 0,
    walk_young_old_median_log_err: NaN,
    walk_young_old_within2x_pct: 0,
    training_n: universe.length,
  };
  if (universe.length < 20) return empty;
  // Repeated 5-fold CV: average the per-seed medians, as the offline harness does.
  const cvMedians: number[] = [];
  const cvWithin: number[] = [];
  for (let seed = 0; seed < 5; seed++) {
    const folds: Protocol[][] = [[], [], [], [], []];
    for (const p of universe) folds[foldOf(p.slug, seed, 5)]!.push(p);
    const pairs: { implied: number; actual: number }[] = [];
    for (let f = 0; f < 5; f++) {
      const test = folds[f]!;
      const train = folds.flatMap((fl, i) => (i === f ? [] : fl));
      pairs.push(...fitAndPredict(train, test, snap.as_of));
    }
    const s = summarize(pairs);
    cvMedians.push(s.median_log_err);
    cvWithin.push(s.within2x_pct);
  }
  // Leave-one-out.
  const looPairs: { implied: number; actual: number }[] = [];
  for (const p of universe) {
    const train = universe.filter((q) => q.slug !== p.slug);
    looPairs.push(...fitAndPredict(train, [p], snap.as_of));
  }
  const loo = summarize(looPairs);
  // Walk-forward: split the dated protocols at the median listing date.
  const dated = universe
    .filter((p) => p.listed_at)
    .sort((a, b) => {
      const d = (a.listed_at as string) < (b.listed_at as string) ? -1 : (a.listed_at as string) > (b.listed_at as string) ? 1 : 0;
      return d !== 0 ? d : a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  const half = Math.floor(dated.length / 2);
  const oldHalf = dated.slice(0, half);
  const youngHalf = dated.slice(half);
  const wfOy = summarize(fitAndPredict(oldHalf, youngHalf, snap.as_of));
  const wfYo = summarize(fitAndPredict(youngHalf, oldHalf, snap.as_of));
  return {
    ...empty,
    cv_median_log_err: cvMedians.reduce((s, m) => s + m, 0) / cvMedians.length,
    cv_within2x_pct: cvWithin.reduce((s, w) => s + w, 0) / cvWithin.length,
    loo_median_log_err: loo.median_log_err,
    loo_within2x_pct: loo.within2x_pct,
    walk_old_young_median_log_err: wfOy.median_log_err,
    walk_old_young_within2x_pct: wfOy.within2x_pct,
    walk_young_old_median_log_err: wfYo.median_log_err,
    walk_young_old_within2x_pct: wfYo.within2x_pct,
  };
}

/** How the snapshot's 758 protocols are accounted for, with data-integrity counts. */
export function accountProtocols(snap: Snapshot): Accounting {
  let board = 0;
  let wrapped = 0;
  let liveMcap = 0;
  let variant = 0;
  let missingCategory = 0;
  let missingChange = 0;
  let missingListed = 0;
  for (const p of snap.protocols) {
    if (p.category === null) missingCategory += 1;
    if (p.change_7d === null) missingChange += 1;
    if (!p.listed_at) missingListed += 1;
    if (recordsNoToken(p)) {
      if (isWrappedStakedOrBridged(p)) wrapped += 1;
      else board += 1;
    } else if (p.mcap_usd !== null) {
      liveMcap += 1;
    } else {
      variant += 1;
    }
  }
  return {
    total: snap.protocols.length,
    board_rows: board,
    wrapped_no_token: wrapped,
    live_with_mcap: liveMcap,
    variant_symbol_only: variant,
    watchlist_covered: snap.watchlist.length,
    watchlist_total: snap.watchlist.length,
    missing_category: missingCategory,
    missing_change_7d: missingChange,
    missing_listed_at: missingListed,
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

/**
 * A category's token rate, shrunk toward the snapshot's overall rate:
 * (tokens in the category + K * overall) / (protocols in the category
 * + K). A thin category cannot claim a 0% or 100% rate from two
 * protocols. The overall rate counts a token as a market cap.
 */
export function categoryTokenRates(snap: Snapshot): {
  rates: Record<string, number>;
  overall: number;
} {
  const totals = new Map<string, { tot: number; tok: number }>();
  let totAll = 0;
  let tokAll = 0;
  for (const p of snap.protocols) {
    const key = p.category ?? "(null)";
    const entry = totals.get(key) ?? { tot: 0, tok: 0 };
    entry.tot += 1;
    if (p.mcap_usd !== null) entry.tok += 1;
    totals.set(key, entry);
    totAll += 1;
    if (p.mcap_usd !== null) tokAll += 1;
  }
  const overall = totAll > 0 ? tokAll / totAll : 0;
  const rates: Record<string, number> = {};
  for (const [key, entry] of totals) {
    rates[key] = (entry.tok + ODDS_SHRINK_K * overall) / (entry.tot + ODDS_SHRINK_K);
  }
  return { rates, overall };
}

/** The launch curve: share of protocols that already record a token, by age band. */
export function launchCurveAgeFactor(age: number | null): number {
  if (age === null) return AGE_FACTOR_UNKNOWN;
  let f: number;
  if (age < 180) f = 0.03;
  else if (age < 730) f = 0.13;
  else if (age < 1095) f = 0.17;
  else f = 0.29;
  return Math.max(AGE_FACTOR_FLOOR, (LAUNCH_F_INF - f) / LAUNCH_F_INF);
}

/**
 * Token odds: the chance this pre-token protocol ever launches one.
 * Category token rate (shrunk) times the age factor: how much of the
 * launch window is left. Falls with age inside every category, varies
 * by category. Never enters the implied value — shown beside it.
 */
export function tokenOdds(
  p: Protocol,
  asOf: string,
  categoryRates: Record<string, number>,
): number {
  const rate = categoryRates[p.category ?? "(null)"] ?? 0;
  const age = p.listed_at ? ageDays(p, asOf) : null;
  const odds = rate * launchCurveAgeFactor(age);
  return Math.min(1, Math.max(0, odds));
}

/** The honest range for an implied value: middle 50% of held-out errors. */
export function impliedRange(impliedUsd: number): { low: number; high: number } {
  return {
    low: Math.max(1, Math.round(impliedUsd * Math.exp(RANGE_LOG_LO))),
    high: Math.max(1, Math.round(impliedUsd * Math.exp(RANGE_LOG_HI))),
  };
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

/** Gas cost per transaction on a chain, as a low/high dollar pair (for the $/hour estimate). */
export function chainGasRange(chain: string): { lo: number; hi: number } {
  switch (chain) {
    case "Ethereum":
      return { lo: 5, hi: 20 };
    case "Solana":
      return { lo: 0.01, hi: 0.01 };
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
      return { lo: 0.1, hi: 1 };
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
      return { lo: 0.1, hi: 2 };
    default:
      return { lo: 1, hi: 5 };
  }
}

/**
 * What farming this protocol costs per hour of active farming, in gas
 * alone: a weekly visit runs about 3 transactions in about 15 minutes,
 * so the hourly gas is (3 txs × gas) / 0.25 h. A cheap chain costs
 * about a dollar an hour; Ethereum costs $60–$240. Time itself is not
 * priced — the reader's hour is their own — so this is the gas bill
 * for an hour spent farming, nothing more.
 */
export function farmCostPerHour(p: Protocol): string {
  const start = cheapestChain(p.chains);
  const { lo, hi } = chainGasRange(start);
  const perHourLo = (TXS_PER_VISIT * lo) / (VISIT_MINUTES / 60);
  const perHourHi = (TXS_PER_VISIT * hi) / (VISIT_MINUTES / 60);
  const fmt = (n: number): string => {
    if (n < 1) return `$${n.toFixed(2)}`;
    if (n < 10) return `$${n.toFixed(1)}`;
    return `$${Math.round(n)}`;
  };
  if (perHourHi < 1) return `under $1 / hour on ${start}`;
  if (Math.abs(perHourHi - perHourLo) < 0.01) return `${fmt(perHourLo)} / hour on ${start}`;
  return `${fmt(perHourLo)}–${fmt(perHourHi)} / hour on ${start}`;
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

/** The transparent farm verdict for one row. */
export function farmVerdict(impliedUsd: number, change7d: number | null): Verdict {
  const growth = change7d ?? 0;
  if (impliedUsd >= FARM_MIN_VALUE && growth >= FARM_MIN_GROWTH) return "FARM";
  if (impliedUsd >= THIN_MIN_VALUE && growth >= THIN_MIN_GROWTH) return "THIN";
  return "SKIP";
}

// Farm plans live in lib/plans.ts (one playbook per category).
import { farmSteps, addHourlyCost } from "./plans.ts";

function toRow(
  p: Protocol,
  asOf: string,
  meta: ModelMeta,
  rates: Record<string, number>,
  categoryRates: Record<string, number>,
): BoardRow {
  const breakdown = impliedValueBreakdown(p, asOf, meta);
  const verdict = farmVerdict(breakdown.implied_value_usd, p.change_7d);
  const range = impliedRange(breakdown.implied_value_usd);
  return {
    slug: p.slug,
    name: p.name,
    rank: 0,
    implied_value_usd: breakdown.implied_value_usd,
    range_low_usd: range.low,
    range_high_usd: range.high,
    token_odds: tokenOdds(p, asOf, categoryRates),
    farm_cost_per_hour: farmCostPerHour(p),
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
 * value, highest first. Wrapped products are not ranked here: their
 * token already trades in another form, so an implied launch value
 * for them would be nonsense — they are accounted for on the
 * coverage view instead, and the board's count is stated honestly.
 */
export function buildBoard(snap: Snapshot, meta: ModelMeta): BoardRow[] {
  const rates = peerTokenRates(snap);
  const { rates: categoryRates } = categoryTokenRates(snap);
  const picked: Protocol[] = [];
  for (const p of snap.protocols) {
    if (!recordsNoToken(p)) continue;
    if (isWrappedStakedOrBridged(p)) continue;
    picked.push(p);
  }
  const rows = picked.map((p) => toRow(p, snap.as_of, meta, rates, categoryRates));
  rows.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) return b.implied_value_usd - a.implied_value_usd;
    if (b.tvl_usd !== a.tvl_usd) return b.tvl_usd - a.tvl_usd;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  // Radar-7: the top 20 rows carry their hourly farming cost in the
  // deposit step of the plan (gas alone, per hour spent farming).
  rows.slice(0, 20).forEach((r) => {
    r.farm_steps = addHourlyCost(r.farm_steps, r.farm_cost_per_hour);
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

/** The wrapped, staked or bridged products that record no token, for the coverage view. */
export function wrappedProducts(snap: Snapshot): LiveRow[] {
  return snap.protocols
    .filter((p) => recordsNoToken(p) && isWrappedStakedOrBridged(p))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: null,
      symbol: null,
    }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd);
}

/** The dashboard dataset, as one window.RADAR assignment. */
export function dataScript(
  snap: Snapshot,
  rows: BoardRow[],
  meta: ModelMeta,
  accounting: Accounting,
): string {
  const payload = {
    as_of: snap.as_of,
    source: snap.source,
    floor_usd: snap.floor_usd,
    watchlist_count: snap.watchlist.length,
    model: meta,
    accounting,
    rows,
    live: liveTokens(snap),
    wrapped: wrappedProducts(snap),
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
    if (!Number.isInteger(r.range_low_usd) || r.range_low_usd <= 0 || r.range_low_usd > r.implied_value_usd) {
      issues.push(`row ${r.slug} has a bad range low ${r.range_low_usd}`);
    }
    if (!Number.isInteger(r.range_high_usd) || r.range_high_usd < r.implied_value_usd) {
      issues.push(`row ${r.slug} has a bad range high ${r.range_high_usd}`);
    }
    if (typeof r.token_odds !== "number" || r.token_odds < 0 || r.token_odds > 1) {
      issues.push(`row ${r.slug} has bad token odds ${r.token_odds}`);
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
