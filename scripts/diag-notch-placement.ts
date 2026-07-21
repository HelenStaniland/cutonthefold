/**
 * DIAGNOSTIC — notch placement positions for Part B (print only).
 * Run: npx tsx scripts/diag-notch-placement.ts
 *
 * §1 Lhigh: back inseam 30 mm from tip → Lhigh = tip→knee − 30;
 *    front inseam-high sits Lhigh up from the knee (same distance-from-knee).
 * §2 Side knee: side seam ∩ y = kneeY.
 *
 * Does not change geometry.
 */
import { applyEase, type Point } from "../lib/types/measurements";
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
  IZZY_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  inseamHighNotches,
  pointAlongPolyline,
  sideKneeNotches,
} from "../lib/geometry/notchPlacement";

const TIP_OFFSET_BACK = 30; // mm from crotch tip on back inseam
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

function report(label: string, settings: TrouserStyleSettings) {
  console.log(`\n========== ${label} ==========`);
  const body = applyEase(bodyForSizeCode(DEFAULT_SIZE_CODE)!, settings.ease);
  const style = resolveStyle(settings, body);
  void draftTrousers(body, style);
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);

  const fInseam = pchipByY([f.p9, f.p15, f.p14]);
  const bInseam = pchipByY([b.p24, b.p29, b.p28]);
  const fTipKnee = polylineLength(
    fInseam.slice(
      0,
      fInseam.findIndex((p) => Math.hypot(p.x - f.p15.x, p.y - f.p15.y) < 0.5) + 1,
    ),
  );
  const bTipKnee = polylineLength(
    bInseam.slice(
      0,
      bInseam.findIndex((p) => Math.hypot(p.x - b.p29.x, p.y - b.p29.y) < 0.5) + 1,
    ),
  );

  const high = inseamHighNotches(
    { tip: f.p9, knee: f.p15, hem: f.p14 },
    { tip: b.p24, knee: b.p29, hem: b.p28 },
    TIP_OFFSET_BACK,
  );

  console.log("\n--- §1 Inseam-high (Lhigh) ---");
  console.log(`  back tip→knee = ${f3(bTipKnee)} mm`);
  console.log(`  front tip→knee = ${f3(fTipKnee)} mm`);
  console.log(
    `  back notch = ${TIP_OFFSET_BACK} mm from tip → Lhigh = tip→knee − ${TIP_OFFSET_BACK} = ${f3(high.Lhigh)} mm`,
  );
  console.log(
    `  back inseam-high ${pt(high.back)}  distFromTip=${f3(high.backDistFromTip)}  distFromKnee=${f3(high.backDistFromKnee)}`,
  );
  console.log(
    `  front inseam-high ${pt(high.front)}  distFromTip=${f3(high.frontDistFromTip)}  distFromKnee=${f3(high.frontDistFromKnee)}`,
  );
  console.log(
    `  check: distFromKnee equal |Δ|=${f3(Math.abs(high.frontDistFromKnee - high.backDistFromKnee))} mm`,
  );

  // Sanity: reconstruct from helpers
  const bFromTip = pointAlongPolyline(bInseam, TIP_OFFSET_BACK);
  console.log(
    `  sanity back@30 from tip: ${pt(bFromTip)} Δ to high.back=${f3(Math.hypot(bFromTip.x - high.back.x, bFromTip.y - high.back.y))}`,
  );

  const sides = sideKneeNotches(
    { sideHip: f.p8, sideKnee: f.p13, sideHem: f.p12, kneeY: f.p15.y },
    { sideHip: b.p25, sideKnee: b.p27, sideHem: b.p26, kneeY: b.p29.y },
  );

  console.log("\n--- §2 Side knee (side seam ∩ y=kneeY) ---");
  console.log(`  kneeY front=${f3(f.p15.y)} back=${f3(b.p29.y)}`);
  console.log(
    `  front side-knee ${pt(sides.front)}  (construction side-knee knot p13 ${pt(f.p13)})`,
  );
  console.log(
    `  back  side-knee ${pt(sides.back)}  (construction side-knee knot p27 ${pt(b.p27)})`,
  );
  console.log(
    `  |Δy| vs kneeY: front ${f3(Math.abs(sides.front.y - f.p15.y))} back ${f3(Math.abs(sides.back.y - b.p29.y))}`,
  );
}

console.log("=== DIAG: notch placement (Lhigh + side knee) ===");
console.log("measure only — no geometry changes");
console.log(`back tip offset = ${TIP_OFFSET_BACK} mm`);

report("Izzy preset", IZZY_TROUSER_STYLE);
report("Aldrich block defaults", BLOCK_TROUSER_STYLE);

console.log("\n=== end diagnostic ===");
