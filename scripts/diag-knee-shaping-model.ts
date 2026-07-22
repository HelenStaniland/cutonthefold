/**
 * Diagnostic only — does knee-shaping (signed S, 85/15) reproduce current widths?
 * Run: npx tsx scripts/diag-knee-shaping-model.ts
 * Report only. Does not change product code.
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
import { CLEO_PRESET } from "../lib/pattern/blockPresets";

const INSEAM_SHARE = 0.85;
const SIDE_SHARE = 0.15;

const chart = bodyForSizeCode("12")!;
const blockBody = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const cleoBody = applyEase(
  { ...chart, hip: 1100 },
  CLEO_PRESET.measured.ease,
);

function xOn(a: Point, b: Point, y: number): number {
  return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
}

function toDraft(
  s: TrouserStyleSettings,
  body: typeof blockBody,
): TrouserFrontStyle {
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    waistDrop: s.waistDrop,
    ...(s.frontKneeWidth != null ? { frontKneeWidth: s.frontKneeWidth } : {}),
    ...(s.frontHemWidth != null ? { frontHemWidth: s.frontHemWidth } : {}),
    ...(s.backKneeWidth != null ? { backKneeWidth: s.backKneeWidth } : {}),
    ...(s.backHemWidth != null ? { backHemWidth: s.backHemWidth } : {}),
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

/**
 * Outboard convention (matches the proposed model):
 *   side outboard  = kneeSide.x − chordSide   (+ = outboard / wider)
 *   inseam outboard = chordIn − kneeIn.x     (+ = outboard / wider on −x edge)
 * Model: sideOut = S·0.15, inseamOut = S·0.85, total width Δ = S.
 */
type EdgeReport = {
  piece: string;
  kneeW: number;
  hemW: number;
  sideChord: number;
  inChord: number;
  kneeSide: number;
  kneeIn: number;
  sideOut: number;
  inOut: number;
  /** Split of total outboard onto inseam (0–1), or NaN if total≈0. */
  actualInseamShare: number;
  S_fromSide: number;
  S_fromInseam: number;
  /** Least-squares S under 85/15: minimise (side−0.15S)²+(in−0.85S)² */
  S_best: number;
  residSide: number;
  residIn: number;
};

function analysePiece(
  piece: string,
  tip: Point,
  hipSide: Point,
  kneeIn: Point,
  kneeSide: Point,
  hemIn: Point,
  hemSide: Point,
): EdgeReport {
  const y = kneeIn.y;
  const sideChord = xOn(hipSide, hemSide, y);
  const inChord = xOn(tip, hemIn, y);
  const sideOut = kneeSide.x - sideChord;
  const inOut = inChord - kneeIn.x;
  const total = sideOut + inOut;
  const actualInseamShare =
    Math.abs(total) < 1e-9 ? NaN : inOut / total;

  const S_fromSide = sideOut / SIDE_SHARE;
  const S_fromInseam = inOut / INSEAM_SHARE;
  // d/dS [ (side−0.15S)² + (in−0.85S)² ] = 0
  // ⇒ S = (0.15·side + 0.85·in) / (0.15² + 0.85²)
  const S_best =
    (SIDE_SHARE * sideOut + INSEAM_SHARE * inOut) /
    (SIDE_SHARE * SIDE_SHARE + INSEAM_SHARE * INSEAM_SHARE);
  const residSide = sideOut - SIDE_SHARE * S_best;
  const residIn = inOut - INSEAM_SHARE * S_best;

  return {
    piece,
    kneeW: Math.abs(kneeSide.x - kneeIn.x),
    hemW: Math.abs(hemSide.x - hemIn.x),
    sideChord,
    inChord,
    kneeSide: kneeSide.x,
    kneeIn: kneeIn.x,
    sideOut,
    inOut,
    actualInseamShare,
    S_fromSide,
    S_fromInseam,
    S_best,
    residSide,
    residIn,
  };
}

function fmt(n: number, d = 3): string {
  if (!Number.isFinite(n)) return "  n/a  ";
  const s = n.toFixed(d);
  return (n >= 0 ? "+" : "") + s;
}

function printTable(title: string, rows: EdgeReport[]) {
  console.log("\n" + "=".repeat(88));
  console.log(title);
  console.log("=".repeat(88));
  console.log(
    "piece | knee  hem  | sideChord  kneeSide  sideOut | inChord    kneeIn    inOut  | actual%inseam",
  );
  console.log("-".repeat(88));
  for (const r of rows) {
    console.log(
      `${r.piece.padEnd(5)} | ${r.kneeW.toFixed(1).padStart(5)} ${r.hemW.toFixed(1).padStart(5)} | ${r.sideChord.toFixed(2).padStart(9)} ${r.kneeSide.toFixed(2).padStart(9)} ${fmt(r.sideOut, 2).padStart(8)} | ${r.inChord.toFixed(2).padStart(9)} ${r.kneeIn.toFixed(2).padStart(9)} ${fmt(r.inOut, 2).padStart(7)} | ${Number.isFinite(r.actualInseamShare) ? (100 * r.actualInseamShare).toFixed(1).padStart(5) + "%" : "  n/a"}`,
    );
  }
  console.log(
    "\npiece | S from side/0.15 | S from in/0.85 | S best(85/15) | resid side | resid in | single-S fit?",
  );
  console.log("-".repeat(88));
  for (const r of rows) {
    const agree =
      Math.abs(r.S_fromSide - r.S_fromInseam) < 2
        ? "YES (~same S)"
        : "NO (edges disagree)";
    console.log(
      `${r.piece.padEnd(5)} | ${fmt(r.S_fromSide, 2).padStart(16)} | ${fmt(r.S_fromInseam, 2).padStart(14)} | ${fmt(r.S_best, 2).padStart(13)} | ${fmt(r.residSide, 2).padStart(10)} | ${fmt(r.residIn, 2).padStart(8)} | ${agree}`,
    );
  }
  console.log(
    "\nImplied split of total outboard (inseam share = inOut/(sideOut+inOut)):",
  );
  for (const r of rows) {
    const sideShare = Number.isFinite(r.actualInseamShare)
      ? 1 - r.actualInseamShare
      : NaN;
    console.log(
      `  ${r.piece}: inseam ${(100 * (r.actualInseamShare || 0)).toFixed(1)}% / side ${(100 * (sideShare || 0)).toFixed(1)}%   (model wants 85% / 15%)`,
    );
  }
}

console.log("Body: size-12 chart, hip 1100 + ease waist 10 / hip 50 → hip", blockBody.hip);
console.log(
  "Model under test: knee = chord ± S with SIDE=15% INSEAM=85%; +S = outboard (wider).",
);

// --- Target A: Aldrich block defaults ---
{
  const style = toDraft(BLOCK_TROUSER_STYLE, blockBody);
  const f = trouserFrontPoints(blockBody, style);
  const b = trouserBackPoints(blockBody, style);
  printTable("TARGET A — Aldrich block defaults (bottomWidth 220, no explicit widths)", [
    analysePiece("front", f.p9, f.p8, f.p15, f.p13, f.p14, f.p12),
    analysePiece("back", b.p24, b.p25, b.p29, b.p27, b.p28, b.p26),
  ]);
}

// --- Target B: Cleo measured widths ---
{
  const style = toDraft(CLEO_TROUSER_STYLE, cleoBody);
  const f = trouserFrontPoints(cleoBody, style);
  const b = trouserBackPoints(cleoBody, style);
  printTable(
    "TARGET B — Cleo (frontKnee/Hem 330/350, back 365/375; drafted via four-width)",
    [
      analysePiece("front", f.p9, f.p8, f.p15, f.p13, f.p14, f.p12),
      analysePiece("back", b.p24, b.p25, b.p29, b.p27, b.p28, b.p26),
    ],
  );
  console.log(
    "\nNote: Cleo knee is placed about the crotch→hem chord mid with the measured half-piece",
  );
  console.log(
    "width (current four-width construction). Offsets above are that placement vs the chords.",
  );
}

console.log("\n" + "=".repeat(88));
console.log("DECISION FRAME (do not implement — report only)");
console.log("=".repeat(88));
console.log(`
If a single S per piece with 85/15 reproduces both Aldrich and Cleo within ~1–2 mm
  → model works; wire next.

If Aldrich needs ~50/50 (symmetric about 0 / equal edge offsets) and Cleo needs ~85/15
  → fixed 85/15 is wrong for both; either sign-dependent split, or accept Aldrich residual.

See tables above for which case we are in.
`);
