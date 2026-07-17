import {
  OutlinePoint,
  PatternPiece,
  Point,
  StepHighlight,
} from "@/lib/types/measurements";
import { svgCoord } from "@/lib/render/svgCoords";

export type EdgeRun = { startIndex: number; endIndex: number; role: string };

export function findPieceHighlight(
  pieceName: string,
  targets: StepHighlight[],
): StepHighlight | undefined {
  return targets.find((t) => t.piece === pieceName);
}

export function isWholePieceTarget(highlight: StepHighlight): boolean {
  return !highlight.edges || highlight.edges.length === 0;
}

export function edgeRunsForRoles(
  outline: OutlinePoint[],
  roles: string[],
): EdgeRun[] {
  const n = outline.length;
  const runs: EdgeRun[] = [];
  let i = 0;
  while (i < n) {
    const role = outline[i].role;
    if (role && roles.includes(role)) {
      const startIndex = i;
      while (i < n && outline[i].role === role) {
        i++;
      }
      runs.push({ startIndex, endIndex: i, role });
    } else {
      i++;
    }
  }
  return runs;
}

export function pieceBoundaryPoints(piece: PatternPiece): Point[] {
  return piece.cuttingOutline ?? piece.outline.map((p) => p.at);
}

function runVertexIndices(run: EdgeRun, vertexCount: number): number[] {
  const indices: number[] = [];
  for (let i = run.startIndex; i <= run.endIndex; i++) {
    indices.push(i % vertexCount);
  }
  return indices;
}

export function runToPolyline(
  points: Point[],
  run: EdgeRun,
  dx: number,
  dy: number,
): string {
  return runVertexIndices(run, points.length)
    .map((i) => {
      const p = points[i];
      return `${svgCoord(p.x + dx)},${svgCoord(p.y + dy)}`;
    })
    .join(" ");
}

/**
 * Cutting-outline polyline for a net-derived edge run. When the piece carries
 * netToCutIndex (trouser hem turn-back), maps net indices through it and fills
 * any inserted cut vertices between them so hem/side/inseam highlights follow
 * the rebuilt cutting edge. Without a map, identical to runToPolyline.
 */
export function runToCuttingPolyline(
  cutting: Point[],
  run: EdgeRun,
  netToCutIndex: number[] | undefined,
  dx: number,
  dy: number,
): string {
  if (!netToCutIndex || netToCutIndex.length === 0) {
    return runToPolyline(cutting, run, dx, dy);
  }
  const netIdxs = runVertexIndices(run, netToCutIndex.length);
  const cutIdxs: number[] = [];
  for (const netI of netIdxs) {
    const c = netToCutIndex[netI];
    if (c === undefined) continue;
    if (cutIdxs.length === 0) {
      cutIdxs.push(c);
      continue;
    }
    const prev = cutIdxs[cutIdxs.length - 1]!;
    if (c === prev) continue;
    if (c > prev) {
      for (let i = prev + 1; i <= c; i++) cutIdxs.push(i);
    } else {
      // Wrap or reverse — push as-is (should not occur on hem runs).
      cutIdxs.push(c);
    }
  }
  return cutIdxs
    .map((i) => {
      const p = cutting[i]!;
      return `${svgCoord(p.x + dx)},${svgCoord(p.y + dy)}`;
    })
    .join(" ");
}

export function runToNetPolyline(
  piece: PatternPiece,
  run: EdgeRun,
  dx: number,
  dy: number,
): string {
  return runVertexIndices(run, piece.outline.length)
    .map((i) => {
      const p = piece.outline[i].at;
      return `${svgCoord(p.x + dx)},${svgCoord(p.y + dy)}`;
    })
    .join(" ");
}
