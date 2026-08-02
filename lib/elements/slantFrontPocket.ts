/**
 * Slant front pocket — facing, bag, and side/hip stay.
 *
 * Functional split (brief):
 * 1. Facing — sewn to the front-leg slant, turns inside (width = facingWidth).
 * 2. Bag — pouch below the mouth (depth = bagDepth), rounded bottom.
 * 3. Stay — restores the trimmed waist∩side corner (silhouette invariant).
 *
 * Pieces are independent (no shared outline indexing with the front leg).
 */
import {
  pointAtArcDistanceFromEnd,
  pointAtArcDistanceFromStart,
  polylineLength,
  splitPolylineAtArcDistance,
} from "@/lib/geometry/curves";
import type {
  Marking,
  Millimetres,
  OutlinePoint,
  PatternPiece,
  Point,
} from "@/lib/types/measurements";

/** Mouth inset from the side corner along the body-waist edge (mm). */
export const DEFAULT_SLANT_MOUTH_INSET = 75;
/** Mouth drop down the side seam from bodyWaistY, by arc length (mm). */
export const DEFAULT_SLANT_MOUTH_DROP = 160;
/** Optional drop of mouth-top below bodyWaistY (mm). Default 0. */
export const DEFAULT_SLANT_MOUTH_TOP_DROP = 0;
/** Facing strip width into the front (mm). */
export const DEFAULT_SLANT_FACING_WIDTH = 40;
/** Bag depth below the mouth-side (mm). */
export const DEFAULT_SLANT_BAG_DEPTH = 130;

export const SLANT_MOUTH_INSET_MIN = 20;
export const SLANT_MOUTH_INSET_MAX = 150;
export const SLANT_MOUTH_DROP_MIN = 40;
export const SLANT_MOUTH_DROP_MAX = 280;
export const SLANT_MOUTH_TOP_DROP_MIN = 0;
export const SLANT_MOUTH_TOP_DROP_MAX = 40;
export const SLANT_FACING_WIDTH_MIN = 20;
export const SLANT_FACING_WIDTH_MAX = 80;
export const SLANT_BAG_DEPTH_MIN = 60;
export const SLANT_BAG_DEPTH_MAX = 220;

export type PocketFront = "none" | "slant";

export type SlantPocketParams = {
  mouthInset: Millimetres;
  mouthDrop: Millimetres;
  mouthTopDrop: Millimetres;
  facingWidth: Millimetres;
  bagDepth: Millimetres;
};

export type SlantPocketMouth = {
  /** Mouth-top on the waist edge (inset from side). */
  mouthTop: Point;
  /** Mouth-side on the side seam (arc drop from body waist). */
  mouthSide: Point;
  /** Side corner at the piece waist∩side (removed from front; kept on stay). */
  sideCorner: Point;
  /** Original waist CF→side (pocket-off). */
  waistFull: Point[];
  /** Original side waist→hem (pocket-off). */
  sideFull: Point[];
  /** Waist CF→mouth-top (front keeps). */
  waistToMouth: Point[];
  /** Waist mouth-top→side corner (stay restores). */
  waistRestored: Point[];
  /** Side mouth-side→hem (front keeps). */
  sideFromMouth: Point[];
  /** Side side-corner→mouth-side (stay restores). */
  sideRestored: Point[];
  /** Straight slant mouth-top→mouth-side. */
  slant: Point[];
  params: SlantPocketParams;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function resolveSlantPocketParams(raw: {
  slantMouthInset?: Millimetres;
  slantMouthDrop?: Millimetres;
  slantMouthTopDrop?: Millimetres;
  slantFacingWidth?: Millimetres;
  slantBagDepth?: Millimetres;
}): SlantPocketParams {
  return {
    mouthInset: clamp(
      raw.slantMouthInset ?? DEFAULT_SLANT_MOUTH_INSET,
      SLANT_MOUTH_INSET_MIN,
      SLANT_MOUTH_INSET_MAX,
    ),
    mouthDrop: clamp(
      raw.slantMouthDrop ?? DEFAULT_SLANT_MOUTH_DROP,
      SLANT_MOUTH_DROP_MIN,
      SLANT_MOUTH_DROP_MAX,
    ),
    mouthTopDrop: clamp(
      raw.slantMouthTopDrop ?? DEFAULT_SLANT_MOUTH_TOP_DROP,
      SLANT_MOUTH_TOP_DROP_MIN,
      SLANT_MOUTH_TOP_DROP_MAX,
    ),
    facingWidth: clamp(
      raw.slantFacingWidth ?? DEFAULT_SLANT_FACING_WIDTH,
      SLANT_FACING_WIDTH_MIN,
      SLANT_FACING_WIDTH_MAX,
    ),
    bagDepth: clamp(
      raw.slantBagDepth ?? DEFAULT_SLANT_BAG_DEPTH,
      SLANT_BAG_DEPTH_MIN,
      SLANT_BAG_DEPTH_MAX,
    ),
  };
}

/**
 * Resolve mouth anchors on the drafted waist + side polylines.
 *
 * Mouth-top: `mouthInset` mm in from the side along the waist (piece top at
 * bodyWaistY when r = 0). Optional `mouthTopDrop` shifts that point down in y.
 * Mouth-side: `mouthDrop` mm arc down the side from the side corner.
 *
 * Stay restored edges are exact sub-polylines of the pocket-off waist/side so
 * front-trimmed + stay reconstructs the original outline byte-identically.
 */
export function resolveSlantPocketMouth(
  waistFull: Point[],
  sideFull: Point[],
  params: SlantPocketParams,
): SlantPocketMouth {
  if (waistFull.length < 2 || sideFull.length < 2) {
    throw new Error("slant pocket: waist and side need ≥2 points");
  }
  const waistLen = polylineLength(waistFull);
  if (params.mouthInset >= waistLen - 1) {
    throw new Error(
      `slant pocket: mouthInset ${params.mouthInset} ≥ waist length ${waistLen}`,
    );
  }
  const sideLen = polylineLength(sideFull);
  if (params.mouthDrop >= sideLen - 1) {
    throw new Error(
      `slant pocket: mouthDrop ${params.mouthDrop} ≥ side length ${sideLen}`,
    );
  }

  const sideCorner = { ...waistFull[waistFull.length - 1]! };
  // Confirm side starts at the same corner.
  const sideStart = sideFull[0]!;
  if (
    Math.hypot(sideStart.x - sideCorner.x, sideStart.y - sideCorner.y) > 0.05
  ) {
    throw new Error(
      `slant pocket: waist side corner ≠ side start (|Δ|=${Math.hypot(
        sideStart.x - sideCorner.x,
        sideStart.y - sideCorner.y,
      ).toFixed(3)})`,
    );
  }

  const mouthTopOnWaist = pointAtArcDistanceFromEnd(
    waistFull,
    params.mouthInset,
  );
  const mouthTop =
    params.mouthTopDrop > 0
      ? { x: mouthTopOnWaist.x, y: mouthTopOnWaist.y + params.mouthTopDrop }
      : mouthTopOnWaist;

  // Split waist by arc from CF so restored/kept edges share samples.
  const waistSplitDist = waistLen - params.mouthInset;
  const waistSplit = splitPolylineAtArcDistance(waistFull, waistSplitDist);
  // If mouthTop was dropped off the waist seam, pin the split vertex to mouthTop
  // for the front opening; restored stay still uses the on-seam stub.
  const waistToMouth =
    params.mouthTopDrop > 0
      ? [
          ...waistSplit.before.slice(0, -1).map((p) => ({ ...p })),
          { ...mouthTop },
        ]
      : waistSplit.before;
  const waistRestored = waistSplit.after; // mouthTop-on-seam → side corner

  const sideSplit = splitPolylineAtArcDistance(sideFull, params.mouthDrop);
  const mouthSide = sideSplit.at;
  const sideRestored = sideSplit.before; // corner → mouth-side
  const sideFromMouth = sideSplit.after; // mouth-side → hem

  const slant: Point[] = [{ ...mouthTop }, { ...mouthSide }];

  return {
    mouthTop,
    mouthSide,
    sideCorner,
    waistFull: waistFull.map((p) => ({ ...p })),
    sideFull: sideFull.map((p) => ({ ...p })),
    waistToMouth,
    waistRestored,
    sideFromMouth,
    sideRestored,
    slant,
    params,
  };
}

/** Sample a quadratic Bézier. */
function quad(
  p0: Point,
  p1: Point,
  p2: Point,
  n: number,
): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return out;
}

/**
 * Draft the three slant-pocket pieces in a local frame (origin at mouth-top,
 * +x along slant) so they lay out cleanly beside the legs.
 */
export function draftSlantFrontPocketPieces(
  mouth: SlantPocketMouth,
): PatternPiece[] {
  const { mouthTop, mouthSide, params } = mouth;
  const fw = params.facingWidth;
  const depth = params.bagDepth;

  // --- Stay (garment frame, then shifted to local for layout) ---------------
  // Outer: restored waist + restored side; inner: slant (bag attaches).
  const stayWaist = mouth.waistRestored; // mouthTop-on-seam → corner
  const staySide = mouth.sideRestored; // corner → mouthSide
  // Stay opens at the on-seam mouth-top when mouthTopDrop>0; notches still at mouthTop.
  const staySlantClose: Point[] = [
    { ...mouthSide },
    params.mouthTopDrop > 0
      ? { ...stayWaist[0]! }
      : { ...mouthTop },
  ];
  const stayOutline = buildStayOutline(stayWaist, staySide, staySlantClose);
  const stayLocal = toLocalFrame(stayOutline, mouthTop, mouthSide);
  const stayMarks: Marking[] = [
    {
      kind: "grainline",
      line: {
        from: { x: 15, y: 10 },
        to: { x: 15, y: Math.max(40, params.mouthDrop * 0.4) },
      },
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser front", seam: "pocket-mouth" },
      at: localPoint(mouthTop, mouthTop, mouthSide),
      label: "mouth-top",
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser front", seam: "pocket-mouth" },
      at: localPoint(mouthSide, mouthTop, mouthSide),
      label: "mouth-side",
    },
  ];

  // --- Facing (local): slant outer + curved inner ----------------------------
  const fOuter0 = { x: 0, y: 0 };
  const slantLen = Math.hypot(
    mouthSide.x - mouthTop.x,
    mouthSide.y - mouthTop.y,
  );
  const fOuter1 = { x: slantLen, y: 0 };
  // In local frame, inward = +y (rotate slant to +x; inward normal → +y).
  const fInner1 = { x: slantLen, y: fw };
  const fInner0 = { x: 0, y: fw };
  const fInnerCtrl = { x: slantLen / 2, y: fw * 1.35 };
  const fInnerCurve = quad(fInner1, fInnerCtrl, fInner0, 16);
  const facingOutline: OutlinePoint[] = [
    { at: fOuter0, edge: "seam", role: "pocket-mouth" },
    { at: fOuter1, edge: "seam", role: "pocket-mouth" },
    { at: fInner1, edge: "seam", role: "facing-end" },
    ...fInnerCurve.slice(1, -1).map(
      (p): OutlinePoint => ({ at: p, edge: "seam", role: "facing-inner" }),
    ),
    { at: fInner0, edge: "seam", role: "facing-inner" },
    { at: fOuter0, edge: "seam", role: "facing-end" },
  ];
  // Drop the closing duplicate of fOuter0 if present as last — keep closed via wrap.
  facingOutline.pop();
  const facingMarks: Marking[] = [
    {
      kind: "grainline",
      line: { from: { x: slantLen / 2, y: 4 }, to: { x: slantLen / 2, y: fw - 4 } },
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser front", seam: "pocket-mouth" },
      at: fOuter0,
      label: "mouth-top",
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser front", seam: "pocket-mouth" },
      at: fOuter1,
      label: "mouth-side",
    },
  ];

  // --- Bag (local): from slant, down to rounded bottom -----------------------
  const bagTop0 = { x: 0, y: 0 };
  const bagTop1 = { x: slantLen, y: 0 };
  // Drop below mouth-side (x = slantLen); round across to mouth-top side.
  const bagRight = { x: slantLen + fw * 0.25, y: depth };
  const bagBottom = { x: slantLen / 2, y: depth + fw * 0.35 };
  const bagLeft = { x: -fw * 0.15, y: depth * 0.85 };
  const bagDown = quad(bagTop1, { x: bagRight.x, y: depth * 0.45 }, bagRight, 10);
  const bagRound = quad(bagRight, bagBottom, bagLeft, 18);
  const bagUp = quad(bagLeft, { x: bagTop0.x - fw * 0.1, y: depth * 0.4 }, bagTop0, 10);
  const bagOutline: OutlinePoint[] = [
    { at: bagTop0, edge: "seam", role: "pocket-mouth" },
    { at: bagTop1, edge: "seam", role: "pocket-mouth" },
    ...bagDown.slice(1).map(
      (p): OutlinePoint => ({ at: p, edge: "seam", role: "bag-side" }),
    ),
    ...bagRound.slice(1).map(
      (p): OutlinePoint => ({ at: p, edge: "seam", role: "bag-bottom" }),
    ),
    ...bagUp.slice(1, -1).map(
      (p): OutlinePoint => ({ at: p, edge: "seam", role: "bag-side" }),
    ),
  ];
  const bagMarks: Marking[] = [
    {
      kind: "grainline",
      line: {
        from: { x: slantLen / 2, y: 8 },
        to: { x: slantLen / 2, y: depth - 8 },
      },
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Slant pocket facing", seam: "facing-inner" },
      at: bagTop0,
      label: "mouth-top",
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Slant pocket stay", seam: "pocket-mouth" },
      at: bagTop1,
      label: "mouth-side",
    },
  ];

  return [
    {
      name: "Slant pocket stay",
      cutCount: 2,
      onFold: false,
      outline: stayLocal,
      markings: stayMarks,
    },
    {
      name: "Slant pocket facing",
      cutCount: 2,
      onFold: false,
      outline: facingOutline,
      markings: facingMarks,
    },
    {
      name: "Slant pocket bag",
      cutCount: 2,
      onFold: false,
      outline: bagOutline,
      markings: bagMarks,
    },
  ];
}

function buildStayOutline(
  waistRestored: Point[],
  sideRestored: Point[],
  slantClose: Point[],
): OutlinePoint[] {
  // waist mouth→corner, side corner→mouth, slant mouth→waist-start
  const outline: OutlinePoint[] = [];
  for (let i = 0; i < waistRestored.length; i++) {
    outline.push({
      at: { ...waistRestored[i]! },
      edge: "seam",
      role: "waist",
    });
  }
  // Retag corner as side-seam departure.
  if (outline.length > 0) {
    outline[outline.length - 1]!.role = "side-seam";
  }
  for (let i = 1; i < sideRestored.length; i++) {
    outline.push({
      at: { ...sideRestored[i]! },
      edge: "seam",
      role: "side-seam",
    });
  }
  if (outline.length > 0) {
    outline[outline.length - 1]!.role = "pocket-mouth";
  }
  // slantClose[0] is mouthSide (already last); add toward waist start
  for (let i = 1; i < slantClose.length; i++) {
    outline.push({
      at: { ...slantClose[i]! },
      edge: "seam",
      role: "pocket-mouth",
    });
  }
  return outline;
}

/** Map garment point into local frame: origin=mouthTop, +x along slant. */
function localPoint(p: Point, origin: Point, mouthSide: Point): Point {
  const dx = mouthSide.x - origin.x;
  const dy = mouthSide.y - origin.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // +y = rotate +x by +90° in y-down: (-uy, ux) … check: for slant down-right,
  // inward toward CF is typically up-left in garment; we only need consistent local.
  const vx = -uy;
  const vy = ux;
  const qx = p.x - origin.x;
  const qy = p.y - origin.y;
  return { x: qx * ux + qy * uy, y: qx * vx + qy * vy };
}

function toLocalFrame(
  outline: OutlinePoint[],
  origin: Point,
  mouthSide: Point,
): OutlinePoint[] {
  return outline.map((o) => ({
    ...o,
    at: localPoint(o.at, origin, mouthSide),
  }));
}

/**
 * Max Hausdorff-style sample distance between two polylines of equal topology
 * (same vertex count preferred). Returns max point-to-point distance when
 * lengths match; otherwise samples by arc fraction.
 */
export function polylineMaxDelta(a: Point[], b: Point[]): number {
  if (a.length === 0 || b.length === 0) return Infinity;
  const n = 48;
  let max = 0;
  const la = polylineLength(a);
  const lb = polylineLength(b);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const pa = pointAtArcDistanceFromStart(a, t * la);
    const pb = pointAtArcDistanceFromStart(b, t * lb);
    max = Math.max(max, Math.hypot(pa.x - pb.x, pa.y - pb.y));
  }
  return max;
}

/**
 * Compose trimmed front edges + stay restored edges and compare to pocket-off.
 * With mouthTopDrop = 0, both deltas must be 0 (acceptance #2).
 */
export function silhouetteInvariantDelta(mouth: SlantPocketMouth): {
  waistDelta: number;
  sideDelta: number;
  /** Stay waist stub + on-seam mouth (excludes dropped mouth-top bridge). */
  waistOnSeamComposed: Point[];
  sideComposed: Point[];
} {
  // On-seam reconstruction: use the seam-split mouth (waistRestored[0]), not a
  // dropped mouth-top. Front's waistToMouth may end off-seam when topDrop > 0.
  const waistOnSeamToMouth = splitPolylineAtArcDistance(
    mouth.waistFull,
    polylineLength(mouth.waistFull) - mouth.params.mouthInset,
  ).before;
  const waistOnSeamComposed = [
    ...waistOnSeamToMouth,
    ...mouth.waistRestored.slice(1),
  ];
  const sideComposed = [
    ...mouth.sideRestored,
    ...mouth.sideFromMouth.slice(1),
  ];
  return {
    waistDelta: polylineMaxDelta(waistOnSeamComposed, mouth.waistFull),
    sideDelta: polylineMaxDelta(sideComposed, mouth.sideFull),
    waistOnSeamComposed,
    sideComposed,
  };
}
