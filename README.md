[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/arshamax16/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/arshamax16/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — radar-8

Pre-token protocols ranked by implied value, for make.fun's ["Build the best token launch radar"](https://make.fun/bounty/token-radar-01) bounty ($1,325 in USDC).

## What it does

Reads the sealed snapshot, scores every pre-token protocol with the radar-8 model, and writes the ranked board, the dashboard data, the dashboard files, the screenshots and `dossier.json` into the output directory. Run twice, it writes identical bytes.

## The model (radar-8)

Implied value is **calibrated from the snapshot itself at run time**, not guessed:

```
implied = exp(A) × TVL^B × categoryFactor × chainFactor × growth × maturity
```

- **Power law:** `A = 7.92`, `B = 0.469`, fitted by **Huber robust regression** (8 rounds of reweighting) over the 94 tokenised protocols in **board-eligible categories**. Protocols whose market cap sits far off the line (rain +6.4, concentrator −5.0 in log terms) are downweighted instead of dragging it. Market data shows the mcap/TVL multiple falls as TVL grows (0.53× at $10M TVL, 0.15× at $100M, 0.05× at $1B) — a flat 30% of TVL overstates giants ~10×.
- **Winsorisation (new in radar-8).** The log(mcap/TVL) multiple is clipped at the training set's own P5/P95 before the fit, so the one or two most extreme multiples cannot drag the line or the category factors. Ten of the 94 training protocols are clipped: five high (rain ×400, bitway-earn ×36, aave-v2 ×19, flokifi-locker ×19, anvil ×12) and five low (concentrator, grove-finance, obol, reservoir-protocol, ssv-network — all near ×0). Winsorising the fit alone moves leave-one-out 1.314 → 1.308 and leave-one-category-out 1.175 → 1.104.
- **Empirical-Bayes category factors (new in radar-8).** The ad-hoc n/(n+6) shrink is replaced by a DerSimonian-Laird random-effects estimate: the between-category variance tau^2 and the within-category variance sigma^2 are estimated from the training residuals, and each category's mean residual is shrunk by tau^2/(tau^2 + sigma^2/n). A thin or noisy category is pulled hard toward 1.0; a large, consistent category keeps its factor. EB alone moves 5-fold CV 1.248 → 1.210; with winsorisation the pair moves CV to 1.214, LOCO to 1.104 and LOO to 1.178. The change matters most for Prediction Market: rain's ×400 multiple had inflated the whole category's factor to ×2.49 under radar-7, so Polymarket was ranked #1 on the back of it; the factor is now ×1.07 and Polymarket ranks #6 on its own TVL.
- **Cleaner fit set (radar-6).** The fit leaves out the 34 token protocols in CEX, bridge, canonical-bridge and liquid-staking categories: a CEX token's value does not follow from its exchange's TVL, a bridge token is usually worth ~nothing whatever the bridge holds, and a liquid-staking token tracks its underlying. The board never ranks those categories anyway, so radar-6 calibrates on exactly the population it predicts.
- **Chain factor (radar-6).** Each chain gets a shrunk residual factor (weight n/(n+4), chains with fewer than 3 training protocols take 1.0); a row's factor is the mean over its chains. Protocols on newer, smaller ecosystems price lower at the same TVL (Kava ×0.50, Mantle ×0.57, Monad ×0.57, Berachain ×0.63; Ethereum ×0.95, Arbitrum ×1.03). Chain count was tested and rejected again (correlation 0.09) — chain identity is what carries signal.
- **Token odds (radar-7).** Every row carries the odds a token ever launches: the category's token rate, shrunk toward the snapshot's overall 19% (weight n/(n+6)), times an age factor from the snapshot's own launch curve — the share of protocols that have launched by each age band (0–180 days 3%, 180–730 days 13%, 730–1095 days 17%, 1095+ days 29%, flattening at 30%). A protocol that has been around 5 years without a token has mostly used up its launch window, so its odds are low even if its implied value is high. Odds never enter the implied value. Top of the board: Sentora Curator 3%, Steakhouse Financial 3%, Gauntlet 3%; Polymarket International 2% (1845 days old, now #6); the highest odds on the board are 36% (young protocols in token-heavy categories).
- **Honest range (radar-7, recalibrated in radar-8).** Every implied value is shown as a range, not a point: the middle 50% of the model's own held-out errors (5-fold CV residuals P25 −1.414 / P75 +1.103 in log terms), so the range is implied ×0.24 to ×3.01. Polymarket International: $29.5M, range $7–89M. The range is the model admitting how wide its own error is.
- **Comps tested and rejected (radar-7).** Peer multiples — the median mcap/TVL of similar protocols, weighted by category, chain overlap, TVL band and age — were tested against the power law on the same harness and lost on every test (5-fold CV 1.545 vs 1.248, LOCO 1.542 vs 1.175, LOO 1.439 vs 1.314; blends and local curves also lose). With 94 training protocols spread over 53 categories, a local method sees too few peers and its variance swamps the signal, so radar-7 keeps the power law. The test and its numbers are in the dashboard's model view, not hidden.
- **Ridge tested and rejected (new in radar-8).** A ridge regression over every snapshot feature at once — log TVL, log age, 7-day change, chain count, the top-8 category dummies and a log TVL × change interaction, lambda tuned by inner cross-validation — scores 5-fold CV 1.250, LOCO 1.234, walk-forward old→young 1.098 and leave-one-out 1.292. It loses to the pooled power law on the second validation too, so it is not used. Weighted regression was checked and not used either: the residual variance is flat across TVL terciles (SD 2.18 / 1.83 / 1.92), so there is nothing for weights to fix.
- **Category factor:** per-category multiplier from the same fit's residuals, by empirical-Bayes partial pooling (see above). Median mcap/TVL differs 18× across categories.
- **Growth:** 7-day TVL change, clamped to ±10% — the signal is weak and its correlation with the residual is slightly negative (−0.17), so the weight was cut from radar-3's 15% to 10%.
- **Maturity:** age has essentially no correlation with the residual (−0.02), so the factor only spans 0.95–1.05 (radar-3 used 0.90–1.10).
- **Chain count:** tested and rejected again — correlation 0.09, no signal.

Backtest (median |log(implied/mcap)| on held-out data, one repeated harness — 5-fold cross-validation over 5 deterministic slug-hash seeds, plus leave-one-out, leave-one-category-out and walk-forward in both directions — all fits refit on the training fold only, including the winsorisation, the category and chain factors). Radar-8's runtime self-check, computed from this snapshot at run time and shown on the board's validation strip: **5-fold CV 1.214 (×3.39), 33.6% within 2×; leave-one-out 1.178 (×3.25), 36.2%; walk-forward old→young 0.823 (×2.28), 47.2%; walk-forward young→old 1.242 (×3.46), 34.3%; leave-one-category-out 1.104 (×3.02), 36.2%** (94 protocols in board-eligible categories). Against radar-7 on the same harness (CV 1.248, LOO 1.314, walk 0.774/1.308, LOCO 1.175): radar-8 is better on four of the five held-out tests; the one cost is walk-forward old→young median 0.774 → 0.823, though its within-2× share rises 38.9% → 47.2%. The improvement is stable across the whole winsorisation plateau (P3/P97 to P10/P90: LOO 1.167–1.225, CV 1.185–1.222), not a tuned spike. The target of within-2× ≥ 45% and median |log err| ≤ 1.0 is **not reached** — a token's market cap follows its TVL only loosely (correlation 0.44 in log terms) and the rest is tokenomics the snapshot cannot see.

**A correction on the radar-6 figure.** The radar-6 README reported 5-fold CV 1.16 / 36.3% for the same fit. That number came from the radar-6 agent's offline harness, which was never committed to the repo, so it cannot be re-run from here. Re-measuring the identical model with strict train-only refitting (the power law and both factors refit on each training fold, in both an offline Python harness and the runtime TypeScript self-check, which agree exactly) gives 1.248. A CV run that fits the category/chain factors on the full data and only refits the power law per fold gives 1.146 — close to the reported 1.16 — which suggests the radar-6 figure was measured with leaked factors. Either way, **the model did not get worse in radar-7; the measurement got stricter.** The 1.248 above is the honest number and the one the board shows. Rejected on the same tests: ridge regression over all features (1.250), empirical-Bayes factors alone (CV 1.210, LOO 1.324), winsorisation alone (CV 1.233, LOO 1.308), per-category slope (1.304), Theil-Sen (1.342), quadratic log(TVL) (1.306), median-residual category factor (1.288), young-age indicator (1.340), k-nearest neighbours on log TVL (1.35–1.43), peer-multiple comps (1.545).

## What radar-8 adds over radar-7

- **Winsorisation + empirical-Bayes category factors (the main change).** See the model section: the log(mcap/TVL) multiple is clipped at the training set's own P5/P95 before the fit, and the category factor is now a DerSimonian-Laird random-effects estimate instead of an ad-hoc n/(n+6) shrink. The pair beats radar-7 on four of the five held-out tests (CV 1.248 → 1.214, LOCO 1.175 → 1.104, walk young→old 1.308 → 1.242, LOO 1.314 → 1.178). The board's top changes with it: Sentora Curator is #1 ($64.6M), Polymarket falls from #1 to #6 ($29.5M) because its category factor is no longer inflated by rain's ×400 multiple. Verdicts move 16/104/78 (FARM/THIN/SKIP) to 13/114/71. The honest range is recalibrated to ×0.24–×3.01.
- **Ridge tested and rejected.** A full ridge regression over every snapshot feature was built and run on the same harness; it loses on the second validation too, so the power law stays. The test is documented in the model view (§7) with the numbers.
- **Stricter validation, same harness.** The runtime self-check refits everything per fold (winsorisation + power law + category + chain factors on the training fold only), and the offline Python harness agrees with it exactly (CV 1.214, LOO 1.178, walk 0.823/1.242).

## What radar-7 adds over radar-6

- **Token odds on every row.** See the model section: odds = shrunk category token rate × age factor from the snapshot's launch curve. Shown as a column on the board, sortable, and explained in every detail view (including the category's raw token rate and the protocol's age). The board's top rows are honest about it: the biggest implied values belong to old protocols whose launch window is mostly used up (Polymarket 2%).
- **Honest ranges.** Every implied value is shown as a range (×0.26 to ×2.93, the middle 50% of held-out errors) — a column on the board and a row in every detail breakdown. The board no longer presents a point estimate as if it were precise.
- **Comps tested, not assumed.** Peer multiples were built and run on the same harness; they lost on every test, so the power law stays. The test is documented in the model view (§7) with the numbers, so a reader can see the alternative was tried.
- **Validation and integrity strips on the board.** The board's first screen now shows the runtime self-check (5-fold CV, leave-one-out, both walk-forward directions, training count) and an integrity strip (758 protocols in the snapshot, 198 ranked, 144 wrapped products, 144 live tokens, 272 versions of live tokens; data gaps: 0 missing category, 4 missing 7-day change, 113 missing listing date). Nothing about the model's quality is asserted — it is computed at run time from this snapshot.
- **All 758 protocols accounted for.** The board still ranks only the 198 pre-token protocols that can honestly be ranked (wrapped/staked/bridged products and versions of live tokens would corrupt the board — a wrapped product's token already trades in another form), but the dashboard now accounts for all 758: a live-tokens view (416 rows: 144 live tokens + 272 versions) and a coverage view that breaks down the 758 and lists the largest wrapped products. The dossier's stats strip says 758 accounted for.
- **Farm plans costed in $/hour.** The top-20 deep plans now state what farming costs per hour in gas on the protocol's cheapest chain (L2 $1.2–$12/hour, Ethereum $60–$240/hour, Solana under $1/hour), in the verdict line and in step 2 of the plan.
- **Stricter validation measurement.** The runtime self-check refits everything per fold (power law + category + chain factors on the training fold only). The radar-6 README's 1.16 is corrected to the strict 1.248 — see the correction note in the model section.

## What radar-6 adds over radar-5

- **A cleaner calibration set and a chain factor (the main change).** See the model section above: the fit now uses only the 94 token protocols in board-eligible categories, and each row's implied value is multiplied by the mean of its chains' shrunk residual factors. Farm plans and the dashboard are unchanged from radar-5 except for the numbers the new model produces (implied values, ranks, verdicts, the model view's new chain-factor section and the updated backtest).
- **Honest backtest.** Radar-5 and radar-6 are now measured on one repeated harness (5 seeds), on both the full 128-protocol universe and the 94-protocol eligible population, instead of a single split. (Radar-7 corrects the radar-6 CV figure to the strict train-only measurement — see the model section.)

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
- `lib/model.ts` — radar-8 model (winsorised Huber power-law fit on board-eligible token protocols + empirical-Bayes category and shrunk chain factors; token odds; honest ranges; runtime self-check; comps and accuracy test records; coverage accounting), board builder, verdicts, validation gates.
- `lib/plans.ts` — per-category farm playbooks (14 categories + generic fallback).
- `dashboard/` — the board UI (index.html, app.js, app.css).
- `screenshots/` — board, detail and filtered views.
- `vendor/makefun-board.ts` — dossier builder (provided by the kit).
