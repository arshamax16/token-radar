[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/arshamax16/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/arshamax16/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — radar-3

Pre-token protocols ranked by implied value, for make.fun's ["Build the best token launch radar"](https://make.fun/bounty/token-radar-01) bounty ($1,325 in USDC).

## What it does

Reads the sealed snapshot, scores every pre-token protocol with the radar-3 model, and writes the ranked board, the dashboard data, the dashboard files, the screenshots and `dossier.json` into the output directory. Run twice, it writes identical bytes.

## The model (radar-3)

Implied value is **calibrated from the snapshot itself at run time**, not guessed:

```
implied = exp(A) × TVL^B × categoryFactor × growth × maturity
```

- **Power law:** `A = 6.965`, `B = 0.522`, fitted by OLS over the 128 tokenised protocols in the snapshot. Market data shows the mcap/TVL multiple falls as TVL grows (0.48× at $10M TVL, 0.16× at $100M, 0.05× at $1B) — a flat 30% of TVL overstates giants ~10×.
- **Category factor:** per-category multiplier from the same fit's residuals, shrunk to 1.0 (weight n/(n+6)). Median mcap/TVL differs 18× across categories.
- **Growth:** 7-day TVL change, clamped to ±15% — the signal is weak (correlation −0.149), so it is kept small on purpose.
- **Maturity:** age barely matters (correlation −0.003), so the factor only spans 0.90–1.10.
- **Chain count:** removed — correlation −0.020, no signal.

Backtest (median |log(implied/mcap)| on the 128 tokenised protocols): radar-2 error ×4.76 → **radar-3 error ×3.03 (−29%)**. Within 2× of real mcap: 23% → **35%**. Within 3×: 35% → **50%**. Split-half cross-validation confirms the signal is real (power-law exponent 0.508 vs 0.520 across halves).

## Run

```sh
node main.ts --input /input/snapshot.json --output /output
```

Node 22, standard library only. No dependencies, no network calls.

## Layout

- `main.ts` — entrypoint: reads the snapshot, validates, writes board/dashboard/screenshots/dossier.
- `lib/model.ts` — radar-3 model, board builder, farm plans, validation gates.
- `dashboard/` — the board UI (index.html, app.js, app.css).
- `screenshots/` — board, detail and filtered views.
- `vendor/makefun-board.ts` — dossier builder (provided by the kit).
