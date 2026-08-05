/**
 * Slant front pocket — four-offset Oliver+S / Camelia shape (Cargo).
 *
 * Two all-fabric pieces (both cut from trouser fabric):
 * 1. Pocket back (pouch) — restores the trimmed corner (silhouette
 *    invariant), caught into the waist over `waistAnchor` and into the side
 *    over `bagDepth`; free bottom-inner corner rounded (`bagCornerRadius`).
 * 2. Pocket front — opening diagonal sews to the front-leg opening; waist
 *    catch and side catch basted into those seams alongside the back; pouch
 *    inner sewn to the back to close the bag. No facing / stay.
 *
 * Independent pieces (no shared outline indexing with the front leg).
 */
import {
  pointAtArcDistanceFromStart,
  polylineLength,
  splitPolylineAtArcDistance,
} from "@/lib/geometry/curves";
import { orientPieceGrainVertical } from "@/lib/pattern/mirrorPiece";
import type {
  Marking,
  Millimetres,
  OutlinePoint,
  PatternPiece,
  Point,
} from "@/lib/types/measurements";

/** Opening top: in along the waist from the side∩waist corner (mm). */
export const DEFAULT_SLANT_OPENING_WAIST_IN = 100;
/** Opening bottom: down the side seam from the corner (mm). */
export const DEFAULT_SLANT_OPENING_SIDE_DOWN = 160;
/** Bag top: further in along the waist past the opening top (mm). */
export const DEFAULT_SLANT_WAIST_ANCHOR = 60;
/** Bag: further down the side past the opening bottom (mm). */
export const DEFAULT_SLANT_BAG_DEPTH = 50;
/**
 * Free bottom-inner corner radius (mm). Default 35 — toile-tunable.
 * 0 restores the square corner.
 */
export const DEFAULT_SLANT_BAG_CORNER_RADIUS = 35;
/** Fixed hand-room widening on the bag inner edge (mm) — not a style param yet. */
export const SLANT_HAND_ROOM = 25;

export const SLANT_POCKET_BACK_NAME = "Slant pocket back";
export const SLANT_POCKET_FRONT_NAME = "Slant pocket front";

export const SLANT_OPENING_WAIST_IN_MIN = 40;
export const SLANT_OPENING_WAIST_IN_MAX = 180;
export const SLANT_OPENING_SIDE_DOWN_MIN = 60;
export const SLANT_OPENING_SIDE_DOWN_MAX = 280;
export const SLANT_WAIST_ANCHOR_MIN = 20;
export const SLANT_WAIST_ANCHOR_MAX = 120;
export const SLANT_BAG_DEPTH_MIN = 40;
export const SLANT_BAG_DEPTH_MAX = 200;
export const SLANT_BAG_CORNER_RADIUS_MIN = 0;
export const SLANT_BAG_CORNER_RADIUS_MAX = 80;

/** Samples along the free-corner quarter-circle (exclusive of endpoints). */
const BAG_CORNER_ARC_SAMPLES = 8;

export type PocketFront = "none" | "slant";

export type SlantPocketParams = {
  openingWaistIn: Millimetres;
  openingSideDown: Millimetres;
  waistAnchor: Millimetres;
  bagDepth: Millimetres;
  /** Free bottom-inner corner radius (mm). 0 = square. */
  bagCornerRadius: Millimetres;
};

export type SpocketGeometry = {
  /**
   * Slash top — on the turndown / net-waist plane at `openingWaistIn` from the
   * corner (same point as `waistOpenPt`). Anchored to the turndown seam.
   */
  openingTop: Point;
  /** Waist-plane point at openingWaistIn from the corner (turndown seam). */
  waistOpenPt: Point;
  /** Opening bottom on the side (openingSideDown from corner). */
  openingBottom: Point;
  /** Bag waist catch end (openingWaistIn + waistAnchor from corner). */
  waistAnchorPt: Point;
  /** Bag side catch end (openingSideDown + bagDepth from corner). */
  bagSideEnd: Point;
  sideCorner: Point;
  /** Turndown reference y (net waist plane at the opening). */
  turndownY: Millimetres;
  waistFull: Point[];
  sideFull: Point[];
  /** Front keeps: CF → waistOpenPt (on turndown / waist). */
  waistToOpening: Point[];
  /** Pocket back restores: waistOpenPt → corner. */
  waistRestored: Point[];
  /** Waist catch: waistAnchor → waistOpenPt (both pieces; on turndown). */
  waistCatch: Point[];
  /** Front opening path: waistOpenPt → openingBottom (slash at turndown). */
  openingPath: Point[];
  /** Front keeps: openingBottom → hem. */
  sideFromOpening: Point[];
  /** Pocket back restores: corner → openingBottom. */
  sideRestored: Point[];
  /** Side catch: openingBottom → bagSideEnd (both pieces). */
  sideCatch: Point[];
  /** Straight opening diagonal (openingTop → openingBottom). */
  slant: Point[];
  params: SlantPocketParams;
};

/** @deprecated Alias — prefer SpocketGeometry. */
export type SlantPocketMouth = SpocketGeometry;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function resolveSlantPocketParams(raw: {
  slantOpeningWaistIn?: Millimetres;
  slantOpeningSideDown?: Millimetres;
  slantWaistAnchor?: Millimetres;
  slantBagDepth?: Millimetres;
  slantBagCornerRadius?: Millimetres;
  /** @deprecated Ignored — four-offset rebuild. */
  slantMouthInset?: Millimetres;
  /** @deprecated Ignored. */
  slantMouthDrop?: Millimetres;
}): SlantPocketParams {
  return {
    openingWaistIn: clamp(
      raw.slantOpeningWaistIn ?? DEFAULT_SLANT_OPENING_WAIST_IN,
      SLANT_OPENING_WAIST_IN_MIN,
      SLANT_OPENING_WAIST_IN_MAX,
    ),
    openingSideDown: clamp(
      raw.slantOpeningSideDown ?? DEFAULT_SLANT_OPENING_SIDE_DOWN,
      SLANT_OPENING_SIDE_DOWN_MIN,
      SLANT_OPENING_SIDE_DOWN_MAX,
    ),
    waistAnchor: clamp(
      raw.slantWaistAnchor ?? DEFAULT_SLANT_WAIST_ANCHOR,
      SLANT_WAIST_ANCHOR_MIN,
      SLANT_WAIST_ANCHOR_MAX,
    ),
    bagDepth: clamp(
      raw.slantBagDepth ?? DEFAULT_SLANT_BAG_DEPTH,
      SLANT_BAG_DEPTH_MIN,
      SLANT_BAG_DEPTH_MAX,
    ),
    bagCornerRadius: clamp(
      raw.slantBagCornerRadius ?? DEFAULT_SLANT_BAG_CORNER_RADIUS,
      SLANT_BAG_CORNER_RADIUS_MIN,
      SLANT_BAG_CORNER_RADIUS_MAX,
    ),
  };
}

/**
 * Resolve four-offset anchors on drafted waist + side polylines.
 * All waist/side distances are arc-length from the side∩waist corner.
 * Slash top sits on the turndown (net waist) plane with the waist catch.
 */
export function resolveSlantPocketMouth(
  waistFull: Point[],
  sideFull: Point[],
  params: SlantPocketParams,
): SpocketGeometry {
  if (waistFull.length < 2 || sideFull.length < 2) {
    throw new Error("slant pocket: waist and side need ≥2 points");
  }
  const waistLen = polylineLength(waistFull);
  const sideLen = polylineLength(sideFull);
  const fromCornerWaist = params.openingWaistIn + params.waistAnchor;
  const fromCornerSide = params.openingSideDown + params.bagDepth;

  if (fromCornerWaist >= waistLen - 1) {
    throw new Error(
      `slant pocket: openingWaistIn+waistAnchor ${fromCornerWaist} ≥ waist ${waistLen}`,
    );
  }
  if (fromCornerSide >= sideLen - 1) {
    throw new Error(
      `slant pocket: openingSideDown+bagDepth ${fromCornerSide} ≥ side ${sideLen}`,
    );
  }

  const sideCorner = { ...waistFull[waistFull.length - 1]! };
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

  // Waist: CF → … → waistAnchor → waistOpenPt → corner (turndown plane)
  const openWaistSplit = splitPolylineAtArcDistance(
    waistFull,
    waistLen - params.openingWaistIn,
  );
  const waistOpenPt = openWaistSplit.at;
  const waistRestored = openWaistSplit.after; // waistOpenPt → corner
  const waistToOpening = openWaistSplit.before; // CF → waistOpenPt

  const anchorSplit = splitPolylineAtArcDistance(
    waistToOpening,
    polylineLength(waistToOpening) - params.waistAnchor,
  );
  const waistAnchorPt = anchorSplit.at;
  const waistCatch = anchorSplit.after; // waistAnchor → waistOpenPt

  // Turndown seam ≡ net waist plane here (casing post-pass leaves it in place;
  // fold/raw extend above). Slash tracks this plane, not bodyWaistY by name.
  const turndownY = waistOpenPt.y;
  const openingTop = { ...waistOpenPt };

  // Side: corner → openingBottom → bagSideEnd → hem
  const openBotSplit = splitPolylineAtArcDistance(
    sideFull,
    params.openingSideDown,
  );
  const openingBottom = openBotSplit.at;
  const sideRestored = openBotSplit.before; // corner → openingBottom
  const sideAfterOpen = openBotSplit.after; // openingBottom → hem

  const bagSideSplit = splitPolylineAtArcDistance(
    sideAfterOpen,
    params.bagDepth,
  );
  const bagSideEnd = bagSideSplit.at;
  const sideCatch = bagSideSplit.before; // openingBottom → bagSideEnd
  const sideFromOpening = sideAfterOpen; // front keeps full openingBottom → hem

  if (openingTop.y >= openingBottom.y - 1) {
    throw new Error(
      `slant pocket: openingTop collides with openingSideDown (openingTop.y=${openingTop.y} openingBottom.y=${openingBottom.y})`,
    );
  }

  const slant: Point[] = [{ ...openingTop }, { ...openingBottom }];
  const openingPath: Point[] = [{ ...openingTop }, { ...openingBottom }];

  return {
    openingTop,
    waistOpenPt,
    openingBottom,
    waistAnchorPt,
    bagSideEnd,
    sideCorner,
    turndownY,
    waistFull: waistFull.map((p) => ({ ...p })),
    sideFull: sideFull.map((p) => ({ ...p })),
    waistToOpening,
    waistRestored,
    waistCatch,
    openingPath,
    sideFromOpening,
    sideRestored,
    sideCatch,
    slant,
    params,
  };
}

/** @deprecated Prefer openingTop / openingBottom field names. */
export function mouthAliases(g: SpocketGeometry): {
  mouthTop: Point;
  mouthSide: Point;
} {
  return { mouthTop: g.openingTop, mouthSide: g.openingBottom };
}

function unit(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** Shared pouch-inner corners (hand-room + free bottom-inner, optionally rounded). */
function pouchInnerPoints(geom: SpocketGeometry): {
  handPt: Point;
  squareInner: Point;
} {
  const { waistOpenPt, waistAnchorPt, bagSideEnd, sideCorner } = geom;
  const waistDir = unit(
    waistAnchorPt.x - sideCorner.x,
    waistAnchorPt.y - sideCorner.y,
  );
  const towardCf = unit(
    waistAnchorPt.x - waistOpenPt.x,
    waistAnchorPt.y - waistOpenPt.y,
  );
  const inboard = unit(
    towardCf.x !== 0 || towardCf.y !== 0 ? towardCf.x : waistDir.x,
    towardCf.x !== 0 || towardCf.y !== 0 ? towardCf.y : waistDir.y,
  );
  const handPt = {
    x: waistAnchorPt.x + inboard.x * SLANT_HAND_ROOM,
    y: waistAnchorPt.y + inboard.y * SLANT_HAND_ROOM,
  };
  const squareInner = { x: handPt.x, y: bagSideEnd.y };
  return { handPt, squareInner };
}

/**
 * Free bottom-inner corner path: bagSideEnd → … → handPt.
 * Radius 0 → single square corner. Radius > 0 → quarter-circle fillet
 * cutting the tip (same on both bag pieces).
 */
export function roundedBottomInnerCorner(
  bagSideEnd: Point,
  squareInner: Point,
  handPt: Point,
  radius: Millimetres,
): {
  /** Points from A through the arc to B (excludes bagSideEnd and handPt). */
  path: Point[];
  /** Applied radius after edge-length clamp (0 = square). */
  appliedRadius: Millimetres;
  /** Geometric square tip (for diagnostics). */
  squareInner: Point;
  /** Fillet start on the bag-bottom edge. */
  filletStart: Point;
  /** Fillet end on the bag-inner edge. */
  filletEnd: Point;
  /** Arc centre (undefined when square). */
  centre: Point | null;
} {
  const bottomLen = Math.hypot(
    squareInner.x - bagSideEnd.x,
    squareInner.y - bagSideEnd.y,
  );
  const innerLen = Math.hypot(
    handPt.x - squareInner.x,
    handPt.y - squareInner.y,
  );
  const R = Math.min(
    Math.max(0, radius),
    bottomLen * 0.5 - 0.01,
    innerLen * 0.5 - 0.01,
  );
  if (R < 0.05) {
    return {
      path: [{ ...squareInner }],
      appliedRadius: 0,
      squareInner: { ...squareInner },
      filletStart: { ...squareInner },
      filletEnd: { ...squareInner },
      centre: null,
    };
  }

  const bottomDir = unit(
    squareInner.x - bagSideEnd.x,
    squareInner.y - bagSideEnd.y,
  );
  const innerDir = unit(handPt.x - squareInner.x, handPt.y - squareInner.y);
  const A: Point = {
    x: squareInner.x - bottomDir.x * R,
    y: squareInner.y - bottomDir.y * R,
  };
  const B: Point = {
    x: squareInner.x + innerDir.x * R,
    y: squareInner.y + innerDir.y * R,
  };
  // Centre of the quarter-circle that cuts the square tip.
  const C: Point = {
    x: squareInner.x - bottomDir.x * R + innerDir.x * R,
    y: squareInner.y - bottomDir.y * R + innerDir.y * R,
  };

  const a0 = Math.atan2(A.y - C.y, A.x - C.x);
  const a1 = Math.atan2(B.y - C.y, B.x - C.x);
  let delta = a1 - a0;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  // Prefer the short sweep whose midpoint lies toward the tip (fillet).
  const alt = delta > 0 ? delta - 2 * Math.PI : delta + 2 * Math.PI;
  const midDist = (d: number) => {
    const a = a0 + d / 2;
    const m = { x: C.x + R * Math.cos(a), y: C.y + R * Math.sin(a) };
    return Math.hypot(m.x - squareInner.x, m.y - squareInner.y);
  };
  if (midDist(alt) < midDist(delta)) delta = alt;

  const path: Point[] = [{ ...A }];
  for (let i = 1; i <= BAG_CORNER_ARC_SAMPLES; i++) {
    const t = i / (BAG_CORNER_ARC_SAMPLES + 1);
    const a = a0 + delta * t;
    path.push({ x: C.x + R * Math.cos(a), y: C.y + R * Math.sin(a) });
  }
  path.push({ ...B });

  return {
    path,
    appliedRadius: R,
    squareInner: { ...squareInner },
    filletStart: A,
    filletEnd: B,
    centre: C,
  };
}

/**
 * Append bag-bottom → rounded/square free corner → bag-inner → waist anchor
 * onto an outline that already ends at bagSideEnd (role bag-bottom).
 */
function pushPouchInnerClose(
  outline: OutlinePoint[],
  geom: SpocketGeometry,
  handPt: Point,
  squareInner: Point,
): void {
  const corner = roundedBottomInnerCorner(
    geom.bagSideEnd,
    squareInner,
    handPt,
    geom.params.bagCornerRadius,
  );
  for (let i = 0; i < corner.path.length; i++) {
    const isLast = i === corner.path.length - 1;
    // Square tip (r=0): bag-bottom on the corner vertex — byte-identical to the
    // first-pass outline. Rounded: A+arc stay bag-bottom; B starts bag-inner.
    const role =
      corner.appliedRadius < 0.05
        ? "bag-bottom"
        : isLast
          ? "bag-inner"
          : "bag-bottom";
    outline.push({
      at: { ...corner.path[i]! },
      edge: "seam",
      role,
    });
  }
  // handPt may coincide with filletEnd when R eats the whole inner — skip dup.
  if (
    Math.hypot(
      handPt.x - corner.filletEnd.x,
      handPt.y - corner.filletEnd.y,
    ) > 0.05
  ) {
    outline.push({
      at: { ...handPt },
      edge: "seam",
      role: "bag-inner",
    });
  }
  outline.push({
    at: { ...geom.waistAnchorPt },
    edge: "seam",
    role: "bag-inner",
  });
}

function pushRoleRun(
  out: OutlinePoint[],
  pts: Point[],
  role: string,
  skipFirst: boolean,
): void {
  const start = skipFirst ? 1 : 0;
  for (let i = start; i < pts.length; i++) {
    out.push({ at: { ...pts[i]! }, edge: "seam", role });
  }
}

function dedupeClose(outline: OutlinePoint[]): OutlinePoint[] {
  if (
    outline.length > 1 &&
    Math.hypot(
      outline[0]!.at.x - outline[outline.length - 1]!.at.x,
      outline[0]!.at.y - outline[outline.length - 1]!.at.y,
    ) < 0.01
  ) {
    outline.pop();
  }
  return outline;
}

/**
 * Grainline through the middle of a pocket piece (garment-space bbox centre),
 * still parallel to garment +y so fabric grain is unchanged. Avoids sitting on
 * the opening edge of the pocket front.
 */
function grainlineThroughPiece(
  outline: OutlinePoint[],
  openingTop: Point,
  openingBottom: Point,
  layoutDy = 0,
): Marking {
  const xs = outline.map((o) => o.at.x);
  const ys = outline.map((o) => o.at.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxY - minY, 1);
  const margin = Math.min(40, span * 0.2);
  const from = localPoint(
    { x: cx, y: minY + margin },
    openingTop,
    openingBottom,
  );
  const to = localPoint(
    { x: cx, y: maxY - margin },
    openingTop,
    openingBottom,
  );
  return {
    kind: "grainline",
    line: {
      from: layoutDy !== 0 ? offsetPt(from, 0, layoutDy) : from,
      to: layoutDy !== 0 ? offsetPt(to, 0, layoutDy) : to,
    },
  };
}

/**
 * Draft pocket back + pocket front (both trouser fabric). Outlines start in
 * garment coords, shift to a local construction frame (origin at opening top,
 * +x along the slant), then rigid-rotate so the grainline is vertical for
 * layout — same upright presentation as the trouser pieces. Grain relative to
 * the piece is unchanged.
 */
export function draftSlantFrontPocketPieces(
  geom: SpocketGeometry,
): PatternPiece[] {
  const { openingTop, openingBottom, waistAnchorPt, bagSideEnd } = geom;
  const { handPt, squareInner } = pouchInnerPoints(geom);

  // --- Pocket back (pouch): restored corner + catch + pouch inner ------------
  const backWaist: Point[] = [
    ...geom.waistCatch.map((p) => ({ ...p })),
    ...geom.waistRestored.slice(1).map((p) => ({ ...p })),
  ];
  const backSide: Point[] = [
    ...geom.sideRestored.map((p) => ({ ...p })),
    ...geom.sideCatch.slice(1).map((p) => ({ ...p })),
  ];

  const backOutline: OutlinePoint[] = [];
  pushRoleRun(backOutline, backWaist, "waist", false);
  if (backOutline.length > 0) {
    backOutline[backOutline.length - 1]!.role = "side-seam";
  }
  pushRoleRun(backOutline, backSide, "side-seam", true);
  if (backOutline.length > 0) {
    backOutline[backOutline.length - 1]!.role = "bag-bottom";
  }
  pushPouchInnerClose(backOutline, geom, handPt, squareInner);
  dedupeClose(backOutline);

  const backLocal = toLocalFrame(backOutline, openingTop, openingBottom);
  const backMarks: Marking[] = [
    grainlineThroughPiece(backOutline, openingTop, openingBottom),
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser front", seam: "waist" },
      at: localPoint(waistAnchorPt, openingTop, openingBottom),
      label: "waist-anchor",
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser front", seam: "side-seam" },
      at: localPoint(bagSideEnd, openingTop, openingBottom),
      label: "bag-side",
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: SLANT_POCKET_FRONT_NAME, seam: "bag-inner" },
      at: localPoint(handPt, openingTop, openingBottom),
      label: "pouch-inner",
    },
  ];

  // --- Pocket front: waist catch on turndown, clearance drop, slant, side ----
  const frontOutline: OutlinePoint[] = [];
  pushRoleRun(frontOutline, geom.waistCatch, "waist", false);
  frontOutline.push({
    at: { ...openingTop },
    edge: "seam",
    role: "pocket-mouth",
  });
  frontOutline.push({
    at: { ...openingBottom },
    edge: "seam",
    role: "pocket-mouth",
  });
  pushRoleRun(frontOutline, geom.sideCatch, "side-seam", true);
  if (frontOutline.length > 0) {
    frontOutline[frontOutline.length - 1]!.role = "bag-bottom";
  }
  pushPouchInnerClose(frontOutline, geom, handPt, squareInner);
  dedupeClose(frontOutline);

  const frontLocal = toLocalFrame(frontOutline, openingTop, openingBottom);
  // Offset in layout so it doesn't sit on the back
  const frontLayout = offsetOutline(frontLocal, 0, 40);
  const frontMarks: Marking[] = [
    grainlineThroughPiece(frontOutline, openingTop, openingBottom, 40),
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser front", seam: "pocket-mouth" },
      at: offsetPt(localPoint(openingTop, openingTop, openingBottom), 0, 40),
      label: "mouth-top",
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser front", seam: "pocket-mouth" },
      at: offsetPt(localPoint(openingBottom, openingTop, openingBottom), 0, 40),
      label: "mouth-side",
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser front", seam: "waist" },
      at: offsetPt(localPoint(waistAnchorPt, openingTop, openingBottom), 0, 40),
      label: "waist-anchor",
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser front", seam: "side-seam" },
      at: offsetPt(localPoint(bagSideEnd, openingTop, openingBottom), 0, 40),
      label: "bag-side",
    },
  ];

  return [
    orientPieceGrainVertical({
      name: SLANT_POCKET_BACK_NAME,
      cutCount: 2,
      onFold: false,
      outline: backLocal,
      markings: backMarks,
    }),
    orientPieceGrainVertical({
      name: SLANT_POCKET_FRONT_NAME,
      cutCount: 2,
      onFold: false,
      outline: frontLayout,
      markings: frontMarks,
    }),
  ];
}

function offsetPt(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy };
}

function offsetOutline(
  outline: OutlinePoint[],
  dx: number,
  dy: number,
): OutlinePoint[] {
  return outline.map((o) => ({ ...o, at: offsetPt(o.at, dx, dy) }));
}

/** Map garment point into local frame: origin=openingTop, +x along slant. */
function localPoint(p: Point, origin: Point, openingBottom: Point): Point {
  const dx = openingBottom.x - origin.x;
  const dy = openingBottom.y - origin.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const vx = -uy;
  const vy = ux;
  const qx = p.x - origin.x;
  const qy = p.y - origin.y;
  return { x: qx * ux + qy * uy, y: qx * vx + qy * vy };
}

function toLocalFrame(
  outline: OutlinePoint[],
  origin: Point,
  openingBottom: Point,
): OutlinePoint[] {
  return outline.map((o) => ({
    ...o,
    at: localPoint(o.at, origin, openingBottom),
  }));
}

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
 * Silhouette invariant: front trim + pocket-back restored edges ≡ pocket-off
 * waist/side. Waist junction is waistOpenPt (turndown); the 5 mm slash drop is
 * not part of the waist reconstruction.
 */
export function silhouetteInvariantDelta(geom: SpocketGeometry): {
  waistDelta: number;
  sideDelta: number;
  waistOnSeamComposed: Point[];
  sideComposed: Point[];
} {
  const waistOnSeamComposed = [
    ...geom.waistToOpening,
    ...geom.waistRestored.slice(1),
  ];
  const sideComposed = [
    ...geom.sideRestored,
    ...geom.sideFromOpening.slice(1),
  ];
  return {
    waistDelta: polylineMaxDelta(waistOnSeamComposed, geom.waistFull),
    sideDelta: polylineMaxDelta(sideComposed, geom.sideFull),
    waistOnSeamComposed,
    sideComposed,
  };
}

/** Convenience: total side span on the pocket back (restored + catch). */
export function bagSideSpanMm(geom: SpocketGeometry): Millimetres {
  return polylineLength(geom.sideRestored) + polylineLength(geom.sideCatch);
}

/** Convenience: waist catch span (opening top → waist anchor). */
export function bagWaistCatchMm(geom: SpocketGeometry): Millimetres {
  return polylineLength(geom.waistCatch);
}

/** Pocket-front outline span check: not a thin strip along the opening. */
export function pocketFrontIsFullPiece(front: PatternPiece): {
  ok: boolean;
  openingLen: Millimetres;
  maxExtent: Millimetres;
  roles: string[];
} {
  const roles = [
    ...new Set(front.outline.map((o) => o.role).filter(Boolean) as string[]),
  ];
  const mouth = front.outline.filter((o) => o.role === "pocket-mouth");
  let openingLen = 0;
  for (let i = 1; i < mouth.length; i++) {
    openingLen += Math.hypot(
      mouth[i]!.at.x - mouth[i - 1]!.at.x,
      mouth[i]!.at.y - mouth[i - 1]!.at.y,
    );
  }
  const xs = front.outline.map((o) => o.at.x);
  const ys = front.outline.map((o) => o.at.y);
  const maxExtent = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
  const ok =
    roles.includes("pocket-mouth") &&
    roles.includes("waist") &&
    roles.includes("side-seam") &&
    (roles.includes("bag-inner") || roles.includes("bag-bottom")) &&
    maxExtent > openingLen * 0.35 &&
    maxExtent > 80;
  return { ok, openingLen, maxExtent, roles };
}
