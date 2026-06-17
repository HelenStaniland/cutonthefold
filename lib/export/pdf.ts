import { jsPDF } from "jspdf";
import type { PatternPiece, Point, Millimetres } from "@/lib/types/measurements";

const SQUARE = 100; // mm
const MARGIN = 10; // mm — safe inside typical printer non-printable area
const OVERLAP = 20; // mm — shared band between adjacent sheets

// page coordinate = pattern coordinate + offset (pure translation, no scale)
type Placement = { offsetX: Millimetres; offsetY: Millimetres };

function patternToPage(p: Point, place: Placement): Point {
  // Assumes pattern y increases downward, matching jsPDF. If the piece
  // prints upside down, this is the only line to change.
  return { x: p.x + place.offsetX, y: p.y + place.offsetY };
}

function bbox(points: Point[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function drawPiece(
  doc: jsPDF,
  piece: PatternPiece,
  place: Placement,
): void {
  const pts = piece.outline.map((o) => patternToPage(o.at, place));
  if (pts.length < 2) return;

  // jsPDF doc.lines takes deltas relative to the previous point.
  const deltas = pts
    .slice(1)
    .map((p, i) => [p.x - pts[i].x, p.y - pts[i].y] as [number, number]);

  doc.setLineWidth(0.3);
  doc.setLineJoin("round");
  doc.lines(deltas, pts[0].x, pts[0].y, [1, 1], "S", true);
}

type Grid = { cols: number; rows: number; stepX: number; stepY: number };

function tileGrid(
  box: { minX: number; minY: number; maxX: number; maxY: number },
  printableW: number,
  printableH: number,
): Grid {
  const stepX = printableW - OVERLAP;
  const stepY = printableH - OVERLAP;
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const cols = Math.max(1, Math.ceil((w - OVERLAP) / stepX));
  const rows = Math.max(1, Math.ceil((h - OVERLAP) / stepY));
  return { cols, rows, stepX, stepY };
}

function drawTileFrame(
  doc: jsPDF,
  printableW: number,
  printableH: number,
  grid: Grid,
  col: number,
  row: number,
): void {
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([], 0);
  doc.rect(MARGIN, MARGIN, printableW, printableH);

  doc.setLineDashPattern([2, 2], 0);
  if (col < grid.cols - 1) {
    const x = MARGIN + grid.stepX;
    doc.line(x, MARGIN, x, MARGIN + printableH);
  }
  if (row < grid.rows - 1) {
    const y = MARGIN + grid.stepY;
    doc.line(MARGIN, y, MARGIN + printableW, y);
  }
  doc.setLineDashPattern([], 0);
}

function drawTileLabel(
  doc: jsPDF,
  name: string,
  grid: Grid,
  col: number,
  row: number,
): void {
  doc.setFontSize(8);
  doc.text(
    `${name}  C${col + 1}/${grid.cols}  R${row + 1}/${grid.rows}`,
    MARGIN + 3,
    MARGIN + 5,
  );
}

export function downloadTiledPiece(piece: PatternPiece): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const printableW = pageW - 2 * MARGIN;
  const printableH = pageH - 2 * MARGIN;

  const box = bbox(piece.outline.map((o) => o.at));
  const grid = tileGrid(box, printableW, printableH);

  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (row > 0 || col > 0) doc.addPage();

      const place: Placement = {
        offsetX: MARGIN - box.minX - col * grid.stepX,
        offsetY: MARGIN - box.minY - row * grid.stepY,
      };

      doc.saveGraphicsState();
      doc.rect(MARGIN, MARGIN, printableW, printableH);
      doc.clip();
      doc.discardPath();
      drawPiece(doc, piece, place);
      doc.restoreGraphicsState();

      drawTileFrame(doc, printableW, printableH, grid, col, row);
      drawTileLabel(doc, piece.name, grid, col, row);
    }
  }

  doc.save(
    `cutonthefold-${piece.name.replace(/\s+/g, "-").toLowerCase()}-tiled.pdf`,
  );
}

export function downloadSinglePiece(piece: PatternPiece): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const box = bbox(piece.outline.map((o) => o.at));
  const place: Placement = {
    offsetX: MARGIN - box.minX,
    offsetY: MARGIN - box.minY,
  };

  drawPiece(doc, piece, place);
  doc.save(
    `cutonthefold-${piece.name.replace(/\s+/g, "-").toLowerCase()}.pdf`,
  );
}

export function downloadCalibrationSheet(): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth(); // 210 mm
  const x0 = (pageW - SQUARE) / 2;
  const y0 = 40;

  doc.setLineWidth(0.2);
  doc.rect(x0, y0, SQUARE, SQUARE); // exactly 100 × 100 mm

  doc.setFontSize(10);
  doc.text(`${SQUARE} mm`, x0 + SQUARE / 2, y0 - 3, { align: "center" });
  doc.text(`${SQUARE} mm`, x0 - 4, y0 + SQUARE / 2, {
    align: "center",
    angle: 90,
  });

  doc.setFontSize(11);
  doc.text(
    "Print at 100% (Actual size — NOT 'Fit to page').\nThis square must measure exactly 100 mm on each side.\nIf it doesn't, adjust the printer scale until it does before printing the pattern.",
    x0,
    y0 + SQUARE + 12,
    { maxWidth: SQUARE + 40 },
  );

  doc.save("cutonthefold-scale-test.pdf");
}
