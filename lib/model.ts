// Radar-2 value model for the Token Radar board.
// Every figure below comes from the sealed snapshot itself: TVL, the
// seven-day TVL change, how long the protocol has been tracked, and how
// many chains it runs on. No protocol name is ever hardcoded here.

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
const REFERENCE_AGE_DAYS = 1460;
const FALLBACK_AGE_DAYS = 365;

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

/**
 * Implied value in whole dollars: 30% of TVL, scaled by recent growth,
 * by maturity (log age against a four-year reference) and by chain breadth.
 */
export function impliedValue(p: Protocol, asOf: string): number {
  const base = p.tvl_usd * 0.3;
  const growthPct = clamp(p.change_7d ?? 0, -80, 200);
  const growthMult = 1 + (0.5 * growthPct) / 100;
  const age = ageDays(p, asOf);
  const maturity = 0.55 + (0.45 * Math.log(1 + age)) / Math.log(1 + REFERENCE_AGE_DAYS);
  const breadth = 1 + 0.04 * Math.min(p.chains.length, 8);
  return Math.max(1, Math.round(base * growthMult * maturity * breadth));
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

/** Seven concrete farming steps built only from this protocol's own record. */
export function farmSteps(p: Protocol, asOf: string, implied: number): string[] {
  const age = ageDays(p, asOf);
  const cat = p.category ?? "this sector";
  const chainList = p.chains.slice(0, 3).join(", ") || "its home chain";
  const extraChains = p.chains.length > 3 ? ` plus ${p.chains.length - 3} more` : "";
  const weekly = `TVL moved ${pct(p.change_7d)} over the last 7 days`;
  // Guard the 600-char gate limit by construction, not just by validation.
  const capStep = (s: string): string => (s.length > 600 ? `${s.slice(0, 597).trimEnd()}…` : s);
  const steps = [
    `Open ${p.name} on ${chainList}${extraChains} and confirm the app loads with ${money(p.tvl_usd)} of TVL behind it before you connect any wallet.`,
    `Create a fresh wallet for farming only, fund it with a small test amount first, and keep the rest of your funds in a separate wallet.`,
    `Use the protocol's core ${cat} action on ${chainList}: deposit or supply a modest position, then check the position shows up before adding more.`,
    `Repeat the core action weekly for at least four weeks, because ${p.name} has run ${age} days and steady activity reads better than one large deposit.`,
    `Watch the board each week (${weekly}); if TVL falls sharply for two weeks in a row, pause new deposits and reassess before continuing.`,
    `If ${p.name} opens points, quests or a leaderboard, complete each task from the same farming wallet so the whole history stays in one place.`,
    `Before any token launch, re-check the implied value (now ${money(implied)}) against fresh TVL and only claim through the protocol's own app, never a link sent to you.`,
  ];
  return steps.map(capStep);
}

function toRow(p: Protocol, asOf: string): BoardRow {
  return {
    slug: p.slug,
    name: p.name,
    rank: 0,
    implied_value_usd: impliedValue(p, asOf),
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    age_days: ageDays(p, asOf),
    farm_steps: farmSteps(p, asOf, impliedValue(p, asOf)),
  };
}

/**
 * The ranked board: every watchlist protocol, plus every other pre-token
 * protocol below the watchlist floor that is not a wrapped, staked or
 * bridged product. Ranked by implied value, highest first.
 */
export function buildBoard(snap: Snapshot): BoardRow[] {
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
  const rows = picked.map((p) => toRow(p, snap.as_of));
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
export function dataScript(snap: Snapshot, rows: BoardRow[]): string {
  const payload = {
    as_of: snap.as_of,
    source: snap.source,
    floor_usd: snap.floor_usd,
    watchlist_count: snap.watchlist.length,
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
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      issues.push(`row ${r.slug} is worth more than the row ranked above it`);
    }
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length !== 7) {
      issues.push(`row ${r.slug} holds ${r.farm_steps?.length ?? 0} farm steps, expected 7`);
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
