/**
 * DIAGNOSTIC — net inseam length front vs back (print only).
 * Run: npx tsx scripts/diag-inseam-length.ts
 *
 * Canonical lengths come from piece.seamLengths (construction polylines,
 * pre-retag). Role-run arcs are printed only to show the retag shortfall.
 */
import {
  applyEase,
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

const VERTEX_TOL = 0.05;

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
    ...(s.crotchDeparture != null ? { crotchDeparture: s.crotchDeparture } : {}),
    ...(s.crotchArrivalAngle != null
      ? { crotchArrivalAngle: s.crotchArrivalAngle }
      : {}),
    ...(s.waistlineCurveFront != null
      ? { waistlineCurveFront: s.waistlineCurveFront }
      : {}),
    ...(s.frontWaistInset != null ? { frontWaistInset: s.frontWaistInset } : {}),
    ...(s.waistTaper != null ? { waistTaper: s.waistTaper } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
  };
  const finish = s.dartedWaistFinish;
  if (finish === "elastic") {
    return withWaistband(
      { ...base, frontWaistInset: 0, waistTaper: 0 },
      0,
      "shaped",
      body,
    );
  }
  const depth =
    s.waistbandMode === "darted"
      ? finish === "facing"
        ? 0
        : s.dartedBandDepth
      : s.waistbandDepth;
  if (s.waistbandMode === "darted") {
    return withWaistband(base, depth, "darted", body);
  }
  return depth > 0 ? withWaistband(base, depth, "shaped", body) : base;
}

function rolePolyline(
  outline: { at: Point; role?: string }[],
  role: string,
): Point[] {
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

  const fTip = frontPts.p9;
  const fKnee = frontPts.p15;
  const fHem = frontPts.p14;
  const bTip = backPts.p24;
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

  const fSplit = measureConstructionInseam(fTip, fKnee, fHem);
  const bSplit = measureConstructionInseam(bTip, bKnee, bHem);

  const canonF = front.seamLengths!.inseam;
  const canonB = back.seamLengths!.inseam;
  const fRole = polylineLength(fInseam);
  const bRole = polylineLength(bInseam);

  console.log("\n--- Canonical seamLengths.inseam (export) vs construction pchip ---");
  console.log(`  export front: ${f3(canonF)} mm`);
  console.log(`  export back:  ${f3(canonB)} mm`);
  console.log(`  pchip front:  ${f3(fSplit.total)} mm  (${fSplit.note})`);
  console.log(`  pchip back:   ${f3(bSplit.total)} mm  (${bSplit.note})`);
  console.log(
    `  export − pchip: front ${f3(canonF - fSplit.total)} mm, back ${f3(canonB - bSplit.total)} mm`,
  );
  console.log(
    `  role-only (short, retag): front ${f3(fRole)} mm, back ${f3(bRole)} mm`,
  );
  console.log(
    `  export − role: front ${f3(canonF - fRole)} mm, back ${f3(canonB - bRole)} mm`,
  );

  console.log("\n--- Split at knee (construction pchip; same path as export) ---");
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
  }

  console.log("\n--- Side / crotch from export ---");
  console.log(
    `  side:   F ${f3(front.seamLengths!.side)}  B ${f3(back.seamLengths!.side)}  Δ ${f3(back.seamLengths!.side - front.seamLengths!.side)}`,
  );
  console.log(
    `  crotch: F ${f3(front.seamLengths!.crotch)}  B ${f3(back.seamLengths!.crotch)}  (independent — not a matched pair)`,
  );
  console.log(
    `  side role-arc (diag historical): F ${f3(polylineLength(fSide))} B ${f3(polylineLength(bSide))}`,
  );

  return {
    totalDelta: canonB - canonF,
    fSide: front.seamLengths!.side,
    bSide: back.seamLengths!.side,
    fInseam: canonF,
    bInseam: canonB,
  };
}

console.log("=== DIAG: net inseam length front vs back ===");
console.log(`body: size ${DEFAULT_SIZE_CODE} + each preset's ease`);
console.log("canonical source: piece.seamLengths (construction, pre-retag)");

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
  console.log("\n--- Isolate knee-inset contribution (Cleo) ---");
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
  console.log("\n========== Side-seam (canonical export) ==========");
  console.log(`  front side-seam: ${f3(Cleo.fSide)} mm`);
  console.log(`  back side-seam:  ${f3(Cleo.bSide)} mm`);
  console.log(`  back − front:    ${f3(Cleo.bSide - Cleo.fSide)} mm`);
}

console.log("\n=== end diagnostic (no geometry changes) ===");
