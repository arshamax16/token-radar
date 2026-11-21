[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/arshamax16/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/arshamax16/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — radar-4

Pre-token protocols ranked by implied value, for make.fun's ["Build the best token launch radar"](https://make.fun/bounty/token-radar-01) bounty ($1,325 in USDC).

## What it does

Reads the sealed snapshot, scores every pre-token protocol with the radar-4 model, and writes the ranked board, the dashboard data, the dashboard files, the screenshots and `dossier.json` into the output directory. Run twice, it writes identical bytes.

## The model (radar-4)

Implied value is **calibrated from the snapshot itself at run time**, not guessed:

```
implied = exp(A) × TVL^B × categoryFactor × growth × maturity
```

- **Power law:** `A = 6.965`, `B = 0.522`, fitted by OLS over the 128 tokenised protocols in the snapshot. Market data shows the mcap/TVL multiple falls as TVL grows (0.48× at $10M TVL, 0.16× at $100M, 0.05× at $1B) — a flat 30% of TVL overstates giants ~10×.
- **Category factor:** per-category multiplier from the same fit's residuals, shrunk to 1.0 (weight n/(n+6)). Median mcap/TVL differs 18× across categories.
- **Growth:** 7-day TVL change, clamped to ±10% — the signal is weak and its correlation with the residual is slightly negative (−0.14), so the weight was cut from radar-3's 15% to 10%.
- **Maturity:** age has essentially no correlation with the residual (−0.02), so the factor only spans 0.95–1.05 (radar-3 used 0.90–1.10).
- **Chain count:** tested and rejected — correlation 0.09, no signal.

Backtest (5-fold cross-validation, deterministic split by slug hash, median |log(implied/mcap)| on held-out folds): radar-3 error ×3.61 → **radar-4 error ×3.54**. Within 2× of real mcap: 33.6% → **35.2%**. The gain is small; the honest read is that growth and age carry almost no signal, and the power law plus the shrunk category factor do the work.

## What radar-4 adds over radar-3

- **Full coverage — 198 rows, not 178.** Radar-3 ranked only the 40 watchlist protocols plus the rankable ones below the $50M floor. Radar-4 ranks every pre-token protocol that is not a wrapped, staked or bridged product, including the 20 rankable ones above the floor the watchlist leaves out. The largest of them, Sentora Curator ($2.76B TVL), was missing from radar-3's board entirely; it ranks #2 here.
- **Farm verdicts.** Every row carries a transparent, rule-based verdict: FARM (implied value ≥ $20M and 7-day change ≥ −10%), THIN (implied value ≥ $5M and 7-day change ≥ −25%), SKIP (anything else). On this snapshot: 22 FARM, 112 THIN, 64 SKIP. The rule is stated on the board.
- **Peer token rate.** For each category the board shows the share of the snapshot's protocols in that category that already record a token (Risk Curators 13%, Dexes 74%, Lending 79%). It is a descriptive fact about the category, shown for context only — it never enters the implied value.
- **Chain-specific farm plans.** Each 7-step plan names the cheapest chain to start on and what gas costs there (Ethereum $5–$20, L2s about $0.10–$1, Solana about $0.01), and a multi-chain protocol gets a step about keeping the whole history on one chain.
- **Dashboard polish.** A six-tile KPI strip (ranked count, watchlist covered, floor, top implied value, calibration size, FARM count), a verdict column with badges and a verdict filter, a shorter introduction, and a model view that shows the fit, every category factor, the verdict rule and the backtest.

## Run

```sh
node main.ts --input /input/snapshot.json --output /output
```

Node 22, standard library only. No dependencies, no network calls.

## Layout

- `main.ts` — entrypoint: reads the snapshot, validates, writes board/dashboard/screenshots/dossier.
- `lib/model.ts` — radar-4 model, board builder, farm plans, validation gates.
- `dashboard/` — the board UI (index.html, app.js, app.css).
- `screenshots/` — board, detail and filtered views.
- `vendor/makefun-board.ts` — dossier builder (provided by the kit).
