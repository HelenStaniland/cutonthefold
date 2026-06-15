import {
  BodyMeasurements,
  ConstructionStep,
  Millimetres,
  OutlinePoint,
  Pattern,
  PatternPiece,
  Point,
  Marking,
  EdgeType,
} from "@/lib/types/measurements";
import { validationResult, ValidationResult } from "@/lib/types/validation";

export type TrouserFrontStyle = {
  /** Finished hem width of one leg (front piece, inseam to side seam). */
  bottomWidth: Millimetres;
};

const CURVE_SAMPLES = 24;

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / len, y: v.y / len };
}

function xOnLineAtY(a: Point, b: Point, y: number): number {
  return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
}

function quadBezier(p0: Point, p1: Point, p2: Point, n = CURVE_SAMPLES): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    points.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return points;
}

function catmullRom(knots: Point[], n = CURVE_SAMPLES, alpha = 0.5): Point[] {
  if (knots.length < 2) return [...knots];

  // phantom points just beyond each end, so the curve passes through the real ends
  const pts: Point[] = [
    { x: 2 * knots[0].x - knots[1].x, y: 2 * knots[0].y - knots[1].y },
    ...knots,
    {
      x: 2 * knots[knots.length - 1].x - knots[knots.length - 2].x,
      y: 2 * knots[knots.length - 1].y - knots[knots.length - 2].y,
    },
  ];

  const spans = knots.length - 1;
  const per = Math.max(1, Math.round(n / spans));
  const out: Point[] = [];

  const knot = (a: Point, b: Point) =>
    Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1e-6) ** alpha; // centripetal: alpha = 0.5
  const lerp = (a: Point, b: Point, f: number): Point => ({
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
  });

  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);

    const startJ = i === 1 ? 0 : 1;
    for (let j = startJ; j <= per; j++) {
      const t = t1 + ((t2 - t1) * j) / per;
      const a1 = lerp(p0, p1, (t - t0) / (t1 - t0));
      const a2 = lerp(p1, p2, (t - t1) / (t2 - t1));
      const a3 = lerp(p2, p3, (t - t2) / (t3 - t2));
      const b1 = lerp(a1, a2, (t - t0) / (t2 - t0));
      const b2 = lerp(a2, a3, (t - t1) / (t3 - t1));
      out.push(lerp(b1, b2, (t - t1) / (t2 - t1)));
    }
  }
  return out;
}

function crotchControl(p5: Point, p6: Point, p9: Point): Point {
  const mid = { x: (p6.x + p9.x) / 2, y: (p6.y + p9.y) / 2 };
  const u = normalize({ x: mid.x - p5.x, y: mid.y - p5.y });
  const G = { x: p5.x + 30 * u.x, y: p5.y + 30 * u.y };
  return { x: 2 * G.x - mid.x, y: 2 * G.y - mid.y };
}

function insideLegControl(p9: Point, p15: Point): Point {
  const m = { x: (p9.x + p15.x) / 2, y: (p9.y + p15.y) / 2 };
  const d = { x: p15.x - p9.x, y: p15.y - p9.y };
  let n = normalize({ x: d.y, y: -d.x });
  if (n.x < 0) {
    n = { x: -n.x, y: -n.y };
  }
  return { x: m.x + 15 * n.x, y: m.y + 15 * n.y };
}

type TaggedSegment = {
  points: Point[];
  edge: EdgeType;
  role: string;
};

function segmentsToOutline(segments: TaggedSegment[]): OutlinePoint[] {
  const outline: OutlinePoint[] = [];

  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s];
    const startIndex = s === 0 ? 0 : 1;

    // The edge leaving a junction point belongs to the new segment, not the old one.
    if (s > 0 && startIndex === 1 && outline.length > 0) {
      outline[outline.length - 1].edge = segment.edge;
      outline[outline.length - 1].role = segment.role;
    }

    for (let i = startIndex; i < segment.points.length; i++) {
      outline.push({
        at: segment.points[i],
        edge: segment.edge,
        role: segment.role,
      });
    }
  }

  return outline;
}

export function draftTrouserFront(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): PatternPiece {
  const W = body.waist;
  const H = body.hip;
  const R = body.bodyRise;
  const D = body.hipDepth;
  const F = body.waistToFloor;
  const B = style.bottomWidth;

  const kneeY = R + (F - R) / 2 - 50;
  const fork = H / 12 + 15;

  const p5 = { x: -fork, y: R };
  const p6 = { x: -fork, y: D };
  const p8 = { x: -fork + H / 4 + 5, y: D };
  const p9 = { x: -(fork + H / 16 + 5), y: R };
  const p10 = { x: -fork + 10, y: 0 };
  const p11 = { x: p10.x + W / 4 + 22.5, y: 0 };
  const p12 = { x: B / 2 - 5, y: F };
  const p14 = { x: -(B / 2 - 5), y: F };

  // Classic tailored knee sits 13 mm wider than the hem. Keep that while the
  // leg narrows, but never let the knee poke past the straight line from its
  // upper neighbour (hip on the side, fork inside) down to the hem — otherwise
  // a wide hem makes the knee the widest point and the leg bulges.
  const sideKneeClassic = B / 2 - 5 + 13;
  const insideKneeClassic = -(B / 2 - 5 + 13);
  const p13 = { x: Math.min(sideKneeClassic, xOnLineAtY(p8, p12, kneeY)), y: kneeY };
  const p15 = { x: Math.max(insideKneeClassic, xOnLineAtY(p9, p14, kneeY)), y: kneeY };

  const crotchCtrl = crotchControl(p5, p6, p9);

  // The inside-leg hollow is a narrowing-leg feature. Only curve while the
  // knee (15) sits inboard of the fork (9); once the hem flares past the
  // fork, the inside leg is straight.
  const insideLegNarrows = p15.x > p9.x;
  const insideLegToFork = insideLegNarrows
    ? quadBezier(p15, insideLegControl(p9, p15), p9).slice(1)
    : [p9];

  const segments: TaggedSegment[] = [
    {
      points: [p10, p11],
      edge: "seam",
      role: "waist",
    },
    {
      points: catmullRom([p11, p8, p13, p12]),
      edge: "seam",
      role: "side-seam",
    },
    {
      points: [p12, p14],
      edge: "hem",
      role: "hem",
    },
    {
      points: [p14, p15, ...insideLegToFork],
      edge: "seam",
      role: "inseam",
    },
    {
      points: [...quadBezier(p9, crotchCtrl, p6).slice(1)],
      edge: "seam",
      role: "crotch",
    },
  ];

  const outline = segmentsToOutline(segments);

  const markings: Marking[] = [
    {
      kind: "grainline",
      line: { from: { x: 0, y: 20 }, to: { x: 0, y: F - 20 } },
    },
    {
      kind: "dart",
      apex: { x: 0, y: 100 },
      legs: [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
      ],
    },
  ];

  return {
    name: "Trouser front",
    cutCount: 2,
    onFold: false,
    outline,
    markings,
  };
}

export function draftTrousers(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): Pattern {
  return { pieces: [draftTrouserFront(body, style)] };
}

export function validateTrousers(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): ValidationResult {
  const issues = [];

  if (body.waist > body.hip) {
    issues.push({
      severity: "error" as const,
      message: "Waist must not be larger than hip.",
      fields: ["waist", "hip"],
    });
  }

  if (body.bodyRise >= body.waistToFloor) {
    issues.push({
      severity: "error" as const,
      message: "Body rise must be less than waist to floor.",
      fields: ["bodyRise", "waistToFloor"],
    });
  }

  if (style.bottomWidth <= 0) {
    issues.push({
      severity: "error" as const,
      message: "Leg hem width must be greater than zero.",
    });
  }

  return validationResult(issues);
}

export function trouserInstructions(): ConstructionStep[] {
  return [
    {
      id: "work-dart",
      text: "Fold and stitch the waist dart on each front; press toward the centre.",
      highlight: [{ piece: "Trouser front", edges: ["waist"] }],
    },
    {
      id: "inseam",
      text: "Right sides together, stitch the inside leg seam on each front.",
      highlight: [{ piece: "Trouser front", edges: ["inseam"] }],
    },
    {
      id: "hem",
      text: "Neaten and hem each leg to the marked hem line.",
      highlight: [{ piece: "Trouser front", edges: ["hem"] }],
    },
  ];
}
