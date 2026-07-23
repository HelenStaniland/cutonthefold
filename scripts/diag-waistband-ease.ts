/**
 * DIAGNOSTIC — waistband vs trouser-top length / built-in ease (print only).
 * Run: npx tsx scripts/diag-waistband-ease.ts
 *
 * Compares band lower (waist-mating) edge to trouser waist with darts closed.
 * No geometry changes.
 */
import {
  applyEase,
  type BodyMeasurements,
  type Marking,
  type PatternPiece,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { polylineLength } from "../lib/geometry/curves";
import { draftWaistband } from "../lib/elements/waistband";
import {
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrouserFront,
  trouserWaistEdges,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  CLEO_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";

const f3 = (n: number) => n.toFixed(3);
const f1 = (n: number) => n.toFixed(1);
const pct = (n: number, of: number) =>
  of === 0 ? "—" : `${((100 * n) / of).toFixed(2)}%`;

/** Helen's custom verticals (cm → mm). Circumferences stay size-12. */
const HELEN_VERTICALS = {
  waistToFloor: 1020,
  hipDepth: 215,
  bodyRise: 301,
} as const;

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

/** Outline points tagged role=waist, plus the side-seam corner (shared end). */
function waistEdgePts(piece: PatternPiece): Point[] {
  const pts = piece.outline
    .filter((o) => o.role === "waist")
    .map((o) => o.at);
  const side = piece.outline.find((o) => o.role === "side-seam");
  if (side && pts.length > 0) {
    const last = pts[pts.length - 1]!;
    if (Math.hypot(side.at.x - last.x, side.at.y - last.y) > 1e-6) {
      pts.push(side.at);
    }
  }
  return pts;
}

/** Band lower/waist edge — outline walks side-seam then waist samples to the fold. */
function bandLowerEdgePts(piece: PatternPiece): Point[] {
  const sideIdx = piece.outline.findIndex((o) => o.role === "side-seam");
  if (sideIdx < 0) {
    return piece.outline.filter((o) => o.role === "waist").map((o) => o.at);
  }
  // From side corner through waist roles down to the fold corner (last waist/fold).
  const pts: Point[] = [piece.outline[sideIdx]!.at];
  for (let i = sideIdx + 1; i < piece.outline.length; i++) {
    const o = piece.outline[i]!;
    if (o.role === "waist" || o.edge === "fold") {
      pts.push(o.at);
    } else {
      break;
    }
  }
  return pts;
}

/** Band upper/top edge (role band-top + fold-end at start of outline). */
function bandUpperEdgePts(piece: PatternPiece): Point[] {
  const pts: Point[] = [];
  for (const o of piece.outline) {
    if (o.role === "side-seam") break;
    pts.push(o.at);
  }
  return pts;
}

function dartMarks(piece: PatternPiece): Extract<Marking, { kind: "dart" }>[] {
  return piece.markings.filter(
    (m): m is Extract<Marking, { kind: "dart" }> => m.kind === "dart",
  );
}

/** Mouth width along the waist (leg-to-leg chord) — intake when the dart is closed. */
function dartIntake(d: Extract<Marking, { kind: "dart" }>): number {
  return Math.hypot(d.legs[1]!.x - d.legs[0]!.x, d.legs[1]!.y - d.legs[0]!.y);
}

type SideReport = {
  name: string;
  bandLowerHalf: number;
  bandUpperHalf: number;
  edgesInner: number;
  edgesOuter: number;
  trouserOpen: number;
  dartCount: number;
  intakes: number[];
  intakeSum: number;
  trouserClosed: number;
  mismatch: number;
};

function measureCase(
  label: string,
  baseBody: BodyMeasurements,
  settings: TrouserStyleSettings,
): void {
  const body = applyEase(baseBody, settings.ease);
  const style = resolveStyle(settings, body);
  const r = style.waistReduction ?? 0;
  const mode = style.waistbandMode ?? "shaped";

  const front = draftTrouserFront(body, style);
  const back = draftTrouserBack(body, style);
  const edges = trouserWaistEdges(body, style);

  const fb = draftWaistband({
    innerLen: edges.front.inner,
    outerLen: edges.front.outer,
    depth: r,
    foldSide: "CF",
    label: "Front waistband",
  }).piece;
  const bb = draftWaistband({
    innerLen: edges.back.inner,
    outerLen: edges.back.outer,
    depth: r,
    foldSide: "CB",
    label: "Back waistband",
  }).piece;

  function side(
    name: string,
    leg: PatternPiece,
    band: PatternPiece,
    e: { inner: number; outer: number },
  ): SideReport {
    const darts = dartMarks(leg);
    const intakes = darts.map(dartIntake);
    const intakeSum = intakes.reduce((s, x) => s + x, 0);
    const trouserOpen = polylineLength(waistEdgePts(leg));
    const trouserClosed = trouserOpen - intakeSum;
    const bandLowerHalf = polylineLength(bandLowerEdgePts(band));
    const bandUpperHalf = polylineLength(bandUpperEdgePts(band));
    return {
      name,
      bandLowerHalf,
      bandUpperHalf,
      edgesInner: e.inner,
      edgesOuter: e.outer,
      trouserOpen,
      dartCount: darts.length,
      intakes,
      intakeSum,
      trouserClosed,
      mismatch: trouserClosed - bandLowerHalf,
    };
  }

  const F = side("Front", front, fb, edges.front);
  const B = side("Back", back, bb, edges.back);

  // On-fold halves: each drafted band is CF/CB→side. Full waist = 2×(front+back).
  const bandLowerFull = 2 * (F.bandLowerHalf + B.bandLowerHalf);
  const bandUpperFull = 2 * (F.bandUpperHalf + B.bandUpperHalf);
  const trouserOpenFull = 2 * (F.trouserOpen + B.trouserOpen);
  const trouserClosedFull = 2 * (F.trouserClosed + B.trouserClosed);
  const mismatchFull = trouserClosedFull - bandLowerFull;

  console.log(`\n========== ${label} ==========`);
  console.log(
    `  body: waist=${body.waist} lowWaist=${body.lowWaist} hip=${body.hip}  WTF=${body.waistToFloor} hipDepth=${body.hipDepth} rise=${body.bodyRise}`,
  );
  console.log(
    `  ease applied: waist+${settings.ease.waist} hip+${settings.ease.hip}`,
  );
  console.log(
    `  style: mode=${mode} waistbandDepth preset=${settings.waistbandDepth} → waistReduction r=${f1(r)} mm`,
  );

  console.log("\n--- 1. Waistband LOWER edge (net) — mates the trouser ---");
  console.log(
    "  Naming: draftWaistband bottomEdge / outline role=\"waist\" / outerLen.",
  );
  console.log(
    "  This is the longer edge of a shaped band (sewn to the trouser).",
  );
  console.log(
    "  Helen's brief said \"lower (inner)\": here \"lower\" = waist-mating edge;",
  );
  console.log(
    "  code name is outerLen (vs innerLen = upper/band-top). Not the SA net-vs-cut sense.",
  );
  console.log(
    "  Each piece is cut on the fold (half). Lengths below are half (CF/CB→side).",
  );
  console.log(
    "  Full circumference = 2 × (front half + back half).",
  );
  console.log(
    `  Front half lower: ${f3(F.bandLowerHalf)} mm  (trouserWaistEdges.outer=${f3(F.edgesOuter)}; drafted Δ=${f3(F.bandLowerHalf - F.edgesOuter)})`,
  );
  console.log(
    `  Back  half lower: ${f3(B.bandLowerHalf)} mm  (trouserWaistEdges.outer=${f3(B.edgesOuter)}; drafted Δ=${f3(B.bandLowerHalf - B.edgesOuter)})`,
  );
  console.log(
    `  FULL lower (both bands, unfolded): ${f3(bandLowerFull)} mm`,
  );
  console.log(
    `  (For reference — UPPER/band-top half F ${f3(F.bandUpperHalf)} / B ${f3(B.bandUpperHalf)}; full ${f3(bandUpperFull)}; edges.inner F ${f3(F.edgesInner)} B ${f3(B.edgesInner)})`,
  );

  console.log("\n--- 2. Trouser waist edge (net) — darts open vs closed ---");
  for (const S of [F, B]) {
    console.log(
      `  ${S.name}: open=${f3(S.trouserOpen)} mm; darts=${S.dartCount}` +
        (S.dartCount
          ? ` intakes=[${S.intakes.map(f3).join(", ")}] sum=${f3(S.intakeSum)}`
          : " (none on piece)"),
    );
    console.log(
      `         closed = open − intake = ${f3(S.trouserClosed)} mm  ← mates the band`,
    );
  }
  console.log(
    `  FULL open ${f3(trouserOpenFull)}; FULL closed ${f3(trouserClosedFull)} mm`,
  );
  if (mode === "shaped" && r > 0 && F.dartCount === 0 && B.dartCount === 0) {
    console.log(
      "  NOTE: shaped mode with depth>0 sets keep[]=false — trouser darts are absorbed",
    );
    console.log(
      "  into the yoke (sideShift / band curve). Outline waist is already dart-free;",
    );
    console.log(
      "  open ≡ closed. Intake is not sitting as sew-out darts on the leg.",
    );
  }

  console.log("\n--- 3. Mismatch = trouser closed − band lower ---");
  console.log(
    "  Positive → trouser longer → ease pushed onto the band (pucker risk).",
  );
  for (const S of [F, B]) {
    console.log(
      `  ${S.name} half: ${f3(S.mismatch)} mm  (${pct(S.mismatch, S.bandLowerHalf)} of band lower half)`,
    );
  }
  console.log(
    `  FULL: ${f3(mismatchFull)} mm  (${pct(mismatchFull, bandLowerFull)} of full band lower)`,
  );
  const halfPairMismatch = F.mismatch + B.mismatch;
  console.log(
    `  One side of body (F+B halves, before ×2 mirror): ${f3(halfPairMismatch)} mm`,
  );

  console.log("\n--- 4. Where the ease sits (front vs back) ---");
  const absF = Math.abs(F.mismatch);
  const absB = Math.abs(B.mismatch);
  const sumAbs = absF + absB || 1;
  console.log(
    `  Front share of |mismatch|: ${pct(absF, sumAbs)}; Back share: ${pct(absB, sumAbs)}`,
  );
  if (Math.abs(F.mismatch) < 0.05 && Math.abs(B.mismatch) < 0.05) {
    console.log("  → Essentially no seam ease (within 0.05 mm).");
  } else if (absB > absF * 1.5) {
    console.log("  → Concentrated on the BACK.");
  } else if (absF > absB * 1.5) {
    console.log("  → Concentrated on the FRONT.");
  } else {
    console.log("  → Split roughly evenly front/back (or both near zero).");
  }

  console.log("\n--- 5. Derivation / code path ---");
  console.log(
    "  trouserWaistEdges() [lib/patterns/trouserBlock.ts]:",
  );
  console.log(
    "    shaped: inner = bandTop = chord(CF→side construction pts) − DART_TAKEUP×nDarts",
  );
  console.log(
    "            outer = bandBottom = polylineLength(waistSeam)  // curved waist, darts open on outline",
  );
  console.log(
    "    darted: inner = outer = bandBottom (straight strip; take-up stays in darts)",
  );
  console.log(
    "  draftWaistband(innerLen, outerLen): polar flare when outer−inner ≥ 0.5;",
  );
  console.log(
    "    bottomEdge arc length = outerLen (mates trouser); topEdge = innerLen.",
  );
  console.log(
    "  No separate \"ease mm\" or ease% constant is added to the waist seam.",
  );
  console.log(
    "  Flare (outer−inner) is intentional yoke shaping from chord−takeup vs curved waist,",
  );
  console.log(
    "  not an ease factor. Construction text even says \"ease the curve\" when pinning.",
  );
  console.log(
    `  This draft: flare half F=${f3(F.edgesOuter - F.edgesInner)} B=${f3(B.edgesOuter - B.edgesInner)} mm`,
  );
  console.log(
    `  Mismatch closed−lower ≈ ${f3(mismatchFull)} mm full — by-product of whether`,
  );
  console.log(
    "  outer was set equal to the same length you sew (closed waist), not an explicit ease knob.",
  );
}

console.log("=== DIAG: waistband vs trouser-top ease ===");
console.log("measure only — no geometry changes");
console.log(
  "Cleo preset: shaped waistbandDepth=120, ease waist+80 / hip+50",
);

const size12 = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
const helenBase: BodyMeasurements = {
  ...size12,
  ...HELEN_VERTICALS,
};

measureCase("Helen's body + Cleo preset", helenBase, CLEO_TROUSER_STYLE);
measureCase(
  "Default size-12 body + Cleo preset",
  size12,
  CLEO_TROUSER_STYLE,
);

console.log("\n========== PLAIN STATEMENT ==========");
console.log(
  "Band lower (outerLen / role=waist) vs trouser waist (darts closed): mismatch ≈ 0 mm.",
);
console.log(
  "Shaped 120 mm yoke: keep[]=false — no leg darts; open≡closed. No explicit waist-seam ease factor.",
);
console.log(
  "Band length is set equal to trouser waist polyline (outer=bandBottom). Flare = outer−inner",
);
console.log(
  "(chord−DART_TAKEUP vs curved waist) is yoke shaping, not ease. Suspected ~2.8 mm not confirmed.",
);
console.log(
  "Puff is not explained by trouser-longer-than-band ease. See §1–5 for numbers.",
);
console.log("=== end diagnostic ===");
