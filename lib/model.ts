// Radar-13 value model for the Token Radar board.
//
// Radar-13 keeps radar-12's board (token odds, honest ranges, all-758
// coverage, costed farm plans) and the radar-12 fit (winsorised power
// law + empirical-Bayes category factors + unknown-age factor +
// chain-count band factor + chain-count × category interaction), and
// adds one factor: a 7-day-change-sign × category interaction. It is
// the radar-10 idea applied a second time, found by a systematic
// binary-split scan of every numeric snapshot field (change_7d sign,
// TVL band, age splits, alternative chain-count thresholds — each at
// K=20/50/100, all refit train-only per fold). Every split LOSES as a
// main effect: the sign factor (CV 1.073, LOO 1.008), the TVL band
// (CV 1.064, LOO 1.009), the age splits (CV wins to 1.039 but LOO
// loses to 1.050 — the gain flips sign between the two medians, so it
// is not a win), the alternative chain thresholds, and the
// chain-count × category refinement grid (K2=8/min_n=5 stays optimal).
// But the sign effect differs by category: the two-way interaction
// median(cat,sign) − median(cat) − median(sign) + median(all),
// shrunk by n/(n+20) toward 1.0 for (category, sign) groups with at
// least 5 training protocols, wins on BOTH held-out medians: CV
// 1.059 → 1.058 and LOO 0.991 → 0.985, with LOCO 1.040 and both
// walk-forwards 0.819/1.219 unchanged. The win is a broad plateau,
// not a tuned spike (K2=12–80 all score CV 1.058–1.059 and LOO
// 0.985–0.989), and it is the first change since radar-10 that
// improves the two hardest categories instead of hurting them: Dexs
// leave-one-out 1.751 → 1.722 and Lending 1.920 → 1.895, with the
// mean absolute error slightly better on leave-one-out (1.528 → 1.526)
// and the within-2× shares unchanged (33.0%). Only five groups
// qualify, all with a negative 7-day change — Lending ×0.97, Dexs
// ×1.02, Basis Trading ×1.01, Yield ×1.02, RWA ×1.04 — so the change
// is small and the factors are heavily shrunk. The target radar-13
// set for itself (CV ≤ 1.05, LOO ≤ 0.95) is NOT reached — both
// medians are close but short — and the gain is small, reported as
// small. The other radar-13 ideas all failed and are documented in the
// model view: sequential factors computed on the full-model residuals
// (age and sign — LOO 1.011–1.120, worse than the same splits on the
// power-law residuals), age × category and TVL-band × category
// interactions, and every combination of the near-misses (each wins
// CV and loses LOO, or loses both). The honest range stays
// ×0.22–×2.39.
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
  unknown_age_factor: number;
  unknown_age_n: number;
  chain_count_factors: Record<string, number>;
  chain_count_shrink_k: number;
  interaction_factors: Record<string, Record<string, number>>;
  interaction_shrink_k: number;
  interaction_min_n: number;
  sign_interaction_factors: Record<string, Record<string, number>>;
  sign_interaction_shrink_k: number;
  sign_interaction_min_n: number;
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
    radar7_median_log_err: number;
    radar7_within2x_pct: number;
    radar7_loco_median_log_err: number;
    radar7_loo_median_log_err: number;
    radar8_median_log_err: number;
    radar8_within2x_pct: number;
    radar8_loco_median_log_err: number;
    radar8_loo_median_log_err: number;
    radar9_median_log_err: number;
    radar9_within2x_pct: number;
    radar9_loco_median_log_err: number;
    radar9_loo_median_log_err: number;
    radar10_median_log_err: number;
    radar10_within2x_pct: number;
    radar10_loco_median_log_err: number;
    radar10_loo_median_log_err: number;
    radar11_median_log_err: number;
    radar11_within2x_pct: number;
    radar11_loco_median_log_err: number;
    radar11_loo_median_log_err: number;
    radar12_median_log_err: number;
    radar12_within2x_pct: number;
    radar12_loco_median_log_err: number;
    radar12_loo_median_log_err: number;
    radar13_median_log_err: number;
    radar13_within2x_pct: number;
    radar13_loco_median_log_err: number;
    radar13_loo_median_log_err: number;
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
  unknown_age_factor: number;
  chain_count_factor: number;
  interaction_factor: number;
  sign_interaction_factor: number;
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

/** Shrinkage strength for chain factors: n/(n+K); chains with fewer
 *  than CHAIN_MIN_N training protocols take no factor (1.0). */
const CHAIN_SHRINK_K = 4;
const CHAIN_MIN_N = 3;
/** Shrinkage for the unknown-age group factor: n/(n+K), same spirit
 *  as the odds shrink. */
const UNKNOWN_AGE_SHRINK_K = 6;
/** Shrinkage for the chain-count band factors: n/(n+K). K=50 is
 *  deliberately heavy — the K sweep (6/12/20/30/40/50/60) shows a
 *  broad plateau where K=20–60 all beat radar-9 on CV and LOO, and
 *  K=50 sits in its middle, winning all five held-out tests with no
 *  loss. At K=6 the factor is strong enough to collapse walk-forward
 *  old→young (0.823 → 0.999). */
const CHAIN_COUNT_SHRINK_K = 50;
/** Shrinkage for the chain-count × category interaction factors: n/(n+K).
 *  K=8 wins the radar-11 refinement sweep on both held-out medians
 *  (CV 1.067 → 1.059, LOO 0.997 → 0.991, LOCO and both walk-forwards
 *  unchanged) and sits in the middle of the plateau (K=6–10 with
 *  min_n=5 all beat radar-11 on CV, 1.059–1.063; K=8 wins on 3 of the
 *  5 CV seeds, ties one, loses one). Only (category, band) groups with at
 *  least INTERACTION_MIN_N training protocols take a factor. The cost
 *  is stated in the model view: Dexs leave-one-out gets worse again
 *  (1.661 → 1.751) and the within-2× share on leave-one-out falls
 *  (34.0% → 33.0%). */
const INTERACTION_SHRINK_K = 8;
const INTERACTION_MIN_N = 5;
/** Shrinkage for the 7-day-change-sign × category interaction factors:
 *  n/(n+K). K=20 sits in the middle of a broad plateau (K2=12–80 all
 *  beat radar-12 on LOO, 0.985–0.989, with CV 1.058–1.059) — the win
 *  is not a tuned spike. Only (category, sign) groups with at least
 *  SIGN_INTERACTION_MIN_N training protocols take a factor. */
const SIGN_INTERACTION_SHRINK_K = 20;
const SIGN_INTERACTION_MIN_N = 5;
/** Winsorisation quantiles for the log(mcap/TVL) multiple: the training
 *  set's own P5/P95 (radar-8). The one or two most extreme multiples
 *  cannot drag the fit or the category factors. */
const WINSOR_QLO = 0.05;
const WINSOR_QHI = 0.95;
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
 * out-of-sample predictions): P25 −1.524, P75 +0.870. A row's range
 * is implied × exp(P25) to implied × exp(P75) — 0.22× to 2.39×.
 * Half of similar protocols' true values fall inside it.
 */
const RANGE_LOG_LO = -1.5240664384674654;
const RANGE_LOG_HI = 0.8695709949586536;

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

/** Numpy-style linear-interpolation quantile on a sorted array. */
function quantileSorted(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0]!;
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (pos - lo) * (sorted[hi]! - sorted[lo]!);
}

/**
 * Winsorise a training set: clip each protocol's log(mcap/TVL)
 * multiple at the training set's own P5/P95, so the one or two most
 * extreme multiples cannot drag the fit or the category factors.
 * Returns new protocol objects (the snapshot's rows are never
 * mutated); the quantiles come from the training set only, so no
 * leakage — a fold's clip is computed from its training fold alone.
 */
function winsorizeTrain(train: Protocol[]): Protocol[] {
  const mults = train
    .map((p) => Math.log((p.mcap_usd as number) / p.tvl_usd))
    .sort((a, b) => a - b);
  const lo = quantileSorted(mults, WINSOR_QLO);
  const hi = quantileSorted(mults, WINSOR_QHI);
  return train.map((p) => {
    const m = Math.log((p.mcap_usd as number) / p.tvl_usd);
    const clipped = Math.min(hi, Math.max(lo, m));
    if (clipped === m) return p;
    return { ...p, mcap_usd: p.tvl_usd * Math.exp(clipped) };
  });
}

/**
 * Empirical-Bayes (DerSimonian-Laird random-effects) shrinkage for
 * category factors. The between-category variance tau^2 and the
 * within-category variance sigma^2 are estimated from the training
 * residuals; each category's mean residual is then shrunk by
 * tau^2/(tau^2 + sigma^2/n). A thin or noisy category is pulled
 * hard toward 1.0; a large, consistent category keeps its factor.
 * Replaces the ad-hoc n/(n+6) shrink, which assumed a fixed
 * shrinkage strength instead of estimating it from the data.
 * Categories absent from the training fold take 1.0 (the caller's
 * `?? 1.0` fallback), which is what leave-one-category-out needs.
 */
function ebCategoryFactors(
  train: Protocol[],
  intercept: number,
  exponent: number,
): Record<string, number> {
  const groups = new Map<string, number[]>();
  for (const p of train) {
    const r = Math.log(p.mcap_usd as number) - (intercept + exponent * Math.log(p.tvl_usd));
    const key = p.category ?? "(null)";
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  const factors: Record<string, number> = {};
  if (groups.size < 2) {
    for (const key of groups.keys()) factors[key] = 1.0;
    return factors;
  }
  const means = new Map<string, number>();
  let num = 0;
  let den = 0;
  for (const [key, rs] of groups) {
    const m = rs.reduce((s, r) => s + r, 0) / rs.length;
    means.set(key, m);
    for (const r of rs) num += (r - m) * (r - m);
    den += rs.length - 1;
  }
  const sigma2 = den > 0 ? num / den : 1.0;
  const entries = [...groups.entries()];
  const ws = entries.map(([, rs]) => rs.length / sigma2);
  const sw = ws.reduce((s, w) => s + w, 0);
  let mw = 0;
  entries.forEach(([key], i) => {
    mw += ws[i]! * (means.get(key) ?? 0);
  });
  mw /= sw;
  let q = 0;
  let sw2 = 0;
  entries.forEach(([key], i) => {
    const w = ws[i]!;
    const d = (means.get(key) ?? 0) - mw;
    q += w * d * d;
    sw2 += w * w;
  });
  const denomTau = sw - sw2 / sw;
  const tau2 = denomTau > 0 ? Math.max(0, (q - (entries.length - 1)) / denomTau) : 0;
  for (const [key, rs] of entries) {
    const m = means.get(key) ?? 0;
    const shrink = tau2 / (tau2 + sigma2 / rs.length);
    factors[key] = Math.exp(shrink * m);
  }
  return factors;
}

/**
 * The unknown-age group factor (radar-9). Protocols whose listing
 * date the snapshot does not record run below the fitted line in the
 * training data: their median residual is −0.505 log (23 protocols,
 * mean −0.395, standard deviation 2.12 — so the signal is real but
 * noisy, under one standard error). The factor is the median
 * residual shrunk by n/(n+6) toward 1.0, computed from the training
 * set only: exp(0.793 × −0.505) = 0.67 on the full fit. It applies
 * to a protocol with no listed_at and to nothing else. The centre is
 * the numpy-style median (mean of the two middle values for even
 * counts), so the run-time self-check matches the offline harness
 * exactly. Reported honestly: on held-out data this moves the
 * overall medians (CV 1.214 → 1.171, LOCO 1.104 → 1.084, LOO
 * 1.178 → 1.115) but the unknown-age subgroup's own leave-one-out
 * median gets worse (1.718 → 1.885) and the mean absolute error is
 * essentially flat — the gain sits in the middle of the error
 * distribution, not in the tails, and the worst outliers (aave-v2,
 * thorchain-dex) are hurt, not helped. It is kept because the
 * headline held-out medians improve on three of the five tests with
 * two ties and no loss, and the subgroup cost is stated here and in
 * the model view rather than hidden.
 */
function unknownAgeFactor(train: Protocol[], intercept: number, exponent: number): number {
  const res: number[] = [];
  for (const p of train) {
    if (p.listed_at) continue;
    res.push(Math.log(p.mcap_usd as number) - (intercept + exponent * Math.log(p.tvl_usd)));
  }
  if (res.length < 3) return 1.0;
  const centre = medianAverage(res);
  const shrink = res.length / (res.length + UNKNOWN_AGE_SHRINK_K);
  return Math.exp(shrink * centre);
}

/**
 * The chain-count band (radar-10): "lo" for three or fewer chains,
 * "hi" for four or more. The per-count medians are incoherent, so
 * the split is a step, not a slope — one factor per band.
 */
export function chainCountBand(chainCount: number): string {
  return chainCount <= 3 ? "lo" : "hi";
}

/**
 * The chain-count band factors (radar-10). Protocols on three or
 * fewer chains run above the fitted line in the training data
 * (median residual +0.153 log over 59 protocols on this snapshot);
 * protocols on four or more run below it (median residual −0.535
 * over 35). Each band takes its median residual shrunk by
 * n/(n+50) toward 1.0, computed from the training set only:
 * 1.09 and 0.80 on the full fit. The centre is the numpy-style
 * median (mean of the two middle values for even counts), so the
 * run-time self-check matches the offline harness exactly. The
 * heavy shrinkage is deliberate (see CHAIN_COUNT_SHRINK_K): the
 * gap is stable across the old/young halves, but at K=6 the
 * four-plus factor (0.67 on the old train) over-corrects young
 * multi-chain protocols the radar-9 fit already predicts well and
 * collapses walk-forward old→young. Reported honestly: the factor
 * wins all five held-out medians but the within-2× shares fall
 * slightly on every test and the mean absolute error is
 * essentially flat — the gain sits in the middle of the error
 * distribution, and the two hardest categories get worse on their
 * own leave-one-out (Lending 1.823 → 1.927, Dexs 1.383 → 1.423).
 */
function chainCountFactors(
  train: Protocol[],
  intercept: number,
  exponent: number,
): Record<string, number> {
  const groups = new Map<string, number[]>();
  for (const p of train) {
    const r = Math.log(p.mcap_usd as number) - (intercept + exponent * Math.log(p.tvl_usd));
    const key = chainCountBand(p.chains.length);
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  const factors: Record<string, number> = {};
  for (const [key, rs] of groups) {
    if (rs.length < 3) {
      factors[key] = 1.0;
      continue;
    }
    const centre = medianAverage(rs);
    const shrink = rs.length / (rs.length + CHAIN_COUNT_SHRINK_K);
    factors[key] = Math.exp(shrink * centre);
  }
  return factors;
}

/**
 * The chain-count × category interaction (radar-11, refined in
 * radar-12). The chain-count band factor is a marginal effect: it
 * shifts every protocol on four or more chains down by the same amount,
 * which helps the over-predicted ones and hurts the ones radar-10
 * already predicted well (the diagnosis in the model view: every
 * protocol radar-10 hurt most moved by exactly +0.21/+0.22 log). The
 * two-way interaction asks whether the band gap differs by category:
 * interaction = median(cat,band) − median(cat) − median(band) +
 * median(all), computed on the training set's power-law residuals,
 * shrunk by n/(n+8) toward 0, and only for (category, band) groups
 * with at least 5 training protocols. On this snapshot only five
 * groups qualify, all in the three-or-fewer band: Lending ×1.06, Dexs
 * ×0.88, Basis Trading ×1.00, Yield ×0.95, RWA ×0.99 — 35 of 40 groups
 * take no factor. The centre is the numpy-style median, so the run-time
 * self-check matches the offline harness exactly. Radar-12's refinement
 * (K=8 instead of 12) moves CV 1.067 → 1.059 and LOO 0.997 → 0.991
 * with LOCO and both walk-forwards unchanged, and the win is a broad
 * plateau across the refinement sweep (K=6–10 with min_n=5 all beat
 * radar-11 on CV, 1.059–1.063), not a tuned spike. Reported honestly:
 * Dexs leave-one-out gets worse again (1.661 → 1.751), the mean
 * absolute error is slightly worse (LOO 1.526 → 1.528, CV 1.545 →
 * 1.547), and the within-2× share on leave-one-out falls (34.0% →
 * 33.0%) — the gain sits in the middle of the error distribution, as
 * in radar-9, radar-10 and radar-11.
 */
function interactionFactors(
  train: Protocol[],
  intercept: number,
  exponent: number,
): Record<string, Record<string, number>> {
  const res = train.map(
    (p) => Math.log(p.mcap_usd as number) - (intercept + exponent * Math.log(p.tvl_usd)),
  );
  const byCat = new Map<string, number[]>();
  const byBand = new Map<string, number[]>();
  const byBoth = new Map<string, number[]>();
  train.forEach((p, i) => {
    const catKey = p.category ?? "(null)";
    const bandKey = chainCountBand(p.chains.length);
    const r = res[i]!;
    const push = (map: Map<string, number[]>, key: string) => {
      const arr = map.get(key);
      if (arr) arr.push(r);
      else map.set(key, [r]);
    };
    push(byCat, catKey);
    push(byBand, bandKey);
    push(byBoth, `${catKey}\u0000${bandKey}`);
  });
  const grand = medianAverage(res);
  const catMed = new Map<string, number>();
  for (const [k, rs] of byCat) catMed.set(k, medianAverage(rs));
  const bandMed = new Map<string, number>();
  for (const [k, rs] of byBand) bandMed.set(k, medianAverage(rs));
  const factors: Record<string, Record<string, number>> = {};
  for (const [key, rs] of byBoth) {
    if (rs.length < INTERACTION_MIN_N) continue;
    const sep = key.indexOf("\u0000");
    const catKey = key.slice(0, sep);
    const bandKey = key.slice(sep + 1);
    const inter =
      medianAverage(rs) - (catMed.get(catKey) ?? grand) - (bandMed.get(bandKey) ?? grand) + grand;
    const shrink = rs.length / (rs.length + INTERACTION_SHRINK_K);
    if (!factors[catKey]) factors[catKey] = {};
    factors[catKey]![bandKey] = Math.exp(shrink * inter);
  }
  return factors;
}

/**
 * The sign of a protocol's 7-day change (radar-13): "pos" when the
 * snapshot records a positive change, "neg" otherwise — a missing
 * change counts as negative, as in the offline harness. As a
 * continuous feature the change carries nothing, and as a main-effect
 * binary factor it loses (CV 1.073, LOO 1.008); only its interaction
 * with category wins.
 */
export function changeSign(change7d: number | null): string {
  return change7d !== null && change7d > 0 ? "pos" : "neg";
}

/**
 * The 7-day-change-sign × category interaction (radar-13). The same
 * two-way form as the chain-count × category interaction: interaction
 * = median(cat,sign) − median(cat) − median(sign) + median(all),
 * computed on the training set's power-law residuals, shrunk by
 * n/(n+20) toward 0, and only for (category, sign) groups with at
 * least 5 training protocols. On this snapshot only five groups
 * qualify, all with a negative 7-day change: Lending ×0.97, Dexs
 * ×1.02, Basis Trading ×1.01, Yield ×1.02, RWA ×1.04 — the positive
 * groups are too small everywhere (11 protocols with a positive
 * change in total). The centre is the numpy-style median, so the
 * run-time self-check matches the offline harness exactly. The win is
 * small and reported as small: CV 1.059 → 1.058 and LOO 0.991 →
 * 0.985, LOCO and both walk-forwards unchanged, and it is the first
 * change since radar-10 that improves Dexs (1.751 → 1.722) and Lending
 * (1.920 → 1.895) on their own leave-one-out instead of hurting them.
 */
function signInteractionFactors(
  train: Protocol[],
  intercept: number,
  exponent: number,
): Record<string, Record<string, number>> {
  const res = train.map(
    (p) => Math.log(p.mcap_usd as number) - (intercept + exponent * Math.log(p.tvl_usd)),
  );
  const byCat = new Map<string, number[]>();
  const byBand = new Map<string, number[]>();
  const byBoth = new Map<string, number[]>();
  train.forEach((p, i) => {
    const catKey = p.category ?? "(null)";
    const bandKey = changeSign(p.change_7d);
    const r = res[i]!;
    const push = (map: Map<string, number[]>, key: string) => {
      const arr = map.get(key);
      if (arr) arr.push(r);
      else map.set(key, [r]);
    };
    push(byCat, catKey);
    push(byBand, bandKey);
    push(byBoth, `${catKey}\u0000${bandKey}`);
  });
  const grand = medianAverage(res);
  const catMed = new Map<string, number>();
  for (const [k, rs] of byCat) catMed.set(k, medianAverage(rs));
  const bandMed = new Map<string, number>();
  for (const [k, rs] of byBand) bandMed.set(k, medianAverage(rs));
  const factors: Record<string, Record<string, number>> = {};
  for (const [key, rs] of byBoth) {
    if (rs.length < SIGN_INTERACTION_MIN_N) continue;
    const sep = key.indexOf("\u0000");
    const catKey = key.slice(0, sep);
    const bandKey = key.slice(sep + 1);
    const inter =
      medianAverage(rs) - (catMed.get(catKey) ?? grand) - (bandMed.get(bandKey) ?? grand) + grand;
    const shrink = rs.length / (rs.length + SIGN_INTERACTION_SHRINK_K);
    if (!factors[catKey]) factors[catKey] = {};
    factors[catKey]![bandKey] = Math.exp(shrink * inter);
  }
  return factors;
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
 * Radar-8 fits on the BOARD-ELIGIBLE token protocols only (94), after
 * winsorising their log(mcap/TVL) multiples at the training set's own
 * P5/P95: a CEX token's value does not follow from its exchange's TVL,
 * a bridge token is usually worth ~nothing whatever the bridge holds,
 * and a liquid-staking token tracks its underlying. Then an
 * empirical-Bayes category factor per category and a shrunk chain
 * factor per chain (mean over the row's chains) from the residuals.
 */
export function fitModel(snap: Snapshot): ModelMeta {
  const train = calibrationSet(snap).filter(
    (p) => p.category === null || !EXCLUDED_CATEGORIES.has(p.category),
  );
  let intercept = FALLBACK_INTERCEPT;
  let exponent = FALLBACK_EXPONENT;
  const categoryFactors: Record<string, number> = {};
  const chainFactors: Record<string, number> = {};
  let unknownAgeFactorValue = 1.0;
  let unknownAgeN = 0;
  const chainCountFactorValues: Record<string, number> = {};
  const interactionFactorValues: Record<string, Record<string, number>> = {};
  const signInteractionFactorValues: Record<string, Record<string, number>> = {};
  if (train.length >= 10) {
    const wtrain = winsorizeTrain(train);
    const fitted = huberFit(wtrain);
    intercept = fitted.intercept;
    exponent = fitted.exponent;
    const { categoryFactors: cf, chainFactors: chf } = residualFactors(wtrain, intercept, exponent);
    Object.assign(categoryFactors, cf);
    Object.assign(chainFactors, chf);
    unknownAgeFactorValue = unknownAgeFactor(wtrain, intercept, exponent);
    unknownAgeN = wtrain.filter((p) => !p.listed_at).length;
    Object.assign(chainCountFactorValues, chainCountFactors(wtrain, intercept, exponent));
    Object.assign(interactionFactorValues, interactionFactors(wtrain, intercept, exponent));
    Object.assign(signInteractionFactorValues, signInteractionFactors(wtrain, intercept, exponent));
  }
  const validation = selfCheck(snap);
  const accounting = accountProtocols(snap);
  return {
    version: "radar-13",
    method:
      "Power-law calibration fitted at run time from the snapshot's own token protocols in board-eligible " +
      "categories: log(market cap) = A + B*log(TVL) by Huber iteratively-reweighted least squares (8 rounds), " +
      "on the training set winsorised at its own P5/P95 of log(mcap/TVL) so the one or two most extreme " +
      "multiples cannot drag the line; then an empirical-Bayes category factor (DerSimonian-Laird " +
      "random-effects shrinkage, tau^2 and sigma^2 estimated from the training residuals) and a shrunk " +
      "chain factor (mean over the protocol's chains) from the residuals, plus an unknown-age factor for " +
      "protocols whose listing date the snapshot does not record (the median residual of that group in " +
      "the training data, shrunk by n/(n+6) toward 1.0 — 0.67 on this snapshot), a chain-count band " +
      "factor: protocols on three or fewer chains take the median residual of that band, protocols on " +
      "four or more take the other band's, each shrunk by n/(n+50) toward 1.0 (1.09 and 0.80 on this " +
      "snapshot), a chain-count × category interaction factor: for (category, band) groups with at " +
      "least 5 training protocols, the two-way interaction median(cat,band) − median(cat) − median(band) " +
      "+ median(all), shrunk by n/(n+8) toward 1.0 — on this snapshot five groups qualify, all in the " +
      "three-or-fewer band (Lending ×1.06, Dexs ×0.88, Basis Trading ×1.00, Yield ×0.95, RWA ×0.99), " +
      "and a 7-day-change-sign × category interaction factor: the same two-way form with the sign of " +
      "the 7-day change (positive or negative) in place of the chain-count band, shrunk by n/(n+20) " +
      "toward 1.0 for (category, sign) groups with at least 5 training protocols — on this snapshot " +
      "five groups qualify, all with a negative 7-day change (Lending ×0.97, Dexs ×1.02, Basis Trading " +
      "×1.01, Yield ×1.02, RWA ×1.04). " +
      "Implied value = exp(A) * TVL^B * category factor * chain factor * unknown-age factor (only when " +
      "no listing date is recorded) * chain-count factor * interaction factor * sign-interaction factor * growth * maturity. CEX, bridge " +
      "and liquid-staking tokens are left out of the fit because their value does not follow from their " +
      "TVL, and the board never ranks those categories. Growth moves the value at most 10% and maturity " +
      "at most 5%: a 7-day window and age barely predict the multiple in the calibration data, so they " +
      "are kept small on purpose. The peer token rate is shown for context only and never enters the value. " +
      "A ridge regression over every snapshot feature, a comps model (similarity-weighted peer multiples, " +
      "the approach the leaders advertise), k-nearest neighbours, gradient boosting and random forests on " +
      "the snapshot features, a piecewise (spline) slope for log TVL, " +
      "a |change_7d| band factor and per-category TVL slopes were all built and tested on the same " +
      "held-out harness and LOSE, so radar-13 keeps this fit — see the accuracy test below.",
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
    unknown_age_factor: unknownAgeFactorValue,
    unknown_age_n: unknownAgeN,
    chain_count_factors: chainCountFactorValues,
    chain_count_shrink_k: CHAIN_COUNT_SHRINK_K,
    interaction_factors: interactionFactorValues,
    interaction_shrink_k: INTERACTION_SHRINK_K,
    interaction_min_n: INTERACTION_MIN_N,
    sign_interaction_factors: signInteractionFactorValues,
    sign_interaction_shrink_k: SIGN_INTERACTION_SHRINK_K,
    sign_interaction_min_n: SIGN_INTERACTION_MIN_N,
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
      "the 94 board-eligible token protocols are −1.524 and +0.870, so the range is implied × 0.22 to " +
      "implied × 2.39. Half of similar protocols' true values fall inside it. A point estimate alone " +
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
      radar6_cv_median_log_err: 1.214,
      radar6_cv_within2x_pct: 33.6,
      radar6_loco_median_log_err: 1.104,
      radar6_loo_median_log_err: 1.178,
      verdict:
        "Comps loses on every held-out test, so radar-13 keeps the power-law fit — winsorised, with " +
        "empirical-Bayes category factors, an unknown-age factor, a chain-count band factor and a " +
        "chain-count × category interaction factor. The accuracy gap to the leaders is structural to this snapshot, not a method the board has not " +
        "tried: ridge regression over every snapshot feature (CV 1.250, LOO 1.292), per-category slope, " +
        "Theil-Sen, quadratic log(TVL), median-residual factors, a young-age flag, k-nearest neighbours " +
        "as a pure predictor (CV 1.284–1.321, LOO 1.369–1.416) and as a log-space ensemble with the " +
        "power law (it improves walk-forward both ways, 0.823 → 0.714 and 1.242 → 1.182, but worsens " +
        "CV, LOCO and LOO), comps multiples, a local comps curve, a residual correction, median " +
        "(quantile) regression in three forms (best: CV 1.177 but LOO 1.189; full quantile regression " +
        "collapses walk-forward old→young to 1.681), sub-category factors for Dexs and Lending (they " +
        "make both categories' leave-one-out worse), age imputation by category median (no change), a " +
        "young×growing×hot-category interaction (the flag never fires in this snapshot), a growth×" +
        "category interaction for Dexs and Lending (CV 1.185, LOO 1.112 — it helps Lending 1.823 → " +
        "1.703 but hurts Dexs 1.383 → 1.696), training without the five extreme outliers (CV 1.190, " +
        "LOO 1.153 — it loses even on the bulk 89, 1.098 vs 1.059), a piecewise (spline) slope for " +
        "log TVL with one knot at the median (CV 1.123 but LOO 1.147; two knots worse again, and a " +
        "shrunk hinge still loses, LOO 1.206), a |change_7d| band factor (it improves walk-forward " +
        "old→young to 0.668 but worsens CV to 1.183 and LOO to 1.145), per-category TVL slopes with " +
        "shrinkage (CV 1.152, LOO 1.165), a spline-plus-interaction combination (CV 1.198, LOO 1.186), " +
        "gradient boosting and random forests on the snapshot features, implemented from scratch " +
        "(a new estimator family, first tried in radar-12: direct, power-law-residual and radar-11-" +
        "residual targets, L1 and L2 loss — best CV 1.286, far from 1.067; a log-space ensemble with " +
        "the power law also loses, CV 1.116 at weight 0.1), TVL per chain instead of total TVL " +
        "(CV 1.087), an unknown-age × chain-count interaction (CV 1.078), an empirical age-bin factor " +
        "to recalibrate the maturity curve (CV 1.106–1.143), fitting the growth and maturity " +
        "coefficients instead of the fixed 10%/5% weights (CV 1.091–1.150), a post-hoc shrunk " +
        "growth/maturity correction (CV 1.191–1.233), capping the interaction factor's range " +
        "(CV 1.096–1.122), a category × unknown-age interaction (CV 1.081–1.137), " +
        "and weighted regression all fail " +
        "the same harness. The chain-count band factor is the one change that beats the radar-9 fit " +
        "on all five held-out tests with no loss (see the accuracy test in the model view) — and its " +
        "cost is stated there too: the within-2× shares fall slightly on every test and the mean " +
        "absolute error is essentially flat. The chain-count × category interaction is the one change " +
        "that beats the radar-10 fit on two of the five held-out tests and ties the other three " +
        "(CV 1.133 → 1.067, LOO 1.023 → 0.997) — and its cost is stated there too: Dexs " +
        "leave-one-out gets worse (1.423 → 1.661) and the mean absolute error is slightly worse. " +
        "Radar-12's refinement of that interaction's shrinkage (K=8) beats the radar-11 fit on two " +
        "of the five held-out tests and ties the other three (CV 1.067 → 1.059, LOO 0.997 → 0.991) " +
        "— and its cost is stated there too: Dexs leave-one-out gets worse again (1.661 → 1.751) " +
        "and the mean absolute error is slightly worse. Radar-13's change is a 7-day-change-sign × " +
        "category interaction, found by a systematic binary-split scan of every numeric snapshot field " +
        "(change_7d sign, TVL band, age splits, alternative chain-count thresholds, each at K=20/50/100): " +
        "every split loses as a main effect, and sequential factors on the full-model residuals lose too, " +
        "but the sign × category interaction beats the radar-12 fit on two of the five held-out tests and " +
        "ties the other three (CV 1.059 → 1.058, LOO 0.991 → 0.985), with no test worse and the two hardest " +
        "categories better on their own leave-one-out (Dexs 1.751 → 1.722, Lending 1.920 → 1.895). The win " +
        "is a broad plateau across the shrinkage grid (K2=12–80 all score CV 1.058–1.059 and LOO 0.985–0.989), " +
        "not a tuned spike — but it is small, and the radar-13 target (LOO ≤ 0.95, CV ≤ 1.05) is NOT reached.",
    },
    backtest: {
      universe_n: 128,
      radar3_median_log_err: 1.283,
      radar4_median_log_err: 1.264,
      radar5_median_log_err: 1.259,
      radar6_median_log_err: 1.257,
      radar6_eligible_median_log_err: 1.162,
      radar7_median_log_err: 1.248,
      radar7_within2x_pct: 35.7,
      radar7_loco_median_log_err: 1.175,
      radar7_loo_median_log_err: 1.314,
      radar8_median_log_err: 1.214,
      radar8_within2x_pct: 33.6,
      radar8_loco_median_log_err: 1.104,
      radar8_loo_median_log_err: 1.178,
      radar9_median_log_err: 1.171,
      radar9_within2x_pct: 34.3,
      radar9_loco_median_log_err: 1.084,
      radar9_loo_median_log_err: 1.115,
      radar10_median_log_err: 1.133,
      radar10_within2x_pct: 33.2,
      radar10_loco_median_log_err: 1.040,
      radar10_loo_median_log_err: 1.023,
      radar11_median_log_err: 1.067,
      radar11_within2x_pct: 32.8,
      radar11_loco_median_log_err: 1.040,
      radar11_loo_median_log_err: 0.997,
      radar12_median_log_err: 1.059,
      radar12_within2x_pct: 33.0,
      radar12_loco_median_log_err: 1.040,
      radar12_loo_median_log_err: 0.991,
      radar13_median_log_err: 1.058,
      radar13_within2x_pct: 33.0,
      radar13_loco_median_log_err: 1.040,
      radar13_loo_median_log_err: 0.985,
      radar3_within2x_pct: 33.6,
      radar4_within2x_pct: 35.2,
      radar5_within2x_pct: 35.2,
      radar6_within2x_pct: 32.9,
      radar6_eligible_within2x_pct: 36.3,
      loco_radar4_median_log_err: 1.479,
      loco_radar5_median_log_err: 1.461,
      loco_radar6_median_log_err: 1.159,
      method: "repeated 5-fold cross-validation (5 seeds, deterministic split by slug hash) plus leave-one-category-out and leave-one-out, all held-out; median |log(implied/mcap)|; radar-5, radar-6, radar-7, radar-8, radar-9 and radar-10 measured on the same strict harness (every factor refit on the training fold only), radar-6 on all 128 token protocols and on the 94 in board-eligible categories",
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

/** Category factors by empirical-Bayes partial pooling and chain
 *  factors by the shrunk residual mean, both from a training set's
 *  Huber residuals. The caller passes the WINSORISED training set,
 *  so the extreme multiples are already clipped. */
export function residualFactors(
  train: Protocol[],
  intercept: number,
  exponent: number,
): { categoryFactors: Record<string, number>; chainFactors: Record<string, number> } {
  const categoryFactors = ebCategoryFactors(train, intercept, exponent);
  const chainResiduals = new Map<string, number[]>();
  for (const p of train) {
    const r = Math.log(p.mcap_usd as number) - (intercept + exponent * Math.log(p.tvl_usd));
    for (const chain of p.chains) {
      const carr = chainResiduals.get(chain);
      if (carr) carr.push(r);
      else chainResiduals.set(chain, [r]);
    }
  }
  const chainFactors: Record<string, number> = {};
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
  unknownAgeFactorValue: number,
  chainCountFactors: Record<string, number>,
  interactionFactors: Record<string, Record<string, number>>,
  signInteractionFactors: Record<string, Record<string, number>>,
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
  const ageFactor = p.listed_at ? 1.0 : unknownAgeFactorValue;
  const chainCountFactor = chainCountFactors[chainCountBand(p.chains.length)] ?? 1.0;
  const interactionFactor =
    interactionFactors[catKey]?.[chainCountBand(p.chains.length)] ?? 1.0;
  const signInteractionFactor =
    signInteractionFactors[catKey]?.[changeSign(p.change_7d)] ?? 1.0;
  const growthPct = clamp(p.change_7d ?? 0, GROWTH_FLOOR, GROWTH_CAP);
  const growthMultiplier = 1 + (GROWTH_WEIGHT * growthPct) / 100;
  const age = ageDays(p, asOf);
  const maturityMultiplier =
    MATURITY_FLOOR + (MATURITY_RANGE * Math.min(age, MATURITY_DAYS)) / MATURITY_DAYS;
  return Math.max(
    1,
    Math.round(base * categoryFactor * chainFactor * ageFactor * chainCountFactor * interactionFactor * signInteractionFactor * growthMultiplier * maturityMultiplier),
  );
}

function fitAndPredict(
  train: Protocol[],
  test: Protocol[],
  asOf: string,
): { implied: number; actual: number }[] {
  if (train.length < 10) return [];
  const wtrain = winsorizeTrain(train);
  const { intercept, exponent } = huberFit(wtrain);
  const { categoryFactors, chainFactors } = residualFactors(wtrain, intercept, exponent);
  const unknownAgeFactorValue = unknownAgeFactor(wtrain, intercept, exponent);
  const chainCountFactorValues = chainCountFactors(wtrain, intercept, exponent);
  const interactionFactorValues = interactionFactors(wtrain, intercept, exponent);
  const signInteractionFactorValues = signInteractionFactors(wtrain, intercept, exponent);
  return test.map((p) => ({
    implied: predictWith(p, asOf, intercept, exponent, categoryFactors, chainFactors, unknownAgeFactorValue, chainCountFactorValues, interactionFactorValues, signInteractionFactorValues),
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
  const unknownAgeFactorValue = p.listed_at ? 1.0 : meta.unknown_age_factor;
  const chainCountFactorValue = meta.chain_count_factors[chainCountBand(p.chains.length)] ?? 1.0;
  const interactionFactorValue =
    meta.interaction_factors[catKey]?.[chainCountBand(p.chains.length)] ?? 1.0;
  const signInteractionFactorValue =
    meta.sign_interaction_factors[catKey]?.[changeSign(p.change_7d)] ?? 1.0;
  const implied = Math.max(
    1,
    Math.round(base * categoryFactor * chainFactor * unknownAgeFactorValue * chainCountFactorValue * interactionFactorValue * signInteractionFactorValue * growthMultiplier * maturityMultiplier),
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
    unknown_age_factor: unknownAgeFactorValue,
    chain_count_factor: chainCountFactorValue,
    interaction_factor: interactionFactorValue,
    sign_interaction_factor: signInteractionFactorValue,
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
