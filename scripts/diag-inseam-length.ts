/**
 * DIAGNOSTIC — net inseam length front vs back (print only).
 * Run: npx tsx scripts/diag-inseam-length.ts
 *
 * Measures NET stitching-line arc lengths (role polylines), not cut edges.
 * Does not change geometry.
 */
import {
  applyEase,
  type OutlinePoint,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { pchipByY, polylineLength } from "../lib/geometry/curves";
import {
  blockFromWaistDrop,
  draftTrousers,
  trouserBackPoints,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";

const VERTEX_TOL = 0.05; // mm — match construction knot on outline sample

const f3 = (n: number) => n.toFixed(3);
const pt = (p: Point) => `(${f3(p.x)}, ${f3(p.y)})`;

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
    ...(s.waistlineCurveFront != null
      ? { waistlineCurveFront: s.waistlineCurveFront }
      : {}),
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

/** Role run as polyline (outline order). Dedupes adjacent duplicates. */
function rolePolyline(outline: OutlinePoint[], role: string): Point[] {
  const pts: Point[] = [];
  for (const o of outline) {
    if (o.role !== role) continue;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(o.at.x - last.x, o.at.y - last.y) < 0.01) continue;
    pts.push(o.at);
  }
  return pts;
}

function findVertexIndex(poly: Point[], target: Point, tol = VERTEX_TOL): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = Math.hypot(poly[i]!.x - target.x, poly[i]!.y - target.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (bestD > tol) return -1;
  return best;
}

/**
 * Canonical net inseam = draft pchip tip→knee→hem (same as draftTrouser*).
 * Knee is an explicit knot, so the split is unambiguous.
 */
function measureConstructionInseam(tip: Point, knee: Point, hem: Point) {
  const tipToHem = pchipByY([tip, knee, hem]);
  const kneeIdx = findVertexIndex(tipToHem, knee);
  if (kneeIdx < 0) {
    return {
      tipToKnee: NaN,
      kneeToHem: NaN,
      total: polylineLength(tipToHem),
      note: `AMBIGUOUS: knee ${pt(knee)} missing from pchip samples`,
      tipToHem,
    };
  }
  return {
    tipToKnee: polylineLength(tipToHem.slice(0, kneeIdx + 1)),
    kneeToHem: polylineLength(tipToHem.slice(kneeIdx)),
    total: polylineLength(tipToHem),
    note: `pchip tip→knee→hem, knee i=${kneeIdx}/${tipToHem.length - 1}`,
    tipToHem,
  };
}

function draft(settings: TrouserStyleSettings) {
  const base = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
  const body = applyEase(base, settings.ease);
  const style = resolveStyle(settings, body);
  const pattern = draftTrousers(body, style);
  const frontPts = trouserFrontPoints(body, style);
  const backPts = trouserBackPoints(body, style);
  const front = pattern.pieces.find((p) => p.name === "Trouser front")!;
  const back = pattern.pieces.find((p) => p.name === "Trouser back")!;
  return { body, style, front, back, frontPts, backPts, settings };
}

function reportCase(label: string, settings: TrouserStyleSettings) {
  console.log(`\n========== ${label} ==========`);
  const { front, back, frontPts, backPts, settings: s } = draft(settings);

  const fInseam = rolePolyline(front.outline, "inseam");
  const bInseam = rolePolyline(back.outline, "inseam");
  const fSide = rolePolyline(front.outline, "side-seam");
  const bSide = rolePolyline(back.outline, "side-seam");

  // Construction landmarks
  const fTip = frontPts.p9;
  const fKnee = frontPts.p15;
  const fHem = frontPts.p14;
  const bTip = backPts.p24; // T = crotch tip / inseam start
  const bKnee = backPts.p29;
  const bHem = backPts.p28;

  const kneePathFront =
    s.frontInseamKneeInset != null
      ? "garment (inseam knee inset)"
      : "block (Aldrich KNEE_ADD)";
  const kneePathBack =
    s.backInseamKneeInset != null
      ? "garment (inseam knee inset)"
      : "block (Aldrich derived ±10 from front)";

  console.log("\n--- Inseam knee insets / code path ---");
  console.log(
    `  frontInseamKneeInset: ${s.frontInseamKneeInset === null ? "null (absent)" : s.frontInseamKneeInset}`,
  );
  console.log(
    `  backInseamKneeInset:  ${s.backInseamKneeInset === null ? "null (absent)" : s.backInseamKneeInset}`,
  );
  console.log(`  front knee path: ${kneePathFront}`);
  console.log(`  back knee path:  ${kneePathBack}`);

  console.log("\n--- Knee y-position ---");
  console.log(`  front knee y: ${f3(fKnee.y)}  at ${pt(fKnee)}`);
  console.log(`  back knee y:  ${f3(bKnee.y)}  at ${pt(bKnee)}`);
  const kneeYDelta = bKnee.y - fKnee.y;
  if (Math.abs(kneeYDelta) > 0.01) {
    console.log(
      `  NOTE: knee y differs front/back by ${f3(kneeYDelta)} mm — split lengths are not at the same height`,
    );
  } else {
    console.log(`  knee y same front/back (Δ ${f3(kneeYDelta)} mm)`);
  }

  console.log("\n--- Crotch tip & inseam hem endpoints (construction) ---");
  console.log(`  front tip (p9):  ${pt(fTip)}`);
  console.log(`  front hem (p14): ${pt(fHem)}`);
  console.log(`  back tip (p24):  ${pt(bTip)}`);
  console.log(`  back hem (p28):  ${pt(bHem)}`);

  // Confirm outline inseam ends match construction tip/hem
  const fStart = fInseam[0]!;
  const fEnd = fInseam[fInseam.length - 1]!;
  const bStart = bInseam[0]!;
  const bEnd = bInseam[bInseam.length - 1]!;
  console.log("\n--- Outline role=inseam (caveat) ---");
  console.log(
    `  front: ${fInseam.length} verts, start(hem) ${pt(fStart)}, end ${pt(fEnd)}`,
  );
  console.log(
    `  back:  ${bInseam.length} verts, start(hem) ${pt(bStart)}, end ${pt(bEnd)}`,
  );
  const tipMatchF = Math.hypot(fEnd.x - fTip.x, fEnd.y - fTip.y);
  const tipMatchB = Math.hypot(bEnd.x - bTip.x, bEnd.y - bTip.y);
  console.log(
    `  tip match Δ (role end vs construction tip): front ${f3(tipMatchF)} mm, back ${f3(tipMatchB)} mm`,
  );
  console.log(
    "  NOTE: segmentsToOutline retags the crotch-tip junction as role=crotch,",
  );
  console.log(
    "  so role=inseam omits the tip itself (~one sample short). Lengths below",
  );
  console.log(
    "  use the draft pchip tip→knee→hem (the actual net stitching line).",
  );

  const fSplit = measureConstructionInseam(fTip, fKnee, fHem);
  const bSplit = measureConstructionInseam(bTip, bKnee, bHem);

  // Sanity: role polyline + missing tip stub ≈ construction total
  const fRole = polylineLength(fInseam);
  const bRole = polylineLength(bInseam);
  console.log(
    `  role-only arc (incomplete): front ${f3(fRole)} mm, back ${f3(bRole)} mm`,
  );

  console.log("\n--- 1. Total net inseam arc length (pchip tip→knee→hem) ---");
  console.log(`  front: ${f3(fSplit.total)} mm  (${fSplit.note})`);
  console.log(`  back:  ${f3(bSplit.total)} mm  (${bSplit.note})`);
  console.log(`  back − front: ${f3(bSplit.total - fSplit.total)} mm`);

  console.log("\n--- 2. Split at knee ---");
  if (Number.isFinite(fSplit.tipToKnee) && Number.isFinite(bSplit.tipToKnee)) {
    console.log("  crotch tip → knee:");
    console.log(`    front: ${f3(fSplit.tipToKnee)} mm`);
    console.log(`    back:  ${f3(bSplit.tipToKnee)} mm`);
    console.log(
      `    back − front: ${f3(bSplit.tipToKnee - fSplit.tipToKnee)} mm`,
    );
    console.log("  knee → hem:");
    console.log(`    front: ${f3(fSplit.kneeToHem)} mm`);
    console.log(`    back:  ${f3(bSplit.kneeToHem)} mm`);
    console.log(
      `    back − front: ${f3(bSplit.kneeToHem - fSplit.kneeToHem)} mm`,
    );
  } else {
    console.log("  SPLIT SKIPPED — see AMBIGUOUS notes");
  }

  return {
    totalDelta: bSplit.total - fSplit.total,
    fSide: polylineLength(fSide),
    bSide: polylineLength(bSide),
  };
}

console.log("=== DIAG: net inseam length front vs back ===");
console.log(`body: size ${DEFAULT_SIZE_CODE} + each preset's ease`);
console.log("measure: role polyline arc length (net stitching line)");

const aldrich = reportCase("Aldrich block defaults", BLOCK_TROUSER_STYLE);
const Cleo = reportCase("Cleo preset", CLEO_TROUSER_STYLE);

{
  console.log("\n========== Cleo with both inseam knee insets = 0 ==========");
  const zeroed: TrouserStyleSettings = {
    ...CLEO_TROUSER_STYLE,
    frontInseamKneeInset: 0,
    backInseamKneeInset: 0,
  };
  const z = reportCase("Cleo + insets 0/0 (garment path, chord knees)", zeroed);
  console.log("\n--- 6. Isolate knee-inset contribution (Cleo) ---");
  console.log(`  Cleo as-shipped total Δ (back−front): ${f3(Cleo.totalDelta)} mm`);
  console.log(`  Cleo insets 0/0 total Δ (back−front): ${f3(z.totalDelta)} mm`);
  console.log(
    `  contribution of asymmetric insets: ${f3(Cleo.totalDelta - z.totalDelta)} mm`,
  );
  console.log(
    `  (Aldrich block Δ for reference: ${f3(aldrich.totalDelta)} mm)`,
  );
}

{
  console.log("\n========== 7. Side-seam comparison (Cleo as-shipped) ==========");
  console.log(`  front side-seam: ${f3(Cleo.fSide)} mm`);
  console.log(`  back side-seam:  ${f3(Cleo.bSide)} mm`);
  console.log(`  back − front:    ${f3(Cleo.bSide - Cleo.fSide)} mm`);
}

console.log("\n=== end diagnostic (no geometry changes) ===");
