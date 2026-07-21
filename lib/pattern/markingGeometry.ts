import type {
  Line,
  NotchMarking,
  PatternPiece,
  Point,
} from "@/lib/types/measurements";
import { notchCount } from "@/lib/types/measurements";

export function unit(dx: number, dy: number): { x: number; y: number } {
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

export function distPointToSeg(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function inwardNormalAtPolyline(
  points: Point[],
  P: Point,
): { x: number; y: number } {
  let best = Infinity;
  let tan = { x: 1, y: 0 };
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const d = distPointToSeg(P, a, b);
    if (d < best) {
      best = d;
      tan = unit(b.x - a.x, b.y - a.y);
    }
  }
  let nrm = { x: -tan.y, y: tan.x };
  const c = points.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), {
    x: 0,
    y: 0,
  });
  c.x /= points.length;
  c.y /= points.length;
  if ((c.x - P.x) * nrm.x + (c.y - P.y) * nrm.y < 0) {
    nrm = { x: -nrm.x, y: -nrm.y };
  }
  return nrm;
}

export function inwardNormalAt(
  piece: PatternPiece,
  P: Point,
): { x: number; y: number } {
  if (piece.cuttingOutline && piece.cuttingOutline.length >= 3) {
    let nearest = Infinity;
    for (let i = 0; i < piece.cuttingOutline.length; i++) {
      const a = piece.cuttingOutline[i];
      const b = piece.cuttingOutline[(i + 1) % piece.cuttingOutline.length];
      nearest = Math.min(nearest, distPointToSeg(P, a, b));
    }
    if (nearest <= 1) {
      return inwardNormalAtPolyline(piece.cuttingOutline, P);
    }
  }
  const pts = piece.outline.map((o) => o.at);
  let best = Infinity;
  let tan = { x: 1, y: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const d = distPointToSeg(P, a, b);
    if (d < best) {
      best = d;
      tan = unit(b.x - a.x, b.y - a.y);
    }
  }
  let nrm = { x: -tan.y, y: tan.x };
  const c = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), {
    x: 0,
    y: 0,
  });
  c.x /= pts.length;
  c.y /= pts.length;
  if ((c.x - P.x) * nrm.x + (c.y - P.y) * nrm.y < 0) {
    nrm = { x: -nrm.x, y: -nrm.y };
  }
  return nrm;
}

/** Pattern-space line segments for a notch. Both the PDF exporter and the
 *  on-screen preview render notches by stroking these, so the two views
 *  can't drift on count or shape. */
export function notchSegments(
  piece: PatternPiece,
  m: NotchMarking,
): Line[] {
  const depth = m.depth ?? 5;
  const count = notchCount(m);
  const n = m.dir ? unit(m.dir.x, m.dir.y) : inwardNormalAt(piece, m.at);
  const tangent = { x: -n.y, y: n.x };
  const gap = 4;
  const start = -((count - 1) * gap) / 2;
  const segs: Line[] = [];
  for (let i = 0; i < count; i++) {
    const off = start + i * gap;
    const base = { x: m.at.x + tangent.x * off, y: m.at.y + tangent.y * off };
    segs.push({
      from: base,
      to: { x: base.x + n.x * depth, y: base.y + n.y * depth },
    });
  }
  return segs;
}
