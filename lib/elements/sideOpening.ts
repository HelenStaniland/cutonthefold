import {
  ConstructionStep,
  Marking,
  Millimetres,
  PatternPiece,
  Point,
} from "@/lib/types/measurements";
import { edgeRunsForRoles } from "@/lib/patternHighlight";
import { WaistOpening } from "./contract";

export type SideOpeningStyle = { side: "left" | "right"; length: Millimetres };
export const DEFAULT_SIDE_OPENING: SideOpeningStyle = {
  side: "left",
  length: 180,
};

function sideSeamVertices(piece: PatternPiece): Point[] {
  const runs = edgeRunsForRoles(piece.outline, ["side-seam"]);
  if (runs.length === 0) {
    return [];
  }
  const run = runs[0];
  const n = piece.outline.length;
  const pts: Point[] = [];
  for (let i = run.startIndex; i <= run.endIndex; i++) {
    pts.push(piece.outline[i % n].at);
  }
  return pts;
}

function orderFromWaist(pts: Point[]): Point[] {
  if (pts.length < 2) {
    return pts;
  }
  if (pts[0].y <= pts[pts.length - 1].y) {
    return pts;
  }
  return [...pts].reverse();
}

function pointAlongPolyline(pts: Point[], distance: Millimetres): Point {
  let remaining = distance;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen >= remaining) {
      const t = remaining / segLen;
      return {
        x: a.x + t * (b.x - a.x),
        y: a.y + t * (b.y - a.y),
      };
    }
    remaining -= segLen;
  }
  return pts[pts.length - 1];
}

function notchDirAt(pts: Point[], at: Point): { x: number; y: number } {
  let bestDist = Infinity;
  let dir = { x: 1, y: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      continue;
    }
    const t = Math.max(
      0,
      Math.min(
        1,
        ((at.x - a.x) * dx + (at.y - a.y) * dy) / (len * len),
      ),
    );
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const dist = Math.hypot(at.x - px, at.y - py);
    if (dist < bestDist) {
      bestDist = dist;
      const tx = dx / len;
      const ty = dy / len;
      dir = { x: -ty, y: tx };
    }
  }
  return dir;
}

function addOpeningNotch(
  piece: PatternPiece,
  length: Millimetres,
): PatternPiece {
  const seam = orderFromWaist(sideSeamVertices(piece));
  if (seam.length < 2) {
    return piece;
  }
  const at = pointAlongPolyline(seam, length);
  const dir = notchDirAt(seam, at);
  const notch: Marking = {
    kind: "notch",
    at,
    label: "zip",
    dir,
  };
  return { ...piece, markings: [...piece.markings, notch] };
}

export function applySideOpening(
  pieces: PatternPiece[],
  style: SideOpeningStyle = DEFAULT_SIDE_OPENING,
): { pieces: PatternPiece[]; opening: WaistOpening; steps: ConstructionStep[] } {
  const marked = pieces.map((p) => addOpeningNotch(p, style.length));

  const steps: ConstructionStep[] = [
    {
      id: "zip-seam",
      text: `Stitch the ${style.side} side seam from the hem up to the opening notch; leave the seam open above it for the zip.`,
      highlight: [
        { piece: "Trouser front", edges: ["side-seam"] },
        { piece: "Trouser back", edges: ["side-seam"] },
      ],
    },
    {
      id: "zip-insert",
      text: `Insert a ${style.length / 10} cm zip in the ${style.side} side opening, top of the zip level with the waist seam.`,
    },
  ];

  return {
    pieces: marked,
    opening: { side: style.side, length: style.length },
    steps,
  };
}
