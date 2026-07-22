/**
 * Diagnostic — knee/hem leg widths vs Cleo reference.
 * Run: npx tsx scripts/diag-leg-widths.ts
 * Report only — change no product code.
 */
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  trouserFrontPoints,
  trouserBackPoints,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function toDraftStyle(s: TrouserStyleSettings): TrouserFrontStyle {
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    waistDrop: s.waistDrop,
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
    ...(s.crotchStraightRun != null
      ? { crotchStraightRun: s.crotchStraightRun }
      : {}),
    ...(s.crotchArrivalAngle != null
      ? { crotchArrivalAngle: s.crotchArrivalAngle }
      : {}),
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
  return withWaistband(base, depth, s.waistbandMode, body);
}

function horiz(a: Point, b: Point): number {
  return Math.abs(b.x - a.x);
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function report(label: string, settings: TrouserStyleSettings) {
  const style = toDraftStyle(settings);
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);

  const fKnee = horiz(f.p15, f.p13);
  const fHem = horiz(f.p14, f.p12);
  const bKnee = horiz(b.p29, b.p27);
  const bHem = horiz(b.p28, b.p26);

  // Hip-level half-piece width (CF/CB construction at D → side)
  const fHip = horiz(f.p6, f.p8);
  const bHip = horiz(b.p17, b.p25);

  const kneeY = f.p15.y;
  const hemY = f.p14.y;
  const tipY = f.p9.y;
  const backTipY = b.p24.y;
  const kneeFromTipF = kneeY - tipY;
  const kneeFromTipB = kneeY - backTipY;

  console.log("\n" + "=".repeat(72));
  console.log(label);
  console.log("=".repeat(72));
  console.log(`legBottomWidth / bottomWidth: ${settings.legBottomWidth} mm`);
  console.log(
    `  (style.bottomWidth → B; front hem = B−10, back hem = B+10; B = finished one-leg laid-flat width = ½ hem circumference)`,
  );
  console.log(`knee line y: ${fmt(kneeY)}  hem y: ${fmt(hemY)}`);
  console.log(
    `knee down from crotch tip: front ${fmt(kneeFromTipF)} mm (p9.y=${fmt(tipY)}); back ${fmt(kneeFromTipB)} mm (p24.y=${fmt(backTipY)})`,
  );

  console.log("\n--- Widths (mm), inseam → side-seam ---");
  console.log(
    "piece | knee                  | hem                   | hip (CF/CB→side at D)",
  );
  console.log(
    "------|-----------------------|-----------------------|----------------------",
  );
  console.log(
    `front | p15→p13  ${fmt(fKnee).padStart(8)} | p14→p12  ${fmt(fHem).padStart(8)} | p6→p8   ${fmt(fHip).padStart(8)}`,
  );
  console.log(
    `back  | p29→p27  ${fmt(bKnee).padStart(8)} | p28→p26  ${fmt(bHem).padStart(8)} | p17→p25 ${fmt(bHip).padStart(8)}`,
  );

  console.log("\n--- Points ---");
  console.log(
    `  p15 (F inseam knee) (${fmt(f.p15.x)}, ${fmt(f.p15.y)})  p13 (F side knee) (${fmt(f.p13.x)}, ${fmt(f.p13.y)})`,
  );
  console.log(
    `  p14 (F inseam hem)  (${fmt(f.p14.x)}, ${fmt(f.p14.y)})  p12 (F side hem)  (${fmt(f.p12.x)}, ${fmt(f.p12.y)})`,
  );
  console.log(
    `  p29 (B inseam knee) (${fmt(b.p29.x)}, ${fmt(b.p29.y)})  p27 (B side knee) (${fmt(b.p27.x)}, ${fmt(b.p27.y)})`,
  );
  console.log(
    `  p28 (B inseam hem)  (${fmt(b.p28.x)}, ${fmt(b.p28.y)})  p26 (B side hem)  (${fmt(b.p26.x)}, ${fmt(b.p26.y)})`,
  );

  console.log("\n--- Knee vs hem (taper if knee < hem; flare if knee < hem wait)");
  console.log(
    `  front: knee ${fmt(fKnee)}  hem ${fmt(fHem)}  Δ(hem−knee)=${fmt(fHem - fKnee)}  ${fHem > fKnee ? "flare (hem wider)" : fHem < fKnee ? "taper (hem narrower)" : "parallel"}`,
  );
  console.log(
    `  back:  knee ${fmt(bKnee)}  hem ${fmt(bHem)}  Δ(hem−knee)=${fmt(bHem - bKnee)}  ${bHem > bKnee ? "flare (hem wider)" : bHem < bKnee ? "taper (hem narrower)" : "parallel"}`,
  );

  const fPullIn = fKnee < fHip && fKnee < fHem;
  const bPullIn = bKnee < bHip && bKnee < bHem;
  console.log("\n--- Pull-in at knee? (knee < hip AND knee < hem) ---");
  console.log(
    `  front: hip ${fmt(fHip)}  knee ${fmt(fKnee)}  hem ${fmt(fHem)}  → pull-in=${fPullIn ? "YES" : "NO"}`,
  );
  console.log(
    `  back:  hip ${fmt(bHip)}  knee ${fmt(bKnee)}  hem ${fmt(bHem)}  → pull-in=${bPullIn ? "YES" : "NO"}`,
  );

  console.log("\n--- bottomWidth relation check ---");
  console.log(
    `  B=${settings.legBottomWidth}; front hem |p14→p12|=${fmt(fHem)} (expect B−10=${settings.legBottomWidth - 10}); back hem |p28→p26|=${fmt(bHem)} (expect B+10=${settings.legBottomWidth + 10}); front+back=${fmt(fHem + bHem)} (expect 2B=${2 * settings.legBottomWidth})`,
  );
}

console.log(
  "Body: size 12 chart, hip 1100 + ease waist 10 / hip 50 → hip",
  body.hip,
);
console.log(
  "Cleo reference (net cm→mm): F knee 330 / hem 350; B knee 365 / hem 375",
);

report(
  "A — Trouser Block defaults (Aldrich, darted, no band, waistDrop 0)",
  BLOCK_TROUSER_STYLE,
);
report("B — Cleo preset", CLEO_TROUSER_STYLE);
