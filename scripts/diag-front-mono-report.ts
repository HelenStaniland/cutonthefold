/**
 * Report-only: dump front crotch handles at mono failure.
 * Run: npx tsx scripts/diag-front-mono-report.ts
 */
import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  frontCrotchCurve,
  frontCrotchExtension,
  frontCrotchTouch,
  resolveCrotchArrivalAngle,
  resolveCrotchExtensionScale,
  resolveCrotchStraightRun,
  trouserFrontPoints,
  draftTrouserFront,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function dump(style: TrouserFrontStyle, label: string) {
  const s = withWaistband(style, 0, "darted", body);
  const f = trouserFrontPoints(body, s);
  const H = body.hip;
  const R = f.p9.y;
  const D = f.p6.y;
  const scale = resolveCrotchExtensionScale(s);
  const waistCfY = 0; // fwc=0, depth=0 → wr.cf.y = 0
  const straightRun = resolveCrotchStraightRun(s, R, D, waistCfY);
  const bez = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    fork: Math.abs(f.p5.x),
    R,
    waistCfY,
    straightRun,
    extension: frontCrotchExtension(H, scale),
    arrivalAngleDeg: resolveCrotchArrivalAngle(s),
    touch: frontCrotchTouch(H) * scale,
  });
  const d1 = bez.P1.y - bez.P0.y;
  const d2 = Math.hypot(bez.P3.x - bez.P2.x, bez.P3.y - bez.P2.y);
  const run = bez.P3.y - bez.P0.y;
  let draftOk = true;
  let err = "";
  try {
    draftTrouserFront(body, s);
  } catch (e) {
    draftOk = false;
    err = e instanceof Error ? e.message : String(e);
  }
  console.log("\n---", label, draftOk ? "DRAFT OK" : "DRAFT FAIL ---");
  if (!draftOk) console.log(err);
  console.log(
    JSON.stringify(
      {
        style: s,
        body: { hip: H, bodyRise: body.bodyRise, hipDepth: body.hipDepth },
        R,
        D,
        waistCfY,
        straightRun,
        extension: frontCrotchExtension(H, scale),
        arrivalAngleDeg: resolveCrotchArrivalAngle(s),
        touch: frontCrotchTouch(H) * scale,
        run,
        P0: bez.P0,
        P1: bez.P1,
        P2: bez.P2,
        P3: bez.P3,
        d1,
        d2,
        k: bez.k,
        touchMiss: bez.touchMiss,
        P1_past_tip: bez.P1.y > bez.P3.y,
      },
      null,
      2,
    ),
  );
}

const base: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  crotchExtensionScale: 1,
  waistlineCurveFront: 0,
  frontWaistInset: 10,
};

// Known failure
dump(
  { ...base, waistDrop: 25, crotchArrivalAngle: 45, crotchDeparture: 0 },
  "FAIL case: drop25 a45 cd0",
);

// Contrasts
dump(
  { ...base, waistDrop: 25, crotchArrivalAngle: 14, crotchDeparture: 0 },
  "contrast: a14 cd0",
);
dump(
  { ...base, waistDrop: 25, crotchArrivalAngle: 45 }, // default straightRun = hipline
  "contrast: a45 default cd (hipline)",
);
dump(
  { ...base, waistDrop: 0, crotchArrivalAngle: 45, crotchDeparture: 0 },
  "contrast: drop0 a45 cd0",
);
dump(
  { ...base, waistDrop: 25, crotchArrivalAngle: 32, crotchDeparture: 0 },
  "contrast: a32 cd0",
);

// k vs angle at cd=0 drop=25
console.log("\n=== k / P1.y vs tip for cd=0 drop=25 ===");
const f = trouserFrontPoints(body, {
  ...base,
  waistDrop: 25,
  crotchArrivalAngle: 45,
  crotchDeparture: 0,
});
const R = f.p9.y;
const D = f.p6.y;
for (const a of [5, 14, 20, 28, 32, 38, 42, 45]) {
  const bez = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    fork: Math.abs(f.p5.x),
    R,
    waistCfY: 0,
    straightRun: 0,
    extension: frontCrotchExtension(body.hip, 1),
    arrivalAngleDeg: a,
    touch: frontCrotchTouch(body.hip),
  });
  console.log(
    `  a=${a}° k=${bez.k.toFixed(3)} miss=${bez.touchMiss.toFixed(3)} P1.y=${bez.P1.y.toFixed(1)} tip.y=${bez.P3.y.toFixed(1)} past=${bez.P1.y > bez.P3.y}`,
  );
}
