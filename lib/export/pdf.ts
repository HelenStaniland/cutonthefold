import { jsPDF } from "jspdf";
import { notchSegments, unit } from "@/lib/pattern/markingGeometry";
import {
  coverSpecLines,
  patternPanel,
  patternPdfFilename,
} from "@/lib/export/patternPanel";
import type {
  Pattern,
  PatternPiece,
  PatternSpec,
  Point,
  Millimetres,
} from "@/lib/types/measurements";

const SQUARE = 100; // mm
const MARGIN = 10; // mm — safe inside typical printer non-printable area
const OVERLAP = 20; // mm — shared band between adjacent sheets

export type SheetSize = "a4" | "a0";

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

function strokePolyline(
  doc: jsPDF,
  pts: Point[],
  place: Placement,
  opts: { width: number; dash?: number[] },
): void {
  if (pts.length < 2) return;
  const p = pts.map((pt) => patternToPage(pt, place));
  const deltas = p.slice(1).map((q, i) => [q.x - p[i].x, q.y - p[i].y]);
  doc.setLineWidth(opts.width);
  doc.setLineDashPattern(opts.dash ?? [], 0);
  doc.lines(deltas, p[0].x, p[0].y, [1, 1], "S", true);
  doc.setLineDashPattern([], 0);
}

function linePP(doc: jsPDF, a: Point, b: Point, place: Placement): void {
  const p = patternToPage(a, place);
  const q = patternToPage(b, place);
  doc.line(p.x, p.y, q.x, q.y);
}

function drawArrowhead(
  doc: jsPDF,
  tip: Point,
  dir: { x: number; y: number },
  place: Placement,
  len = 10,
  deg = 25,
): void {
  const a = (deg * Math.PI) / 180;
  const back = { x: -dir.x, y: -dir.y };
  const rot = (v: { x: number; y: number }, t: number) => ({
    x: v.x * Math.cos(t) - v.y * Math.sin(t),
    y: v.x * Math.sin(t) + v.y * Math.cos(t),
  });
  const b1 = rot(back, a);
  const b2 = rot(back, -a);
  linePP(doc, tip, { x: tip.x + b1.x * len, y: tip.y + b1.y * len }, place);
  linePP(doc, tip, { x: tip.x + b2.x * len, y: tip.y + b2.y * len }, place);
}

function drawMarkings(
  doc: jsPDF,
  piece: PatternPiece,
  place: Placement,
): void {
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([], 0);

  for (const m of piece.markings) {
    switch (m.kind) {
      case "grainline": {
        const { from, to } = m.line;
        linePP(doc, from, to, place);
        drawArrowhead(doc, to, unit(to.x - from.x, to.y - from.y), place);
        drawArrowhead(doc, from, unit(from.x - to.x, from.y - to.y), place);
        break;
      }
      case "dart": {
        linePP(doc, m.legs[0], m.apex, place);
        linePP(doc, m.legs[1], m.apex, place);
        break;
      }
      case "notch": {
        for (const s of notchSegments(piece, m)) {
          linePP(doc, s.from, s.to, place);
        }
        break;
      }
      default:
        break;
    }
  }
}

/** Net-outline left/right edges at height y (pattern coords). */
function outlineXBoundsAtY(
  outline: Point[],
  y: number,
): { left: number; right: number } | null {
  const xs: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (a.y === b.y) continue;
    if ((a.y <= y && b.y >= y) || (b.y <= y && a.y >= y)) {
      const t = (y - a.y) / (b.y - a.y);
      xs.push(a.x + t * (b.x - a.x));
    }
  }
  return xs.length < 2 ? null : { left: Math.min(...xs), right: Math.max(...xs) };
}

function panelBoxHeight(lineCount: number): number {
  const lineH = 4.4;
  const pad = 3;
  return pad * 2 + lineCount * lineH;
}

/** Keep the full panel (heading + box) inside this tile's printable area. */
function clampPanelPage(
  panel: { title: string; lines: string[] },
  boxLeftPage: number,
  boxTopPage: number,
  boxW: number,
  printableW: number,
  printableH: number,
): { boxLeftPage: number; boxTopPage: number; boxW: number } {
  const headingGap = 7;
  const headingH = 5;
  const boxH = panelBoxHeight(panel.lines.length);
  const minX = MARGIN;
  const maxX = MARGIN + printableW;
  const minY = MARGIN;
  const maxY = MARGIN + printableH;

  let left = boxLeftPage;
  let top = boxTopPage;
  let w = boxW;

  if (left < minX) left = minX;
  if (left + w > maxX) left = maxX - w;
  if (left < minX) {
    left = minX;
    w = Math.min(w, maxX - minX);
  }

  let panelTop = top - headingGap - headingH;
  if (panelTop < minY) top += minY - panelTop;
  if (top + boxH > maxY) top = maxY - boxH;
  panelTop = top - headingGap - headingH;
  if (panelTop < minY) top = minY + headingGap + headingH;

  return { boxLeftPage: left, boxTopPage: top, boxW: w };
}

function panelPlacement(
  piece: PatternPiece,
  panel: { title: string; lines: string[] },
): { boxLeft: number; yTop: number; boxW: number } | null {
  const INSET = 8;
  const BOX_W = 92;
  const boxH = panelBoxHeight(panel.lines.length);
  const outline = piece.outline.map((o) => o.at);

  const ys = outline.map((p) => p.y);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const yTop = top + 0.3 * (bottom - top);
  const yBottom = yTop + boxH;

  const bounds = [yTop, (yTop + yBottom) / 2, yBottom]
    .map((y) => outlineXBoundsAtY(outline, y))
    .filter((b): b is { left: number; right: number } => b !== null);

  if (bounds.length === 0) {
    return null;
  }

  const left = Math.max(...bounds.map((b) => b.left)) + INSET;
  const right = Math.min(...bounds.map((b) => b.right)) - INSET;
  const boxW = Math.min(BOX_W, right - left);
  let boxLeft = (left + right) / 2 - boxW / 2;
  boxLeft = Math.max(left, Math.min(boxLeft, right - boxW));

  return { boxLeft, yTop, boxW };
}

function drawPiecePanel(
  doc: jsPDF,
  panel: { title: string; lines: string[] },
  boxLeftPage: number,
  boxTopPage: number,
  boxW: number,
): void {
  const lineH = 4.4;
  const pad = 3;
  const headingGap = 7;
  const boxH = panelBoxHeight(panel.lines.length);
  const cx = boxLeftPage + boxW / 2;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(panel.title, cx, boxTopPage - headingGap, { align: "center" });
  doc.setFont("helvetica", "normal");

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(140);
  doc.setLineWidth(0.2);
  doc.rect(boxLeftPage, boxTopPage, boxW, boxH, "FD");
  doc.setFontSize(8);
  doc.setTextColor(70);
  panel.lines.forEach((ln, i) =>
    doc.text(ln, boxLeftPage + pad, boxTopPage + pad + (i + 1) * lineH - 1.2),
  );
  doc.setTextColor(0);
  doc.setDrawColor(0);
}

export function drawPiece(
  doc: jsPDF,
  piece: PatternPiece,
  place: Placement,
): void {
  const netPts = piece.outline.map((o) => o.at);
  const cutPts = piece.cuttingOutline ?? netPts;

  strokePolyline(doc, cutPts, place, { width: 0.5 });
  strokePolyline(doc, netPts, place, { width: 0.3, dash: [1.5, 1.5] });
  drawMarkings(doc, piece, place);
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
  const label =
    grid.cols * grid.rows > 1
      ? `${name}  C${col + 1}/${grid.cols}  R${row + 1}/${grid.rows}`
      : name;
  doc.text(label, MARGIN + 3, MARGIN + 5);
}

function tilePiece(
  doc: jsPDF,
  piece: PatternPiece,
  spec: PatternSpec | undefined,
  isFirstPieceInDoc: boolean,
  withScaleSquare = false,
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const printableW = pageW - 2 * MARGIN;
  const printableH = pageH - 2 * MARGIN;

  const cutPts = piece.cuttingOutline ?? piece.outline.map((o) => o.at);
  const box = bbox(cutPts);
  const grid = tileGrid(box, printableW, printableH);

  const panelData = spec ? patternPanel(piece, spec) : null;
  const panelPat = panelData ? panelPlacement(piece, panelData) : null;
  const ownCol = panelPat
    ? Math.min(
        grid.cols - 1,
        Math.max(
          0,
          Math.floor((panelPat.boxLeft + panelPat.boxW / 2 - box.minX) / grid.stepX),
        ),
      )
    : 0;
  const ownRow = panelPat
    ? Math.min(
        grid.rows - 1,
        Math.max(0, Math.floor((panelPat.yTop - box.minY) / grid.stepY)),
      )
    : 0;

  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const firstPageOfAll = isFirstPieceInDoc && row === 0 && col === 0;
      if (!firstPageOfAll) doc.addPage();

      const place: Placement = {
        offsetX: MARGIN - box.minX - col * grid.stepX,
        offsetY: MARGIN - box.minY - row * grid.stepY,
      };

      doc.saveGraphicsState();
      doc.rect(MARGIN, MARGIN, printableW, printableH);
      doc.clip();
      doc.discardPath();
      drawPiece(doc, piece, place);
      if (panelData && panelPat && col === ownCol && row === ownRow) {
        const pagePanel = clampPanelPage(
          panelData,
          panelPat.boxLeft + place.offsetX,
          panelPat.yTop + place.offsetY,
          panelPat.boxW,
          printableW,
          printableH,
        );
        drawPiecePanel(
          doc,
          panelData,
          pagePanel.boxLeftPage,
          pagePanel.boxTopPage,
          pagePanel.boxW,
        );
      }
      doc.restoreGraphicsState();

      drawTileFrame(doc, printableW, printableH, grid, col, row);
      drawTileLabel(doc, piece.name, grid, col, row);
      if (withScaleSquare) {
        drawCalibrationSquare(doc, pageW - MARGIN - 100, MARGIN, 100);
        doc.setFontSize(10);
        doc.text(
          "Check: this square = 100 mm",
          pageW - MARGIN - 100,
          MARGIN + 108,
        );
      }
    }
  }
}

export function downloadPattern(
  pattern: Pattern,
  spec: PatternSpec,
  sheet: SheetSize = "a4",
): void {
  const doc = new jsPDF({ unit: "mm", format: sheet, orientation: "portrait" });
  if (sheet === "a4") {
    drawCoverSheet(doc, pattern, spec);
    pattern.pieces.forEach((piece) => tilePiece(doc, piece, spec, false));
  } else {
    pattern.pieces.forEach((piece, i) =>
      tilePiece(doc, piece, spec, i === 0, true),
    );
  }
  doc.save(patternPdfFilename(spec));
}

export function downloadTiledPiece(piece: PatternPiece): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  tilePiece(doc, piece, undefined, true);
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

function drawCalibrationSquare(
  doc: jsPDF,
  x: number,
  y: number,
  size = 100,
): void {
  doc.setLineWidth(0.2);
  doc.rect(x, y, size, size);
  doc.setFontSize(10);
  doc.text(`${size} mm`, x + size / 2, y - 3, { align: "center" });
  doc.text(`${size} mm`, x - 4, y + size / 2, {
    align: "center",
    angle: 90,
  });
}

function drawCoverSheet(doc: jsPDF, pattern: Pattern, spec: PatternSpec): void {
  const pageW = doc.internal.pageSize.getWidth();
  const printableW = pageW - 2 * MARGIN;

  doc.setFontSize(16);
  doc.text("cutonthefold.com", MARGIN, MARGIN + 8);

  drawCalibrationSquare(doc, MARGIN, MARGIN + 20, 100);
  doc.setFontSize(11);
  doc.text(
    "Print at 100% (Actual size — NOT 'Fit to page').\nThis square must measure exactly 100 mm before you cut anything.",
    MARGIN,
    MARGIN + 132,
    { maxWidth: printableW },
  );

  let y = MARGIN + 152;
  doc.setFontSize(9);
  doc.setTextColor(70);
  for (const line of coverSpecLines(spec)) {
    doc.text(line, MARGIN, y);
    y += 5;
  }
  doc.setTextColor(0);

  y += 8;
  doc.setFontSize(12);
  doc.text("Sheets in this pattern:", MARGIN, y);
  y += 7;
  doc.setFontSize(10);
  const printableH = doc.internal.pageSize.getHeight() - 2 * MARGIN;
  for (const piece of pattern.pieces) {
    const g = tileGrid(
      bbox(piece.cuttingOutline ?? piece.outline.map((o) => o.at)),
      printableW,
      printableH,
    );
    doc.text(
      `${piece.name} — ${g.cols * g.rows} sheet(s), ${g.cols}×${g.rows} grid`,
      MARGIN,
      y,
    );
    y += 6;
  }
}

export function downloadCalibrationSheet(): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth(); // 210 mm
  const x0 = (pageW - SQUARE) / 2;
  const y0 = 40;

  drawCalibrationSquare(doc, x0, y0, SQUARE);

  doc.setFontSize(11);
  doc.text(
    "Print at 100% (Actual size — NOT 'Fit to page').\nThis square must measure exactly 100 mm on each side.\nIf it doesn't, adjust the printer scale until it does before printing the pattern.",
    x0,
    y0 + SQUARE + 12,
    { maxWidth: SQUARE + 40 },
  );

  doc.save("cutonthefold-scale-test.pdf");
}
