/**
 * Measure cut↔sew gap around casing top-outer corner (pinch detector).
 * Run: npx tsx scripts/diag-casing-corner-sa-gap.ts
 */
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
  type SeamAllowancePolicy,
} from "../lib/geometry/seamAllowance";
import { applyTrouserHemTurnbackToPattern } from "../lib/geometry/trouserHemTurnback";
import {
  applyTrouserWaistCasingToPattern,
  resolveCasingDepths,
} from "../lib/geometry/trouserWaistCasing";
import { MILA_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrousers,
  withWaistband,
} from "../lib/patterns/trouserBlock";

const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const f = (n: number) => n.toFixed(2);

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Min distance from point to polyline segments. */
function distToPoly(p: Point, poly: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]!;
    const b = poly[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    best = Math.min(best, dist(p, q));
  }
  return best;
}

function finish(saSpec: SeamAllowancePolicy) {
  const body = applyEase(
    { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN },
    MILA_TROUSER_STYLE.ease,
  );
  const style = withWaistband(
    {
      bottomWidth: MILA_TROUSER_STYLE.legBottomWidth,
      block: blockFromWaistDrop(MILA_TROUSER_STYLE.waistDrop),
      waistDrop: MILA_TROUSER_STYLE.waistDrop,
      backHemShape: MILA_TROUSER_STYLE.backHemShape,
      frontWaistInset: 0,
      waistTaper: 0,
      pocketFront: "none" as const,
    },
    0,
    "shaped",
    body,
  );
  const d = resolveCasingDepths(25, saSpec.seam);
  const sa = withSeamAllowance(draftTrousers(body, style), saSpec);
  return applyTrouserHemTurnbackToPattern(
    applyTrouserWaistCasingToPattern(sa, d, saSpec.seam),
  );
}

for (const seam of [10, 15] as const) {
  const saSpec: SeamAllowancePolicy = {
    ...DEFAULT_SEAM_ALLOWANCE,
    seam,
  };
  const pat = finish(saSpec);
  console.log(`\n######## SA=${seam} ########`);
  for (const name of ["Trouser front", "Trouser back"] as const) {
    const p = pat.pieces.find((x) => x.name === name)!;
    const cut = p.cuttingOutline!;
    const sew = p.outline.map((o) => o.at);
    const ref = p.waistCasing!;
    const midT = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
    const midF = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
    const upLen = Math.hypot(midF.x - midT.x, midF.y - midT.y) || 1;
    const up = { x: (midF.x - midT.x) / upLen, y: (midF.y - midT.y) / upLen };
    const along = (q: Point) =>
      (q.x - midT.x) * up.x + (q.y - midT.y) * up.y;

    // Find top-outer on cut: max across among high-along verts, or last on top run
    const topExt = ref.totalExtension;
    let topEnd = 0;
    for (let i = 0; i < cut.length; i++) {
      if (along(cut[i]!) > topExt - 15) topEnd = i;
      else if (topEnd > 5) break;
    }
    // Sample cut verts around topEnd (± a few) and measure gap to sew
    console.log(`\n=== ${name} (expect gap=${seam}) totalExt=${ref.totalExtension} ===`);
    const idxs = [
      Math.max(0, topEnd - 3),
      Math.max(0, topEnd - 1),
      topEnd,
      Math.min(cut.length - 1, topEnd + 1),
      Math.min(cut.length - 1, topEnd + 3),
    ];
    let minGap = Infinity;
    for (const i of idxs) {
      const g = distToPoly(cut[i]!, sew);
      minGap = Math.min(minGap, g);
      console.log(
        `  cut[${i}] (${cut[i]!.x.toFixed(1)},${cut[i]!.y.toFixed(1)}) ` +
          `along=${f(along(cut[i]!))} gap→sew=${f(g)}`,
      );
    }
    console.log(`  min gap around corner: ${f(minGap)} (pinch if < ${seam - 0.5})`);

    // Sewing corner: last hem-fold vert (high along ≈ 2*channel)
    const hemAlong = 2 * ref.channelDepth;
    let sewCorner: Point | null = null;
    for (let i = 0; i < sew.length; i++) {
      if (Math.abs(along(sew[i]!) - hemAlong) < 3) sewCorner = sew[i]!;
    }
    const cutCorner = cut[topEnd]!;
    if (sewCorner) {
      const diag = dist(cutCorner, sewCorner);
      const expectDiag = seam * Math.SQRT2; // if orthogonal
      console.log(
        `  sew corner (${f(sewCorner.x)},${f(sewCorner.y)}) → cut (${f(cutCorner.x)},${f(cutCorner.y)}) ` +
          `diag=${f(diag)} (√2·SA≈${f(expectDiag)} if square)`,
      );
    }
  }
}
