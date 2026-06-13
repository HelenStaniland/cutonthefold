import {
  OutlinePoint,
  Pattern,
  PatternPiece,
  Point,
  SeamAllowancePolicy,
} from "@/lib/types/measurements";

export const DEFAULT_SEAM_ALLOWANCE: SeamAllowancePolicy = { seam: 15, hem: 50 };

const PARALLEL_ANGLE_THRESHOLD = (5 * Math.PI) / 180;

function allowanceFor(edge: OutlinePoint["edge"], policy: SeamAllowancePolicy): number {
  switch (edge) {
    case "seam":
      return policy.seam;
    case "hem":
      return policy.hem;
    case "fold":
      return 0;
  }
}

function signedArea(outline: OutlinePoint[]): number {
  let area = 0;
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i].at;
    const b = outline[(i + 1) % n].at;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function outwardNormal(dx: number, dy: number, clockwise: boolean): Point {
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    return { x: 0, y: 0 };
  }
  const ux = dx / len;
  const uy = dy / len;
  // SVG y-down: clockwise interior is on the right; outward is the right normal.
  return clockwise ? { x: uy, y: -ux } : { x: -uy, y: ux };
}

function offsetPoint(p: Point, normal: Point, distance: number): Point {
  return { x: p.x + normal.x * distance, y: p.y + normal.y * distance };
}

function lineIntersection(
  p1: Point,
  d1: Point,
  p2: Point,
  d2: Point,
): Point | null {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-9) {
    return null;
  }
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const t = (dx * d2.y - dy * d2.x) / cross;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
}

function edgeDirection(from: Point, to: Point): Point {
  return { x: to.x - from.x, y: to.y - from.y };
}

function normalsNearlyParallel(n1: Point, n2: Point): boolean {
  const dot = n1.x * n2.x + n1.y * n2.y;
  const clamped = Math.max(-1, Math.min(1, dot));
  const angle = Math.acos(clamped);
  return angle < PARALLEL_ANGLE_THRESHOLD || Math.PI - angle < PARALLEL_ANGLE_THRESHOLD;
}

export function addSeamAllowance(
  piece: PatternPiece,
  policy: SeamAllowancePolicy,
): PatternPiece {
  const { outline } = piece;
  const n = outline.length;
  if (n < 3) {
    return piece;
  }

  const clockwise = signedArea(outline) > 0;
  const cuttingOutline: Point[] = [];

  for (let i = 0; i < n; i++) {
    const prev = (i + n - 1) % n;
    const next = (i + 1) % n;

    const vertex = outline[i].at;
    const prevFrom = outline[prev].at;
    const prevTo = vertex;
    const currFrom = vertex;
    const currTo = outline[next].at;

    const prevDir = edgeDirection(prevFrom, prevTo);
    const currDir = edgeDirection(currFrom, currTo);

    const prevNormal = outwardNormal(prevDir.x, prevDir.y, clockwise);
    const currNormal = outwardNormal(currDir.x, currDir.y, clockwise);

    const prevAllowance = allowanceFor(outline[prev].edge, policy);
    const currAllowance = allowanceFor(outline[i].edge, policy);

    let corner: Point;

    if (normalsNearlyParallel(prevNormal, currNormal)) {
      const avgNx = prevNormal.x + currNormal.x;
      const avgNy = prevNormal.y + currNormal.y;
      const avgLen = Math.hypot(avgNx, avgNy);
      const avgNormal =
        avgLen > 0
          ? { x: avgNx / avgLen, y: avgNy / avgLen }
          : prevNormal;
      const allowance = (prevAllowance + currAllowance) / 2;
      corner = offsetPoint(vertex, avgNormal, allowance);
    } else {
      const prevOffsetStart = offsetPoint(prevFrom, prevNormal, prevAllowance);
      const prevOffsetEnd = offsetPoint(prevTo, prevNormal, prevAllowance);
      const currOffsetStart = offsetPoint(currFrom, currNormal, currAllowance);
      const currOffsetEnd = offsetPoint(currTo, currNormal, currAllowance);

      const intersection = lineIntersection(
        prevOffsetStart,
        prevDir,
        currOffsetStart,
        currDir,
      );

      corner =
        intersection ??
        offsetPoint(vertex, currNormal, currAllowance);
    }

    cuttingOutline.push(corner);
  }

  return { ...piece, cuttingOutline };
}

export function withSeamAllowance(
  pattern: Pattern,
  policy: SeamAllowancePolicy,
): Pattern {
  return {
    pieces: pattern.pieces.map((piece) => addSeamAllowance(piece, policy)),
  };
}
