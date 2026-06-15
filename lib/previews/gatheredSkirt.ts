import { BodyMeasurements, Line, Point } from "@/lib/types/measurements";
import {
  GatheredSkirtFit,
  GatheredSkirtStyle,
  validateGatheredSkirt,
} from "@/lib/patterns/gatheredSkirt";

export type GarmentPreview = {
  waistband: Point[];
  skirt: Point[];
  gatherLines: Line[];
};

export function previewGatheredSkirt(
  body: BodyMeasurements,
  fit: GatheredSkirtFit,
  style: GatheredSkirtStyle,
): GarmentPreview | null {
  if (!validateGatheredSkirt(body, fit, style).valid) {
    return null;
  }

  const W = body.waist;
  const hemWidth = body.hip + fit.fullness;
  const L = style.length;
  const bandDepth = 40;
  const waistHalf = W / 4; // front view shows half the girth
  const hemHalf = hemWidth / 4;

  const waistband: Point[] = [
    { x: -waistHalf, y: 0 },
    { x: waistHalf, y: 0 },
    { x: waistHalf, y: bandDepth },
    { x: -waistHalf, y: bandDepth },
  ];

  const skirt: Point[] = [
    { x: -waistHalf, y: bandDepth },
    { x: waistHalf, y: bandDepth },
    { x: hemHalf, y: bandDepth + L },
    { x: -hemHalf, y: bandDepth + L },
  ];

  const gatherCount = 7;
  const xMin = -waistHalf + 20;
  const xMax = waistHalf - 20;
  const gatherLines: Line[] = [];
  for (let i = 0; i < gatherCount; i++) {
    const x = xMin + (i * (xMax - xMin)) / (gatherCount - 1);
    gatherLines.push({
      from: { x, y: bandDepth },
      to: { x, y: bandDepth + 35 },
    });
  }

  return { waistband, skirt, gatherLines };
}
