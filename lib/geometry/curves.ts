import { Millimetres, Point } from "@/lib/types/measurements";

export const CURVE_SAMPLES = 24;

function catmullRomPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function catmullRomPointNonUniform(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  t: number,
): Point {
  const a1 = {
    x: ((t1 - t) / (t1 - t0)) * p0.x + ((t - t0) / (t1 - t0)) * p1.x,
    y: ((t1 - t) / (t1 - t0)) * p0.y + ((t - t0) / (t1 - t0)) * p1.y,
  };
  const a2 = {
    x: ((t2 - t) / (t2 - t1)) * p1.x + ((t - t1) / (t2 - t1)) * p2.x,
    y: ((t2 - t) / (t2 - t1)) * p1.y + ((t - t1) / (t2 - t1)) * p2.y,
  };
  const a3 = {
    x: ((t3 - t) / (t3 - t2)) * p2.x + ((t - t2) / (t3 - t2)) * p3.x,
    y: ((t3 - t) / (t3 - t2)) * p2.y + ((t - t2) / (t3 - t2)) * p3.y,
  };
  const b1 = {
    x: ((t2 - t) / (t2 - t0)) * a1.x + ((t - t0) / (t2 - t0)) * a2.x,
    y: ((t2 - t) / (t2 - t0)) * a1.y + ((t - t0) / (t2 - t0)) * a2.y,
  };
  const b2 = {
    x: ((t3 - t) / (t3 - t1)) * a2.x + ((t - t1) / (t3 - t1)) * a3.x,
    y: ((t3 - t) / (t3 - t1)) * a2.y + ((t - t1) / (t3 - t1)) * a3.y,
  };
  return {
    x: ((t2 - t) / (t2 - t1)) * b1.x + ((t - t1) / (t2 - t1)) * b2.x,
    y: ((t2 - t) / (t2 - t1)) * b1.y + ((t - t1) / (t2 - t1)) * b2.y,
  };
}

function reflectPhantom(a: Point, b: Point): Point {
  return { x: a.x + (a.x - b.x), y: a.y + (a.y - b.y) };
}

/** Uniform Catmull-Rom — crotches only in this project. */
export function catmullRom(knots: Point[], n = CURVE_SAMPLES): Point[] {
  if (knots.length < 2) return [...knots];
  const padded = [reflectPhantom(knots[0], knots[1]), ...knots, reflectPhantom(knots.at(-1)!, knots.at(-2)!)];

  const spans = knots.length - 1;
  const per = Math.max(1, Math.round(n / spans));
  const points: Point[] = [];
  for (let i = 1; i < padded.length - 2; i++) {
    for (let j = i === 1 ? 0 : 1; j <= per; j++) {
      points.push(
        catmullRomPoint(padded[i - 1], padded[i], padded[i + 1], padded[i + 2], j / per),
      );
    }
  }
  return points;
}

export type CatmullRomOptions = {
  /** Replace reflected start phantom — e.g. to match inseam tangent at the fork. */
  startPhantom?: Point;
  /** Replace reflected end phantom — e.g. to match waist tangent. */
  endPhantom?: Point;
  alpha?: number;
};

/**
 * Centripetal Catmull-Rom (alpha = 0.5 by default). Spacing-aware parameterisation
 * reduces overshoot on unevenly spaced guide points.
 */
export function catmullRomCentripetal(
  knots: Point[],
  options: CatmullRomOptions = {},
  n = CURVE_SAMPLES,
): Point[] {
  if (knots.length < 2) return [...knots];

  const alpha = options.alpha ?? 0.5;
  const t: number[] = [0];
  for (let i = 1; i < knots.length; i++) {
    const dx = knots[i].x - knots[i - 1].x;
    const dy = knots[i].y - knots[i - 1].y;
    t.push(t[i - 1] + Math.pow(Math.hypot(dx, dy), alpha));
  }

  const startPhantom =
    options.startPhantom ?? reflectPhantom(knots[0], knots[1]);
  const endPhantom =
    options.endPhantom ?? reflectPhantom(knots.at(-1)!, knots.at(-2)!);

  const padded = [startPhantom, ...knots, endPhantom];
  const tPadded = [
    t[0] - (t[1] - t[0]),
    ...t,
    t.at(-1)! + (t.at(-1)! - t.at(-2)!),
  ];

  const spans = knots.length - 1;
  const per = Math.max(1, Math.round(n / spans));
  const points: Point[] = [];

  for (let i = 1; i < padded.length - 2; i++) {
    const t1 = tPadded[i];
    const t2 = tPadded[i + 1];
    for (let j = i === 1 ? 0 : 1; j <= per; j++) {
      const u = t1 + (j / per) * (t2 - t1);
      points.push(
        catmullRomPointNonUniform(
          padded[i - 1],
          padded[i],
          padded[i + 1],
          padded[i + 2],
          tPadded[i - 1],
          tPadded[i],
          tPadded[i + 1],
          tPadded[i + 2],
          u,
        ),
      );
    }
  }

  return points;
}

export function quadBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  n = CURVE_SAMPLES,
): Point[] {
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

export function cubicBezier(
  p0: Point,
  c1: Point,
  c2: Point,
  p3: Point,
  steps = CURVE_SAMPLES,
): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    out.push({
      x: w0 * p0.x + w1 * c1.x + w2 * c2.x + w3 * p3.x,
      y: w0 * p0.y + w1 * c1.y + w2 * c2.y + w3 * p3.y,
    });
  }
  return out;
}

// Shape-preserving (monotone) cubic through points ordered by ascending y,
// interpolating x as a function of y. Unlike Catmull-Rom it cannot overshoot:
// each tangent comes from the neighbouring secant slopes and is forced flat at
// a local peak, and stays straight through collinear points.
export function pchipByY(knots: Point[], n = CURVE_SAMPLES): Point[] {
  const k = knots.length;
  if (k < 3) return [...knots];

  const ys = knots.map((p) => p.y);
  const xs = knots.map((p) => p.x);
  const h: number[] = [];
  const d: number[] = []; // secant slope dx/dy on each span
  for (let i = 0; i < k - 1; i++) {
    h.push(ys[i + 1] - ys[i]);
    d.push((xs[i + 1] - xs[i]) / h[i]);
  }

  const m = new Array<number>(k).fill(0); // tangent dx/dy at each knot
  for (let i = 1; i < k - 1; i++) {
    if (d[i - 1] * d[i] <= 0) {
      m[i] = 0; // local extremum (e.g. the hip) -> flat, so no overshoot
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); // weighted harmonic mean
    }
  }
  const endTangent = (de: number, dn: number, he: number, hn: number) => {
    let t = ((2 * he + hn) * de - he * dn) / (he + hn);
    if (t * de <= 0) t = 0;
    else if (de * dn <= 0 && Math.abs(t) > 3 * Math.abs(de)) t = 3 * de;
    return t;
  };
  m[0] = endTangent(d[0], d[1], h[0], h[1]);
  m[k - 1] = endTangent(d[k - 2], d[k - 3], h[k - 2], h[k - 3]);

  const perSpan = Math.max(1, Math.round(n / (k - 1)));
  const out: Point[] = [];
  for (let i = 0; i < k - 1; i++) {
    for (let j = i === 0 ? 0 : 1; j <= perSpan; j++) {
      const t = j / perSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          (2 * t3 - 3 * t2 + 1) * xs[i] +
          (t3 - 2 * t2 + t) * h[i] * m[i] +
          (-2 * t3 + 3 * t2) * xs[i + 1] +
          (t3 - t2) * h[i] * m[i + 1],
        y: ys[i] + t * h[i],
      });
    }
  }
  return out;
}

/** Total length of a polyline (mm). */
export function polylineLength(points: Point[]): Millimetres {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/** Walk `distance` mm along a polyline from its first vertex. */
export function pointAtArcDistanceFromStart(
  points: Point[],
  distance: Millimetres,
): Point {
  if (points.length === 0) {
    throw new Error("empty polyline");
  }
  if (distance <= 0) {
    return { ...points[0] };
  }
  let traveled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (traveled + seg >= distance) {
      const t = (distance - traveled) / seg;
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    }
    traveled += seg;
  }
  return { ...points[points.length - 1] };
}

/** Walk `distance` mm along a polyline from its last vertex toward the start. */
export function pointAtArcDistanceFromEnd(
  points: Point[],
  distance: Millimetres,
): Point {
  if (points.length === 0) {
    throw new Error("empty polyline");
  }
  if (distance <= 0) {
    return { ...points[points.length - 1] };
  }
  let traveled = 0;
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i];
    const b = points[i - 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (traveled + seg >= distance) {
      const t = (distance - traveled) / seg;
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    }
    traveled += seg;
  }
  return { ...points[0] };
}
