/**
 * Shared notch placement maths for trouser balance notches (Part B).
 * Pure geometry helpers — do not alter outlines.
 */
import type { Point } from "@/lib/types/measurements";
import { pchipByY, polylineLength } from "@/lib/geometry/curves";

/** Point at arc distance `distance` along a polyline from pts[0]. */
export function pointAlongPolyline(pts: Point[], distance: number): Point {
  if (pts.length === 0) {
    throw new Error("pointAlongPolyline: empty polyline");
  }
  if (distance <= 0) return pts[0]!;
  let remaining = distance;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen >= remaining) {
      const t = remaining / segLen;
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    }
    remaining -= segLen;
  }
  return pts[pts.length - 1]!;
}

/** Arc length from pts[0] to the closest point on the polyline to `target`. */
export function arcToPoint(pts: Point[], target: Point): number {
  let bestD = Infinity;
  let bestArc = 0;
  let arc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) {
      t = Math.max(
        0,
        Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / lenSq),
      );
    }
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(target.x - q.x, target.y - q.y);
    const segLen = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      bestArc = arc + t * segLen;
    }
    arc += segLen;
  }
  return bestArc;
}

export function pointOnPolyAtY(pts: Point[], y: number): Point {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (y < minY - 1e-9 || y > maxY + 1e-9) continue;
    if (Math.abs(b.y - a.y) < 1e-9) continue;
    const t = (y - a.y) / (b.y - a.y);
    return { x: a.x + t * (b.x - a.x), y };
  }
  throw new Error(`pointOnPolyAtY: no segment crosses y=${y}`);
}

/**
 * Inseam-high notches: back is `tipOffset` mm from the crotch tip toward the knee;
 * Lhigh = back tip→knee − tipOffset; front is Lhigh up from the knee toward the tip.
 * Distance-from-knee is equal on both pieces (= Lhigh).
 */
export function inseamHighNotches(
  front: { tip: Point; knee: Point; hem: Point },
  back: { tip: Point; knee: Point; hem: Point },
  tipOffsetBack: number,
): {
  Lhigh: number;
  front: Point;
  back: Point;
  frontDistFromTip: number;
  backDistFromTip: number;
  frontDistFromKnee: number;
  backDistFromKnee: number;
} {
  const fInseam = pchipByY([front.tip, front.knee, front.hem]);
  const bInseam = pchipByY([back.tip, back.knee, back.hem]);
  const bTipKnee = arcToPoint(bInseam, back.knee);
  const fTipKnee = arcToPoint(fInseam, front.knee);
  const Lhigh = bTipKnee - tipOffsetBack;
  if (Lhigh <= 0) {
    throw new Error(
      `inseamHighNotches: Lhigh=${Lhigh} (back tip→knee ${bTipKnee} − ${tipOffsetBack})`,
    );
  }
  const backPt = pointAlongPolyline(bInseam, tipOffsetBack);
  // Front: from tip, stop at tip→knee − Lhigh (= distance from tip to the high notch).
  const frontFromTip = fTipKnee - Lhigh;
  const frontPt = pointAlongPolyline(fInseam, frontFromTip);
  return {
    Lhigh,
    front: frontPt,
    back: backPt,
    frontDistFromTip: frontFromTip,
    backDistFromTip: tipOffsetBack,
    frontDistFromKnee: Lhigh,
    backDistFromKnee: Lhigh,
  };
}

/**
 * Side-knee notches: side seam ∩ y = kneeY (same height as inseam knee).
 * Side polyline is hip → side-knee knot → hem (pchip), matching the draft.
 */
export function sideKneeNotches(
  front: {
    sideHip: Point;
    sideKnee: Point;
    sideHem: Point;
    kneeY: number;
  },
  back: {
    sideHip: Point;
    sideKnee: Point;
    sideHem: Point;
    kneeY: number;
  },
): { front: Point; back: Point } {
  const fSide = pchipByY([front.sideHip, front.sideKnee, front.sideHem]);
  const bSide = pchipByY([back.sideHip, back.sideKnee, back.sideHem]);
  return {
    front: pointOnPolyAtY(fSide, front.kneeY),
    back: pointOnPolyAtY(bSide, back.kneeY),
  };
}

export const INSEAM_HIGH_TIP_OFFSET_BACK = 30;
