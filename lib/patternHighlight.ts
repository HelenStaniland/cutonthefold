import {
  OutlinePoint,
  PatternPiece,
  Point,
  StepHighlight,
} from "@/lib/types/measurements";

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
      return `${p.x + dx},${p.y + dy}`;
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
      return `${p.x + dx},${p.y + dy}`;
    })
    .join(" ");
}
