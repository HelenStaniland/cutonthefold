/** Snap mm coords for SVG output — avoids SSR/client float drift in hydration. */
const SCALE = 1000;

export function svgCoord(value: number): number {
  return Math.round(value * SCALE) / SCALE;
}

export function svgPolygonPoints(
  points: Iterable<{ x: number; y: number }>,
): string {
  return [...points]
    .map((p) => `${svgCoord(p.x)},${svgCoord(p.y)}`)
    .join(" ");
}

export function svgLineProps(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x1: number; y1: number; x2: number; y2: number } {
  return {
    x1: svgCoord(x1),
    y1: svgCoord(y1),
    x2: svgCoord(x2),
    y2: svgCoord(y2),
  };
}
