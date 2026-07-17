import {
  Marking,
  OutlinePoint,
  Pattern,
  PatternPiece,
  Point,
  SeamAllowancePolicy,
} from "@/lib/types/measurements";
import { inwardNormalAtPolyline } from "@/lib/pattern/markingGeometry";

export const DEFAULT_SEAM_ALLOWANCE: SeamAllowancePolicy = { seam: 10, hem: 30 };

const PARALLEL_ANGLE_THRESHOLD = (5 * Math.PI) / 180;
const MITER_LIMIT = 2.5; // max corner extension as a multiple of local allowance
const NOTCH_EDGE_TOLERANCE = 3; // mm
const DUPLICATE_VERTEX_TOLERANCE = 0.01; // mm

function collapseDuplicateVertices(outline: OutlinePoint[]): OutlinePoint[] {
  if (outline.length === 0) {
    return outline;
  }

  const collapsed: OutlinePoint[] = [];
  for (const point of outline) {
    const last = collapsed[collapsed.length - 1];
    if (
      last &&
      Math.hypot(point.at.x - last.at.x, point.at.y - last.at.y) <
        DUPLICATE_VERTEX_TOLERANCE
    ) {
      continue;
    }
    collapsed.push(point);
  }

  if (collapsed.length > 1) {
    const first = collapsed[0];
    const last = collapsed[collapsed.length - 1];
    if (
      Math.hypot(first.at.x - last.at.x, first.at.y - last.at.y) <
      DUPLICATE_VERTEX_TOLERANCE
    ) {
      collapsed.pop();
    }
  }

  return collapsed;
}

type EdgeOffset = { normal: Point; allowance: number };

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

function averagedCorner(
  vertex: Point,
  prevNormal: Point,
  currNormal: Point,
  prevAllowance: number,
  currAllowance: number,
): Point {
  const avgNx = prevNormal.x + currNormal.x;
  const avgNy = prevNormal.y + currNormal.y;
  const avgLen = Math.hypot(avgNx, avgNy);
  const avgNormal =
    avgLen > 0 ? { x: avgNx / avgLen, y: avgNy / avgLen } : prevNormal;
  const allowance = (prevAllowance + currAllowance) / 2;
  return offsetPoint(vertex, avgNormal, allowance);
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

function computeEdgeOffsets(
  outline: OutlinePoint[],
  clockwise: boolean,
  policy: SeamAllowancePolicy,
): EdgeOffset[] {
  const n = outline.length;
  return outline.map((pt, i) => {
    const from = pt.at;
    const to = outline[(i + 1) % n].at;
    const dir = edgeDirection(from, to);
    return {
      normal: outwardNormal(dir.x, dir.y, clockwise),
      allowance: allowanceFor(pt.edge, policy),
    };
  });
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq),
  );
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

function findVertexIndex(outline: OutlinePoint[], p: Point): number | null {
  for (let i = 0; i < outline.length; i++) {
    if (Math.hypot(outline[i].at.x - p.x, outline[i].at.y - p.y) <= NOTCH_EDGE_TOLERANCE) {
      return i;
    }
  }
  return null;
}

function findEdgeOffsetForPoint(
  p: Point,
  outline: OutlinePoint[],
  edgeOffsets: EdgeOffset[],
): EdgeOffset | null {
  const n = outline.length;
  let best: { edge: EdgeOffset; dist: number } | null = null;
  for (let i = 0; i < n; i++) {
    const from = outline[i].at;
    const to = outline[(i + 1) % n].at;
    const dist = distanceToSegment(p, from, to);
    if (dist <= NOTCH_EDGE_TOLERANCE && (!best || dist < best.dist)) {
      best = { edge: edgeOffsets[i], dist };
    }
  }
  return best?.edge ?? null;
}


function relocateNotchOntoCuttingLine(
  marking: Extract<Marking, { kind: "notch" }>,
  outline: OutlinePoint[],
  edgeOffsets: EdgeOffset[],
  cuttingOutline: Point[],
): Extract<Marking, { kind: "notch" }> {
  const vertexIndex = findVertexIndex(outline, marking.at);
  const edge =
    vertexIndex !== null
      ? edgeOffsets[vertexIndex]
      : findEdgeOffsetForPoint(marking.at, outline, edgeOffsets);

  if (!edge || edge.allowance === 0) {
    return marking;
  }

  const at =
    vertexIndex !== null
      ? cuttingOutline[vertexIndex]
      : offsetPoint(marking.at, edge.normal, edge.allowance);

  const inward = inwardNormalAtPolyline(cuttingOutline, at);

  return {
    ...marking,
    at,
    dir: inward,
    depth: edge.allowance,
  };
}

function relocateNotches(
  markings: Marking[],
  outline: OutlinePoint[],
  edgeOffsets: EdgeOffset[],
  cuttingOutline: Point[],
): Marking[] {
  return markings.map((marking) =>
    marking.kind === "notch"
      ? relocateNotchOntoCuttingLine(
          marking,
          outline,
          edgeOffsets,
          cuttingOutline,
        )
      : marking,
  );
}

export function addSeamAllowance(
  piece: PatternPiece,
  policy: SeamAllowancePolicy,
): PatternPiece {
  const { outline: rawOutline } = piece;
  const outline = collapseDuplicateVertices(rawOutline);
  const n = outline.length;
  if (n < 3) {
    return piece;
  }

  const clockwise = signedArea(outline) > 0;
  const edgeOffsets = computeEdgeOffsets(outline, clockwise, policy);
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

    const prevNormal = edgeOffsets[prev].normal;
    const currNormal = edgeOffsets[i].normal;

    const prevAllowance = edgeOffsets[prev].allowance;
    const currAllowance = edgeOffsets[i].allowance;

    let corner: Point;

    if (normalsNearlyParallel(prevNormal, currNormal)) {
      corner = averagedCorner(
        vertex,
        prevNormal,
        currNormal,
        prevAllowance,
        currAllowance,
      );
    } else {
      const prevOffsetStart = offsetPoint(prevFrom, prevNormal, prevAllowance);
      const currOffsetStart = offsetPoint(currFrom, currNormal, currAllowance);

      const intersection = lineIntersection(
        prevOffsetStart,
        prevDir,
        currOffsetStart,
        currDir,
      );

      if (intersection) {
        const miterDistance = Math.hypot(
          intersection.x - vertex.x,
          intersection.y - vertex.y,
        );
        const maxMiter =
          Math.max(prevAllowance, currAllowance) * MITER_LIMIT;
        corner =
          miterDistance <= maxMiter
            ? intersection
            : averagedCorner(
                vertex,
                prevNormal,
                currNormal,
                prevAllowance,
                currAllowance,
              );
      } else {
        corner = offsetPoint(vertex, currNormal, currAllowance);
      }
    }

    cuttingOutline.push(corner);
  }

  return {
    ...piece,
    cuttingOutline,
    markings: relocateNotches(piece.markings, outline, edgeOffsets, cuttingOutline),
  };
}

export function withSeamAllowance(
  pattern: Pattern,
  policy: SeamAllowancePolicy,
): Pattern {
  return {
    pieces: pattern.pieces.map((piece) => addSeamAllowance(piece, policy)),
  };
}
