import { BodyMeasurements, Line, Millimetres, Point } from "@/lib/types/measurements";
import {
  trouserDraftMeasures,
  validateTrousers,
  TrouserFrontStyle,
  frontDartLength,
  frontDartFromCentreFront,
  normalizeWaistbandMode,
} from "@/lib/patterns/trouserBlock";
import { pchipByY } from "@/lib/geometry/curves";

/** Minimum gap between inner hems — stylising knob. */
const LEG_GAP_MIN = 20;

/** Samples along a preview-only quadratic (not pattern construction). */
const CURVE_SAMPLES = 10;

export type TrouserPreview = {
  /** Continuous outer garment silhouette (includes top waist edge). */
  outline: Point[];
  /** Straight chord across the yoke height (legacy). */
  waistline: Line;
  /** Lower yoke seam as an internal curve, left → right. Empty when no band. */
  yokeSeam: Point[];
  darts: Line[];
  /**
   * Unused for drawing (kept for call-site compatibility).
   * Yoke is an internal seam, not a separate polygon.
   */
  waistband: Point[];
  zipMark: Line;
};

export type TrouserPreviewFinishing = {
  waistbandDepth: Millimetres;
  zipLength: Millimetres;
  zipSide: "left" | "right";
};

function sampleQuad(a: Point, control: Point, b: Point, n = CURVE_SAMPLES): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({
      x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
    });
  }
  return pts;
}

/** Half-width on the side seam between waist and hip at depth y (0 = waist). */
function sideXAtDepth(
  y: number,
  waistHalf: number,
  hipHalf: number,
  hipY: number,
): number {
  if (hipY <= 0) return hipHalf;
  const t = Math.max(0, Math.min(1, y / hipY));
  // Ease out toward the hip so the upper section fills quickly, then settles.
  const eased = 1 - (1 - t) * (1 - t);
  return waistHalf + (hipHalf - waistHalf) * eased;
}

export function previewTrousers(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  finishing?: TrouserPreviewFinishing,
): TrouserPreview | null {
  if (!validateTrousers(body, style).valid) {
    return null;
  }

  const { W, H, R, D, F } = trouserDraftMeasures(body, style);
  const B = style.bottomWidth;
  const mode = normalizeWaistbandMode(style.waistbandMode);
  const bandDepth = Math.max(
    0,
    finishing?.waistbandDepth ?? style.waistReduction ?? 0,
  );
  const shaped = mode === "shaped" && bandDepth > 0;
  const showYokeSeam = bandDepth > 0;

  const waistHalf = W / 4;
  const hipHalf = H / 4;

  // Wide-leg silhouette: outer side stays near the hip (nearly vertical into the
  // leg). Hem width mainly opens the inner leg / crotch gap, not a skirt flare.
  const outerHemX = hipHalf * 1.02;
  const innerHemX = Math.max(LEG_GAP_MIN, outerHemX - B);

  const hipY = D;
  const crotchY = R;
  const hemY = F;

  const topCurve = shaped ? Math.min(12, Math.max(4, bandDepth * 0.1)) : 6;
  const topL: Point = { x: -waistHalf, y: 0 };
  const topR: Point = { x: waistHalf, y: 0 };
  const topEdge = sampleQuad(topL, { x: 0, y: topCurve }, topR);

  const hipL: Point = { x: -hipHalf, y: hipY };
  const hipR: Point = { x: hipHalf, y: hipY };
  // Mid-thigh stay-near-hip control so the drop to the hem is not triangular.
  const thighY = hipY + (hemY - hipY) * 0.4;
  const thighL: Point = { x: -outerHemX * 0.99, y: thighY };
  const thighR: Point = { x: outerHemX * 0.99, y: thighY };
  const outerHemR: Point = { x: outerHemX, y: hemY };
  const outerHemL: Point = { x: -outerHemX, y: hemY };
  const innerHemR: Point = { x: innerHemX, y: hemY };
  const innerHemL: Point = { x: -innerHemX, y: hemY };
  const crotch: Point = { x: 0, y: crotchY };

  // Continuous outer side seams: waist → hip → thigh → hem.
  const outerRight = pchipByY([topR, hipR, thighR, outerHemR]).slice(1);
  const outerLeftUp = pchipByY([topL, hipL, thighL, outerHemL])
    .slice(1, -1)
    .reverse();

  const outline: Point[] = [
    ...topEdge.slice(0, -1),
    topR,
    ...outerRight,
    innerHemR,
    crotch,
    innerHemL,
    outerHemL,
    ...outerLeftUp,
  ];

  // Internal yoke seam only — endpoints sit on the continuous side seams.
  let yokeSeam: Point[] = [];
  if (showYokeSeam) {
    const yokeSideX = sideXAtDepth(bandDepth, waistHalf, hipHalf, hipY);
    const yokeL: Point = { x: -yokeSideX, y: bandDepth };
    const yokeR: Point = { x: yokeSideX, y: bandDepth };
    const bottomCurve = shaped
      ? Math.min(26, bandDepth * 0.3)
      : Math.min(8, bandDepth * 0.12);
    yokeSeam = sampleQuad(yokeL, { x: 0, y: bandDepth + bottomCurve }, yokeR);
  }

  const waistline: Line = showYokeSeam
    ? {
        from: { x: -sideXAtDepth(bandDepth, waistHalf, hipHalf, hipY), y: bandDepth },
        to: { x: sideXAtDepth(bandDepth, waistHalf, hipHalf, hipY), y: bandDepth },
      }
    : { from: topL, to: topR };

  // Darts only for darted construction; start below the yoke (or at waist).
  const dartOriginY = showYokeSeam ? bandDepth : 0;
  const darts: Line[] =
    mode === "darted"
      ? (() => {
          const dartX = frontDartFromCentreFront(body, style);
          const dartLen = frontDartLength(style.block ?? "classic");
          const visibleLen = Math.max(12, dartLen - bandDepth * 0.35);
          return [-dartX, dartX].map((cx) => ({
            from: { x: cx, y: dartOriginY },
            to: { x: cx, y: dartOriginY + visibleLen },
          }));
        })()
      : [];

  const zipSide = finishing?.zipSide ?? "left";
  const zipLen = finishing?.zipLength ?? 180;
  const zipX =
    zipSide === "left"
      ? -sideXAtDepth(dartOriginY, waistHalf, hipHalf, hipY)
      : sideXAtDepth(dartOriginY, waistHalf, hipHalf, hipY);
  const zipMark: Line = {
    from: { x: zipX, y: dartOriginY },
    to: { x: zipX, y: dartOriginY + zipLen },
  };

  return {
    outline,
    waistline,
    yokeSeam,
    darts,
    waistband: [],
    zipMark,
  };
}
