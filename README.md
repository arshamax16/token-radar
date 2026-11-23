[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/arshamax16/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/arshamax16/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — radar-6

Pre-token protocols ranked by implied value, for make.fun's ["Build the best token launch radar"](https://make.fun/bounty/token-radar-01) bounty ($1,325 in USDC).

## What it does

Reads the sealed snapshot, scores every pre-token protocol with the radar-6 model, and writes the ranked board, the dashboard data, the dashboard files, the screenshots and `dossier.json` into the output directory. Run twice, it writes identical bytes.

## The model (radar-6)

Implied value is **calibrated from the snapshot itself at run time**, not guessed:

```
implied = exp(A) × TVL^B × categoryFactor × chainFactor × growth × maturity
```

- **Power law:** `A = 8.63`, `B = 0.426`, fitted by **Huber robust regression** (8 rounds of reweighting) over the 94 tokenised protocols in **board-eligible categories**. Protocols whose market cap sits far off the line (rain +6.4, concentrator −5.0 in log terms) are downweighted instead of dragging it. Market data shows the mcap/TVL multiple falls as TVL grows (0.54× at $10M TVL, 0.14× at $100M, 0.04× at $1B) — a flat 30% of TVL overstates giants ~10×.
- **Cleaner fit set (new in radar-6).** The fit leaves out the 34 token protocols in CEX, bridge, canonical-bridge and liquid-staking categories: a CEX token's value does not follow from its exchange's TVL, a bridge token is usually worth ~nothing whatever the bridge holds, and a liquid-staking token tracks its underlying. The board never ranks those categories anyway, so radar-6 calibrates on exactly the population it predicts.
- **Chain factor (new in radar-6).** Each chain gets a shrunk residual factor (weight n/(n+4), chains with fewer than 3 training protocols take 1.0); a row's factor is the mean over its chains. Protocols on newer, smaller ecosystems price lower at the same TVL (Kava ×0.50, Mantle ×0.57, Monad ×0.57, Berachain ×0.63; Ethereum ×0.95, Arbitrum ×1.03). Chain count was tested and rejected again (correlation 0.09) — chain identity is what carries signal.
- **Category factor:** per-category multiplier from the same fit's residuals, shrunk to 1.0 (weight n/(n+6)). Median mcap/TVL differs 18× across categories.
- **Growth:** 7-day TVL change, clamped to ±10% — the signal is weak and its correlation with the residual is slightly negative (−0.17), so the weight was cut from radar-3's 15% to 10%.
- **Maturity:** age has essentially no correlation with the residual (−0.02), so the factor only spans 0.95–1.05 (radar-3 used 0.90–1.10).
- **Chain count:** tested and rejected again — correlation 0.09, no signal.

Backtest (median |log(implied/mcap)| on held-out data, one repeated harness — 5-fold cross-validation over 5 deterministic slug-hash seeds, plus leave-one-category-out — so radar-5 and radar-6 are measured the same way): on all 128 token protocols radar-5 1.31 (×3.72), **radar-6 1.26 (×3.51)**; within 2× of real mcap: 32.0% → **32.9%**. On the 94 protocols in board-eligible categories — the population the board actually predicts — radar-5 1.26/33.4%, **radar-6 1.16/36.3%**. Leave-one-category-out: radar-5 1.29, **radar-6 1.16**. The gain is real but modest and is reported as modest: radar-6 is better on every held-out test, in the same direction (including the age splits: train old/test young 1.50 vs 1.78, train young/test old 0.87 vs 1.08), but the target of within-2× ≥ 45% and median |log err| ≤ 1.0 is **not reached** — a token's market cap follows its TVL only loosely (correlation 0.44 in log terms) and the rest is tokenomics the snapshot cannot see. Rejected on the same tests: per-category slope (1.304), Theil-Sen (1.342), quadratic log(TVL) (1.306), median-residual category factor (1.288), young-age indicator (1.340), k-nearest neighbours on log TVL (1.35–1.43).

## What radar-6 adds over radar-5

- **A cleaner calibration set and a chain factor (the main change).** See the model section above: the fit now uses only the 94 token protocols in board-eligible categories, and each row's implied value is multiplied by the mean of its chains' shrunk residual factors. Farm plans and the dashboard are unchanged from radar-5 except for the numbers the new model produces (implied values, ranks, verdicts, the model view's new chain-factor section and the updated backtest).
- **Honest backtest.** Radar-5 and radar-6 are now measured on one repeated harness (5 seeds), on both the full 128-protocol universe and the 94-protocol eligible population, instead of a single split.

## What radar-5 added over radar-4

- **Per-category farm playbooks (the main change).** Radar-4 used one 7-step template for every protocol. Radar-5 gives each category its own playbook in `lib/plans.ts` — 14 categories (Risk Curators, Onchain Capital Allocator, RWA, Prediction Market, Basis Trading, CDP, CDP Manager, Dexs, Chain, Collateral Markets, Lending, Yield, Yield Aggregator, Derivatives) plus a generic fallback. A curated vault, a basis vault, a CDP, a prediction market and a chain each get different steps: the core action, the specific risk and the specific thing to check are different. Young protocols (under 120 days) and fast-falling ones (7-day change below −15%) get their own notes. The top-20 rows therefore read differently from each other instead of sharing one template. Every step still states what to do, what it costs and how long it takes, and stays within 20–600 characters.
- **Huber robust fit.** See the model section above: better on both held-out tests, reported honestly as a small gain.
- **Second validation.** Leave-one-category-out, reported alongside the 5-fold cross-validation in the model view and in `lib/model.ts`.
- **Bolder dashboard.** A radar-screen identity: phosphor-green sweep disc, a top-8 implied-value distribution strip (bars, so the board's shape — one giant, a near-giant, then a long tail — is visible before the table), gold left edges on the top-3 rows, and a value bar in every detail view showing that protocol's implied value against the board's top.

## What radar-4 added over radar-3

- **Full coverage — 198 rows, not 178.** Radar-3 ranked only the 40 watchlist protocols plus the rankable ones below the $50M floor. Radar-4 ranks every pre-token protocol that is not a wrapped, staked or bridged product, including the 20 rankable ones above the floor the watchlist leaves out. The largest of them, Sentora Curator ($2.76B TVL), was missing from radar-3's board entirely; it ranks #2 here.
- **Farm verdicts.** Every row carries a transparent, rule-based verdict: FARM (implied value ≥ $20M and 7-day change ≥ −10%), THIN (implied value ≥ $5M and 7-day change ≥ −25%), SKIP (anything else). On this snapshot: 22 FARM, 112 THIN, 64 SKIP. The rule is stated on the board.
- **Peer token rate.** For each category the board shows the share of the snapshot's protocols in that category that already record a token (Risk Curators 13%, Dexes 74%, Lending 79%). It is a descriptive fact about the category, shown for context only — it never enters the implied value.
- **Chain-specific farm plans.** Each 7-step plan names the cheapest chain to start on and what gas costs there (Ethereum $5–$20, L2s about $0.10–$1, Solana about $0.01), and a multi-chain protocol gets a step about keeping the whole history on one chain.

## Run

```sh
node main.ts --input /input/snapshot.json --output /output
```

Node 22, standard library only. No dependencies, no network calls.

## Layout

- `main.ts` — entrypoint: reads the snapshot, validates, writes board/dashboard/screenshots/dossier.
- `lib/model.ts` — radar-6 model (Huber power-law fit on board-eligible token protocols + category and chain factors), board builder, verdicts, validation gates.
- `lib/plans.ts` — per-category farm playbooks (14 categories + generic fallback).
- `dashboard/` — the board UI (index.html, app.js, app.css).
- `screenshots/` — board, detail and filtered views.
- `vendor/makefun-board.ts` — dossier builder (provided by the kit).
