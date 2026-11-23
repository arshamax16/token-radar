// Token Radar entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot, scores every pre-token protocol with the
// radar-8 model in lib/model.ts (Huber power-law fit on board-eligible
// token protocols + category and chain factors, token odds from the
// peers' launch record, an honest implied-value range from the model's
// own held-out errors, per-category farm playbooks in lib/plans.ts),
// and writes the ranked board, the dashboard data, the dashboard
// files, the screenshots and dossier.json into the output directory.
// Run twice, it must write identical bytes.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildBoard, boardIssues, dataScript, fitModel, accountProtocols } from "./lib/model.ts";
import type { Snapshot } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function fail(message: string): never {
  console.error(`token-radar: ${message}`);
  process.exit(1);
}

function flagValue(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  if (i === -1 || i + 1 >= argv.length) return null;
  return argv[i + 1]!;
}

function isImage(bytes: Buffer): boolean {
  const png = PNG_MAGIC.every((b, i) => bytes[i] === b);
  const jpg = JPEG_MAGIC.every((b, i) => bytes[i] === b);
  return png || jpg;
}

function main(): void {
  const argv = process.argv.slice(2);
  const input = flagValue(argv, "--input") ?? "/input/snapshot.json";
  const output = flagValue(argv, "--output") ?? process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  const outDir = resolve(output);

  let raw: string;
  try {
    raw = readFileSync(resolve(input), "utf8");
  } catch {
    fail(`cannot read snapshot at ${input}`);
  }
  let snap: Snapshot;
  try {
    snap = JSON.parse(raw!) as Snapshot;
  } catch {
    fail(`snapshot at ${input} is not valid JSON`);
  }
  if (!Array.isArray(snap!.protocols) || !Array.isArray(snap!.watchlist)) {
    fail("snapshot is missing protocols or watchlist");
  }

  // The value model calibrates itself from the snapshot's own token
  // protocols before it scores anything pre-token. fitModel also runs
  // the program's own held-out validation and the 758-protocol
  // accounting, so the board can answer its own checks on the cover.
  const meta = fitModel(snap!);
  const accounting = accountProtocols(snap!);
  const rows = buildBoard(snap!, meta);
  // A watchlist slug the snapshot never names is a data problem, not a
  // board problem: fail loudly instead of silently covering 39 of 40.
  const known = new Set(snap!.protocols.map((p) => p.slug));
  const missingWatch = snap!.watchlist.filter((s) => !known.has(s));
  if (missingWatch.length > 0) fail(`watchlist names unknown slugs: ${missingWatch.join(", ")}`);
  const issues = boardIssues(snap!, rows);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`token-radar: gate issue: ${issue}`);
    fail(`board failed validation with ${issues.length} issue(s)`);
  }

  mkdirSync(outDir, { recursive: true });
  const dashSrc = resolve(import.meta.dirname, "dashboard");
  const shotsSrc = resolve(import.meta.dirname, "screenshots");
  if (!existsSync(join(dashSrc, "index.html"))) fail("dashboard/index.html is missing");
  if (!existsSync(join(shotsSrc))) fail("screenshots/ is missing");

  const shots = readdirSync(shotsSrc)
    .filter((n) => !n.startsWith("."))
    .sort();
  if (shots.length < 3) fail(`screenshots/ holds ${shots.length} images, need at least 3`);
  for (const name of shots) {
    const bytes = readFileSync(join(shotsSrc, name));
    if (!isImage(bytes)) fail(`screenshots/${name} is not a whole PNG or JPEG`);
    if (bytes.length > 512 * 1024) fail(`screenshots/${name} is over the 512 KiB cap`);
  }

  writeFileSync(join(outDir, "board.json"), `${JSON.stringify({ rows }, null, 2)}\n`, "utf8");
  const boardBytes = statSync(join(outDir, "board.json")).size;
  if (boardBytes > 8 * 1024 * 1024) fail(`board.json is ${boardBytes} bytes, over the 8 MiB cap`);
  writeFileSync(join(outDir, "data.js"), dataScript(snap!, rows, meta, accounting), "utf8");
  cpSync(dashSrc, join(outDir, "dashboard"), { recursive: true });
  cpSync(shotsSrc, join(outDir, "screenshots"), { recursive: true });

  // Dossier last: it is built from exactly what was just written.
  const dossier = buildDossier(outDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  writeFileSync(join(outDir, "dossier.json"), dossier);
  const dossierBytes = statSync(join(outDir, "dossier.json")).size;
  if (dossierBytes > 1.5 * 1024 * 1024) fail(`dossier.json is ${dossierBytes} bytes, over the 1.5 MiB cap`);
  if (!existsSync(join(outDir, "dashboard", "index.html"))) fail("dashboard/index.html did not copy to the output");

  const watchRows = rows.filter((r) => snap!.watchlist.includes(r.slug)).length;
  const v = meta.validation;
  console.log(
    `token-radar: ${snap!.protocols.length} protocols, ${watchRows} watchlist rows, ${rows.length} rows scored, ` +
      `model radar-8 fit on ${meta.calibration_n} token protocols (A=${meta.intercept.toFixed(3)}, B=${meta.exponent.toFixed(3)}), ` +
      `top implied $${rows[0]!.implied_value_usd.toLocaleString("en-US")}, ` +
      `self-check CV ${v.cv_median_log_err.toFixed(3)} (within 2x ${v.cv_within2x_pct.toFixed(1)}%), ` +
      `LOO ${v.loo_median_log_err.toFixed(3)}, walk-forward old->young ${v.walk_old_young_median_log_err.toFixed(3)}`,
  );
}

main();
