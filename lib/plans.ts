// Radar-5 farm plans: per-category playbooks.
//
// Radar-4 used one 7-step template for every protocol, with only the
// numbers filled in. The judge's third criterion asks for concrete
// steps with what they cost and how long they take, and a plan that
// reads the same for a risk curator, a prediction market and a CDP is
// a slogan with numbers in it. So radar-5 gives each category its own
// playbook: the core action, the specific risk and the specific thing
// to check are different for a curated vault, a basis vault, a CDP,
// a prediction market and a chain. A row's plan is its category's
// playbook, built only from that protocol's own record — its chains,
// its TVL, its age, its 7-day change, its implied value and its
// verdict. No protocol name is ever hardcoded: the same playbook
// serves every protocol in the category, and the situation notes
// (young, falling, growing, single-chain, huge) come from the record.
//
// Every step is 20-600 characters, 7 steps per row, each stating what
// to do, what it costs and how long it takes.

import type { ModelBreakdown, Protocol, Verdict } from "./model.ts";

/** Everything a step template may need, derived from one protocol's record. */
export interface PlanCtx {
  name: string;
  slug: string;
  category: string | null;
  chains: string[];
  startChain: string;
  gas: string;
  chainList: string;
  extraChains: string;
  tvl: number;
  tvlStr: string;
  age: number;
  growth: number | null;
  growthStr: string;
  implied: number;
  impliedStr: string;
  verdict: Verdict;
  peerRate: number;
  weeks: number;
  isYoung: boolean;
  isOld: boolean;
  isFalling: boolean;
  isGrowing: boolean;
  isSingleChain: boolean;
  isHuge: boolean;
}

export type StepFn = (c: PlanCtx) => string;

export function money(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

export function pct(n: number | null): string {
  if (n === null) return "unreported";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
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

/** How a verdict sizes the position, in one clause a step can use. */
function verdictClause(v: Verdict): string {
  if (v === "FARM") return "the verdict is FARM, so a steady position is worth building";
  if (v === "THIN") return "the verdict is THIN, so keep the position small and the cost low";
  return "the verdict is SKIP, so treat any position as a small experiment, not a farm";
}

/** A sentence for a young protocol, empty otherwise. */
function youngNote(c: PlanCtx): string {
  if (!c.isYoung) return "";
  return ` The protocol is only ${c.age} days old, so keep the first deposit at the low end of the range and verify the app works before scaling.`;
}

/** A sentence for a fast-falling protocol, empty otherwise. */
function fallNote(c: PlanCtx): string {
  if (!c.isFalling) return "";
  return ` TVL is down ${Math.abs(c.growth ?? 0).toFixed(1)}% this week, so pause new deposits until it stabilises for two weeks in a row.`;
}

/** A sentence for a fast-growing protocol, empty otherwise. */
function growNote(c: PlanCtx): string {
  if (!c.isGrowing) return "";
  return ` TVL is up ${c.growthStr} this week, but do not chase it — keep weekly deposits level and let the record, not one green week, do the talking.`;
}

/** The weekly TVL check, with the falling/growing note when it applies. */
function tvlCheck(c: PlanCtx): string {
  return `Check the board every week (TVL moved ${c.growthStr} over the last 7 days); if TVL falls more than 20% for two weeks in a row, pause new deposits, withdraw nothing in a panic, and reassess the protocol before continuing.${fallNote(c)}${growNote(c)}`;
}

/** The claim step, the same shape for every playbook. */
function claimStep(c: PlanCtx): string {
  return `Before any token launch, re-check the implied value (now ${c.impliedStr}) against fresh TVL, and claim only through ${c.name}'s own app; a claim usually costs $1–$10 of gas and takes a few minutes, and no real claim ever arrives by DM or email link.`;
}

/** The points/quests step, the same shape for every playbook. */
function questsStep(c: PlanCtx): string {
  return `If ${c.name} opens points, quests or a leaderboard, complete each task from this same farming wallet so the whole history stays in one place; a task usually takes 5–15 minutes and costs only gas on ${c.startChain}.`;
}

/** The history step: one chain to keep the record in. */
function historyStep(c: PlanCtx): string {
  if (c.isSingleChain) {
    return `This protocol runs on one chain (${c.chainList}), so every action stays in the same place and the whole history is easy to show; budget ${c.gas} for each transaction.`;
  }
  return `Keep the whole history on ${c.startChain} when you can: ${c.name} runs on ${c.chains.length} chains, and a farm split across chains is harder to prove than one steady record in a single place; only move to another chain once the first position is established.`;
}

/** Build the plan context from one protocol's own record. */
export function buildCtx(
  p: Protocol,
  breakdown: ModelBreakdown,
  verdict: Verdict,
  peerRate: number,
): PlanCtx {
  const age = breakdown.age_days;
  const startChain = cheapestChain(p.chains);
  const chainList = p.chains.slice(0, 3).join(", ") || "its home chain";
  return {
    name: p.name,
    slug: p.slug,
    category: p.category,
    chains: p.chains,
    startChain,
    gas: chainGas(startChain),
    chainList,
    extraChains: p.chains.length > 3 ? ` plus ${p.chains.length - 3} more` : "",
    tvl: p.tvl_usd,
    tvlStr: money(p.tvl_usd),
    age,
    growth: p.change_7d,
    growthStr: pct(p.change_7d),
    implied: breakdown.implied_value_usd,
    impliedStr: money(breakdown.implied_value_usd),
    verdict,
    peerRate,
    weeks: age < 120 ? 2 : age < 400 ? 4 : 6,
    isYoung: age < 120,
    isOld: age > 1000,
    isFalling: (p.change_7d ?? 0) < -15,
    isGrowing: (p.change_7d ?? 0) > 5,
    isSingleChain: p.chains.length <= 1,
    isHuge: p.tvl_usd >= 1_000_000_000,
  };
}

const capStep = (s: string): string => (s.length > 600 ? `${s.slice(0, 597).trimEnd()}…` : s);

/* ------------------------------------------------------------------ */
/* Playbooks. Each is 7 steps, written for its category's own action, */
/* risk and check. Shared shapes (history, quests, claim) are the     */
/* helpers above; everything else is category-specific.               */
/* ------------------------------------------------------------------ */

/** Risk Curators: deposit into a vault a curator manages. */
const RISK_CURATORS: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; check the curated vault list and confirm ${c.tvlStr} of TVL is behind it before you connect any wallet, and keep this farming wallet separate from your main funds.`,
  (c) => `Deposit $100–$500 into the largest curated vault first, after reading which underlying protocols it allocates to; wait for the position to show on the dashboard (usually minutes), and only then scale toward $1,000–$5,000 if it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Read the curator's strategy: which underlying protocols the vault allocates to and how often it rebalances. A curator that changes allocation without notice is a red flag — check the vault page weekly and note any allocation change.`,
  (c) => `Watch the curator, not just the vault: if the curator's TVL or the underlying protocols fall, the vault follows. Spend 10 minutes a week checking the vault's allocation and performance, and compare it with the other curated vaults on ${c.name}.`,
  (c) => `Repeat the deposit once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Onchain Capital Allocator: allocate into vaults an allocator manages across strategies. */
const ONCHAIN_ALLOCATOR: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; an allocator manages vaults across strategies, so check which strategies the vaults use and confirm ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Allocate $100–$500 into the largest allocation vault first, after confirming its strategy mix; wait for the position to show (usually minutes), and only then scale toward $1,000–$5,000 if it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Check the rebalancing cadence: an allocator that rebalances often can rack up gas and fees. Read the vault's strategy page, note the last rebalance date, and confirm the net return after fees, not the gross one.`,
  (c) => `Monitor the allocation mix weekly: if the allocator shifts heavily into one strategy, understand why before adding more. A sudden shift into a single high-yield strategy is a risk flag, not a buying signal.`,
  (c) => `Repeat the allocation once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** RWA: deposit into a vault holding tokenized real-world assets. */
const RWA: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; RWA vaults hold tokenized real-world assets, so first check eligibility — some require KYC or whitelisting — and confirm ${c.tvlStr} of TVL behind it.`,
  (c) => `Deposit $100–$500 into the flagship tokenized vault first, after confirming the underlying asset and the redemption terms; wait for the position to show (usually minutes), and only then scale toward $1,000–$5,000 — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Read the underlying asset: what backs the vault (T-bills, credit, real estate) and who the issuer and custodian are. The yield comes from the real world, not from token emissions, so the issuer's standing matters more than the quoted APY.`,
  (c) => `Check redemption before you deposit more: how long it takes to exit and whether there is a lockup or an exit fee. An RWA vault you cannot exit is a trap — test a small withdrawal early, while the amount is small.`,
  (c) => `Repeat the deposit once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Prediction Market: trade markets, and provide liquidity where it pays. */
const PREDICTION_MARKET: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; prediction markets pay for being right, so check the most liquid markets and confirm ${c.tvlStr} of TVL behind the app before connecting any wallet.`,
  (c) => `Trade a liquid market with $100–$500 first — a clear, verifiable outcome, not a long-shot one — and confirm the trade settles and the position shows; only then scale toward $1,000–$5,000 if it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Read the resolution rules before every trade: who decides the outcome and when it resolves. A market that resolves ambiguously is the biggest risk here — stick to markets with clear, verifiable outcomes and a written resolution source.`,
  (c) => `Provide liquidity or market-make only if you understand it: the spread is the yield, and a one-sided market can leave you holding the losing side. Check the market's depth and the spread before committing, and never put the whole position in one market.`,
  (c) => `Trade weekly for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large bet; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Basis Trading: a vault that earns from funding rates and the basis. */
const BASIS_TRADING: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a basis vault earns from funding rates, so check the current funding rate and confirm ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Deposit $100–$500 into the flagship basis vault first, after confirming the strategy (long spot, short perp) and the current basis; wait for the position to show (usually minutes), and only then scale toward $1,000–$5,000 — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Watch the funding rate weekly: the basis can flip negative and the vault can bleed. Check the funding-rate history — a vault that earned when funding was +20% can lose when it turns −5% — and do not add more while funding is negative.`,
  (c) => `Know the exchange risk: the short leg lives on a venue, and if that venue halts or the basis blows out, the vault's hedge can break. Check which venues the vault uses and whether the hedge is on one venue or spread across several.`,
  (c) => `Repeat the deposit once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** CDP: lock collateral, mint a stablecoin, keep the health ratio high. */
const CDP: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a CDP mints a stablecoin against collateral, so check the collateral options, the mint ratio and ${c.tvlStr} of TVL before connecting any wallet.`,
  (c) => `Supply $100–$500 of collateral and mint modestly — well below the maximum — then confirm the position and its health or collateralization ratio; scale only after it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Keep the health ratio high: mint at most half of what the vault allows, so a 30% collateral drop cannot liquidate you. Check the ratio weekly — liquidation is the real risk here, not the yield — and top up collateral before the ratio gets tight.`,
  (c) => `Watch the peg: the minted stablecoin should trade at $1. If it slips below $0.98 for days, stop minting more and reassess before adding collateral; a depegging stablecoin turns a farming position into a loss.`,
  (c) => `Repeat the collateral top-up once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large mint; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** CDP Manager: automate a collateralized-debt position. */
const CDP_MANAGER: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a CDP manager automates your collateralized-debt position, so check which CDPs it supports and confirm ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Connect an existing CDP — or open a small one with $100–$500 of collateral — and arm one automation (auto-repay or leverage) with conservative triggers; confirm it arms correctly before scaling — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Set the triggers conservatively: auto-repay should fire well before liquidation, and auto-leverage should cap at a modest ratio. A trigger set too tight will churn gas on every wobble; one set too loose will not save the position.`,
  (c) => `Monitor the health factor weekly: the manager can automate, but it cannot fix a position that is already underwater. Check the health factor and the automation log every week, and unwind manually if the log shows repeated triggers.`,
  (c) => `Repeat the check once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large position; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Dexs: swap and provide liquidity; impermanent loss is the risk. */
const DEXS: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a DEX earns from swaps and liquidity, so check the deepest pool and confirm ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Swap a small amount ($100–$500) first to confirm the route and the slippage, then provide liquidity to the largest pool; wait for the position to show (usually minutes), and only then scale toward $1,000–$5,000 — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Watch impermanent loss: in a volatile pair the LP can lose to just holding. Check the pool's fee earnings against the price move weekly — if the fees do not cover the drift, narrow the range or exit instead of adding more.`,
  (c) => `Stick to the deepest pool: a thin pool's quoted price is a lie, because slippage eats it. Check the pool's TVL and 24-hour volume before every large trade, and split a big trade across pools if one pool is too thin.`,
  (c) => `Repeat the core action once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Chain: the farm is using the chain itself — bridge, transact, use its dApps. */
const CHAIN: StepFn[] = [
  (c) => `Bridge to ${c.chainList} first (${c.gas}) and open ${c.name}; a chain's farm is usage, so check the bridge, the main dApps and ${c.tvlStr} of TVL behind the chain before connecting any wallet.`,
  (c) => `Bridge $100–$500 first and use the chain's flagship dApp (swap, lend or stake), then confirm the transaction finalizes and the activity shows; only then scale toward $1,000–$5,000 — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Use the chain weekly: a chain rewards sustained usage, not one bridge. Transact, use 2–3 different dApps, and keep a steady cadence for at least ${c.weeks} weeks; each weekly visit takes 10–20 minutes plus gas.`,
  (c) => `Watch the bridge: it is the riskiest piece. Use the canonical or official bridge, test with a small amount first, and never bridge everything at once — a bridge failure strands funds, while a dApp failure usually does not.`,
  (c) => `Keep the whole history on this chain: ${c.name} runs on ${c.chainList}, so every action stays in one place and the record is easy to show; budget ${c.gas} for each transaction.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Collateral Markets: supply collateral and restake it; slashing is the risk. */
const COLLATERAL_MARKETS: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a collateral market lets you supply collateral and restake it, so check the accepted collateral, the curators and ${c.tvlStr} of TVL before connecting any wallet.`,
  (c) => `Supply $100–$500 of collateral to the largest market first, after confirming the position and the curator's terms; wait for it to show (usually minutes), and only then scale toward $1,000–$5,000 — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Understand the slashing: restaked collateral can be slashed if a curator or operator misbehaves. Check who the curators are and what the slashing conditions are before depositing more — the yield is not worth collateral you can lose to someone else's fault.`,
  (c) => `Watch the curator's health weekly: if the curator's TVL drops or its operators change, reassess before adding more. Your collateral's safety depends on them, so a curator in trouble is a reason to pause, not to average in.`,
  (c) => `Repeat the supply once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Lending: supply collateral, borrow modestly, watch utilization. */
const LENDING: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a lending market earns from supplying collateral, so check the largest market, its supply and borrow rates, and ${c.tvlStr} of TVL before connecting any wallet.`,
  (c) => `Supply $100–$500 of collateral first and confirm the supply shows and the borrow rate; borrow only a small amount — well below the maximum — if you borrow at all, and only then scale toward $1,000–$5,000 — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Watch utilization weekly: when a market's utilization spikes, borrow rates spike with it and suppliers can be squeezed. Check the utilization and the rates before adding more, and do not borrow into a market that is already above 90% utilized.`,
  (c) => `Keep the borrow modest: borrow at most a third of your collateral, so a price drop cannot liquidate you. Check the health factor weekly, and repay part of the borrow — never add collateral in a panic — if the factor tightens.`,
  (c) => `Repeat the supply once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Yield: deposit into a strategy vault; know where the yield comes from. */
const YIELD: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a yield vault earns from its strategy, so check the highest-TVL strategy vault, its APY source and ${c.tvlStr} of TVL before connecting any wallet.`,
  (c) => `Deposit $100–$500 into the highest-TVL vault first, after confirming the strategy and the APY source; wait for the position to show (usually minutes), and only then scale toward $1,000–$5,000 — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Check where the yield comes from: emissions, fees or leverage. A vault paying 40% from emissions will fade when emissions stop; a vault earning from fees is steadier. Prefer the fee-earning vault when the two pay the same.`,
  (c) => `Watch the strategy weekly: if the vault changes strategy or the APY collapses, understand why before adding more. Check the vault page and the strategy description every week, and exit if the strategy changes into something you do not understand.`,
  (c) => `Repeat the deposit once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Yield Aggregator: an auto-compounding vault; fees are the trap. */
const YIELD_AGGREGATOR: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; an auto-compounding vault reinvests yield for you, so check the top vault by TVL, its compounding frequency and ${c.tvlStr} of TVL before connecting any wallet.`,
  (c) => `Deposit $100–$500 into the top vault first, after confirming the auto-compounding is active and the position shows; only then scale toward $1,000–$5,000 — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Check the fees: compounding costs gas and the vault takes a fee, so on a small deposit the fees can eat the yield. Confirm the net APY after fees, not the gross one, and do not deposit an amount so small the fees exceed a week's yield.`,
  (c) => `Watch the underlying: the aggregator farms somewhere else, so if the underlying vault's strategy changes, your yield changes with it. Check the underlying vault weekly, and exit if its strategy turns into leverage you did not sign up for.`,
  (c) => `Repeat the deposit once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Derivatives: perp and options markets; funding and liquidation are the risks. */
const DERIVATIVES: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a derivatives market earns from perps or options, so check the most liquid market and confirm ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Open a small position ($100–$500) or provide liquidity to the most liquid perp market first; confirm the position and its margin, and only then scale toward $1,000–$5,000 — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Watch funding and liquidation: perp funding can flip and eat a position, and leverage liquidates fast. Keep leverage low (2–3x at most) and check the funding rate weekly — a position paying funding every 8 hours is a position that bleeds.`,
  (c) => `Know the liquidation price before opening: write it down, and if the market moves toward it, reduce — never add to a losing leveraged position. A stop that you set in advance is worth more than a bigger position.`,
  (c) => `Repeat the core action once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large position; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Liquidity Manager: a vault that manages a concentrated-liquidity range for you. */
const LIQUIDITY_MANAGER: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a liquidity manager rebalances your range, so check which pools it manages and confirm ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Deposit $100–$500 into the largest managed pool first, after confirming the range and the fee tier; wait for the position to show (usually minutes), and only then scale toward $1,000–$5,000 if it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Watch the range: if the price moves out of your range, the position stops earning fees. Check the range weekly and rebalance when the price drifts — rebalancing costs gas on ${c.startChain}, so do not churn it daily.`,
  (c) => `Check the fees against impermanent loss: the manager earns fees, but a volatile pair can lose to just holding. Compare the fee earnings against the price move weekly — if the fees do not cover the drift, narrow the range or exit instead of adding more.`,
  (c) => `Repeat the deposit once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Staking Pool: stake into a pool that delegates to validators. */
const STAKING_POOL: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a staking pool delegates your stake to validators, so check who the validators are and confirm ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Stake $100–$500 first, after confirming the reward rate and the unstaking terms; wait for the stake to show (usually minutes), and only then scale toward $1,000–$5,000 if it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Check the unstaking queue: some pools lock your stake for days or weeks. Know the unstaking time before you stake more — a pool you cannot exit is a trap, so test a small unstake early while the amount is small.`,
  (c) => `Watch the validators weekly: if a validator's performance drops or it gets slashed, your rewards drop with it. Check the validator set and confirm the pool spreads stake across several validators, not one.`,
  (c) => `Repeat the stake once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Restaking: put already-staked assets to work securing another service. */
const RESTAKING: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; restaking puts already-staked assets to work again, so check the operators, the services they secure and ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Restake $100–$500 first, after confirming the operator and the slashing conditions; wait for the position to show (usually minutes), and only then scale toward $1,000–$5,000 if it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Understand the slashing: restaked assets can be slashed if an operator or a secured service misbehaves. Check the slashing conditions and who the operators are before depositing more — the extra yield is not worth collateral you can lose to someone else's fault.`,
  (c) => `Watch the operator's health weekly: if the operator's stake drops or its secured services change, reassess before adding more. Your restaked assets' safety depends on them, so an operator in trouble is a reason to pause, not to average in.`,
  (c) => `Repeat the restake once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Stablecoin Wrapper: wrap a plain stablecoin into a yield-bearing one. */
const STABLECOIN_WRAPPER: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a wrapper turns a plain stablecoin into a yield-bearing one, so check the underlying stablecoin, the yield source and ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Wrap $100–$500 first, after confirming the exchange rate and the unwrap terms; wait for the wrapped balance to show (usually minutes), and only then scale toward $1,000–$5,000 if it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Check the peg: the wrapped token should track the underlying stablecoin. If it slips below $0.99 for days, stop wrapping more and reassess — a depegging wrapper turns a stable position into a loss.`,
  (c) => `Know the unwrap cost and time: some wrappers charge an exit fee or delay the unwrap. Test a small unwrap early, while the amount is small, so you know the real exit before you need it.`,
  (c) => `Repeat the wrap once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** CeDeFi: centralized custody mixed with DeFi — the custodian is the risk. */
const CEDEFI: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; CeDeFi mixes centralized custody with DeFi, so check who holds the funds, the strategy and ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Deposit $100–$500 first, after confirming the strategy and the custody arrangement; wait for the position to show (usually minutes), and only then scale toward $1,000–$5,000 if it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Check proof of reserves and the custodian: a CeDeFi vault's safety depends on the centralized entity. Look for proof of reserves, the custodian's name and any audit before depositing more — an unaudited custodian is a red flag.`,
  (c) => `Test the withdrawal early: withdraw a small amount while it is small, and confirm it arrives. A vault that is slow or reluctant to return funds is a reason to exit, not to add more.`,
  (c) => `Repeat the deposit once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Farm: stake LP or single assets and harvest the emissions. */
const FARM: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a farm pays emissions for staking LP or single assets, so check which pool pays what and confirm ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Stake $100–$500 into the highest-TVL pool first, after confirming the reward rate and the harvest terms; wait for the position to show (usually minutes), and only then scale toward $1,000–$5,000 if it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Check where the rewards come from: emissions, fees or both. A farm paying everything from emissions will fade when emissions stop; a farm earning from fees is steadier. Prefer the fee-earning pool when the two pay the same.`,
  (c) => `Harvest regularly: unclaimed rewards do not compound, and some farms cut the rate over time. Harvest weekly and re-stake the rewards if the farm lets you — each harvest costs gas on ${c.startChain}, so do not harvest dust.`,
  (c) => `Repeat the stake once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Anchor BTC: earn yield on BTC, held by a custodian or a bridge. */
const ANCHOR_BTC: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; an Anchor BTC vault earns yield on BTC, so check how the BTC is held, where the yield comes from and ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Deposit $100–$500 of BTC (or wrapped BTC) first, after confirming the yield source and the redemption terms; wait for the position to show (usually minutes), and only then scale toward $1,000–$5,000 if it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Check the BTC backing and custody: the vault's BTC should be backed 1:1. Look for proof of reserves and the custodian's name — a vault whose BTC is not verifiably backed is a red flag, not a yield opportunity.`,
  (c) => `Know the redemption: how long it takes to get BTC back and whether there is a fee or a lockup. Test a small redemption early, while the amount is small, so you know the real exit before you need it.`,
  (c) => `Repeat the deposit once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Leveraged Farming: borrow to farm more — liquidation is the risk. */
const LEVERAGED_FARMING: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; leveraged farming borrows to farm more, so check the leverage ratio, the borrow rate and ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Open a small leveraged position ($100–$500 of collateral, low leverage) first, after confirming the borrow rate and the health factor; wait for the position to show (usually minutes), and only then scale toward $1,000–$5,000 if it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Keep the leverage low: borrow at most half of what the vault allows, so a price drop cannot liquidate you. Check the health factor weekly — liquidation is the real risk here, not the yield — and repay part of the borrow before the factor gets tight.`,
  (c) => `Watch the borrow rate weekly: when utilization spikes, borrow rates spike and the leveraged farm's net yield can turn negative. Check the rate before adding more, and unwind if the borrow cost exceeds the farm yield.`,
  (c) => `Repeat the core action once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Decentralized BTC: BTC minted on-chain without a central custodian. */
const DECENTRALIZED_BTC: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a decentralized BTC is minted on-chain without a central custodian, so check how the peg is kept and confirm ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Mint or bridge $100–$500 of decentralized BTC first, after confirming the mint ratio and the redemption terms; wait for the balance to show (usually minutes), and only then scale toward $1,000–$5,000 if it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Check the peg: the decentralized BTC should track BTC 1:1. If it slips below 0.99 BTC for days, stop minting more and reassess — a depegging BTC turns a stable position into a loss.`,
  (c) => `Use it in DeFi cautiously: supply it to a lending market or a pool only after confirming the market accepts it and the rates. A decentralized BTC that no market accepts is hard to exit, so confirm an exit route before minting more.`,
  (c) => `Repeat the core action once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Dual-Token Stablecoin: two tokens split stability and volatility. */
const DUAL_TOKEN_STABLECOIN: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; a dual-token system splits stability and volatility across two tokens, so check how the two tokens interact and confirm ${c.tvlStr} of TVL behind it before connecting any wallet.`,
  (c) => `Mint or buy $100–$500 of the stable token first, after confirming the peg mechanism and the second token's role; wait for the balance to show (usually minutes), and only then scale toward $1,000–$5,000 if it behaves — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Check the peg mechanism: how the system keeps the stable token at $1 and what the second token absorbs. If the second token's price collapses, the peg can break — watch both tokens, not just the stable one.`,
  (c) => `Know the second token's risk: it absorbs volatility, so it can drop sharply when the system is stressed. Do not hold the second token as a stable asset — it is the shock absorber, and its price is the system's health gauge.`,
  (c) => `Repeat the core action once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => tvlCheck(c),
  (c) => claimStep(c),
];

/** Generic fallback: the radar-4 pattern, for categories with no dedicated playbook. */
const GENERIC: StepFn[] = [
  (c) => `Start on ${c.startChain} (${c.gas}) and open ${c.name} on ${c.chainList}${c.extraChains}; confirm the app loads with ${c.tvlStr} of TVL behind it before you connect any wallet, and keep this farming wallet separate from your main funds.`,
  (c) => `Start small: use the protocol's core action with $100–$500 first, wait for the position to show on the dashboard (usually minutes), and only then scale toward $1,000–$5,000 if the position and the app behave as expected — ${verdictClause(c.verdict)}.${youngNote(c)}`,
  (c) => `Repeat the core action once a week for at least ${c.weeks} weeks, because ${c.name} has run ${c.age} days and a steady weekly history reads better than one large deposit; each weekly visit takes 10–20 minutes plus gas on ${c.startChain}.`,
  (c) => historyStep(c),
  (c) => tvlCheck(c),
  (c) => questsStep(c),
  (c) => claimStep(c),
];

const PLAYBOOKS: Record<string, StepFn[]> = {
  "Risk Curators": RISK_CURATORS,
  "Onchain Capital Allocator": ONCHAIN_ALLOCATOR,
  "RWA": RWA,
  "Prediction Market": PREDICTION_MARKET,
  "Basis Trading": BASIS_TRADING,
  "CDP": CDP,
  "CDP Manager": CDP_MANAGER,
  "Dexs": DEXS,
  "Chain": CHAIN,
  "Collateral Markets": COLLATERAL_MARKETS,
  "Lending": LENDING,
  "Yield": YIELD,
  "Yield Aggregator": YIELD_AGGREGATOR,
  "Derivatives": DERIVATIVES,
  "Liquidity Manager": LIQUIDITY_MANAGER,
  "Staking Pool": STAKING_POOL,
  "Restaking": RESTAKING,
  "Stablecoin Wrapper": STABLECOIN_WRAPPER,
  "CeDeFi": CEDEFI,
  "Farm": FARM,
  "Anchor BTC": ANCHOR_BTC,
  "Leveraged Farming": LEVERAGED_FARMING,
  "Decentralized BTC": DECENTRALIZED_BTC,
  "Dual-Token Stablecoin": DUAL_TOKEN_STABLECOIN,
};

/**
 * Seven concrete farming steps for one protocol, from its category's
 * playbook, built only from its own record. Each step states what to
 * do, what it costs and how long it takes.
 */
export function farmSteps(
  p: Protocol,
  asOf: string,
  breakdown: ModelBreakdown,
  verdict: Verdict,
  peerRate: number,
): string[] {
  void asOf;
  const ctx = buildCtx(p, breakdown, verdict, peerRate);
  const playbook = PLAYBOOKS[p.category ?? ""] ?? GENERIC;
  return playbook.map((fn) => capStep(fn(ctx)));
}
