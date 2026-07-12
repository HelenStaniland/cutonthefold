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
  catmullRomCentripetal,
  cubicBezier,
  pchipByY,
  pointAtArcDistanceFromEnd,
  pointAtArcDistanceFromStart,
  polylineLength,
  quadBezier,
} from "@/lib/geometry/curves";

export type TrouserBlock = "classic" | "production";

/** Maximum waist drop (mm) — production endpoint; classic is 0. */
export const WAIST_DROP_MAX: Millimetres = 50;

type TrouserBlockSpec = {
  riseDrop: Millimetres;
  hipDepthDrop: Millimetres;
  frontDartLength: Millimetres;
  backWaistStep: Millimetres;
  backCrotchAdd: Millimetres;
  backDartLengths: [Millimetres, Millimetres];
};

/**
 * Block constants interpolated between classic (d=0) and production (d=50).
 *
 * Endpoints reproduce Aldrich's classic and production blocks exactly.
 * Intermediate drops are an interpolation with no external reference — validated
 * only by toile, not by Aldrich or a hand-draft.
 */
function blockSpecForDrop(d: Millimetres): TrouserBlockSpec {
  const clamped = Math.max(0, Math.min(WAIST_DROP_MAX, d));
  const s = clamped / WAIST_DROP_MAX;
  return {
    riseDrop: clamped,
    hipDepthDrop: clamped,
    frontDartLength: 100 - 40 * s,
    backDartLengths: [120 - 40 * s, 100 - 40 * s],
    backWaistStep: 20 - 2.5 * s,
    backCrotchAdd: 8 - 3 * s,
  };
}

const TROUSER_BLOCKS: Record<TrouserBlock, TrouserBlockSpec> = {
  classic: blockSpecForDrop(0),
  production: blockSpecForDrop(WAIST_DROP_MAX),
};
// Low-waist vertical origin: R, D, and F all subtract waistDrop (spec.riseDrop).
// Leg length F−R = waistToFloor−bodyRise is drop-invariant; knee follows from dropped R/F.

export type WaistbandMode = "darted" | "shaped";
const DART_TAKEUP = 20;

/** Aldrich back CB step 20→21 — 2 cm up from point 20 (mm). */
const BACK_CB_WAIST_RISE: Millimetres = 20;
/**
 * Aldrich p.48 §2a — default front waistline scoop depth (mm).
 * Overridable via TrouserFrontStyle.waistlineCurveFront (0 = §2a off).
 */
export const WAISTLINE_CURVE_FRONT = 12;
export const WAISTLINE_CURVE_FRONT_MIN = 0;
export const WAISTLINE_CURVE_FRONT_MAX = 30;
export const WAISTLINE_CURVE_BACK = 0;

export function resolveWaistlineCurveFront(
  style: Pick<TrouserFrontStyle, "waistlineCurveFront">,
): Millimetres {
  const raw = style.waistlineCurveFront ?? WAISTLINE_CURVE_FRONT;
  return Math.max(
    WAISTLINE_CURVE_FRONT_MIN,
    Math.min(WAISTLINE_CURVE_FRONT_MAX, raw),
  );
}

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
  waistDrop?: Millimetres,
): Millimetres {
  const drop = waistDrop ?? TROUSER_BLOCKS[block].hipDepthDrop;
  const hipLine = body.hipDepth - drop;
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
  waistDrop?: Millimetres,
): Millimetres {
  const style: TrouserFrontStyle = {
    bottomWidth,
    block,
    waistbandMode: "shaped",
    waistDrop,
  };
  const hipCap = maxYokeDepth(body, block, waistDrop);
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
  waistDrop?: Millimetres,
): { min: Millimetres; max: Millimetres } {
  switch (mode) {
    case "darted":
      return { min: DARTED_DEPTH_MIN, max: DARTED_DEPTH_MAX };
    case "shaped": {
      const hipCap = maxYokeDepth(body, block, waistDrop);
      const backCap = maxBackShapedWaistDepth(
        body,
        block,
        bottomWidth,
        waistDrop,
      );
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

/** Resolved waist drop for a style (mm), clamped to [0, WAIST_DROP_MAX]. */
export function resolveWaistDrop(style: TrouserFrontStyle): Millimetres {
  const d =
    style.waistDrop ??
    (style.block === "production" ? WAIST_DROP_MAX : 0);
  return Math.max(0, Math.min(WAIST_DROP_MAX, d));
}

/**
 * Waist girth W — linear taper from natural waist (d=0) to low waist (d=50).
 * Assumes a linear waist→low-waist taper over the 5 cm drop (estimate from two girths).
 */
function trouserWaistGirth(
  body: BodyMeasurements,
  spec: TrouserBlockSpec,
): Millimetres {
  return (
    body.waist +
    (spec.riseDrop / WAIST_DROP_MAX) * (body.lowWaist - body.waist)
  );
}

function trouserBlockSpec(style: TrouserFrontStyle): TrouserBlockSpec {
  return blockSpecForDrop(resolveWaistDrop(style));
}

export function trouserDraftMeasures(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): { W: Millimetres; H: Millimetres; R: Millimetres; D: Millimetres; F: Millimetres } {
  const spec = trouserBlockSpec(style);
  return {
    W: trouserWaistGirth(body, spec),
    H: body.hip,
    R: body.bodyRise - spec.riseDrop,
    D: body.hipDepth - spec.hipDepthDrop,
    F: body.waistToFloor - spec.riseDrop,
  };
}

// Distance from centre front to the sewn front dart, along the finished waist.
// Dart is centred on point 0; centre front is point 10; the 2 cm dart's take-up
// (10 mm on the CF side) closes up when sewn. Works out to one-twelfth hip.
export function frontDartFromCentreFront(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): number {
  const inset = resolveFrontWaistInset(style);
  const { p10 } = trouserFrontPoints(body, style);
  // Historical formula was −p10.x − 10 with the trailing 10 = Aldrich 7–10.
  // Keep that identity under a variable inset.
  return -p10.x - inset;
}

export type TrouserFrontStyle = {
  /** Finished hem width of one leg laid flat (= ½ the hem circumference; Aldrich's trouser bottom width). Front piece drafts 10mm narrower, back 10mm wider. */
  bottomWidth: Millimetres;
  block?: TrouserBlock;
  /** Waist height drop (mm), 0 = classic / natural waist, 50 = production / low waist. */
  waistDrop?: Millimetres;
  /** Drop the trouser waist by this amount when a waistband is added. */
  waistReduction?: Millimetres;
  /** darted | shaped — shallow faced band vs deep shaped band / yoke. */
  waistbandMode?: WaistbandMode;
  /**
   * Scale on Aldrich's front crotch extension (H/16+10). 1.0 = Aldrich;
   * ~0.5 ≈ Izzy (half the extension at the same drafted hip). Clamped [0.4, 1.0].
   * Intermediate values have no external authority — toile is the verdict.
   */
  crotchExtensionScale?: number;
  /**
   * Departure height on the true CF (mm below the scooped waist CF, wr.cf.y).
   * P0 = (−fork, wr.cf.y + crotchStraightRun); the edge above is the slanted join
   * wr.cf → P0 (Aldrich 10–6 when departure is at the hipline).
   * Default / max = hipline from scooped waist (D − wr.cf.y). 0 = curve from the waist.
   */
  crotchStraightRun?: Millimetres;
  /**
   * Arrival angle at p9, degrees below horizontal (curve travelling down-and-out).
   * Default ≈ 14° (previous effective arrival). Izzy ≈ 32°.
   */
  crotchArrivalAngle?: number;
  /**
   * Aldrich §2a front waistline scoop depth (mm). Default = WAISTLINE_CURVE_FRONT (12).
   * 0 = straight front waist (§2a off). Clamped [0, 30].
   */
  waistlineCurveFront?: Millimetres;
  /**
   * Aldrich 7–10: how far p10 sits inboard of the fork-line CF (mm).
   * Default 10 (Aldrich). 0 = vertical CF (Izzy-style). Clamped [0, 20].
   */
  frontWaistInset?: Millimetres;
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

const KNEE_ADD: Record<SizeBand, Millimetres> = {
  "6-8": 13,
  "10-14": 13,
  "16-20": 15,
  "22-26": 17,
};

/**
 * Fashion-garment chart (book p.10) hips by size, cm — the chart Aldrich drafts
 * the production block from (p.46: "A size 12 from the size chart on page 10").
 * Sizes 6–16 are tabulated; 18–26 continue the chart's own +4 cm-per-size pattern.
 */
const FASHION_CHART_HIP_CM: Record<number, number> = {
  6: 82,
  8: 86,
  10: 90,
  12: 94,
  14: 98,
  16: 102,
  18: 106,
  20: 110,
  22: 114,
  24: 118,
  26: 122,
};

/**
 * Aldrich p.46 crotch-touch bands. Front is measured from point 5, back from
 * point 16. Back − front is exactly 12.5 mm at every band, so back is derived
 * from the front fit (see BACK_FRONT_TOUCH_OFFSET_MM), not fitted separately.
 */
const CROTCH_TOUCH_BANDS: { sizes: number[]; frontCm: number }[] = [
  { sizes: [6, 8], frontCm: 2.75 },
  { sizes: [10, 12, 14], frontCm: 3.0 },
  { sizes: [16, 18, 20], frontCm: 3.25 },
  { sizes: [22, 24, 26], frontCm: 3.5 },
];

/** Back touch = front touch + this. Exact at all four Aldrich bands. */
const BACK_FRONT_TOUCH_OFFSET_MM: Millimetres = 12.5;

function linearFit(points: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
} {
  const n = points.length;
  const xMean = points.reduce((s, p) => s + p.x, 0) / n;
  const yMean = points.reduce((s, p) => s + p.y, 0) / n;
  const num = points.reduce((s, p) => s + (p.x - xMean) * (p.y - yMean), 0);
  const den = points.reduce((s, p) => s + (p.x - xMean) ** 2, 0);
  const slope = num / den;
  return { slope, intercept: yMean - slope * xMean };
}

/**
 * Least-squares line through 11 (fashion-chart hip, Aldrich band touch) points.
 *
 * The four Aldrich front bands step +2.5 mm each (27.5 / 30 / 32.5 / 35 mm) but are
 * not collinear in hip: the 6–8 band spans two sizes while the other three span three,
 * so band centres step 10 / 12 / 12 cm against a constant +2.5 mm. No straight line
 * can sit on all four bands. This fit is centre-anchored: it reproduces the textbook
 * size-12 example almost exactly (hip 940 → ≈30.0 mm) but reads high at band tops
 * (+0.727 mm at hip 1100) and low at band bottoms. That skew is intended, not drift.
 * Do not re-anchor to hit a band top — that would move the textbook point off 30.0.
 */
const FRONT_TOUCH_FIT = linearFit(
  CROTCH_TOUCH_BANDS.flatMap((b) =>
    b.sizes.map((s) => ({
      x: FASHION_CHART_HIP_CM[s] * 10,
      y: b.frontCm * 10,
    })),
  ),
);

/** Front crotch-curve touch distance from point 5, continuous in hip (Aldrich p.46). */
export function frontCrotchTouch(hip: Millimetres): Millimetres {
  return FRONT_TOUCH_FIT.slope * hip + FRONT_TOUCH_FIT.intercept;
}

/** Back crotch-curve touch distance from point 16, continuous in hip (Aldrich p.46). */
export function backCrotchTouch(hip: Millimetres): Millimetres {
  return frontCrotchTouch(hip) + BACK_FRONT_TOUCH_OFFSET_MM;
}

/**
 * Aldrich p.46: 5–9 = one sixteenth hip plus 1 cm. Expressed as a fraction of the
 * drafted hip so it grades correctly across bodies. crotchExtensionScale = 1.0 is
 * Aldrich; 0.5 approximates the Izzy pattern (measured: half Aldrich's front extension
 * at the same drafted hip). Validated only by toile — no external authority for
 * intermediate values.
 */
const ALDRICH_FRONT_EXTENSION = (H: Millimetres): Millimetres => H / 16 + 10;

export const CROTCH_EXTENSION_SCALE_MIN = 0.4;
export const CROTCH_EXTENSION_SCALE_MAX = 1.0;
export const DEFAULT_CROTCH_EXTENSION_SCALE = 1.0;

/** Default arrival ≈ previous Catmull leave angle at p9 (degrees below horizontal). */
export const DEFAULT_CROTCH_ARRIVAL_ANGLE = 14;
export const CROTCH_ARRIVAL_ANGLE_MIN = 5;
export const CROTCH_ARRIVAL_ANGLE_MAX = 45;
/** Departure on CF: 0 = from the waist; max = hipline (Aldrich default). */
export const CROTCH_STRAIGHT_RUN_MIN = 0;

/** Aldrich 7–10 default inset (mm). */
export const DEFAULT_FRONT_WAIST_INSET = 10;
export const FRONT_WAIST_INSET_MIN = 0;
export const FRONT_WAIST_INSET_MAX = 20;

export function resolveCrotchExtensionScale(
  style: Pick<TrouserFrontStyle, "crotchExtensionScale">,
): number {
  const raw = style.crotchExtensionScale ?? DEFAULT_CROTCH_EXTENSION_SCALE;
  return Math.max(
    CROTCH_EXTENSION_SCALE_MIN,
    Math.min(CROTCH_EXTENSION_SCALE_MAX, raw),
  );
}

export function resolveCrotchArrivalAngle(
  style: Pick<TrouserFrontStyle, "crotchArrivalAngle">,
): number {
  const raw = style.crotchArrivalAngle ?? DEFAULT_CROTCH_ARRIVAL_ANGLE;
  return Math.max(
    CROTCH_ARRIVAL_ANGLE_MIN,
    Math.min(CROTCH_ARRIVAL_ANGLE_MAX, raw),
  );
}

/**
 * Y-distance below the scooped waist CF (wr.cf.y) at which the crotch curve
 * leaves the true CF (−fork). Default / max = hipline (D − waistCfY) — Aldrich's
 * point 6 measured from the scooped waist, so P0 lands on y = D.
 */
export function resolveCrotchStraightRun(
  style: Pick<TrouserFrontStyle, "crotchStraightRun">,
  _R: Millimetres,
  D: Millimetres,
  waistCfY: Millimetres,
): Millimetres {
  const hiplineFromWaist = Math.max(0, D - waistCfY);
  const raw = style.crotchStraightRun ?? hiplineFromWaist;
  return Math.max(CROTCH_STRAIGHT_RUN_MIN, Math.min(hiplineFromWaist, raw));
}

/** Aldrich 7–10: p10 inset from the fork line. Default 10. */
export function resolveFrontWaistInset(
  style: Pick<TrouserFrontStyle, "frontWaistInset">,
): Millimetres {
  const raw = style.frontWaistInset ?? DEFAULT_FRONT_WAIST_INSET;
  return Math.max(FRONT_WAIST_INSET_MIN, Math.min(FRONT_WAIST_INSET_MAX, raw));
}

export function frontCrotchExtension(
  H: Millimetres,
  scale: number,
): Millimetres {
  return ALDRICH_FRONT_EXTENSION(H) * scale;
}

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

/**
 * Evaluate a cubic Bézier at parameter t ∈ [0, 1].
 */
function cubicBezierAt(
  p0: Point,
  c1: Point,
  c2: Point,
  p3: Point,
  t: number,
): Point {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * p0.x + w1 * c1.x + w2 * c2.x + w3 * p3.x,
    y: w0 * p0.y + w1 * c1.y + w2 * c2.y + w3 * p3.y,
  };
}

/**
 * Front crotch tip→waist path: full Bézier tip→P0, then the straight CF join
 * P0→wr.cf (Aldrich 10–6 generalised — absorbs the waist inset).
 * Does not snap the curve onto wr.cf; P0 stays the curve endpoint.
 * Degenerate join (inset 0 and coincident waist): omit the join segment.
 */
function frontCrotchPathToWaist(
  P0: Point,
  P1: Point,
  P2: Point,
  P3: Point,
  wrCf: Point,
  steps = 48,
): Point[] {
  // Assert y monotonic along the Bézier (P0 at CF → P3 at crotch tip).
  let yPrev = P0.y;
  for (let i = 1; i <= 16; i++) {
    const y = cubicBezierAt(P0, P1, P2, P3, i / 16).y;
    if (y + 1e-6 < yPrev) {
      throw new Error(
        `front crotch Bézier not monotonic in y (y(${i / 16})=${y} < yPrev=${yPrev})`,
      );
    }
    yPrev = y;
  }

  const tipToP0 = cubicBezier(P0, P1, P2, P3, steps).slice().reverse();
  // tipToP0 ends at P0 once.
  if (Math.hypot(P0.x - wrCf.x, P0.y - wrCf.y) < 0.01) {
    tipToP0[tipToP0.length - 1] = { ...wrCf };
    return tipToP0;
  }
  return [...tipToP0, { ...wrCf }];
}

/**
 * Split a tip→waist polyline at `y` into lower (tip→y) and upper (y→waist).
 * Continuous: both halves share the split point.
 */
function splitPolylineAtY(
  poly: Point[],
  y: Millimetres,
): { lower: Point[]; upper: Point[] } {
  if (poly.length < 2) {
    return { lower: poly.map((p) => ({ ...p })), upper: [] };
  }
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]!;
    const b = poly[i + 1]!;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (y < minY - 1e-9 || y > maxY + 1e-9) {
      continue;
    }
    if (Math.abs(b.y - a.y) < 1e-9) {
      continue;
    }
    const t = (y - a.y) / (b.y - a.y);
    const at = { x: a.x + t * (b.x - a.x), y };
    const lower = [...poly.slice(0, i + 1).map((p) => ({ ...p })), { ...at }];
    const upper = [{ ...at }, ...poly.slice(i + 1).map((p) => ({ ...p }))];
    const dedupe = (pts: Point[]) => {
      const out: Point[] = [];
      for (const p of pts) {
        const prev = out[out.length - 1];
        if (!prev || Math.hypot(prev.x - p.x, prev.y - p.y) > 1e-6) {
          out.push(p);
        }
      }
      return out;
    };
    return { lower: dedupe(lower), upper: dedupe(upper) };
  }
  return { lower: poly.map((p) => ({ ...p })), upper: [] };
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
  /** +1 dips CF at centre (front); −1 raises CB at centre (back). */
  centreScoopSign?: 1 | -1;
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
 *    • t = 0 (CF/CB): arc-walk cfEdge by full depth r from cfWaist; y from cfEnd + §2a scoop.
 *    • t = 1 (side): arc-walk sideEdge by full depth r from sideWaist; y from sideEased (no scoop).
 *
 * 2. INTERIOR (chord between full-depth corners plus §2a scoop)
 *    No body edge runs CF→side on the waist; the interior is the straight chord
 *    between cfEnd and sideEased (the r = 0 construction lowered by r), plus scoop.
 *    sideEased already includes full sideShift at the side seam; blending u · sideEased
 *    ramps ease linearly 0 → full as u: 0 → 1.
 *
 * 3. §2a SCOOP (fixed shallow term, centre-heavy)
 *    y blends arc-walked body heights, plus centreScoopSign · scoopDepth · waistlineScoopFactor(t).
 *    Front (+1): CF dips scoopDepth below the body chord; back (−1): CB rises scoopDepth above it.
 *    Envelope is zero at the side seam (t = 1).
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
  const scoopSign = spec.centreScoopSign ?? 1;
  const u = Math.max(0, Math.min(1, t));
  const scoopTerm = scoopSign * scoopDepth * waistlineScoopFactor(u);

  const cfEnd = waistArcWalk(cfEdge, cfWaist, r);
  const sideRaw = waistArcWalk(sideEdge, sideWaist, r);
  const sideEased: Point = { x: sideRaw.x - sideShift, y: sideRaw.y };

  if (u <= 0) {
    return { x: cfEnd.x, y: cfEnd.y + scoopTerm };
  }
  if (u >= 1) {
    return { x: sideEased.x, y: sideEased.y };
  }

  if (r <= 0) {
    const x = cfWaist.x + u * (sideWaist.x - cfWaist.x);
    const y = (1 - u) * cfWaist.y + u * sideWaist.y + scoopTerm;
    return { x, y };
  }

  // Interior chord between full-depth corners — see doc above.
  const x = (1 - u) * cfEnd.x + u * sideEased.x;
  const y = (1 - u) * cfEnd.y + u * sideEased.y + scoopTerm;
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
    // Straight CB join (p21→p19), not the crotch curve — mirrors front cfEdge [p10, p6].
    cfEdge: [b.p21, b.p19],
    sideEdge: pchipByY([b.p22, b.p25, b.p27, b.p26]),
    depth,
    scoopDepth: 0,
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

function backCrotchCurve(b: BackPoints): Point[] {
  return catmullRomCentripetal([b.p24, b.guide, b.p19, b.p21]);
}

/** Crotch body for CB clearance — stops at hipline p19; p19→p21 is the straight CB join leg. */
function backCrotchBelowHip(b: BackPoints): Point[] {
  const full = backCrotchCurve(b);
  let hipIdx = full.length - 1;
  for (let i = 0; i < full.length; i++) {
    if (Math.hypot(full[i].x - b.p19.x, full[i].y - b.p19.y) < 0.5) {
      hipIdx = i;
      break;
    }
  }
  return full.slice(0, hipIdx + 1);
}

/**
 * Front crotch as a cubic Bézier with vertical CF departure and angled arrival at p9.
 * Handle lengths d1 = k·run (run = p9.y − P0.y, never vanishes), d2 = k·extension;
 * k is solved so the curve passes through the 45° touch landmark (overlay-only, not a knot).
 *
 * P0 sits on the true CF (−fork), `straightRun` mm below the scooped waist CF (waistCfY).
 * The edge above is the slanted join wr.cf → P0 (Aldrich 10–6 when departure is at the hipline).
 * Returns samples ordered p9 → P0.
 */
export function frontCrotchCurve(args: {
  p5: Point;
  p9: Point;
  fork: Millimetres;
  R: Millimetres;
  /** Scooped waist CF y (wr.cf.y) — one source of truth for the waist top. */
  waistCfY: Millimetres;
  straightRun: Millimetres;
  extension: Millimetres;
  arrivalAngleDeg: number;
  touch: Millimetres;
}): { points: Point[]; P0: Point; P1: Point; P2: Point; P3: Point; k: number; touchMiss: Millimetres } {
  const {
    p5,
    p9,
    fork,
    waistCfY,
    straightRun,
    extension,
    arrivalAngleDeg,
    touch,
  } = args;
  const P0: Point = { x: -fork, y: waistCfY + straightRun };
  const P3 = p9;
  // Vertical run P0 → crotch tip — not the style departure (which is 0 at the waist).
  const run = p9.y - P0.y;
  // Arrival travelling down-and-out (−x, +y), θ below horizontal.
  const theta = (arrivalAngleDeg * Math.PI) / 180;
  const dir = { x: -Math.cos(theta), y: Math.sin(theta) };
  const touchPt = crotchGuide45(p5, touch);

  const handlesForK = (k: number): { P1: Point; P2: Point } => {
    const d1 = k * run;
    const d2 = k * extension;
    return {
      P1: { x: P0.x, y: P0.y + d1 },
      P2: {
        x: P3.x - d2 * dir.x,
        y: P3.y - d2 * dir.y,
      },
    };
  };

  const curveForK = (k: number): Point[] => {
    const { P1, P2 } = handlesForK(k);
    return cubicBezier(P0, P1, P2, P3, 48);
  };

  const miss = (k: number): Millimetres => {
    const curve = curveForK(k);
    let best = Infinity;
    for (const p of curve) {
      const d = Math.hypot(p.x - touchPt.x, p.y - touchPt.y);
      if (d < best) best = d;
    }
    return best;
  };

  // Scan then refine: find k minimising distance to the 45° touch point.
  let bestK = 0.55;
  let bestMiss = miss(bestK);
  for (let i = 0; i <= 40; i++) {
    const k = 0.15 + (i / 40) * 1.85;
    const m = miss(k);
    if (m < bestMiss) {
      bestMiss = m;
      bestK = k;
    }
  }
  let lo = Math.max(0.05, bestK - 0.08);
  let hi = bestK + 0.08;
  for (let iter = 0; iter < 24; iter++) {
    const mid = (lo + hi) / 2;
    const m1 = miss(mid - 1e-3);
    const m2 = miss(mid + 1e-3);
    if (m1 < m2) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  const k = (lo + hi) / 2;
  const touchMiss = miss(k);
  const { P1, P2 } = handlesForK(k);
  const forward = cubicBezier(P0, P1, P2, P3, 48);
  // Outline: crotch runs crotch-tip → CF join.
  const points = forward.slice().reverse();
  return { points, P0, P1, P2, P3, k, touchMiss };
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
  return backCbClearOfCrotchReason(body, style, waistSeam, strict) === null;
}

function backCbClearOfCrotchReason(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  waistSeam: Point[],
  strict: boolean,
): string | null {
  if (waistSeam.length < 2) {
    return "waist too short";
  }
  const b = trouserBackPoints(body, style);
  const cb = waistSeam[0];
  const waistNext = waistSeam[1];
  const departEps = strict ? 1e-9 : X_MONOTONE_EPS;

  if (waistNext.x <= cb.x + departEps) {
    return `waistNext.x ${waistNext.x.toFixed(2)} <= cb.x ${cb.x.toFixed(2)}`;
  }

  const crotchCheck = backCrotchBelowHip(b);
  const joinStart = backCrotchCurve(b).at(-1)!;
  const nearCount = strict
    ? Math.min(CB_WAIST_NEAR_DENSE, waistSeam.length)
    : Math.min(12, waistSeam.length);
  const waistNear = waistSeam.slice(0, nearCount);
  const crossEps = strict ? 0.005 : 0.02;
  if (polylinesCrossInterior(waistNear, crotchCheck, crossEps)) {
    return "waist crosses crotch interior";
  }

  if (strict && waistCrossesCrotchAtY(waistSeam, crotchCheck, nearCount)) {
    return "waist inboard of crotch at matched y";
  }

  const interior = cbInteriorAngle(joinStart, cb, waistNext);
  if (interior > CB_MAX_INTERIOR_ANGLE_DEG) {
    return `interior ${interior.toFixed(1)}° > max ${CB_MAX_INTERIOR_ANGLE_DEG}°`;
  }

  const approachVec = { x: cb.x - joinStart.x, y: cb.y - joinStart.y };
  const departVec = { x: waistNext.x - cb.x, y: waistNext.y - cb.y };
  const refSide = cross2(approachVec, departVec);
  if (!strict && Math.abs(refSide) < 1) {
    return "degenerate corner turn";
  }
  if (strict && interior > CB_FOLD_INTERIOR_DEG) {
    return `fold interior ${interior.toFixed(1)}° > ${CB_FOLD_INTERIOR_DEG}°`;
  }
  for (let i = 2; i < waistNear.length; i++) {
    const side = cross2(approachVec, {
      x: waistSeam[i].x - cb.x,
      y: waistSeam[i].y - cb.y,
    });
    if (side * refSide < 0) {
      return `waist folds back at sample ${i}`;
    }
  }

  return null;
}

function assertBackCbClearOfCrotch(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  curveSpec: WaistCurveSpec,
  context: WaistMonotoneContext,
): void {
  const dense = sampleWaistSeam(curveSpec, WAIST_CAP_SAMPLE_COUNT);
  const failReason = backCbClearOfCrotchReason(body, style, dense, true);
  if (failReason === null) {
    return;
  }
  const b = trouserBackPoints(body, style);
  const cb = dense[0];
  const joinStart = backCrotchCurve(b).at(-1)!;
  const interior =
    dense.length >= 2 ? cbInteriorAngle(joinStart, cb, dense[1]) : 0;
  throw new Error(
    `Back waist/crotch corner incoherent on ${context.piece} at depth ` +
      `${context.depth.toFixed(1)} mm (${failReason}; interior angle ${interior.toFixed(1)}°, ` +
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
    scoopDepth: resolveWaistlineCurveFront(style),
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

/** Aldrich p.46–47 — 45° bisector into the crotch corner (−x, −y). Used at p5 (front) and p16 (back). */
function crotchGuide45(corner: Point, touch: Millimetres): Point {
  const c = Math.SQRT1_2;
  return { x: corner.x - touch * c, y: corner.y - touch * c };
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
  const W = trouserWaistGirth(body, spec);
  const H = body.hip;
  const R = body.bodyRise - spec.riseDrop;
  const D = body.hipDepth - spec.hipDepthDrop;
  const F = body.waistToFloor - spec.riseDrop;
  const B = style.bottomWidth;
  const band = sizeBand(H);
  const kneeAdd = KNEE_ADD[band];

  const kneeY = trouserKneeY(body, spec.riseDrop);
  const fork = forkWidth(H);
  const scale = resolveCrotchExtensionScale(style);
  const ext = frontCrotchExtension(H, scale);
  const inset = resolveFrontWaistInset(style);

  const p5 = { x: -fork, y: R };
  const p6 = { x: -fork, y: D };
  const p8 = { x: -fork + H / 4 + 5, y: D };
  const p9 = { x: -(fork + ext), y: R };
  const p10 = { x: -fork + inset, y: 0 };
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
  const W = trouserWaistGirth(body, spec);
  const H = body.hip;
  const R = body.bodyRise - spec.riseDrop;
  const D = body.hipDepth - spec.hipDepthDrop;
  const F = body.waistToFloor - spec.riseDrop;
  const fork = forkWidth(H);
  const f = trouserFrontPoints(body, style);
  const scale = resolveCrotchExtensionScale(style);
  const ext = frontCrotchExtension(H, scale);

  const p16 = { x: -fork + fork / 4, y: R };
  const p17 = { x: p16.x, y: D };
  const p18 = { x: p16.x, y: 0 };
  const p19 = { x: p16.x, y: R / 2 };
  const p20x = p18.x + spec.backWaistStep;
  const p21 = { x: p20x, y: -BACK_CB_WAIST_RISE };
  const L = W / 4 + 40;
  const p22 = { x: p21.x + Math.sqrt(L * L - p21.y * p21.y), y: 0 };
  const p23 = { x: f.p9.x - (ext / 2 + spec.backCrotchAdd), y: R };
  const p24 = { x: p23.x, y: R + 5 };
  const p25 = { x: p17.x + H / 4 + 15, y: D };
  const p26 = { x: f.p12.x + 10, y: F };
  const p28 = { x: f.p14.x - 10, y: F };
  const kneeY = f.p13.y;

  const p27 = { x: f.p13.x + 10, y: kneeY };
  const p29 = { x: f.p15.x - 10, y: kneeY };
  const guide = crotchGuide45(p16, backCrotchTouch(H) * scale);

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

function trouserKneeY(body: BodyMeasurements, drop: Millimetres = 0): Millimetres {
  const R = body.bodyRise - drop;
  const F = body.waistToFloor - drop;
  return R + (F - R) / 2 - 50;
}

export function trouserFramePoints(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): FramePoints {
  const spec = trouserBlockSpec(style);
  const drop = spec.riseDrop;
  const R = body.bodyRise - drop;
  const D = body.hipDepth - spec.hipDepthDrop;
  const F = body.waistToFloor - drop;
  const p0 = { x: 0, y: TROUSER_LAYOUT_ANCHOR_Y };
  const p1 = { x: 0, y: R };
  const p2 = { x: 0, y: D };
  const p3 = { x: 0, y: F };
  const p4 = { x: 0, y: trouserKneeY(body, drop) };
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
  const spec = trouserBlockSpec(style);
  const drop = spec.riseDrop;
  const R = body.bodyRise - drop;
  const D = body.hipDepth - spec.hipDepthDrop;
  const F = body.waistToFloor - drop;
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const crotchScale = resolveCrotchExtensionScale(style);
  // Front 45° touch landmark — drawn in the construction overlay / checked by
  // verify:aldrich. The cut crotch is a Bézier constrained to this depth, not
  // a Catmull-Rom through the guide as a knot.
  const frontGuide = crotchGuide45(
    f.p5,
    frontCrotchTouch(body.hip) * crotchScale,
  );
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
  const framePoints = trouserFramePoints(body, style);
  const frame = frameConstruction(framePoints);
  const framePts = Object.values(framePoints);

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
  const R = body.bodyRise - spec.riseDrop;
  const D = body.hipDepth - spec.hipDepthDrop;
  const F = body.waistToFloor - spec.riseDrop;
  const f = trouserFrontPoints(body, style);
  const { p5, p6, p8, p9, p12, p13, p14, p15 } = f;
  const r = style.waistReduction ?? 0;
  const wr = frontWaistResolved(body, style);

  const crotchScale = resolveCrotchExtensionScale(style);
  const touch = frontCrotchTouch(H) * crotchScale;
  // Landmark only (construction overlay / verify) — not a curve knot.
  const frontGuide = crotchGuide45(p5, touch);
  const fork = Math.abs(p5.x);
  // Departure measured from the scooped waist (wr.cf), not p10.y.
  const straightRun = resolveCrotchStraightRun(style, R, D, wr.cf.y);
  const extension = frontCrotchExtension(H, crotchScale);
  const arrivalAngle = resolveCrotchArrivalAngle(style);
  const frontCrotch = frontCrotchCurve({
    p5,
    p9,
    fork,
    R,
    waistCfY: wr.cf.y,
    straightRun,
    extension,
    arrivalAngleDeg: arrivalAngle,
    touch,
  });
  const { P0: cfJoin, P1, P2, P3, points: crotchCurve } = frontCrotch;

  // Tip→waist: full Bézier to P0, then straight join P0→wr.cf (no snap).
  const crotchFromWaist = frontCrotchPathToWaist(
    cfJoin,
    P1,
    P2,
    P3,
    wr.cf,
  );

  const insideLegCtrl = insideLegControl(p9, p15);
  const insideLegToFork = quadBezier(p15, insideLegCtrl, p9).slice(1);

  const facingFinish = isDartedFacingFinish(style);

  // Split at the hipline for role tagging — one continuous polyline, two roles.
  const { lower: crotchSeg, upper: cfSeg } = splitPolylineAtY(
    crotchFromWaist,
    D,
  );

  // Hip notch at p6 when the departure is at/below the hipline (default), or where
  // the path crosses D. Omit when the curve leaves at the waist (no straight join).
  const markingsHip: Marking[] = [];
  if (straightRun >= 0.5) {
    let hipNotchAt = p6;
    let hipNotchBefore = frontGuide;
    let hipNotchAfter = p6;
    if (Math.abs(cfJoin.y - D) < 0.5 && Math.abs(cfJoin.x - p6.x) < 0.5) {
      // Aldrich default: P0 = p6.
      hipNotchAt = cfJoin;
      hipNotchBefore = crotchCurve[Math.max(0, crotchCurve.length - 2)]!;
      hipNotchAfter = cfJoin;
    } else {
      try {
        const onCurve = pointOnPolylineAtY(crotchFromWaist, D);
        hipNotchAt = onCurve.at;
        hipNotchBefore = onCurve.before;
        hipNotchAfter = onCurve.after;
      } catch {
        hipNotchAt = p6;
      }
    }
    markingsHip.push({
      kind: "notch",
      at: hipNotchAt,
      dir: crotchNotchDir(hipNotchBefore, hipNotchAfter),
      count: 1,
    });
  }

  const crotchCfSegments: TaggedSegment[] = [
    {
      points: crotchSeg.length >= 2 ? crotchSeg : crotchFromWaist,
      edge: "seam",
      role: "crotch",
    },
  ];
  if (cfSeg.length >= 2) {
    crotchCfSegments.push({
      points: cfSeg,
      edge: "seam",
      role: "centre-front",
    });
  }

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
    ...crotchCfSegments,
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
    ...markingsHip,
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
  const spec = trouserBlockSpec(style);
  const F = body.waistToFloor - spec.riseDrop;
  const b = trouserBackPoints(body, style);
  const { p24, p25, p26, p27, p28, p29 } = b;
  const r = style.waistReduction ?? 0;
  const wr = backWaistResolved(body, style);

  const insideLegCtrl = insideLegControl(p24, p29, 12.5);
  const backInsideToFork = quadBezier(p29, insideLegCtrl, p24).slice(1);
  // Crotch body stops at the hipline join (p19); CB leg runs to the lowered waist.
  const crotch = backCrotchBelowHip(b);
  const cbTop = crotch[crotch.length - 1]!;
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
    { points: [cbTop, wr.cf], edge: "seam", role: "centre-back" },
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
      text: "With right sides together, join each front to its back at the side seams — sew the right side seam its full length, and the left from the hem up to the opening notch, leaving the seam open above for the zip.",
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
  );
  return steps;
}

export function trouserHemStep(): ConstructionStep {
  return {
    id: "hem",
    text: "Neaten and hem both legs to the marked hem line.",
    highlight: [
      { piece: "Trouser front", edges: ["hem"] },
      { piece: "Trouser back", edges: ["hem"] },
    ],
  };
}

export {
  verifyAldrichProductionDepth0,
  verifyCrotchTouchFormula,
  verifyFrontWaistSeamBow,
  formatAldrichReport,
  ALDRICH_P46_SIZE_12_BODY,
  ALDRICH_P46_DEPTH0_STYLE,
} from "@/lib/patterns/aldrichProductionVerify";
export type { AldrichCheck } from "@/lib/patterns/aldrichProductionVerify";
