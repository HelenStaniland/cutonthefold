/**
 * DIAGNOSTIC ONLY — front-crotch ↔ waist-finish coupling (print only).
 * Run: npx tsx scripts/diag-front-crotch-waist-coupling.ts
 *
 * Characterises how waist finish (waistCfY) moves the front crotch belly and
 * whether front↔back crotch seam lengths stay matched. Changes no product code.
 */
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { polylineLength } from "../lib/geometry/curves";
import { MILA_PRESET } from "../lib/pattern/blockPresets";
import {
  milaTrouserStyle,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrouserFront,
  frontCrotchCurve,
  frontCrotchExtension,
  frontCrotchTouch,
  resolveCrotchArrivalAngle,
  resolveCrotchStraightRun,
  resolveFrontCrotchExtensionScale,
  resolveFrontCrotchFullness,
  trouserBackPoints,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
  type WaistbandMode,
} from "../lib/patterns/trouserBlock";

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const f3 = (n: number) => n.toFixed(3);
const pt = (p: Point) => `(${f2(p.x)}, ${f2(p.y)})`;

const chart = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
const body = applyEase({ ...chart, hip: 1100 }, MILA_PRESET.measured.ease);

function resolveStyle(
  s: TrouserStyleSettings,
  waistOverride?: {
    mode: WaistbandMode;
    depth: number;
    dartedWaistFinish?: "facing" | "waistband";
  },
  crotchStraightRun?: number | null,
): TrouserFrontStyle {
  const mode = waistOverride?.mode ?? s.waistbandMode;
  const finish = waistOverride?.dartedWaistFinish ?? s.dartedWaistFinish;
  const depth =
    waistOverride != null
      ? waistOverride.depth
      : mode === "darted"
        ? finish === "facing"
          ? 0
          : s.dartedBandDepth
        : s.waistbandDepth;

  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale: s.frontCrotchExtensionScale }
      : {}),
    ...(s.backCrotchExtensionScale != null
      ? { backCrotchExtensionScale: s.backCrotchExtensionScale }
      : {}),
    ...(crotchStraightRun !== undefined
      ? crotchStraightRun != null
        ? { crotchStraightRun }
        : {}
      : s.crotchStraightRun != null
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
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
    ...(s.frontInseamKneeInset != null
      ? { frontInseamKneeInset: s.frontInseamKneeInset }
      : {}),
    ...(s.backInseamKneeInset != null
      ? { backInseamKneeInset: s.backInseamKneeInset }
      : {}),
  };

  if (mode === "darted") {
    return withWaistband(base, depth, "darted", body);
  }
  return depth > 0 ? withWaistband(base, depth, "shaped", body) : base;
}

function rolePts(
  piece: { outline: { role?: string; at: Point }[] },
  role: string,
): Point[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at);
}

/** Tip → waist CF path on the drafted front (crotch + centre-front roles). */
function frontCrotchTipToWaist(piece: {
  outline: { role?: string; at: Point }[];
}): Point[] {
  // Outline order: … crotch (tip→hip) then centre-front (hip→waist).
  const crotch = rolePts(piece, "crotch");
  const cf = rolePts(piece, "centre-front");
  if (crotch.length === 0) return cf;
  if (cf.length === 0) return crotch;
  const last = crotch[crotch.length - 1]!;
  const first = cf[0]!;
  if (Math.hypot(last.x - first.x, last.y - first.y) < 1e-6) {
    return [...crotch, ...cf.slice(1)];
  }
  return [...crotch, ...cf];
}

function xAtY(poly: Point[], y: number): number | null {
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]!;
    const b = poly[i + 1]!;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo - 1e-6 || y > hi + 1e-6) continue;
    if (Math.abs(b.y - a.y) < 1e-12) return (a.x + b.x) / 2;
    const t = (y - a.y) / (b.y - a.y);
    return a.x + t * (b.x - a.x);
  }
  return null;
}

/** Belly Δx vs reference curve (same y samples on tip→P0 Bézier). */
function bellyVsRef(
  ref: Point[],
  cur: Point[],
): { maxAbsDx: number; yMin: number; yMax: number } {
  let maxAbsDx = 0;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const p of cur) {
    const xRef = xAtY(ref, p.y);
    if (xRef == null) continue;
    const dx = Math.abs(p.x - xRef);
    if (dx > 0.5) {
      yMin = Math.min(yMin, p.y);
      yMax = Math.max(yMax, p.y);
    }
    maxAbsDx = Math.max(maxAbsDx, dx);
  }
  if (yMin === Infinity) {
    return { maxAbsDx, yMin: NaN, yMax: NaN };
  }
  return { maxAbsDx, yMin, yMax };
}

type CaseMetrics = {
  label: string;
  waistCfY: number;
  yokeLowerY: number | null;
  hipY: number;
  tipY: number;
  P0: Point;
  P1: Point;
  P2: Point;
  P3: Point;
  drop: number;
  d1: number;
  chord: number;
  frontCurveLen: number;
  frontTipToWaistLen: number;
  backCrotchLen: number;
  backTipToWaistLen: number;
  deltaFB: number;
  deltaFBTipToWaist: number;
  belly: { maxAbsDx: number; yMin: number; yMax: number };
  inseamF: number;
  inseamB: number;
  inseamDelta: number;
};

function measureCase(
  label: string,
  style: TrouserFrontStyle,
  refBezPts: Point[] | null,
): CaseMetrics {
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const frontPiece = draftTrouserFront(body, style);
  const backPiece = draftTrouserBack(body, style);

  const waistPts = rolePts(frontPiece, "waist");
  const waistCfY = waistPts[0]?.y ?? NaN;
  const r = style.waistReduction ?? 0;
  const yokeLowerY =
    style.waistbandMode === "shaped" && r > 0 ? waistCfY : null;

  const H = body.hip;
  const R = f.p9.y;
  const D = f.p6.y;
  const fork = Math.abs(f.p5.x);
  const crotchScale = resolveFrontCrotchExtensionScale(style);
  const straightRun = resolveCrotchStraightRun(style, R, D, waistCfY);
  const bez = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    fork,
    R,
    waistCfY,
    straightRun,
    extension: frontCrotchExtension(H, crotchScale),
    arrivalAngleDeg: resolveCrotchArrivalAngle(style),
    touch: frontCrotchTouch(H) * crotchScale,
    k1: resolveFrontCrotchFullness(style),
  });

  const drop = bez.P3.y - bez.P0.y;
  const d1 = bez.P1.y - bez.P0.y;
  const chord = Math.hypot(bez.P3.x - bez.P0.x, bez.P3.y - bez.P0.y);
  // tip → CF join (P0): points are p9 → P0
  const frontCurveLen = polylineLength(bez.points);
  const frontTipToWaistLen = polylineLength(frontCrotchTipToWaist(frontPiece));
  const backCrotchOnly = rolePts(backPiece, "crotch");
  const backCb = rolePts(backPiece, "centre-back");
  const backCrotchLen = polylineLength(backCrotchOnly);
  // Homologous tip→waist: back crotch role + centre-back (tip→hip→waist).
  let backTipToWaist: Point[] = backCrotchOnly;
  if (backCb.length > 0) {
    const last = backCrotchOnly[backCrotchOnly.length - 1];
    const first = backCb[0]!;
    if (
      last &&
      Math.hypot(last.x - first.x, last.y - first.y) < 1e-6
    ) {
      backTipToWaist = [...backCrotchOnly, ...backCb.slice(1)];
    } else {
      backTipToWaist = [...backCrotchOnly, ...backCb];
    }
  }
  const backTipToWaistLen = polylineLength(backTipToWaist);

  const inseamF = polylineLength([f.p9, f.p15, f.p14]);
  const inseamB = polylineLength([b.p24, b.p29, b.p28]);

  const belly = refBezPts
    ? bellyVsRef(refBezPts, bez.points)
    : { maxAbsDx: 0, yMin: NaN, yMax: NaN };

  return {
    label,
    waistCfY,
    yokeLowerY,
    hipY: D,
    tipY: f.p9.y,
    P0: bez.P0,
    P1: bez.P1,
    P2: bez.P2,
    P3: bez.P3,
    drop,
    d1,
    chord,
    frontCurveLen,
    frontTipToWaistLen,
    backCrotchLen,
    backTipToWaistLen,
    deltaFB: frontCurveLen - backCrotchLen,
    deltaFBTipToWaist: frontTipToWaistLen - backTipToWaistLen,
    belly,
    inseamF,
    inseamB,
    inseamDelta: inseamB - inseamF,
  };
}

const milaSettings = milaTrouserStyle();

console.log("=== DIAG: front-crotch ↔ waist-finish coupling ===");
console.log(
  `Body: size ${DEFAULT_SIZE_CODE} chart, ease {waist:80, hip:50}, hip 1100`,
);
console.log("Base style: Mila (geometry fixed); only the swept variable changes.\n");

// --- Sweep A ---
const sweepASpecs: {
  label: string;
  mode: WaistbandMode;
  depth: number;
  finish?: "facing" | "waistband";
}[] = [
  { label: "darted/0 (Mila)", mode: "darted", depth: 0, finish: "facing" },
  { label: "shaped/60", mode: "shaped", depth: 60 },
  { label: "shaped/120 (Cleo)", mode: "shaped", depth: 120 },
];

const sweepA: CaseMetrics[] = [];
let refBez: Point[] | null = null;

for (const spec of sweepASpecs) {
  const style = resolveStyle(milaSettings, {
    mode: spec.mode,
    depth: spec.depth,
    dartedWaistFinish: spec.finish,
  });
  const m = measureCase(spec.label, style, refBez);
  if (refBez == null) {
    // Re-measure with self as ref zero, then store bez points from a fresh call.
    const f = trouserFrontPoints(body, style);
    const waistCfY = rolePts(draftTrouserFront(body, style), "waist")[0]!.y;
    const R = f.p9.y;
    const D = f.p6.y;
    const scale = resolveFrontCrotchExtensionScale(style);
    const bez = frontCrotchCurve({
      p5: f.p5,
      p9: f.p9,
      fork: Math.abs(f.p5.x),
      R,
      waistCfY,
      straightRun: resolveCrotchStraightRun(style, R, D, waistCfY),
      extension: frontCrotchExtension(body.hip, scale),
      arrivalAngleDeg: resolveCrotchArrivalAngle(style),
      touch: frontCrotchTouch(body.hip) * scale,
      k1: resolveFrontCrotchFullness(style),
    });
    refBez = bez.points;
    m.belly = { maxAbsDx: 0, yMin: NaN, yMax: NaN };
  }
  sweepA.push(m);
}

console.log("## Sweep A — waist finish (Cleo→Mila axis)\n");
console.log(
  "finish              | waistCfY | P0.y   | F tip→P0 | B crotch | F−B(role) | F tip→w | B tip→w | F−B(tip→w) | belly|Δx|",
);
console.log(
  "--------------------|----------|--------|----------|----------|-----------|---------|---------|------------|----------",
);

for (const m of sweepA) {
  console.log(
    `${m.label.padEnd(19)} | ${f1(m.waistCfY).padStart(8)} | ${f1(m.P0.y).padStart(6)} | ${f2(m.frontCurveLen).padStart(8)} | ${f2(m.backCrotchLen).padStart(8)} | ${f2(m.deltaFB).padStart(9)} | ${f2(m.frontTipToWaistLen).padStart(7)} | ${f2(m.backTipToWaistLen).padStart(7)} | ${f2(m.deltaFBTipToWaist).padStart(10)} | ${f2(m.belly.maxAbsDx).padStart(8)}`,
  );
}

console.log("\n### Sweep A — control points detail\n");
for (const m of sweepA) {
  console.log(`--- ${m.label} ---`);
  console.log(
    `  waistCfY=${f3(m.waistCfY)}  hipY=${f3(m.hipY)}  tipY=${f3(m.tipY)}  yokeLowerY=${m.yokeLowerY == null ? "n/a" : f3(m.yokeLowerY)}`,
  );
  console.log(`  P0 ${pt(m.P0)}`);
  console.log(`  P1 ${pt(m.P1)}`);
  console.log(`  P2 ${pt(m.P2)}`);
  console.log(`  P3 ${pt(m.P3)}`);
  console.log(
    `  drop=${f3(m.drop)}  d1=${f3(m.d1)}  chord=${f3(m.chord)}`,
  );
  console.log(
    `  front tip→P0 (curve)=${f3(m.frontCurveLen)}  tip→waist (outline)=${f3(m.frontTipToWaistLen)}  back crotch(role)=${f3(m.backCrotchLen)}  back tip→waist=${f3(m.backTipToWaistLen)}`,
  );
  console.log(
    `  F−B (tip→P0 − back-role)=${f3(m.deltaFB)}  F−B (tip→waist)=${f3(m.deltaFBTipToWaist)}`,
  );
  console.log(
    `  inseam named F=${f3(m.inseamF)} B=${f3(m.inseamB)}  B−F Δ=${f3(m.inseamDelta)}`,
  );
}

// Headline: does F−B grow across the sweep?
const deltaAtMila = sweepA[0]!.deltaFBTipToWaist;
const deltaAtCleo = sweepA[sweepA.length - 1]!.deltaFBTipToWaist;
const deltaSpread =
  Math.max(...sweepA.map((m) => m.deltaFBTipToWaist)) -
  Math.min(...sweepA.map((m) => m.deltaFBTipToWaist));
const backSpread =
  Math.max(...sweepA.map((m) => m.backCrotchLen)) -
  Math.min(...sweepA.map((m) => m.backCrotchLen));
const backTwSpread =
  Math.max(...sweepA.map((m) => m.backTipToWaistLen)) -
  Math.min(...sweepA.map((m) => m.backTipToWaistLen));
const roleDeltaSpread =
  Math.max(...sweepA.map((m) => m.deltaFB)) -
  Math.min(...sweepA.map((m) => m.deltaFB));

console.log("\n### Sweep A — headline\n");
console.log(
  `  Back crotch *role* range across sweep: ${f3(backSpread)} mm (invariant)`,
);
console.log(
  `  Back tip→waist range across sweep: ${f3(backTwSpread)} mm`,
);
console.log(
  `  F−B tip→waist Δ at darted/0 (Mila): ${f3(deltaAtMila)} mm`,
);
console.log(
  `  F−B tip→waist Δ at shaped/120 (Cleo): ${f3(deltaAtCleo)} mm`,
);
console.log(
  `  Spread of F−B tip→waist Δ across Sweep A: ${f3(deltaSpread)} mm`,
);
console.log(
  `  Spread of F−B (tip→P0 − back-role) across Sweep A: ${f3(roleDeltaSpread)} mm (mixed segments; for context)`,
);
console.log(
  `  Inseam B−F at darted/0 (this body): ${f3(sweepA[0]!.inseamDelta)} mm`,
);
console.log(
  `  (Reference: ~3.8 mm front/back inseam balance accepted at Helen's body.)`,
);

// --- Sweep B ---
console.log("\n## Sweep B — crotchStraightRun alone (waist fixed darted/0)\n");
console.log(
  "straightRun | P0.y   | drop   | d1     | F crotch | note",
);
console.log(
  "------------|--------|--------|--------|----------|------",
);

const sweepBRuns = [0, 15, 30] as const;
for (const run of sweepBRuns) {
  const style = resolveStyle(
    milaSettings,
    { mode: "darted", depth: 0, dartedWaistFinish: "facing" },
    run,
  );
  const m = measureCase(`run=${run}`, style, null);
  const note =
    run === 0
      ? "same lever as raising waistCfY (P0.y = waistCfY + run)"
      : `P0.y − waistCfY = ${f1(m.P0.y - m.waistCfY)}`;
  console.log(
    `${String(run).padStart(11)} | ${f1(m.P0.y).padStart(6)} | ${f1(m.drop).padStart(6)} | ${f1(m.d1).padStart(6)} | ${f2(m.frontCurveLen).padStart(8)} | ${note}`,
  );
  console.log(
    `             waistCfY=${f1(m.waistCfY)}  P0 ${pt(m.P0)}  drop=${f3(m.drop)} d1=${f3(m.d1)}`,
  );
}

// Compare Sweep A P0.y motion to Sweep B
console.log("\n### Sweep B vs Sweep A — same lever through P0.y?\n");
console.log("  Sweep A P0.y:");
for (const m of sweepA) {
  console.log(`    ${m.label.padEnd(20)} P0.y=${f3(m.P0.y)}  drop=${f3(m.drop)}  F len=${f3(m.frontCurveLen)}`);
}
console.log(
  "  Sweep B moves P0.y by changing straightRun at fixed waistCfY; Sweep A moves P0.y by changing waistCfY (and resolved straightRun max).",
);
console.log(
  "  Both act through P0.y → drop → d1 → belly / front seam length.",
);

console.log("\n=== end diagnostic (no code changed) ===");
