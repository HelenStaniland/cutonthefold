/**
 * DIAGNOSTIC — net inseam tip→knee at Helen's body (print only).
 * Run: npx tsx scripts/diag-inseam-atbody.ts
 *
 * Compares Cleo preset at Helen's verticals vs default size-12 body.
 * Does not change geometry.
 */
import {
  applyEase,
  type BodyMeasurements,
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
  CLEO_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";

const VERTEX_TOL = 0.05;
const f3 = (n: number) => n.toFixed(3);
const f1 = (n: number) => n.toFixed(1);
const pt = (p: Point) => `(${f3(p.x)}, ${f3(p.y)})`;

/** Helen's custom verticals (cm → mm). Circumferences stay size-12 unless noted. */
const HELEN_VERTICALS = {
  waistToFloor: 1020, // 102 cm
  hipDepth: 215, // 21.5 cm
  bodyRise: 301, // 30.1 cm
} as const;

const PAPER = { front: 310, back: 317.5, delta: 7.5 } as const;

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
  return bestD > tol ? -1 : best;
}

function measureConstructionInseam(tip: Point, knee: Point, hem: Point) {
  const tipToHem = pchipByY([tip, knee, hem]);
  const kneeIdx = findVertexIndex(tipToHem, knee);
  if (kneeIdx < 0) {
    return {
      tipToKnee: NaN,
      kneeToHem: NaN,
      total: polylineLength(tipToHem),
    };
  }
  return {
    tipToKnee: polylineLength(tipToHem.slice(0, kneeIdx + 1)),
    kneeToHem: polylineLength(tipToHem.slice(kneeIdx)),
    total: polylineLength(tipToHem),
  };
}

/** Knee rule: kneeY = R + (F−R)/2 − 50, with R/F drop-adjusted. */
function kneeRule(body: BodyMeasurements, riseDrop: number) {
  const R = body.bodyRise - riseDrop;
  const F = body.waistToFloor - riseDrop;
  const leg = F - R;
  const kneeY = R + leg / 2 - 50;
  return {
    R,
    F,
    leg,
    kneeY,
    fractionOfLeg: (kneeY - R) / leg,
    formula: "kneeY = R + (F−R)/2 − 50  (= rise + half leg − 50)",
  };
}

type CaseReport = {
  label: string;
  body: BodyMeasurements;
  kneeYF: number;
  kneeYB: number;
  tipF: Point;
  tipB: Point;
  kneeF: Point;
  kneeB: Point;
  tipToKneeF: number;
  tipToKneeB: number;
  kneeToHemF: number;
  kneeToHemB: number;
  rule: ReturnType<typeof kneeRule>;
};

function runCase(label: string, baseBody: BodyMeasurements): CaseReport {
  const settings = CLEO_TROUSER_STYLE;
  const body = applyEase(baseBody, settings.ease);
  const style = resolveStyle(settings, body);
  const frontPts = trouserFrontPoints(body, style);
  const backPts = trouserBackPoints(body, style);
  // Draft to ensure the same path as UI; lengths come from construction knots.
  void draftTrousers(body, style);

  const f = measureConstructionInseam(frontPts.p9, frontPts.p15, frontPts.p14);
  const b = measureConstructionInseam(backPts.p24, backPts.p29, backPts.p28);
  const rule = kneeRule(body, style.waistDrop ?? 0);

  return {
    label,
    body,
    kneeYF: frontPts.p15.y,
    kneeYB: backPts.p29.y,
    tipF: frontPts.p9,
    tipB: backPts.p24,
    kneeF: frontPts.p15,
    kneeB: backPts.p29,
    tipToKneeF: f.tipToKnee,
    tipToKneeB: b.tipToKnee,
    kneeToHemF: f.kneeToHem,
    kneeToHemB: b.kneeToHem,
    rule,
  };
}

function printCase(r: CaseReport) {
  const delta = r.tipToKneeB - r.tipToKneeF;
  console.log(`\n========== ${r.label} ==========`);
  console.log("\n  Body (after Cleo ease on waist/hip only)");
  console.log(
    `    waistToFloor=${r.body.waistToFloor}  hipDepth=${r.body.hipDepth}  bodyRise=${r.body.bodyRise}`,
  );
  console.log(
    `    waist=${r.body.waist}  lowWaist=${r.body.lowWaist}  hip=${r.body.hip}`,
  );

  console.log("\n  1. Knee y & leg length");
  console.log(`    front knee y: ${f3(r.kneeYF)}  ${pt(r.kneeF)}`);
  console.log(`    back knee y:  ${f3(r.kneeYB)}  ${pt(r.kneeB)}`);
  console.log(
    `    leg length F−R = ${f3(r.rule.leg)} mm  (R=${f3(r.rule.R)}, F=${f3(r.rule.F)})`,
  );
  console.log(
    `    formula kneeY = ${f3(r.rule.kneeY)}  (matches front: ${Math.abs(r.rule.kneeY - r.kneeYF) < 0.01})`,
  );

  console.log("\n  2. Net inseam tip→knee");
  console.log(`    front: ${f3(r.tipToKneeF)} mm`);
  console.log(`    back:  ${f3(r.tipToKneeB)} mm`);
  console.log(`    Δ (back − front): ${f3(delta)} mm`);

  console.log("\n  3. Net inseam knee→hem");
  console.log(`    front: ${f3(r.kneeToHemF)} mm`);
  console.log(`    back:  ${f3(r.kneeToHemB)} mm`);
  console.log(
    `    Δ (back − front): ${f3(r.kneeToHemB - r.kneeToHemF)} mm`,
  );

  console.log("\n  4. Crotch tip & knee-notch coordinates");
  console.log(`    front tip (p9):   ${pt(r.tipF)}`);
  console.log(`    front knee (p15): ${pt(r.kneeF)}`);
  console.log(`    back tip (p24):   ${pt(r.tipB)}`);
  console.log(`    back knee (p29):  ${pt(r.kneeB)}`);

  return delta;
}

console.log("=== DIAG: inseam tip→knee at Helen's body ===");
console.log("measure only — no geometry changes");
console.log(`default size code: ${DEFAULT_SIZE_CODE}`);
console.log("\nField mapping (Helen → BodyMeasurements, mm):");
console.log("  waist-to-floor 102 cm → waistToFloor = 1020");
console.log("  hip depth 21.5 cm     → hipDepth     = 215");
console.log("  body rise 30.1 cm     → bodyRise     = 301");
console.log(
  "  Circumferences (waist/lowWaist/hip): still size-12 defaults + Cleo ease.",
);
console.log(
  "  applyEase only adds ease to waist/lowWaist/hip — verticals pass through unchanged.",
);

const size12 = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
const helenBase: BodyMeasurements = {
  ...size12,
  ...HELEN_VERTICALS,
};

console.log("\n--- Defaults filling (Helen body) ---");
console.log(
  `  from size-${DEFAULT_SIZE_CODE}: waist=${size12.waist}, lowWaist=${size12.lowWaist}, hip=${size12.hip}`,
);
console.log(
  `  overridden: waistToFloor ${size12.waistToFloor}→${HELEN_VERTICALS.waistToFloor}, hipDepth ${size12.hipDepth}→${HELEN_VERTICALS.hipDepth}, bodyRise ${size12.bodyRise}→${HELEN_VERTICALS.bodyRise}`,
);
console.log(
  `  Cleo insets: front=${CLEO_TROUSER_STYLE.frontInseamKneeInset}, back=${CLEO_TROUSER_STYLE.backInseamKneeInset}; ease waist=${CLEO_TROUSER_STYLE.ease.waist} hip=${CLEO_TROUSER_STYLE.ease.hip}`,
);

const helen = runCase("Helen's body + Cleo preset", helenBase);
const def = runCase(`Default size-${DEFAULT_SIZE_CODE} body + Cleo preset`, size12);

const deltaHelen = printCase(helen);

console.log("\n  5. vs Helen's paper (net tip→knee)");
console.log(
  `    Helen paper: front ${PAPER.front}, back ${PAPER.back}, Δ +${PAPER.delta}`,
);
console.log(
  `    Code @ her body: front ${f1(helen.tipToKneeF)}, back ${f1(helen.tipToKneeB)}, Δ ${f1(deltaHelen)}`,
);
console.log(
  `    residual (code − paper): front ${f1(helen.tipToKneeF - PAPER.front)}, back ${f1(helen.tipToKneeB - PAPER.back)}, Δ ${f1(deltaHelen - PAPER.delta)}`,
);

const deltaDef = printCase(def);

console.log("\n  6. How much the leg-length change moved each number");
console.log(
  `    knee y:     Helen ${f3(helen.kneeYF)}  vs default ${f3(def.kneeYF)}  → Δ ${f3(helen.kneeYF - def.kneeYF)} mm`,
);
console.log(
  `    leg F−R:    Helen ${f3(helen.rule.leg)}  vs default ${f3(def.rule.leg)}  → Δ ${f3(helen.rule.leg - def.rule.leg)} mm`,
);
console.log(
  `    tip→knee F: Helen ${f3(helen.tipToKneeF)}  vs default ${f3(def.tipToKneeF)}  → Δ ${f3(helen.tipToKneeF - def.tipToKneeF)} mm`,
);
console.log(
  `    tip→knee B: Helen ${f3(helen.tipToKneeB)}  vs default ${f3(def.tipToKneeB)}  → Δ ${f3(helen.tipToKneeB - def.tipToKneeB)} mm`,
);
console.log(
  `    tip→knee Δ: Helen ${f3(deltaHelen)}  vs default ${f3(deltaDef)}  → Δ ${f3(deltaHelen - deltaDef)} mm`,
);
console.log(
  `    (default back was ~335; Helen paper 317.5; shift ≈ ${f1(def.tipToKneeB - helen.tipToKneeB)} mm on back tip→knee)`,
);

console.log("\n  7. Knee placement rule");
console.log(`    ${helen.rule.formula}`);
console.log(
  `    tip→knee height along leg = (kneeY − R) = ${f3(helen.rule.kneeY - helen.rule.R)} mm`,
);
console.log(
  `    = ${(helen.rule.fractionOfLeg * 100).toFixed(2)}% of leg length (F−R)`,
);
console.log(
  `    (half leg − 50)/leg = ${(((helen.rule.leg / 2 - 50) / helen.rule.leg) * 100).toFixed(2)}%`,
);
console.log(
  "    So tip→knee scales ~½ with waistToFloor−bodyRise; −50 mm is a fixed offset.",
);

console.log("\n=== end diagnostic ===");
