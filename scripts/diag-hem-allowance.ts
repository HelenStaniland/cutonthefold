/**
 * DIAGNOSTIC ONLY — current hem allowance geometry for Izzy trousers.
 * Run: npx tsx scripts/diag-hem-allowance.ts
 *
 * Prints current numbers only. Does not change geometry.
 */
import { applyEase, type OutlinePoint, type Point } from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  addSeamAllowance,
  DEFAULT_SEAM_ALLOWANCE,
} from "../lib/geometry/seamAllowance";
import {
  blockFromWaistDrop,
  draftTrousers,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  IZZY_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";

const DUP_TOL = 0.01;

function fmt(n: number): string {
  return n.toFixed(3);
}

function point(p: Point): string {
  return `(${fmt(p.x)}, ${fmt(p.y)})`;
}

function collapse(outline: OutlinePoint[]): OutlinePoint[] {
  const out: OutlinePoint[] = [];
  for (const p of outline) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.at.x - last.at.x, p.at.y - last.at.y) < DUP_TOL) {
      continue;
    }
    out.push(p);
  }
  if (out.length > 1) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(first.at.x - last.at.x, first.at.y - last.at.y) < DUP_TOL) {
      out.pop();
    }
  }
  return out;
}

function resolveStyle(
  s: TrouserStyleSettings,
  body: ReturnType<typeof applyEase>,
): TrouserFrontStyle {
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    ...(s.frontInseamKneeInset != null
      ? { frontInseamKneeInset: s.frontInseamKneeInset }
      : {}),
    ...(s.backInseamKneeInset != null
      ? { backInseamKneeInset: s.backInseamKneeInset }
      : {}),
    ...(s.frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale: s.frontCrotchExtensionScale }
      : {}),
    ...(s.backCrotchExtensionScale != null
      ? { backCrotchExtensionScale: s.backCrotchExtensionScale }
      : {}),
    ...(s.crotchStraightRun != null ? { crotchStraightRun: s.crotchStraightRun } : {}),
    ...(s.crotchArrivalAngle != null ? { crotchArrivalAngle: s.crotchArrivalAngle } : {}),
    ...(s.waistlineCurveFront != null ? { waistlineCurveFront: s.waistlineCurveFront } : {}),
    ...(s.frontWaistInset != null ? { frontWaistInset: s.frontWaistInset } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
  };
  const depth =
    s.waistbandMode === "darted"
      ? s.dartedWaistFinish === "facing"
        ? 0
        : s.dartedBandDepth
      : s.waistbandDepth;
  if (s.waistbandMode === "darted") {
    return withWaistband(base, depth, "darted", body);
  }
  return depth > 0 ? withWaistband(base, depth, "shaped", body) : base;
}

function findHemCorners(outline: OutlinePoint[]): {
  sideIdx: number;
  inseamIdx: number;
} {
  const hemIndices = outline
    .map((p, i) => (p.edge === "hem" ? i : -1))
    .filter((i) => i >= 0);
  if (hemIndices.length === 0) {
    throw new Error("piece has no hem edge");
  }
  const sideIdx = hemIndices[0]!;
  const inseamIdx = (hemIndices[hemIndices.length - 1]! + 1) % outline.length;
  return { sideIdx, inseamIdx };
}

function pointAtYOnRun(
  outline: OutlinePoint[],
  cornerIdx: number,
  direction: -1 | 1,
  targetY: number,
): Point {
  const n = outline.length;
  let prev = outline[cornerIdx]!.at;
  for (let step = 1; step < n; step++) {
    const idx = (cornerIdx + step * direction + n) % n;
    const curr = outline[idx]!.at;
    const minY = Math.min(prev.y, curr.y);
    const maxY = Math.max(prev.y, curr.y);
    if (targetY >= minY && targetY <= maxY && Math.abs(curr.y - prev.y) > 1e-9) {
      const t = (targetY - prev.y) / (curr.y - prev.y);
      return {
        x: prev.x + (curr.x - prev.x) * t,
        y: targetY,
      };
    }
    prev = curr;
  }
  throw new Error(`could not find y=${targetY} on seam run from idx ${cornerIdx}`);
}

function seamSpanIndices(
  outline: OutlinePoint[],
  cornerIdx: number,
  direction: -1 | 1,
  depth: number,
): number[] {
  const indices = [cornerIdx];
  const hemY = outline[cornerIdx]!.at.y;
  const n = outline.length;
  for (let step = 1; step < n; step++) {
    const idx = (cornerIdx + step * direction + n) % n;
    indices.push(idx);
    if (outline[idx]!.at.y <= hemY - depth) {
      break;
    }
  }
  return indices;
}

function printSpan(
  label: string,
  indices: number[],
  outline: OutlinePoint[],
  cutting: Point[],
) {
  console.log(`  ${label} (hem toward ${DEFAULT_SEAM_ALLOWANCE.hem} mm above):`);
  for (const idx of indices) {
    const net = outline[idx]!;
    console.log(
      `    idx ${idx}: net ${point(net.at)} edge=${net.edge} role=${net.role ?? "(none)"} | cutting ${point(cutting[idx]!)}`,
    );
  }
}

function reportPiece(name: string, outlineRaw: OutlinePoint[]) {
  const outline = collapse(outlineRaw);
  const withAllowance = addSeamAllowance(
    { name, cutCount: 2, onFold: false, outline, markings: [] },
    DEFAULT_SEAM_ALLOWANCE,
  );
  const cutting = withAllowance.cuttingOutline!;
  const { sideIdx, inseamIdx } = findHemCorners(outline);
  const sideHem = outline[sideIdx]!.at;
  const inseamHem = outline[inseamIdx]!.at;
  const sideAbove = pointAtYOnRun(outline, sideIdx, -1, sideHem.y - 20);
  const inseamAbove = pointAtYOnRun(outline, inseamIdx, 1, inseamHem.y - 20);
  const sideCut = cutting[sideIdx]!;
  const inseamCut = cutting[inseamIdx]!;

  console.log(`\n=== ${name} ===`);
  console.log(`net outline points: ${outline.length}; cutting outline points: ${cutting.length}`);
  console.log("net hemline corners:");
  console.log(`  side-seam/hem : idx ${sideIdx} ${point(sideHem)}`);
  console.log(`  inseam/hem    : idx ${inseamIdx} ${point(inseamHem)}`);
  console.log("net seam direction just above hem (at hem -> at y=hemY-20):");
  console.log(`  side seam : ${point(sideHem)} -> ${point(sideAbove)}  delta (${fmt(sideAbove.x - sideHem.x)}, ${fmt(sideAbove.y - sideHem.y)})`);
  console.log(`  inseam    : ${point(inseamHem)} -> ${point(inseamAbove)}  delta (${fmt(inseamAbove.x - inseamHem.x)}, ${fmt(inseamAbove.y - inseamHem.y)})`);
  console.log("current allowance raw-edge/cutting corners below hemline:");
  console.log(`  side-seam raw corner : ${point(sideCut)}  delta from net (${fmt(sideCut.x - sideHem.x)}, ${fmt(sideCut.y - sideHem.y)})`);
  console.log(`  inseam raw corner    : ${point(inseamCut)}  delta from net (${fmt(inseamCut.x - inseamHem.x)}, ${fmt(inseamCut.y - inseamHem.y)})`);
  console.log("cutting-outline representation around the hem:");
  console.log(
    `  side allowance is only the lower part of segment cut[${(sideIdx - 1 + outline.length) % outline.length}] -> cut[${sideIdx}]; there is no cutting vertex at the fold`,
  );
  console.log(
    `  raw bottom is segment cut[${sideIdx}] -> cut[${inseamIdx}]`,
  );
  console.log(
    `  inseam allowance is only the lower part of segment cut[${inseamIdx}] -> cut[${(inseamIdx + 1) % outline.length}]; there is no cutting vertex at the fold`,
  );
  printSpan(
    "side-seam vertices",
    seamSpanIndices(outline, sideIdx, -1, DEFAULT_SEAM_ALLOWANCE.hem),
    outline,
    cutting,
  );
  printSpan(
    "inseam vertices",
    seamSpanIndices(outline, inseamIdx, 1, DEFAULT_SEAM_ALLOWANCE.hem),
    outline,
    cutting,
  );
}

const baseBody = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
const body = applyEase(baseBody, IZZY_TROUSER_STYLE.ease);
const style = resolveStyle(IZZY_TROUSER_STYLE, body);
const pattern = draftTrousers(body, style);

console.log("DIAGNOSTIC — Izzy hem allowance geometry");
console.log(`body: default size ${DEFAULT_SIZE_CODE} + Izzy ease => waist ${body.waist} mm, hip ${body.hip} mm`);
console.log(`back hem shape: ${style.backHemShape ?? "curved(default)"}`);
console.log(`allowance policy: seam ${DEFAULT_SEAM_ALLOWANCE.seam} mm; hem ${DEFAULT_SEAM_ALLOWANCE.hem} mm`);
console.log(
  DEFAULT_SEAM_ALLOWANCE.hem === DEFAULT_SEAM_ALLOWANCE.seam
    ? "hem uses the same numeric value as the global seam allowance"
    : "hem uses a separate hem value, not the global 10 mm seam allowance",
);
console.log(
  "builder path: app calls withSeamAllowance(), which maps pieces through addSeamAllowance(); addSeamAllowance uses allowanceFor(edge) and one shared offset/miter loop for seam and hem edges. There is no dedicated hem-turnback/mirroring path.",
);

for (const piece of pattern.pieces) {
  if (piece.name === "Trouser front" || piece.name === "Trouser back") {
    reportPiece(piece.name, piece.outline);
  }
}
