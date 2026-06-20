import { BodyMeasurements, Line, Point } from "@/lib/types/measurements";
import {
  trouserDraftMeasures,
  validateTrousers,
  TrouserFrontStyle,
} from "@/lib/patterns/trouserBlock";
import { pchipByY } from "@/lib/geometry/curves";

/** Minimum gap between inner hems — stylising knob. */
const LEG_GAP_MIN = 20;

export type TrouserPreview = {
  outline: Point[];
  waistline: Line;
};

export function previewTrousers(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): TrouserPreview | null {
  if (!validateTrousers(body, style).valid) {
    return null;
  }

  const { W, H, R, D, F } = trouserDraftMeasures(body, style);
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

  const outerRight = pchipByY([waistR, hipR, outerHemR]).slice(1);
  const outerLeftUp = pchipByY([waistL, hipL, outerHemL]).slice(1, -1).reverse();

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
    outline,
    waistline: { from: waistL, to: waistR },
  };
}
