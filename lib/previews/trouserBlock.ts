import { BodyMeasurements, Line, Point } from "@/lib/types/measurements";
import {
  TROUSER_WAISTBAND,
  validateTrousers,
  TrouserFrontStyle,
} from "@/lib/patterns/trouserBlock";
import { pchipByY } from "@/lib/geometry/curves";

/** Minimum gap between inner hems — stylising knob. */
const LEG_GAP_MIN = 20;

export type TrouserPreview = {
  waistband: Point[];
  outline: Point[]; // closed front-view silhouette (legs only)
  waistline: Line; // join between waistband and trouser body
};

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
  const bandDepth = TROUSER_WAISTBAND.finishedDepth;

  const waistHalf = W / 4;
  const hipHalf = H / 4;
  const innerHemX = Math.max(hipHalf - B, LEG_GAP_MIN);
  const outerHemX = innerHemX + B;

  const waistL: Point = { x: -waistHalf, y: bandDepth };
  const waistR: Point = { x: waistHalf, y: bandDepth };
  const hipL: Point = { x: -hipHalf, y: bandDepth + D };
  const hipR: Point = { x: hipHalf, y: bandDepth + D };
  const crotch: Point = { x: 0, y: bandDepth + R };
  const outerHemR: Point = { x: outerHemX, y: bandDepth + F };
  const innerHemR: Point = { x: innerHemX, y: bandDepth + F };
  const outerHemL: Point = { x: -outerHemX, y: bandDepth + F };
  const innerHemL: Point = { x: -innerHemX, y: bandDepth + F };

  const outerRight = pchipByY([waistR, hipR, outerHemR]).slice(1);
  const outerLeftUp = pchipByY([waistL, hipL, outerHemL]).slice(1, -1).reverse();

  const waistband: Point[] = [
    { x: -waistHalf, y: 0 },
    { x: waistHalf, y: 0 },
    { x: waistHalf, y: bandDepth },
    { x: -waistHalf, y: bandDepth },
  ];

  const outline: Point[] = [
    waistL,
    waistR,
    ...outerRight,
    innerHemR,
    crotch,
    innerHemL,
    outerHemL,
    ...outerLeftUp,
  ];

  return {
    waistband,
    outline,
    waistline: { from: waistL, to: waistR },
  };
}
