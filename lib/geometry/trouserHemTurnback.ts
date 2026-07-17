/**
 * Trouser-local hem turn-back for *straight* hems only.
 *
 * Reflects the leg cutting edge across the hemline so the allowance folds
 * cleanly (Fp → Rc → Rc′ → Fp′). Runs AFTER withSeamAllowance.
 *
 * Curved hems (Aldrich back) are left alone — their cutting outline stays the
 * ordinary hemDepth (30 mm) parallel offset from addSeamAllowance.
 */
import {
  OutlinePoint,
  PatternPiece,
  Point,
} from "@/lib/types/measurements";
import { DEFAULT_SEAM_ALLOWANCE } from "@/lib/geometry/seamAllowance";

const DUP_TOL = 0.01;
const TROUSER_LEG_NAMES = new Set(["Trouser front", "Trouser back"]);

/** Same collapse as addSeamAllowance, plus raw→collapsed index map. */
function collapseWithMap(outline: OutlinePoint[]): {
  collapsed: OutlinePoint[];
  rawToCollapsed: number[];
} {
  const collapsed: OutlinePoint[] = [];
  const rawToCollapsed: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const point = outline[i]!;
    const last = collapsed[collapsed.length - 1];
    if (
      last &&
      Math.hypot(point.at.x - last.at.x, point.at.y - last.at.y) < DUP_TOL
    ) {
      rawToCollapsed.push(collapsed.length - 1);
      continue;
    }
    rawToCollapsed.push(collapsed.length);
    collapsed.push(point);
  }
  if (collapsed.length > 1) {
    const first = collapsed[0]!;
    const last = collapsed[collapsed.length - 1]!;
    if (Math.hypot(first.at.x - last.at.x, first.at.y - last.at.y) < DUP_TOL) {
      const dropped = collapsed.length - 1;
      collapsed.pop();
      for (let i = 0; i < rawToCollapsed.length; i++) {
        if (rawToCollapsed[i] === dropped) rawToCollapsed[i] = 0;
      }
    }
  }
  return { collapsed, rawToCollapsed };
}

function signedArea(outline: OutlinePoint[]): number {
  let area = 0;
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i]!.at;
    const b = outline[(i + 1) % n]!.at;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function outwardNormal(dx: number, dy: number, clockwise: boolean): Point {
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };
  const ux = dx / len;
  const uy = dy / len;
  return clockwise ? { x: uy, y: -ux } : { x: -uy, y: ux };
}

function offsetPoint(p: Point, normal: Point, distance: number): Point {
  return { x: p.x + normal.x * distance, y: p.y + normal.y * distance };
}

function findHemCorners(outline: OutlinePoint[]): {
  sideIdx: number;
  inseamIdx: number;
} {
  const hemIndices = outline
    .map((p, i) => (p.edge === "hem" ? i : -1))
    .filter((i) => i >= 0);
  if (hemIndices.length === 0) {
    throw new Error("trouserHemTurnback: piece has no hem edge");
  }
  const sideIdx = hemIndices[0]!;
  const inseamIdx = (hemIndices[hemIndices.length - 1]! + 1) % outline.length;
  return { sideIdx, inseamIdx };
}

/**
 * Point on the seam's cutting edge at an exact y (horizontal slice).
 * Offsets the net segment that contains targetY, then intersects that
 * offset segment with y = targetY — so fold vertices sit on the hemline.
 */
function offsetSeamAtY(
  outline: OutlinePoint[],
  cornerIdx: number,
  direction: -1 | 1,
  targetY: number,
  clockwise: boolean,
  seamAllowance: number,
): Point {
  const n = outline.length;
  let a = outline[cornerIdx]!.at;
  for (let step = 1; step < n; step++) {
    const bIdx = (cornerIdx + step * direction + n) % n;
    const b = outline[bIdx]!.at;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (
      targetY >= minY - 1e-9 &&
      targetY <= maxY + 1e-9 &&
      Math.abs(b.y - a.y) > 1e-9
    ) {
      const from = direction === -1 ? b : a;
      const to = direction === -1 ? a : b;
      const normal = outwardNormal(to.x - from.x, to.y - from.y, clockwise);
      const o0 = offsetPoint(from, normal, seamAllowance);
      const o1 = offsetPoint(to, normal, seamAllowance);
      if (Math.abs(o1.y - o0.y) < 1e-12) {
        return { x: o0.x, y: targetY };
      }
      const t = (targetY - o0.y) / (o1.y - o0.y);
      return {
        x: o0.x + (o1.x - o0.x) * t,
        y: targetY,
      };
    }
    a = b;
  }
  throw new Error(
    `trouserHemTurnback: seam does not reach y=${targetY} from corner ${cornerIdx}`,
  );
}

function reflectAcrossHemY(p: Point, hemY: number): Point {
  return { x: p.x, y: 2 * hemY - p.y };
}

/**
 * Rebuild the hem region of a trouser leg piece as a fold-back.
 * No-ops for non-leg pieces, pieces without a cutting outline, or curved hems
 * (those keep the addSeamAllowance parallel offset).
 */
export function applyTrouserHemTurnback(
  piece: PatternPiece,
  hemDepth: number = DEFAULT_SEAM_ALLOWANCE.hem,
  seamAllowance: number = DEFAULT_SEAM_ALLOWANCE.seam,
): PatternPiece {
  if (!TROUSER_LEG_NAMES.has(piece.name) || !piece.cuttingOutline) {
    return piece;
  }

  const { collapsed, rawToCollapsed } = collapseWithMap(piece.outline);
  const oldCut = piece.cuttingOutline;
  if (oldCut.length !== collapsed.length) {
    console.warn(
      `trouserHemTurnback: ${piece.name} cutting (${oldCut.length}) ≠ collapsed net (${collapsed.length}); skipping`,
    );
    return piece;
  }

  if (!collapsed.some((p) => p.edge === "hem")) {
    return piece;
  }

  const { sideIdx, inseamIdx } = findHemCorners(collapsed);
  // Curved hem: more than the two corner samples → leave SA offset as-is.
  if (inseamIdx - sideIdx > 1) {
    return piece;
  }

  const clockwise = signedArea(collapsed) > 0;
  const hemY = collapsed[sideIdx]!.at.y;
  const targetAbove = hemY - hemDepth;

  const sideFp = offsetSeamAtY(
    collapsed,
    sideIdx,
    -1,
    hemY,
    clockwise,
    seamAllowance,
  );
  const sideAbove = offsetSeamAtY(
    collapsed,
    sideIdx,
    -1,
    targetAbove,
    clockwise,
    seamAllowance,
  );
  const sideRc = reflectAcrossHemY(sideAbove, hemY);

  const inseamFp = offsetSeamAtY(
    collapsed,
    inseamIdx,
    1,
    hemY,
    clockwise,
    seamAllowance,
  );
  const inseamAbove = offsetSeamAtY(
    collapsed,
    inseamIdx,
    1,
    targetAbove,
    clockwise,
    seamAllowance,
  );
  const inseamRc = reflectAcrossHemY(inseamAbove, hemY);

  // Straight hem: Fp, Rc, Rc′, Fp′ (corners only — no interior raw samples).
  const newCut: Point[] = [];
  const collapsedToCut: number[] = new Array(collapsed.length);

  for (let i = 0; i < sideIdx; i++) {
    collapsedToCut[i] = newCut.length;
    newCut.push(oldCut[i]!);
  }

  const sideFpIdx = newCut.length;
  newCut.push(sideFp);
  newCut.push(sideRc);
  collapsedToCut[sideIdx] = sideFpIdx;

  newCut.push(inseamRc);
  const inseamFpIdx = newCut.length;
  newCut.push(inseamFp);
  collapsedToCut[inseamIdx] = inseamFpIdx;

  for (let i = inseamIdx + 1; i < collapsed.length; i++) {
    collapsedToCut[i] = newCut.length;
    newCut.push(oldCut[i]!);
  }

  const netToCut = rawToCollapsed.map((c) => collapsedToCut[c]!);

  return {
    ...piece,
    cuttingOutline: newCut,
    netToCutIndex: netToCut,
  };
}

export function applyTrouserHemTurnbackToPattern(
  pattern: { pieces: PatternPiece[] },
  hemDepth: number = DEFAULT_SEAM_ALLOWANCE.hem,
): { pieces: PatternPiece[] } {
  return {
    pieces: pattern.pieces.map((p) => applyTrouserHemTurnback(p, hemDepth)),
  };
}
