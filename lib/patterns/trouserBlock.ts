import {
  BodyMeasurements,
  ConstructionStep,
  DraftingLine,
  DraftingLineKind,
  DraftingPoint,
  Millimetres,
  OutlinePoint,
  Pattern,
  PatternPiece,
  PieceConstruction,
  Point,
  Marking,
  EdgeType,
} from "@/lib/types/measurements";
import { validationResult, ValidationResult } from "@/lib/types/validation";
import {
  catmullRom,
  pchipByY,
  pointAtArcDistanceFromEnd,
  pointAtArcDistanceFromStart,
  polylineLength,
  quadBezier,
} from "@/lib/geometry/curves";

export type TrouserBlock = "classic" | "production";

type TrouserBlockSpec = {
  waist: "natural" | "low";
  riseDrop: Millimetres;
  hipDepthDrop: Millimetres;
  frontDartLength: Millimetres;
  backWaistStep: Millimetres;
  backCrotchAdd: Millimetres;
  backDartLengths: [Millimetres, Millimetres];
};

const TROUSER_BLOCKS: Record<TrouserBlock, TrouserBlockSpec> = {
  classic: {
    waist: "natural",
    riseDrop: 0,
    hipDepthDrop: 0,
    frontDartLength: 100,
    backWaistStep: 20,
    backCrotchAdd: 8,
    backDartLengths: [120, 100],
  },
  production: {
    waist: "low",
    riseDrop: 50,
    hipDepthDrop: 50,
    frontDartLength: 60,
    backWaistStep: 17.5,
    backCrotchAdd: 5,
    backDartLengths: [80, 60],
  },
};
// NOTE: Aldrich p.46 lowers rise and waist-to-hip by 5cm but leaves 0–3 (waist
// to floor) at the FULL measurement, so the production leg runs to the same
// floor length. If the first toile comes up ~5cm long in the leg, also subtract
// 50 from waistToFloor for the production block (add a waistToFloorDrop here).

export type WaistbandMode = "darted" | "shaped";
const DART_TAKEUP = 20;

/** Aldrich p.48 §2a — fixed waistline scoop depth (mm), not user-adjustable. */
export const WAISTLINE_CURVE_FRONT = 12;
export const WAISTLINE_CURVE_BACK = 5;

/** Darted faced band depth range (mm): sewable minimum through shaped handover. */
export const DARTED_DEPTH_MIN = 20;
export const DARTED_DEPTH_MAX = 30;
export const SHAPED_DEPTH_MIN = 30;
/** Slider / cap safety step (mm) — matches shaped depth UI step. */
export const SHAPED_DEPTH_CAP_STEP = 5;

export const DEFAULT_WAISTBAND_DEPTH = 40;
/** Shaped-band lower edge must stay at least this far above the drafted hipline (mm). */
export const YOKE_HIP_MARGIN = 15;

/** Map legacy mode names to the two-mode model. */
export function normalizeWaistbandMode(mode?: string): WaistbandMode {
  if (mode === "darted" || mode === "shaped") {
    return mode;
  }
  if (
    mode === "contour" ||
    mode === "yoke" ||
    mode === "shapedStub"
  ) {
    return "shaped";
  }
  return "shaped";
}

/** Maximum shaped-band / deep-yoke depth for this body (mm). */
export function maxYokeDepth(
  body: BodyMeasurements,
  block: TrouserBlock = "classic",
): Millimetres {
  const hipLine = body.hipDepth - TROUSER_BLOCKS[block].hipDepthDrop;
  return Math.max(0, hipLine - YOKE_HIP_MARGIN);
}

const DEFAULT_HEM_WIDTH: Millimetres = 220;

/** Minimum turn at CB (degrees) — below this the waist continues into the crotch curve. */
const CB_MIN_CORNER_TURN_DEG = 20;
const CB_MAX_INTERIOR_ANGLE_DEG = 180 - CB_MIN_CORNER_TURN_DEG;
/** Interior angle above this at CB — waist is folding into the crotch curve. */
const CB_FOLD_INTERIOR_DEG = 135;
/** Dense waist samples for back cap / CB coherence (not the 97-point seam). */
const WAIST_CAP_SAMPLE_COUNT = 241;
const CB_WAIST_NEAR_DENSE = 48;

/** Largest shaped depth (mm) where the back waist stays coherent at CB. */
export function maxBackShapedWaistDepth(
  body: BodyMeasurements,
  block: TrouserBlock = "classic",
  bottomWidth: Millimetres = DEFAULT_HEM_WIDTH,
): Millimetres {
  const style: TrouserFrontStyle = {
    bottomWidth,
    block,
    waistbandMode: "shaped",
  };
  const hipCap = maxYokeDepth(body, block);
  if (hipCap <= SHAPED_DEPTH_MIN) {
    return SHAPED_DEPTH_MIN;
  }

  let firstBad: Millimetres | null = null;
  for (let d = SHAPED_DEPTH_MIN; d <= hipCap; d += 1) {
    if (!isBackShapedWaistCoherentAtDepth(body, style, d)) {
      firstBad = d;
      break;
    }
  }
  if (firstBad === null) {
    return hipCap;
  }
  if (firstBad <= SHAPED_DEPTH_MIN) {
    return SHAPED_DEPTH_MIN;
  }
  return Math.max(SHAPED_DEPTH_MIN, firstBad - SHAPED_DEPTH_CAP_STEP);
}

/** Finished depth range for the active waistband mode (mm). */
export function waistbandDepthRange(
  mode: WaistbandMode,
  body: BodyMeasurements,
  block: TrouserBlock = "classic",
  bottomWidth: Millimetres = DEFAULT_HEM_WIDTH,
): { min: Millimetres; max: Millimetres } {
  switch (mode) {
    case "darted":
      return { min: DARTED_DEPTH_MIN, max: DARTED_DEPTH_MAX };
    case "shaped": {
      const hipCap = maxYokeDepth(body, block);
      const backCap = maxBackShapedWaistDepth(body, block, bottomWidth);
      return { min: SHAPED_DEPTH_MIN, max: Math.min(hipCap, backCap) };
    }
  }
}

/** Clamp requested band depth to the active mode's range (and hip cap). */
export function clampWaistbandDepth(
  requested: Millimetres,
  body: BodyMeasurements,
  block: TrouserBlock = "classic",
  mode: WaistbandMode = "darted",
  bottomWidth: Millimetres = DEFAULT_HEM_WIDTH,
): Millimetres {
  if (requested <= 0) {
    return 0;
  }
  const { min, max } = waistbandDepthRange(mode, body, block, bottomWidth);
  return Math.max(min, Math.min(max, requested));
}

/** True when darted mode finishes the waist with a facing (depth 0), not a band. */
export function isDartedFacingFinish(style: TrouserFrontStyle): boolean {
  return (
    normalizeWaistbandMode(style.waistbandMode) === "darted" &&
    (style.waistReduction ?? 0) === 0
  );
}

/** Construction steps for darted facing finish — band piece omitted until drafted. */
export function trouserFacingSteps(): ConstructionStep[] {
  // TODO: draft facing pieces (front/back) from trouser waist edges and append here.
  return [
    {
      id: "waist-facing",
      text: "Finish the waist with a facing — facing piece to follow.",
      highlight: [
        { piece: "Trouser front", edges: ["waist"] },
        { piece: "Trouser back", edges: ["waist"] },
      ],
    },
  ];
}

function resolveDarts(
  lengths: number[],
  r: number,
  mode: WaistbandMode,
): { keep: boolean[]; sideShift: number } {
  if (r === 0) {
    return { keep: lengths.map(() => true), sideShift: 0 };
  }
  if (mode === "shaped") {
    const sideShift = lengths.reduce(
      (s, L) => s + DART_TAKEUP * Math.max(0, Math.min(1, 1 - r / L)),
      0,
    );
    return { keep: lengths.map(() => false), sideShift };
  }
  return { keep: lengths.map(() => true), sideShift: 0 };
}

export const frontDartLength = (block: TrouserBlock): number =>
  TROUSER_BLOCKS[block].frontDartLength;

// Distance from centre front to the sewn front dart, along the finished waist.
// Dart is centred on point 0; centre front is point 10; the 2 cm dart's take-up
// (10 mm on the CF side) closes up when sewn. Works out to one-twelfth hip.
export function frontDartFromCentreFront(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): number {
  const { p10 } = trouserFrontPoints(body, style);
  return -p10.x - 10;
}

function trouserBlockSpec(style: TrouserFrontStyle): TrouserBlockSpec {
  return TROUSER_BLOCKS[style.block ?? "classic"];
}

export function trouserDraftMeasures(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): { W: Millimetres; H: Millimetres; R: Millimetres; D: Millimetres; F: Millimetres } {
  const spec = trouserBlockSpec(style);
  return {
    W: spec.waist === "low" ? body.lowWaist : body.waist,
    H: body.hip,
    R: body.bodyRise - spec.riseDrop,
    D: body.hipDepth - spec.hipDepthDrop,
    F: body.waistToFloor,
  };
}

export type TrouserFrontStyle = {
  /** Finished hem width of one leg laid flat (= ½ the hem circumference; Aldrich's trouser bottom width). Front piece drafts 10mm narrower, back 10mm wider. */
  bottomWidth: Millimetres;
  block?: TrouserBlock;
  /** Drop the trouser waist by this amount when a waistband is added. */
  waistReduction?: Millimetres;
  /** darted | shaped — shallow faced band vs deep shaped band / yoke. */
  waistbandMode?: WaistbandMode;
};

export const withWaistband = (
  style: TrouserFrontStyle,
  depth: Millimetres = DEFAULT_WAISTBAND_DEPTH,
  mode: WaistbandMode = "shaped",
  body?: BodyMeasurements,
): TrouserFrontStyle => {
  const normalized = normalizeWaistbandMode(mode);
  return {
    ...style,
    waistReduction: body
      ? clampWaistbandDepth(
          depth,
          body,
          style.block,
          normalized,
          style.bottomWidth,
        )
      : depth,
    waistbandMode: normalized,
  };
};

export type FrontPoints = {
  p5: Point;
  p6: Point;
  p8: Point;
  p9: Point;
  p10: Point;
  p11: Point;
  p12: Point;
  p13: Point;
  p14: Point;
  p15: Point;
};

export type BackPoints = {
  p16: Point;
  p17: Point;
  p18: Point;
  p19: Point;
  p21: Point;
  p22: Point;
  p23: Point;
  p24: Point;
  p25: Point;
  p26: Point;
  p27: Point;
  p28: Point;
  p29: Point;
  guide: Point;
};

export type SizeBand = "6-8" | "10-14" | "16-20" | "22-26";

export function sizeBand(hip: Millimetres): SizeBand {
  if (hip < 875) return "6-8";
  if (hip < 1030) return "10-14";
  if (hip < 1210) return "16-20";
  return "22-26";
}

const FRONT_CROTCH_TOUCH: Record<SizeBand, Millimetres> = {
  "6-8": 27.5,
  "10-14": 30,
  "16-20": 32.5,
  "22-26": 35,
};

const BACK_CROTCH_TOUCH: Record<SizeBand, Millimetres> = {
  "6-8": 40,
  "10-14": 42.5,
  "16-20": 45,
  "22-26": 47.5,
};

const KNEE_ADD: Record<SizeBand, Millimetres> = {
  "6-8": 13,
  "10-14": 13,
  "16-20": 15,
  "22-26": 17,
};

const forkWidth = (H: number) => H / 12 + 20;

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / len, y: v.y / len };
}

/** Inward normal for a crotch notch from two neighbouring curve samples.
 *  Perpendicular to the local tangent, pointed toward +x (side seam). */
function crotchNotchDir(neighbourBefore: Point, neighbourAfter: Point): Point {
  const tangent = normalize({
    x: neighbourAfter.x - neighbourBefore.x,
    y: neighbourAfter.y - neighbourBefore.y,
  });
  let nrm = { x: -tangent.y, y: tangent.x };
  if (nrm.x < 0) {
    nrm = { x: -nrm.x, y: -nrm.y };
  }
  return nrm;
}

/** Point on a polyline at the given y, with chord neighbours for tangent. */
function pointOnPolylineAtY(
  points: Point[],
  y: Millimetres,
): { at: Point; before: Point; after: Point } {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (y < minY - 1e-9 || y > maxY + 1e-9) {
      continue;
    }
    if (Math.abs(b.y - a.y) < 1e-9) {
      continue;
    }
    const t = (y - a.y) / (b.y - a.y);
    return {
      at: { x: a.x + t * (b.x - a.x), y },
      before: a,
      after: b,
    };
  }
  throw new Error(`No polyline segment crosses y=${y}`);
}

function xOnLineAtY(a: Point, b: Point, y: number): number {
  return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
}

type WaistResolved = {
  cf: Point;
  side: Point;
  waistSeam: Point[];
  curveSpec: WaistCurveSpec;
  keep: boolean[];
  dartLengths: Millimetres[];
  bandTop: Millimetres;
  bandBottom: Millimetres;
};

const DART_LEG_HALF = 10;
const FRONT_DART_APEX_X = 0;
/** Back dart mouth positions along waist parameter t (Aldrich thirds). */
const BACK_DART_T: [number, number] = [1 / 3, 2 / 3];

/** §2a scoop envelope: 1 at CF/CB, 0 at the side seam. */
function waistlineScoopFactor(t: number): number {
  const c = Math.cos((t * Math.PI) / 2);
  return c * c;
}

/** Walk arc-distance down a body edge from the drafted waist corner. */
function waistCornerEndpoint(
  edge: Point[],
  corner: Point,
  r: Millimetres,
): Point {
  if (r <= 0) {
    return { ...corner };
  }
  const cornerIdx = edge.findIndex(
    (p) => Math.hypot(p.x - corner.x, p.y - corner.y) < 0.01,
  );
  if (cornerIdx < 0) {
    return pointOnPolylineAtY(edge, corner.y + r).at;
  }
  if (cornerIdx === edge.length - 1) {
    return pointAtArcDistanceFromEnd(edge, r);
  }
  const fromCorner = edge.slice(cornerIdx);
  if (fromCorner.length < 2) {
    return pointOnPolylineAtY(edge, corner.y + r).at;
  }
  return pointAtArcDistanceFromStart(fromCorner, r);
}

// =============================================================================
// Single-curve waist model — waistPoint(t) sampled once, no re-spline.
// =============================================================================

/** Inputs for one waist edge (front CF→side or back CB→side). */
type WaistCurveSpec = {
  cfWaist: Point;
  sideWaist: Point;
  cfEdge: Point[];
  sideEdge: Point[];
  /** Lowering depth r (mm). */
  depth: Millimetres;
  /** Aldrich §2a fixed scoop depth for this piece (mm). */
  scoopDepth: Millimetres;
  /** Side-seam dart easing (mm); 0 in darted mode. Baked into t = 1, ramped on side leg. */
  sideShift: Millimetres;
};

const WAIST_SEAM_SAMPLE_COUNT = 97;

/** Arc-walk `dist` mm along a body edge from the drafted waist corner. */
function waistArcWalk(
  edge: Point[],
  corner: Point,
  dist: Millimetres,
): Point {
  return waistCornerEndpoint(edge, corner, dist);
}

/**
 * Single waist-edge parametrisation.
 *
 * Composition order (read in sequence — this is the whole curve):
 *
 * 1. ENDPOINTS (exact; early return, no post-hoc pin)
 *    • t = 0 (CF/CB): arc-walk cfEdge by full depth r from cfWaist.
 *      §2a scoop at t = 0: y = sideY + scoopDepth (centre scoopDepth below side).
 *    • t = 1 (side): arc-walk sideEdge by full depth r from sideWaist.
 *      Apply full sideShift to x only: x = sideRaw.x − sideShift.
 *      No scoop at the side (waistlineScoopFactor(1) = 0).
 *
 * 2. INTERIOR (body-following; not a chord between the two endpoints)
 *    Partial arc-walks on the real body edges, distances tied to t:
 *      cfDist(t)   = r · (1 − t)   → r at CF, 0 at side
 *      sideDist(t) = r · t         → 0 at CF, r at side
 *    cfPt(t)   = arc-walk(cfEdge,   cfWaist,   cfDist)
 *    sidePt(t) = arc-walk(sideEdge, sideWaist, sideDist)
 *                 with sideShift ramped: x − sideShift · t  (full ease only at t = 1)
 *    Coons blend between the two body legs:
 *      base(t) = (1 − t) · cfPt(t) + t · sidePt(t)
 *    At t = 0 this collapses to cfEnd; at t = 1 to sideEased.
 *
 * 3. §2a SCOOP (fixed shallow term, centre-heavy)
 *    y = sideY + scoopDepth · waistlineScoopFactor(t)
 *    y-down: centre finished scoopDepth below sideY; cos²(πt/2) peaks at CF/CB.
 *
 * r = 0 short-circuit: flat drafted waist span + §2a scoop only (darted regression).
 *
 * Guardrails assumed (verify when wiring):
 *   • x monotone in t (CF x ≤ interior x ≤ eased side x)
 *   • scoop envelope zero at side → no second inflection from scoop at t = 1
 *   • sideShift continuous in r via resolveDarts; easing in target, not a switched shear
 */
function waistPoint(spec: WaistCurveSpec, t: number): Point {
  const {
    cfWaist,
    sideWaist,
    cfEdge,
    sideEdge,
    depth: r,
    scoopDepth,
    sideShift,
  } = spec;
  const u = Math.max(0, Math.min(1, t));

  const cfEnd = waistArcWalk(cfEdge, cfWaist, r);
  const sideRaw = waistArcWalk(sideEdge, sideWaist, r);
  const sideEased: Point = { x: sideRaw.x - sideShift, y: sideRaw.y };
  const sideY = sideEased.y;
  const y = sideY + scoopDepth * waistlineScoopFactor(u);

  if (u <= 0) {
    return { x: cfEnd.x, y };
  }
  if (u >= 1) {
    return { x: sideEased.x, y };
  }

  if (r <= 0) {
    const x = cfWaist.x + u * (sideWaist.x - cfWaist.x);
    return { x, y };
  }

  const cfDist = r * (1 - u);
  const sideDist = r * u;
  const cfPt = waistArcWalk(cfEdge, cfWaist, cfDist);
  const sidePtRaw = waistArcWalk(sideEdge, sideWaist, sideDist);
  const sidePt: Point = {
    x: sidePtRaw.x - sideShift * u,
    y: sidePtRaw.y,
  };

  const x = (1 - u) * cfPt.x + u * sidePt.x;

  return { x, y };
}

/** Tangent of waistPoint (central difference) — dart legs aim inward from this. */
function waistPointTangent(spec: WaistCurveSpec, t: number): Point {
  const eps = 1e-4;
  const a = waistPoint(spec, Math.max(0, t - eps));
  const b = waistPoint(spec, Math.min(1, t + eps));
  return normalize({ x: b.x - a.x, y: b.y - a.y });
}

/** Sample waistPoint once to a dense polyline — no re-spline. */
function sampleWaistSeam(
  spec: WaistCurveSpec,
  n = WAIST_SEAM_SAMPLE_COUNT,
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    pts.push(waistPoint(spec, i / (n - 1)));
  }
  return pts;
}

/** Find t where waistPoint(t).x = targetX (requires x monotone in t). */
function waistTAtX(spec: WaistCurveSpec, targetX: Millimetres): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (waistPoint(spec, mid).x < targetX) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Dart on the same curve as the waist edge.
 * Both legs are samples of waistPoint at ±DART_LEG_HALF in x; apex inward along normal.
 */
function waistDartMarking(
  spec: WaistCurveSpec,
  mouthX: Millimetres,
  dartLength: Millimetres,
): Marking {
  const tMouth = waistTAtX(spec, mouthX);
  const tan = waistPointTangent(spec, tMouth);
  let inward = { x: -tan.y, y: tan.x };
  if (inward.y < 0) {
    inward = { x: -inward.x, y: -inward.y };
  }
  const mouth = waistPoint(spec, tMouth);
  const leg0 = waistPoint(spec, waistTAtX(spec, mouthX - DART_LEG_HALF));
  const leg1 = waistPoint(spec, waistTAtX(spec, mouthX + DART_LEG_HALF));
  return {
    kind: "dart",
    apex: {
      x: mouth.x + inward.x * dartLength,
      y: mouth.y + inward.y * dartLength,
    },
    legs: [leg0, leg1],
  };
}

function waistDartMarkingAtT(
  spec: WaistCurveSpec,
  t: number,
  dartLength: Millimetres,
): Marking {
  const mouth = waistPoint(spec, t);
  return waistDartMarking(spec, mouth.x, dartLength);
}

const X_MONOTONE_EPS = 0.01;

function isWaistXMonotone(seam: Point[]): boolean {
  for (let i = 1; i < seam.length; i++) {
    if (seam[i].x < seam[i - 1].x + X_MONOTONE_EPS) {
      return false;
    }
  }
  return true;
}

/** Strict x order for back cap — any backward step counts as a fold. */
function isWaistXStrictlyMonotone(seam: Point[], limit?: number): boolean {
  const n = limit === undefined ? seam.length : Math.min(limit, seam.length);
  for (let i = 1; i < n; i++) {
    if (seam[i].x < seam[i - 1].x - 1e-9) {
      return false;
    }
  }
  return true;
}

function polylineXAtY(points: Point[], y: Millimetres): number | null {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (y < minY - 1e-9 || y > maxY + 1e-9) {
      continue;
    }
    if (Math.abs(b.y - a.y) < 1e-9) {
      continue;
    }
    const t = (y - a.y) / (b.y - a.y);
    return a.x + t * (b.x - a.x);
  }
  return null;
}

function waistMonotoneBreakIndex(seam: Point[]): number | null {
  for (let i = 1; i < seam.length; i++) {
    if (seam[i].x < seam[i - 1].x + X_MONOTONE_EPS) {
      return i;
    }
  }
  return null;
}

type WaistMonotoneContext = { piece: string; depth: Millimetres };

/** Dev assertion — waist x must increase CF→side for waistTAtX / dart placement. */
function assertWaistXMonotone(
  seam: Point[],
  context?: WaistMonotoneContext,
): void {
  const breakAt = waistMonotoneBreakIndex(seam);
  if (breakAt === null) {
    return;
  }
  const piece = context?.piece ?? "waist";
  const depthPart =
    context?.depth !== undefined
      ? ` at depth ${context.depth.toFixed(1)} mm`
      : "";
  throw new Error(
    `Waist seam x must increase CF→side on ${piece}${depthPart}; ` +
      `non-monotone at sample ${breakAt}: ` +
      `${seam[breakAt - 1].x.toFixed(2)} → ${seam[breakAt].x.toFixed(2)}`,
  );
}

/** Reduce sideShift until x-monotone; never exceeds requested shift. */
function clampSideShiftForMonotone(
  spec: WaistCurveSpec,
  strict = true,
): Millimetres {
  if (spec.sideShift <= 0) {
    return 0;
  }
  if (isWaistXMonotone(sampleWaistSeam(spec))) {
    return spec.sideShift;
  }
  let lo = 0;
  let hi = spec.sideShift;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const trial = { ...spec, sideShift: mid };
    if (isWaistXMonotone(sampleWaistSeam(trial))) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  if (strict && lo < spec.sideShift - 0.05) {
    throw new Error(
      `Waist x-monotonicity limits sideShift to ${lo.toFixed(1)} mm ` +
        `(requested ${spec.sideShift.toFixed(1)} mm at depth ${spec.depth} mm)`,
    );
  }
  return lo;
}

function buildBackWaistCurveSpec(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  depth: Millimetres,
): WaistCurveSpec {
  const b = trouserBackPoints(body, style);
  const spec = trouserBlockSpec(style);
  const mode = normalizeWaistbandMode(style.waistbandMode);
  const { sideShift } = resolveDarts(spec.backDartLengths, depth, mode);
  return {
    cfWaist: b.p21,
    sideWaist: b.p22,
    cfEdge: catmullRom([b.p24, b.guide, b.p19, b.p21]),
    sideEdge: pchipByY([b.p22, b.p25, b.p27, b.p26]),
    depth,
    scoopDepth: WAISTLINE_CURVE_BACK,
    sideShift,
  };
}

function cross2(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

function segmentsIntersectProper(
  a0: Point,
  a1: Point,
  b0: Point,
  b1: Point,
  eps = 0.02,
): boolean {
  const d1x = a1.x - a0.x;
  const d1y = a1.y - a0.y;
  const d2x = b1.x - b0.x;
  const d2y = b1.y - b0.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) {
    return false;
  }
  const t = ((b0.x - a0.x) * d2y - (b0.y - a0.y) * d2x) / denom;
  const u = ((b0.x - a0.x) * d1y - (b0.y - a0.y) * d1x) / denom;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

function polylinesCrossInterior(a: Point[], b: Point[], eps = 0.02): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsIntersectProper(a[i], a[i + 1], b[j], b[j + 1], eps)) {
        return true;
      }
    }
  }
  return false;
}

function cbInteriorAngle(
  crotchBefore: Point,
  cb: Point,
  waistAfter: Point,
): number {
  const v1x = crotchBefore.x - cb.x;
  const v1y = crotchBefore.y - cb.y;
  const v2x = waistAfter.x - cb.x;
  const v2y = waistAfter.y - cb.y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 < 1e-9 || m2 < 1e-9) {
    return 0;
  }
  const dot = (v1x * v2x + v1y * v2y) / (m1 * m2);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

function backCrotchSeam(b: BackPoints, cb: Point): Point[] {
  return catmullRom([b.p24, b.guide, b.p19, cb]);
}

function resolveBackWaistSeamAtDepth(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  depth: Millimetres,
  sampleCount = WAIST_CAP_SAMPLE_COUNT,
): { seam: Point[]; spec: WaistCurveSpec } {
  const spec = buildBackWaistCurveSpec(body, style, depth);
  const sideShift = clampSideShiftForMonotone(spec, false);
  const resolved: WaistCurveSpec =
    sideShift === spec.sideShift ? spec : { ...spec, sideShift };
  const seam = sampleWaistSeam(resolved, sampleCount);
  return { seam, spec: resolved };
}

/** Waist must sit outside the crotch at matched y — touching counts as overlap. */
const CROTCH_OVERLAP_MM = 0;

function waistCrossesCrotchAtY(
  waistSeam: Point[],
  crotch: Point[],
  nearCount: number,
): boolean {
  const n = Math.min(nearCount, waistSeam.length);
  for (let i = 1; i < n; i++) {
    const wp = waistSeam[i];
    const cx = polylineXAtY(crotch, wp.y);
    if (cx !== null && wp.x <= cx + 1e-9) {
      return true;
    }
  }
  return false;
}

function isBackCbClearOfCrotch(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  waistSeam: Point[],
  strict = false,
): boolean {
  if (waistSeam.length < 2) {
    return false;
  }
  const b = trouserBackPoints(body, style);
  const cb = waistSeam[0];
  const waistNext = waistSeam[1];
  const departEps = strict ? 1e-9 : X_MONOTONE_EPS;

  if (waistNext.x <= cb.x + departEps) {
    return false;
  }

  const crotch = backCrotchSeam(b, cb);
  const nearCount = strict
    ? Math.min(CB_WAIST_NEAR_DENSE, waistSeam.length)
    : Math.min(12, waistSeam.length);
  const waistNear = waistSeam.slice(0, nearCount);
  const crossEps = strict ? 0.005 : 0.02;
  if (polylinesCrossInterior(waistNear, crotch.slice(0, -1), crossEps)) {
    return false;
  }

  if (strict && waistCrossesCrotchAtY(waistSeam, crotch, nearCount)) {
    return false;
  }

  const approach = crotch[crotch.length - 2];
  const interior = cbInteriorAngle(approach, cb, waistNext);
  if (interior > CB_MAX_INTERIOR_ANGLE_DEG) {
    return false;
  }

  const approachVec = { x: cb.x - approach.x, y: cb.y - approach.y };
  const departVec = { x: waistNext.x - cb.x, y: waistNext.y - cb.y };
  const refSide = cross2(approachVec, departVec);
  if (!strict && Math.abs(refSide) < 1) {
    return false;
  }
  if (strict && interior > CB_FOLD_INTERIOR_DEG) {
    return false;
  }
  for (let i = 2; i < waistNear.length; i++) {
    const side = cross2(approachVec, {
      x: waistSeam[i].x - cb.x,
      y: waistSeam[i].y - cb.y,
    });
    if (side * refSide < 0) {
      return false;
    }
  }

  return true;
}

function assertBackCbClearOfCrotch(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  curveSpec: WaistCurveSpec,
  context: WaistMonotoneContext,
): void {
  const dense = sampleWaistSeam(curveSpec, WAIST_CAP_SAMPLE_COUNT);
  if (isBackCbClearOfCrotch(body, style, dense, true)) {
    return;
  }
  const b = trouserBackPoints(body, style);
  const cb = dense[0];
  const crotch = backCrotchSeam(b, cb);
  const interior =
    dense.length >= 2
      ? cbInteriorAngle(crotch[crotch.length - 2], cb, dense[1])
      : 0;
  throw new Error(
    `Back waist/crotch corner incoherent on ${context.piece} at depth ` +
      `${context.depth.toFixed(1)} mm (interior angle ${interior.toFixed(1)}°, ` +
      `max ${CB_MAX_INTERIOR_ANGLE_DEG}°)`,
  );
}

function isBackShapedWaistCoherentAtDepth(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  depth: Millimetres,
): boolean {
  const { seam } = resolveBackWaistSeamAtDepth(body, style, depth);
  const cbNear = CB_WAIST_NEAR_DENSE;
  if (!isWaistXStrictlyMonotone(seam, cbNear)) {
    return false;
  }
  if (!isWaistXStrictlyMonotone(seam)) {
    return false;
  }
  return isBackCbClearOfCrotch(body, style, seam, true);
}

function resolveWaistSeam(
  spec: WaistCurveSpec,
  context?: WaistMonotoneContext,
): { seam: Point[]; spec: WaistCurveSpec } {
  const sideShift = clampSideShiftForMonotone(spec);
  const resolved: WaistCurveSpec =
    sideShift === spec.sideShift ? spec : { ...spec, sideShift };
  const seam = sampleWaistSeam(resolved);
  assertWaistXMonotone(seam, context ?? { piece: "waist", depth: spec.depth });
  return { seam, spec: resolved };
}

function frontWaistResolved(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): WaistResolved {
  const f = trouserFrontPoints(body, style);
  const spec = trouserBlockSpec(style);
  const mode = normalizeWaistbandMode(style.waistbandMode);
  const r = clampWaistbandDepth(
    style.waistReduction ?? 0,
    body,
    style.block,
    mode,
    style.bottomWidth,
  );
  const { keep, sideShift } = resolveDarts([spec.frontDartLength], r, mode);

  const curveInput: WaistCurveSpec = {
    cfWaist: f.p10,
    sideWaist: f.p11,
    cfEdge: [f.p10, f.p6],
    sideEdge: pchipByY([f.p11, f.p8, f.p13, f.p12]),
    depth: r,
    scoopDepth: WAISTLINE_CURVE_FRONT,
    sideShift,
  };
  const { seam: waistSeam, spec: curveSpec } = resolveWaistSeam(curveInput, {
    piece: "Trouser front",
    depth: r,
  });
  const cf = { ...waistSeam[0] };
  const side = { ...waistSeam[waistSeam.length - 1] };

  let dartLengths: Millimetres[] = [spec.frontDartLength];
  if (mode === "darted" && r > 0 && keep[0]) {
    dartLengths = [Math.max(0, spec.frontDartLength - r)];
  }

  const waistChord =
    Math.hypot(f.p11.x - f.p10.x, f.p11.y - f.p10.y) - DART_TAKEUP;
  return {
    cf,
    side,
    waistSeam,
    curveSpec,
    keep,
    dartLengths,
    bandTop: waistChord,
    bandBottom: polylineLength(waistSeam),
  };
}

function backWaistResolved(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): WaistResolved {
  const b = trouserBackPoints(body, style);
  const spec = trouserBlockSpec(style);
  const mode = normalizeWaistbandMode(style.waistbandMode);
  const r = clampWaistbandDepth(
    style.waistReduction ?? 0,
    body,
    style.block,
    mode,
    style.bottomWidth,
  );
  const { keep } = resolveDarts(spec.backDartLengths, r, mode);

  const curveInput = buildBackWaistCurveSpec(body, style, r);
  const { seam: waistSeam, spec: curveSpec } = resolveWaistSeam(curveInput, {
    piece: "Trouser back",
    depth: r,
  });
  assertBackCbClearOfCrotch(body, style, curveSpec, {
    piece: "Trouser back",
    depth: r,
  });
  const cf = { ...waistSeam[0] };
  const side = { ...waistSeam[waistSeam.length - 1] };

  const dartLengths = spec.backDartLengths.map((L, i) => {
    if (mode === "darted" && r > 0 && keep[i]) {
      return Math.max(0, L - r);
    }
    return L;
  });

  const waistChord =
    Math.hypot(b.p22.x - b.p21.x, b.p22.y - b.p21.y) -
    DART_TAKEUP * spec.backDartLengths.length;
  return {
    cf,
    side,
    waistSeam,
    curveSpec,
    keep,
    dartLengths,
    bandTop: waistChord,
    bandBottom: polylineLength(waistSeam),
  };
}

export function trouserWaistEdges(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): {
  front: { inner: Millimetres; outer: Millimetres };
  back: { inner: Millimetres; outer: Millimetres };
} {
  const f = frontWaistResolved(body, style);
  const b = backWaistResolved(body, style);
  const mode = normalizeWaistbandMode(style.waistbandMode);
  if (mode === "darted") {
    // Dart take-up stays in trouser darts — band is a straight strip (no flare).
    const frontLen = f.bandBottom;
    const backLen = b.bandBottom;
    return {
      front: { inner: frontLen, outer: frontLen },
      back: { inner: backLen, outer: backLen },
    };
  }
  return {
    front: { inner: f.bandTop, outer: f.bandBottom },
    back: { inner: b.bandTop, outer: b.bandBottom },
  };
}

function crotchGuide(corner: Point, a: Point, b: Point, touch: Millimetres): Point {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const u = normalize({ x: mid.x - corner.x, y: mid.y - corner.y });
  return { x: corner.x + touch * u.x, y: corner.y + touch * u.y };
}

function insideLegControl(a: Point, b: Point, bulge: Millimetres = 7.5): Point {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const d = { x: b.x - a.x, y: b.y - a.y };
  let n = normalize({ x: d.y, y: -d.x });
  if (n.x < 0) {
    n = { x: -n.x, y: -n.y };
  }
  return { x: m.x + 2 * bulge * n.x, y: m.y + 2 * bulge * n.y };
}

type TaggedSegment = {
  points: Point[];
  edge: EdgeType;
  role: string;
  waistFinish?: "facing";
};

function segmentsToOutline(segments: TaggedSegment[]): OutlinePoint[] {
  const outline: OutlinePoint[] = [];

  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s];
    const startIndex = s === 0 ? 0 : 1;

    // The edge leaving a junction point belongs to the new segment, not the old one.
    if (s > 0 && startIndex === 1 && outline.length > 0) {
      outline[outline.length - 1].edge = segment.edge;
      outline[outline.length - 1].role = segment.role;
      if (segment.waistFinish !== undefined) {
        outline[outline.length - 1].waistFinish = segment.waistFinish;
      }
    }

    for (let i = startIndex; i < segment.points.length; i++) {
      outline.push({
        at: segment.points[i],
        edge: segment.edge,
        role: segment.role,
        ...(segment.waistFinish !== undefined
          ? { waistFinish: segment.waistFinish }
          : {}),
      });
    }
  }

  return outline;
}

export function trouserFrontPoints(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): FrontPoints {
  const spec = trouserBlockSpec(style);
  const W = spec.waist === "low" ? body.lowWaist : body.waist;
  const H = body.hip;
  const R = body.bodyRise - spec.riseDrop;
  const D = body.hipDepth - spec.hipDepthDrop;
  const F = body.waistToFloor;
  const B = style.bottomWidth;
  const band = sizeBand(H);
  const kneeAdd = KNEE_ADD[band];

  const kneeY = trouserKneeY(body);
  const fork = forkWidth(H);

  const p5 = { x: -fork, y: R };
  const p6 = { x: -fork, y: D };
  const p8 = { x: -fork + H / 4 + 5, y: D };
  const p9 = { x: -(fork + H / 16 + 10), y: R };
  const p10 = { x: -fork + 10, y: 0 };
  const p11 = { x: p10.x + W / 4 + 20, y: 0 };
  const p12 = { x: B / 2 - 5, y: F };
  const p14 = { x: -(B / 2 - 5), y: F };

  const K = B + 2 * kneeAdd;

  const p13 = { x: Math.min(K / 2 - 5, xOnLineAtY(p8, p12, kneeY)), y: kneeY };
  const p15 = { x: Math.max(-(K / 2 - 5), xOnLineAtY(p9, p14, kneeY)), y: kneeY };

  return { p5, p6, p8, p9, p10, p11, p12, p13, p14, p15 };
}

export function trouserBackPoints(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): BackPoints {
  const spec = trouserBlockSpec(style);
  const W = spec.waist === "low" ? body.lowWaist : body.waist;
  const H = body.hip;
  const R = body.bodyRise - spec.riseDrop;
  const D = body.hipDepth - spec.hipDepthDrop;
  const fork = forkWidth(H);
  const band = sizeBand(H);
  const f = trouserFrontPoints(body, style);

  const p16 = { x: -fork + fork / 4, y: R };
  const p17 = { x: p16.x, y: D };
  const p18 = { x: p16.x, y: 0 };
  const p19 = { x: p16.x, y: R / 2 };
  const p21 = { x: p18.x + 20, y: -spec.backWaistStep };
  const L = W / 4 + 40;
  const p22 = { x: p21.x + Math.sqrt(L * L - p21.y * p21.y), y: 0 };
  const p23 = { x: f.p9.x - ((H / 16 + 10) / 2 + spec.backCrotchAdd), y: R };
  const p24 = { x: p23.x, y: R + 5 };
  const p25 = { x: p17.x + H / 4 + 15, y: D };
  const p26 = { x: f.p12.x + 10, y: body.waistToFloor };
  const p28 = { x: f.p14.x - 10, y: body.waistToFloor };
  const kneeY = f.p13.y;

  const p27 = { x: f.p13.x + 10, y: kneeY };
  const p29 = { x: f.p15.x - 10, y: kneeY };
  const guide = crotchGuide(p16, p19, p24, BACK_CROTCH_TOUCH[band]);

  return { p16, p17, p18, p19, p21, p22, p23, p24, p25, p26, p27, p28, p29, guide };
}

function horizLine(
  y: Millimetres,
  xMin: Millimetres,
  xMax: Millimetres,
): DraftingLine {
  return {
    from: { x: xMin, y },
    to: { x: xMax, y },
    kind: "helper",
  };
}

function draftLine(
  from: Point,
  to: Point,
  kind: DraftingLineKind,
): DraftingLine {
  return { from, to, kind };
}

function crotchCurveControls(guide: Point): {
  points: DraftingPoint[];
  lines: DraftingLine[];
} {
  return {
    points: [{ id: "guide", at: guide, kind: "curveControl" }],
    lines: [],
  };
}

function insideLegCurveControls(
  a: Point,
  b: Point,
  bulge: Millimetres,
  id: string,
): { points: DraftingPoint[]; lines: DraftingLine[] } {
  const ctrl = insideLegControl(a, b, bulge);
  return {
    points: [{ id, at: ctrl, kind: "curveControl" }],
    lines: [
      draftLine(a, ctrl, "curveControl"),
      draftLine(ctrl, b, "curveControl"),
    ],
  };
}

export type FramePoints = {
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
  p4: Point;
};

/** Waistline y used to align front and back in the flat layout. */
export const TROUSER_LAYOUT_ANCHOR_Y = 0;

function trouserKneeY(body: BodyMeasurements): Millimetres {
  const R = body.bodyRise;
  const F = body.waistToFloor;
  return R + (F - R) / 2 - 50;
}

export function trouserFramePoints(body: BodyMeasurements): FramePoints {
  const R = body.bodyRise;
  const D = body.hipDepth;
  const F = body.waistToFloor;
  const p0 = { x: 0, y: TROUSER_LAYOUT_ANCHOR_Y };
  const p1 = { x: 0, y: R };
  const p2 = { x: 0, y: D };
  const p3 = { x: 0, y: F };
  const p4 = { x: 0, y: trouserKneeY(body) };
  return { p0, p1, p2, p3, p4 };
}

function frameConstruction(frame: FramePoints): {
  points: DraftingPoint[];
  lines: DraftingLine[];
} {
  const { p0, p1, p2, p3, p4 } = frame;
  return {
    points: [
      { id: "p0", at: p0 },
      { id: "p1", at: p1 },
      { id: "p2", at: p2 },
      { id: "p3", at: p3 },
      { id: "p4", at: p4 },
    ],
    lines: [
      draftLine(p0, p1, "construction"),
      draftLine(p1, p2, "construction"),
      draftLine(p2, p4, "construction"),
      draftLine(p4, p3, "construction"),
    ],
  };
}

function xExtent(points: Point[]): { min: Millimetres; max: Millimetres } {
  const xs = points.map((p) => p.x);
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

export function trouserConstruction(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): PieceConstruction[] {
  const R = body.bodyRise;
  const D = body.hipDepth;
  const F = body.waistToFloor;
  const band = sizeBand(body.hip);
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const frontGuide = crotchGuide(f.p5, f.p6, f.p9, FRONT_CROTCH_TOUCH[band]);
  const frontInsideLegCtrl = insideLegCurveControls(f.p9, f.p15, 7.5, "inseamCtrl");
  const frontCrotchControls = crotchCurveControls(frontGuide);

  const backInsideLegCtrl = insideLegCurveControls(b.p24, b.p29, 12.5, "inseamCtrl");
  const backCrotchControls = crotchCurveControls(b.guide);
  const backHemCtrl = { x: 0, y: F + 20 };
  const backHemControls = {
    points: [{ id: "hemCtrl", at: backHemCtrl, kind: "curveControl" as const }],
    lines: [
      draftLine(b.p26, backHemCtrl, "curveControl"),
      draftLine(backHemCtrl, b.p28, "curveControl"),
    ],
  };
  const frame = frameConstruction(trouserFramePoints(body));
  const framePts = Object.values(trouserFramePoints(body));

  const frontPts = [
    ...framePts,
    f.p5,
    f.p6,
    f.p8,
    f.p9,
    f.p10,
    f.p11,
    f.p12,
    f.p13,
    f.p14,
    f.p15,
  ];
  const frontX = xExtent(frontPts);

  const backPts = [
    ...framePts,
    b.p16,
    b.p17,
    b.p18,
    b.p19,
    b.p21,
    b.p22,
    b.p23,
    b.p24,
    b.p25,
    b.p26,
    b.p27,
    b.p28,
    b.p29,
  ];
  const backX = xExtent(backPts);

  return [
    {
      pieceName: "Trouser front",
      points: [
        ...frame.points,
        { id: "p5", at: f.p5 },
        { id: "p6", at: f.p6 },
        { id: "p8", at: f.p8 },
        { id: "p9", at: f.p9 },
        { id: "p10", at: f.p10 },
        { id: "p11", at: f.p11 },
        { id: "p12", at: f.p12 },
        { id: "p13", at: f.p13 },
        { id: "p14", at: f.p14 },
        { id: "p15", at: f.p15 },
        ...frontCrotchControls.points,
        ...frontInsideLegCtrl.points,
      ],
      lines: [
        ...frame.lines,
        draftLine(f.p5, f.p6, "construction"),
        draftLine(f.p6, f.p8, "construction"),
        draftLine(f.p5, f.p9, "construction"),
        draftLine(f.p10, f.p11, "construction"),
        draftLine(f.p5, frontGuide, "construction"),
        draftLine(f.p6, f.p9, "construction"),
        draftLine(f.p8, f.p13, "helper"),
        draftLine(f.p13, f.p12, "helper"),
        draftLine(f.p9, f.p15, "helper"),
        draftLine(f.p15, f.p14, "helper"),
        draftLine(f.p12, f.p14, "helper"),
        horizLine(0, frontX.min, frontX.max),
        horizLine(R, frontX.min, frontX.max),
        horizLine(D, frontX.min, frontX.max),
        horizLine(f.p13.y, frontX.min, frontX.max),
        horizLine(F, frontX.min, frontX.max),
        ...frontCrotchControls.lines,
        ...frontInsideLegCtrl.lines,
      ],
    },
    {
      pieceName: "Trouser back",
      points: [
        ...frame.points,
        { id: "p16", at: b.p16 },
        { id: "p17", at: b.p17 },
        { id: "p18", at: b.p18 },
        { id: "p19", at: b.p19 },
        { id: "p21", at: b.p21 },
        { id: "p22", at: b.p22 },
        { id: "p23", at: b.p23 },
        { id: "p24", at: b.p24 },
        { id: "p25", at: b.p25 },
        { id: "p26", at: b.p26 },
        { id: "p27", at: b.p27 },
        { id: "p28", at: b.p28 },
        { id: "p29", at: b.p29 },
        ...backCrotchControls.points,
        ...backInsideLegCtrl.points,
        ...backHemControls.points,
      ],
      lines: [
        ...frame.lines,
        draftLine(b.p16, b.p17, "construction"),
        draftLine(b.p17, b.p18, "construction"),
        draftLine(b.p16, b.p19, "construction"),
        draftLine(b.p18, b.p21, "construction"),
        draftLine(b.p21, b.p22, "construction"),
        draftLine(b.p16, b.guide, "construction"),
        draftLine(b.p19, b.p24, "construction"),
        draftLine(b.p23, b.p24, "construction"),
        draftLine(b.p17, b.p25, "construction"),
        draftLine(b.p25, b.p27, "helper"),
        draftLine(b.p27, b.p26, "helper"),
        draftLine(b.p24, b.p29, "helper"),
        draftLine(b.p29, b.p28, "helper"),
        draftLine(b.p26, b.p28, "helper"),
        horizLine(0, backX.min, backX.max),
        horizLine(R, backX.min, backX.max),
        horizLine(D, backX.min, backX.max),
        horizLine(b.p27.y, backX.min, backX.max),
        horizLine(F, backX.min, backX.max),
        ...backCrotchControls.lines,
        ...backInsideLegCtrl.lines,
        ...backHemControls.lines,
      ],
    },
  ];
}

export function draftTrouserFront(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): PatternPiece {
  const spec = trouserBlockSpec(style);
  const H = body.hip;
  const F = body.waistToFloor;
  const band = sizeBand(H);
  const f = trouserFrontPoints(body, style);
  const { p5, p6, p8, p9, p12, p13, p14, p15 } = f;
  const r = style.waistReduction ?? 0;
  const wr = frontWaistResolved(body, style);

  const frontGuide = crotchGuide(p5, p6, p9, FRONT_CROTCH_TOUCH[band]);

  const insideLegCtrl = insideLegControl(p9, p15);
  const insideLegToFork = quadBezier(p15, insideLegCtrl, p9).slice(1);

  const facingFinish = isDartedFacingFinish(style);

  const segments: TaggedSegment[] = [
    {
      points: wr.waistSeam,
      edge: "seam",
      role: "waist",
      ...(facingFinish ? { waistFinish: "facing" as const } : {}),
    },
    {
      points: pchipByY([wr.side, p8, p13, p12]),
      edge: "seam",
      role: "side-seam",
    },
    {
      points: [p12, p14],
      edge: "hem",
      role: "hem",
    },
    {
      points: [p14, p15, ...insideLegToFork],
      edge: "seam",
      role: "inseam",
    },
    {
      points: catmullRom([p9, frontGuide, p6, wr.cf]),
      edge: "seam",
      role: "crotch",
    },
  ];

  const outline = segmentsToOutline(segments);

  const waistMidF = wr.waistSeam[Math.floor(wr.waistSeam.length / 2)];
  const waistTangentF = waistPointTangent(wr.curveSpec, 0.5);
  let waistInwardF = { x: -waistTangentF.y, y: waistTangentF.x };
  if (waistInwardF.y < 0) {
    waistInwardF = { x: -waistInwardF.x, y: -waistInwardF.y };
  }

  const markings: Marking[] = [
    {
      kind: "grainline",
      line: { from: { x: 0, y: r + 20 }, to: { x: 0, y: F - 20 } },
    },
    ...(wr.keep[0]
      ? [waistDartMarking(wr.curveSpec, FRONT_DART_APEX_X, wr.dartLengths[0])]
      : []),
    { kind: "notch", at: waistMidF, dir: waistInwardF, count: 1 },
    { kind: "notch", at: p8, count: 1 },
    { kind: "notch", at: p15, count: 1 },
    {
      kind: "notch",
      at: p6,
      dir: crotchNotchDir(frontGuide, wr.cf),
      count: 1,
    },
  ];

  return {
    name: "Trouser front",
    cutCount: 2,
    onFold: false,
    outline,
    markings,
  };
}

export function draftTrouserBack(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): PatternPiece {
  const F = body.waistToFloor;
  const b = trouserBackPoints(body, style);
  const {
    p19,
    p24,
    p25,
    p26,
    p27,
    p28,
    p29,
    guide,
  } = b;
  const spec = trouserBlockSpec(style);
  const r = style.waistReduction ?? 0;
  const wr = backWaistResolved(body, style);

  const insideLegCtrl = insideLegControl(p24, p29, 12.5);
  const backInsideToFork = quadBezier(p29, insideLegCtrl, p24).slice(1);
  const crotch = catmullRom([p24, guide, p19, wr.cf]);
  const hipOnCrotch = pointOnPolylineAtY(crotch, b.p17.y);

  const facingFinish = isDartedFacingFinish(style);

  const segments: TaggedSegment[] = [
    {
      points: wr.waistSeam,
      edge: "seam",
      role: "waist",
      ...(facingFinish ? { waistFinish: "facing" as const } : {}),
    },
    {
      points: pchipByY([wr.side, p25, p27, p26]),
      edge: "seam",
      role: "side-seam",
    },
    {
      points: quadBezier(p26, { x: 0, y: F + 20 }, p28),
      edge: "hem",
      role: "hem",
    },
    {
      points: [p28, p29, ...backInsideToFork],
      edge: "seam",
      role: "inseam",
    },
    { points: crotch, edge: "seam", role: "crotch" },
  ];
  const outline = segmentsToOutline(segments);

  const dartMarks: Marking[] = [];
  if (wr.keep[0]) {
    dartMarks.push(
      waistDartMarkingAtT(wr.curveSpec, BACK_DART_T[0], wr.dartLengths[0]),
    );
  }
  if (wr.keep[1]) {
    dartMarks.push(
      waistDartMarkingAtT(wr.curveSpec, BACK_DART_T[1], wr.dartLengths[1]),
    );
  }

  const waistMidB = wr.waistSeam[Math.floor(wr.waistSeam.length / 2)];
  const waistTangentB = waistPointTangent(wr.curveSpec, 0.5);
  let waistInwardB = { x: -waistTangentB.y, y: waistTangentB.x };
  if (waistInwardB.y < 0) {
    waistInwardB = { x: -waistInwardB.x, y: -waistInwardB.y };
  }

  const markings: Marking[] = [
    {
      kind: "grainline",
      line: { from: { x: 0, y: r + 20 }, to: { x: 0, y: F - 20 } },
    },
    ...dartMarks,
    { kind: "notch", at: waistMidB, dir: waistInwardB, count: 2 },
    { kind: "notch", at: p25, count: 2 },
    { kind: "notch", at: p29, count: 2 },
    {
      kind: "notch",
      at: hipOnCrotch.at,
      dir: crotchNotchDir(hipOnCrotch.before, hipOnCrotch.after),
      count: 2,
    },
  ];

  return {
    name: "Trouser back",
    cutCount: 2,
    onFold: false,
    outline,
    markings,
  };
}

export function draftTrousers(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): Pattern {
  return {
    pieces: [draftTrouserFront(body, style), draftTrouserBack(body, style)],
  };
}

export function validateTrousers(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): ValidationResult {
  const issues = [];

  if (body.waist > body.hip) {
    issues.push({
      severity: "error" as const,
      message: "Waist must not be larger than hip.",
      fields: ["waist", "hip"],
    });
  }

  if (body.bodyRise >= body.waistToFloor) {
    issues.push({
      severity: "error" as const,
      message: "Body rise must be less than waist to floor.",
      fields: ["bodyRise", "waistToFloor"],
    });
  }

  if (style.bottomWidth <= 0) {
    issues.push({
      severity: "error" as const,
      message: "Leg hem width must be greater than zero.",
    });
  }

  return validationResult(issues);
}

export function trouserInstructions(
  style?: TrouserFrontStyle,
): ConstructionStep[] {
  const shaped = normalizeWaistbandMode(style?.waistbandMode) === "shaped";
  const steps: ConstructionStep[] = [
    {
      id: "cut",
      text: shaped
        ? "Cut on doubled fabric with each grainline on the straight grain: front and back two each, so each leg comes as a mirrored pair — a left and a right. Transfer the notches to the fabric."
        : "Cut on doubled fabric with each grainline on the straight grain: front and back two each, so each leg comes as a mirrored pair — a left and a right. Transfer the darts and notches to the fabric.",
      highlight: [{ piece: "Trouser front" }, { piece: "Trouser back" }],
    },
  ];
  if (!shaped) {
    steps.push(
      {
        id: "work-front-dart",
        text: "Fold and stitch the waist dart on each front; press toward the centre.",
        highlight: [{ piece: "Trouser front", edges: ["waist"] }],
      },
      {
        id: "work-back-darts",
        text: "Fold and stitch the two waist darts on each back; press toward the centre.",
        highlight: [{ piece: "Trouser back", edges: ["waist"] }],
      },
    );
  }
  steps.push(
    {
      id: "side-seam",
      text: "With right sides together, join each front to a back at the side seam.",
      highlight: [
        { piece: "Trouser front", edges: ["side-seam"] },
        { piece: "Trouser back", edges: ["side-seam"] },
      ],
    },
    {
      id: "inseam",
      text: "Stitch the inside leg seam on each leg unit.",
      highlight: [
        { piece: "Trouser front", edges: ["inseam"] },
        { piece: "Trouser back", edges: ["inseam"] },
      ],
    },
    {
      id: "crotch",
      text: "Turn one leg inside the other and stitch the crotch seam in one pass.",
      highlight: [
        { piece: "Trouser front", edges: ["crotch"] },
        { piece: "Trouser back", edges: ["crotch"] },
      ],
    },
    {
      id: "hem",
      text: "Neaten and hem both legs to the marked hem line.",
      highlight: [
        { piece: "Trouser front", edges: ["hem"] },
        { piece: "Trouser back", edges: ["hem"] },
      ],
    },
  );
  return steps;
}
