import { Point } from "@/lib/types/measurements";

export const CURVE_SAMPLES = 24;

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
