/**
 * Verify cleared-override draft matches baseline construction points.
 * Run: npx tsx scripts/diag-aldrich-baseline-delta.ts
 */
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  trouserFrontPoints,
  trouserBackPoints,
  withWaistband,
  type TrouserFrontStyle,
  WAIST_DROP_MAX,
  DEFAULT_FRONT_CROTCH_EXTENSION_SCALE,
  DEFAULT_BACK_CROTCH_EXTENSION_SCALE,
  DEFAULT_CROTCH_ARRIVAL_ANGLE,
  DEFAULT_FRONT_WAIST_INSET,
  DEFAULT_BACK_CROTCH_DROP,
  DEFAULT_FRONT_CROTCH_FULLNESS,
  DEFAULT_BACK_CROTCH_FULLNESS,
  WAISTLINE_CURVE_FRONT,
} from "../lib/patterns/trouserBlock";
import { CLEO_PRESET } from "../lib/pattern/blockPresets";
import { execSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function clearedStyle(waistDrop: number): TrouserFrontStyle {
  return withWaistband({ bottomWidth: 220, waistDrop }, 0, "darted", body);
}

function explicitDefaultsStyle(waistDrop: number): TrouserFrontStyle {
  return withWaistband(
    {
      bottomWidth: 220,
      waistDrop,
      frontCrotchExtensionScale: DEFAULT_FRONT_CROTCH_EXTENSION_SCALE,
      backCrotchExtensionScale: DEFAULT_BACK_CROTCH_EXTENSION_SCALE,
      crotchArrivalAngle: DEFAULT_CROTCH_ARRIVAL_ANGLE,
      frontWaistInset: DEFAULT_FRONT_WAIST_INSET,
      backCrotchDrop: DEFAULT_BACK_CROTCH_DROP,
      frontCrotchFullness: DEFAULT_FRONT_CROTCH_FULLNESS,
      backCrotchFullness: DEFAULT_BACK_CROTCH_FULLNESS,
      waistlineCurveFront: WAISTLINE_CURVE_FRONT,
    },
    0,
    "darted",
    body,
  );
}

function constructionPoints(
  style: TrouserFrontStyle,
): { id: string; at: Point }[] {
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const out: { id: string; at: Point }[] = [];
  for (const [id, at] of Object.entries(f)) {
    out.push({ id: `F.${id}`, at: at as Point });
  }
  for (const [id, at] of Object.entries(b)) {
    out.push({ id: `B.${id}`, at: at as Point });
  }
  return out;
}

function maxDelta(
  a: { id: string; at: Point }[],
  b: { id: string; at: Point }[],
): { max: number; atId: string; nCompared: number } {
  const mapB = new Map(b.map((p) => [p.id, p.at]));
  let max = 0;
  let atId = "(none)";
  let nCompared = 0;
  for (const p of a) {
    const q = mapB.get(p.id);
    if (!q) continue;
    nCompared++;
    const d = Math.hypot(p.at.x - q.x, p.at.y - q.y);
    if (d > max) {
      max = d;
      atId = p.id;
    }
  }
  return { max, atId, nCompared };
}

console.log("Body hip", body.hip);

console.log("\n=== 1. Cleared overrides vs explicit DEFAULT_* (current HEAD) ===");
for (const drop of [0, WAIST_DROP_MAX]) {
  const { max, atId, nCompared } = maxDelta(
    constructionPoints(clearedStyle(drop)),
    constructionPoints(explicitDefaultsStyle(drop)),
  );
  console.log(
    `waistDrop=${drop}: maxΔ=${max.toFixed(6)} mm  at ${atId}  (n=${nCompared})`,
  );
}

console.log("\n=== 2. Cleared construction pts vs commit 802466c ===");
const wt = mkdtempSync(join(tmpdir(), "cotf-aldrich-"));
try {
  execSync(`git worktree add --detach "${wt}" 802466c`, {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  const measurer = `
import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  trouserFrontPoints,
  trouserBackPoints,
  withWaistband,
} from "../lib/patterns/trouserBlock";
import { writeFileSync } from "fs";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function dump(waistDrop: number) {
  const block = waistDrop >= 50 ? "production" : "classic";
  const style = withWaistband(
    { bottomWidth: 220, block, waistDrop },
    0,
    "darted",
    body,
  );
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const pts = [];
  for (const [id, at] of Object.entries(f)) pts.push({ id: "F." + id, at });
  for (const [id, at] of Object.entries(b)) pts.push({ id: "B." + id, at });
  return pts;
}
writeFileSync(process.argv[2], JSON.stringify({ 0: dump(0), 50: dump(50) }));
`;
  writeFileSync(join(wt, "scripts", "_dump-aldrich-pts.ts"), measurer);
  const jsonPath = join(wt, "pts.json");
  execSync(`npx tsx scripts/_dump-aldrich-pts.ts "${jsonPath}"`, {
    cwd: wt,
    stdio: "pipe",
  });
  const old = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<
    string,
    { id: string; at: Point }[]
  >;
  for (const drop of [0, 50]) {
    const now = constructionPoints(clearedStyle(drop));
    const baseline = old[String(drop)]!;
    const { max, atId, nCompared } = maxDelta(now, baseline);
    console.log(
      `waistDrop=${drop}: maxΔ=${max.toFixed(6)} mm  at ${atId}  (n=${nCompared})`,
    );
    // Per-point table for any non-zero
    if (max > 1e-9) {
      const mapOld = new Map(baseline.map((p) => [p.id, p.at]));
      for (const p of now) {
        const q = mapOld.get(p.id);
        if (!q) continue;
        const d = Math.hypot(p.at.x - q.x, p.at.y - q.y);
        if (d > 1e-6) {
          console.log(
            `  ${p.id}: Δ=${d.toFixed(4)}  now=(${p.at.x.toFixed(3)},${p.at.y.toFixed(3)})  old=(${q.x.toFixed(3)},${q.y.toFixed(3)})`,
          );
        }
      }
    }
  }
} finally {
  try {
    execSync(`git worktree remove "${wt}" --force`, {
      cwd: process.cwd(),
      stdio: "pipe",
    });
  } catch {
    /* ignore */
  }
}

console.log("\n=== 3. Cleo measured style still drafts ===");
const m = CLEO_PRESET.measured;
const Cleo = constructionPoints(
  withWaistband(
    {
      bottomWidth: 220,
      waistDrop: m.waistDrop,
      crotchDeparture: m.crotchDeparture,
      frontWaistInset: m.frontWaistInset,
      crotchArrivalAngle: m.crotchArrivalAngle,
      backCrotchDrop: m.backCrotchDrop,
      frontCrotchFullness: m.frontCrotchFullness,
      backCrotchFullness: m.backCrotchFullness,
      frontCrotchExtensionScale: m.frontCrotchExtensionScale,
      backCrotchExtensionScale: m.backCrotchExtensionScale,
      waistlineCurveFront: CLEO_PRESET.provisional.waistlineCurveFront,
    },
    0,
    "darted",
    body,
  ),
);
console.log(`Cleo construction points: ${Cleo.length}`);

console.log("\n=== Module DEFAULT_* (drift watch) ===");
console.log({
  DEFAULT_FRONT_CROTCH_EXTENSION_SCALE,
  DEFAULT_BACK_CROTCH_EXTENSION_SCALE,
  DEFAULT_CROTCH_ARRIVAL_ANGLE,
  DEFAULT_FRONT_WAIST_INSET,
  DEFAULT_BACK_CROTCH_DROP,
  DEFAULT_FRONT_CROTCH_FULLNESS,
  DEFAULT_BACK_CROTCH_FULLNESS,
  WAISTLINE_CURVE_FRONT,
});
