/**
 * Probe front cut outline at slash ↔ casing top junction.
 * Run: npx tsx scripts/diag-front-cut-corner.ts
 */
import {
  applyEase,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import {
  applyTrouserWaistCasingToPattern,
  resolveCasingDepths,
} from "../lib/geometry/trouserWaistCasing";
import { CARGO_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrousers,
  withWaistband,
} from "../lib/patterns/trouserBlock";

const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const f = (n: number) => n.toFixed(2);
const fmt = (p: Point) => `(${f(p.x)},${f(p.y)})`;

const body = applyEase(
  { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN },
  CARGO_TROUSER_STYLE.ease,
);
const style = withWaistband(
  {
    bottomWidth: CARGO_TROUSER_STYLE.legBottomWidth,
    block: blockFromWaistDrop(CARGO_TROUSER_STYLE.waistDrop),
    waistDrop: CARGO_TROUSER_STYLE.waistDrop,
    backHemShape: CARGO_TROUSER_STYLE.backHemShape,
    frontWaistInset: 0,
    waistTaper: 0,
    pocketFront: "slant" as const,
  },
  0,
  "shaped",
  body,
);

const d = resolveCasingDepths(25);
const sa = withSeamAllowance(draftTrousers(body, style), DEFAULT_SEAM_ALLOWANCE);
const cased = applyTrouserWaistCasingToPattern(sa, d);

for (const name of ["Trouser front", "Trouser back"] as const) {
  const p = cased.pieces.find((x) => x.name === name)!;
  const cut = p.cuttingOutline!;
  const ref = p.waistCasing!;
  const midT = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
  const midF = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
  const upLen = Math.hypot(midF.x - midT.x, midF.y - midT.y) || 1;
  const up = { x: (midF.x - midT.x) / upLen, y: (midF.y - midT.y) / upLen };

  console.log(`\n=== ${name} cut n=${cut.length} ext=${d.totalExtension} ===`);
  // Find top run (near totalExtension along up from midT)
  const along = (q: Point) =>
    (q.x - midT.x) * up.x + (q.y - midT.y) * up.y;
  let topEnd = 0;
  while (
    topEnd < cut.length &&
    along(cut[topEnd]!) > d.totalExtension - 15
  ) {
    topEnd++;
  }
  console.log(`  top run cut[0..${topEnd - 1}] (${topEnd} verts)`);
  for (let i = 0; i < Math.min(topEnd + 8, cut.length); i++) {
    const q = cut[i]!;
    console.log(
      `  [${String(i).padStart(3)}] ${fmt(q)}  along=${f(along(q))}`,
    );
  }
  // Also last few (CF wall close)
  console.log("  … tail (CF wall / close):");
  for (let i = Math.max(0, cut.length - 6); i < cut.length; i++) {
    const q = cut[i]!;
    console.log(
      `  [${String(i).padStart(3)}] ${fmt(q)}  along=${f(along(q))}`,
    );
  }

  // Net outline around mouth
  console.log("  net around pocket-mouth / side:");
  for (let i = 0; i < p.outline.length; i++) {
    const o = p.outline[i]!;
    if (
      o.role === "pocket-mouth" ||
      o.role === "side-seam" ||
      (o.role === "waist" && Math.abs(o.at.x - 60) < 30)
    ) {
      console.log(
        `    net[${i}] ${String(o.role).padEnd(12)} ${fmt(o.at)}`,
      );
    }
  }

  // Junction dump: last 3 top + next 5
  console.log("  junction (last top → wall → body):");
  const from = Math.max(0, topEnd - 3);
  for (let i = from; i < Math.min(cut.length, topEnd + 5); i++) {
    const q = cut[i]!;
    const dx = i > 0 ? q.x - cut[i - 1]!.x : 0;
    const dy = i > 0 ? q.y - cut[i - 1]!.y : 0;
    console.log(
      `    [${i}] ${fmt(q)}  Δ=(${f(dx)},${f(dy)})  along=${f(along(q))}`,
    );
  }
}
