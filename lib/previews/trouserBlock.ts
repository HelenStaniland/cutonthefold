import { BodyMeasurements, Line, Point } from "@/lib/types/measurements";
import {
  TrouserFrontStyle,
  validateTrousers,
} from "@/lib/patterns/trouserBlock";

/** Minimum gap between inner hems — stylising knob. */
const LEG_GAP_MIN = 20;
/** Thigh hollow depth, pulled toward centre — stylising knob. */
const THIGH_HOLLOW_MM = 15;

export type TrouserPreview = {
  outline: Point[]; // closed front-view silhouette
  waistline: Line; // the top (waist) edge
};

function sampleQuad(p0: Point, p1: Point, p2: Point, n = 8): Point[] {
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

function xOnLineAtY(a: Point, b: Point, y: number): number {
  return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
}

export function previewTrousers(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): TrouserPreview | null {
  if (!validateTrousers(body, style).valid) {
    return null;
  }

  const W = body.waist;
  const H = body.hip;
  const D = body.hipDepth;
  const R = body.bodyRise;
  const F = body.waistToFloor;
  const B = style.bottomWidth;

  const waistHalf = W / 4;
  const hipHalf = H / 4;
  const innerHemX = Math.max(hipHalf - B, LEG_GAP_MIN);
  const outerHemX = innerHemX + B;

  const waistL: Point = { x: -waistHalf, y: 0 };
  const waistR: Point = { x: waistHalf, y: 0 };
  const hipL: Point = { x: -hipHalf, y: D };
  const hipR: Point = { x: hipHalf, y: D };
  const crotch: Point = { x: 0, y: R };
  const outerHemR: Point = { x: outerHemX, y: F };
  const innerHemR: Point = { x: innerHemX, y: F };
  const outerHemL: Point = { x: -outerHemX, y: F };
  const innerHemL: Point = { x: -innerHemX, y: F };

  const midY = (D + F) / 2;
  const midXR = xOnLineAtY(hipR, outerHemR, midY) - THIGH_HOLLOW_MM;
  const midXL = xOnLineAtY(hipL, outerHemL, midY) + THIGH_HOLLOW_MM;

  const outerRHollow = sampleQuad(hipR, { x: midXR, y: midY }, outerHemR).slice(1);
  const outerLHollow = sampleQuad(outerHemL, { x: midXL, y: midY }, hipL).slice(1);

  const outline: Point[] = [
    waistL,
    waistR,
    hipR,
    ...outerRHollow,
    outerHemR,
    innerHemR,
    crotch,
    innerHemL,
    outerHemL,
    ...outerLHollow,
    hipL,
  ];

  return {
    outline,
    waistline: { from: waistL, to: waistR },
  };
}
