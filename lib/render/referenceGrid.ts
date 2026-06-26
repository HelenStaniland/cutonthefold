import { svgCoord } from "@/lib/render/svgCoords";

const GRID_SPACING_MM = 50;

export type GridLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  major: boolean;
};

export function referenceGridLines(
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): GridLine[] {
  const lines: GridLine[] = [];
  const gridXMin = Math.floor(xMin / GRID_SPACING_MM) * GRID_SPACING_MM;
  const gridXMax = Math.ceil(xMax / GRID_SPACING_MM) * GRID_SPACING_MM;
  const gridYMin = Math.floor(yMin / GRID_SPACING_MM) * GRID_SPACING_MM;
  const gridYMax = Math.ceil(yMax / GRID_SPACING_MM) * GRID_SPACING_MM;

  for (let x = gridXMin; x <= gridXMax; x += GRID_SPACING_MM) {
    lines.push({
      x1: svgCoord(x),
      y1: svgCoord(yMin),
      x2: svgCoord(x),
      y2: svgCoord(yMax),
      major: x % 100 === 0,
    });
  }
  for (let y = gridYMin; y <= gridYMax; y += GRID_SPACING_MM) {
    lines.push({
      x1: svgCoord(xMin),
      y1: svgCoord(y),
      x2: svgCoord(xMax),
      y2: svgCoord(y),
      major: y % 100 === 0,
    });
  }
  return lines;
}
