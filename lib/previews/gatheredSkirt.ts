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

  const waistband: Point[] = [
    { x: -W / 2, y: 0 },
    { x: W / 2, y: 0 },
    { x: W / 2, y: bandDepth },
    { x: -W / 2, y: bandDepth },
  ];

  const skirt: Point[] = [
    { x: -W / 2, y: bandDepth },
    { x: W / 2, y: bandDepth },
    { x: hemWidth / 2, y: bandDepth + L },
    { x: -hemWidth / 2, y: bandDepth + L },
  ];

  const gatherCount = 7;
  const xMin = -W / 2 + 20;
  const xMax = W / 2 - 20;
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
