import { jsPDF } from "jspdf";
import { notchSegments, unit } from "@/lib/pattern/markingGeometry";
import {
  coverSpecLines,
  patternPanel,
  patternPdfFilename,
} from "@/lib/export/patternPanel";
import type {
  DraftingLineKind,
  Pattern,
  PatternPiece,
  PatternSpec,
  PieceConstruction,
  Point,
  Millimetres,
} from "@/lib/types/measurements";

const SQUARE = 100; // mm
const MARGIN = 10; // mm — safe inside typical printer non-printable area
const OVERLAP = 20; // mm — shared band between adjacent sheets

export type SheetSize = "a4" | "a0";

export type DownloadPatternOptions = {
  /** Draw trouserConstruction points/lines on the cut pattern at true scale. */
  includeConstruction?: boolean;
  construction?: PieceConstruction[];
};

const CONSTRUCTION_LINE_RGB: [number, number, number] = [70, 90, 130];
const SUBORDINATE_LINE_RGB: [number, number, number] = [155, 155, 155];
const CONSTRUCTION_POINT_RGB: [number, number, number] = [70, 90, 130];
/** Preview --pattern-fold / drafting-green — cut-on-fold + foldLine. */
const FOLD_MARK_RGB: [number, number, number] = [4, 120, 87];
/** Preview --pattern-instruction — casing fold / region labels. */
const CASING_MARK_RGB: [number, number, number] = [2, 132, 199];
/** Preview --pattern-construction — casing turndown. */
const CASING_TURNDOWN_RGB: [number, number, number] = [3, 105, 161];
const CASING_REGION_FILL_RGB: [number, number, number] = [220, 238, 248];
/** Match drawPieceLineLabel — ~11 pt ≈ 3.9 mm, not preview's ~11 mm CSS. */
const MARK_LABEL_FONT_PT = 11;
/** Keep marking labels clear of tile seam dashes / page margin. */
const MARK_LABEL_SEAM_CLEAR_MM = 10;

const PDF_CONSTRUCTION_LINE_ORDER: DraftingLineKind[] = [
  "helper",
  "curveControl",
  "construction",
];

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

/** Match on-screen construction labels: p5 → "5", guide → "guide". */
function constructionPointLabel(id: string): string {
  const m = /^p(\d+)$/.exec(id);
  return m ? m[1]! : id;
}

function pointOnPrintableTile(
  pagePt: Point,
  printableW: number,
  printableH: number,
): boolean {
  return (
    pagePt.x >= MARGIN - 0.5 &&
    pagePt.x <= MARGIN + printableW + 0.5 &&
    pagePt.y >= MARGIN - 0.5 &&
    pagePt.y <= MARGIN + printableH + 0.5
  );
}

export function drawConstructionOverlay(
  doc: jsPDF,
  construction: PieceConstruction,
  place: Placement,
  printableW: number,
  printableH: number,
): void {
  for (const kind of PDF_CONSTRUCTION_LINE_ORDER) {
    const isMain = kind === "construction";
    doc.setDrawColor(...(isMain ? CONSTRUCTION_LINE_RGB : SUBORDINATE_LINE_RGB));
    doc.setLineWidth(isMain ? 0.3 : 0.2);
    doc.setLineDashPattern(isMain ? [] : [2, 2], 0);
    for (const line of construction.lines) {
      if (line.kind !== kind) continue;
      linePP(doc, line.from, line.to, place);
    }
  }
  doc.setLineDashPattern([], 0);

  for (const pt of construction.points) {
    const pagePt = patternToPage(pt.at, place);
    if (!pointOnPrintableTile(pagePt, printableW, printableH)) {
      continue;
    }
    const isCurveControl = pt.kind === "curveControl";
    doc.setFillColor(...CONSTRUCTION_POINT_RGB);
    doc.circle(pagePt.x, pagePt.y, 0.5, "F");
    const labelOffsetX = isCurveControl ? 2.5 : 2;
    const labelOffsetY = isCurveControl ? -2.5 : -2;
    doc.setFontSize(isCurveControl ? 6 : 7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...CONSTRUCTION_POINT_RGB);
    doc.text(
      constructionPointLabel(pt.id),
      pagePt.x + labelOffsetX,
      pagePt.y + labelOffsetY,
    );
  }
  doc.setTextColor(0);
  doc.setDrawColor(0);
  doc.setFillColor(0, 0, 0);
}

function constructionForPiece(
  pieceName: string,
  overlays?: PieceConstruction[],
): PieceConstruction | undefined {
  return overlays?.find((c) => c.pieceName === pieceName);
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

type Grid = { cols: number; rows: number; stepX: number; stepY: number };

/** Per-tile context so marking labels draw once, off seams (like the info panel). */
export type MarkTileContext = {
  grid: Grid;
  box: { minX: number; minY: number; maxX: number; maxY: number };
  col: number;
  row: number;
  printableW: number;
  printableH: number;
};

function tileCellForPoint(
  p: Point,
  box: MarkTileContext["box"],
  grid: Grid,
): { col: number; row: number } {
  const col = Math.min(
    grid.cols - 1,
    Math.max(0, Math.floor((p.x - box.minX) / grid.stepX)),
  );
  const row = Math.min(
    grid.rows - 1,
    Math.max(0, Math.floor((p.y - box.minY) / grid.stepY)),
  );
  return { col, row };
}

/**
 * Clamp a marking label's page position inside the printable area and away from
 * this tile's seam edges (reuse of the panel off-seam idea).
 */
export function clampMarkLabelPage(
  page: Point,
  halfWidthMm: number,
  tile: MarkTileContext,
): Point {
  const clear = MARK_LABEL_SEAM_CLEAR_MM;
  let minX = MARGIN + clear + halfWidthMm;
  let maxX = MARGIN + tile.printableW - clear - halfWidthMm;
  let minY = MARGIN + clear;
  let maxY = MARGIN + tile.printableH - clear;

  // Stay clear of the dashed tile-seam lines drawn at MARGIN+step on non-last tiles,
  // and fully clear of the overlap band on tiles that are not the first col/row.
  if (tile.col < tile.grid.cols - 1) {
    maxX = Math.min(maxX, MARGIN + tile.grid.stepX - clear - halfWidthMm);
  }
  if (tile.col > 0) {
    minX = Math.max(minX, MARGIN + OVERLAP + clear + halfWidthMm);
  }
  if (tile.row < tile.grid.rows - 1) {
    maxY = Math.min(maxY, MARGIN + tile.grid.stepY - clear);
  }
  if (tile.row > 0) {
    minY = Math.max(minY, MARGIN + OVERLAP + clear);
  }

  // If constraints collapse, fall back to printable centre strip.
  if (minX > maxX) {
    const mid = MARGIN + tile.printableW / 2;
    minX = mid - 1;
    maxX = mid + 1;
  }
  if (minY > maxY) {
    const mid = MARGIN + tile.printableH / 2;
    minY = mid - 1;
    maxY = mid + 1;
  }

  return {
    x: Math.min(maxX, Math.max(minX, page.x)),
    y: Math.min(maxY, Math.max(minY, page.y)),
  };
}

function approxLabelHalfWidthMm(text: string): number {
  // Helvetica ~0.5×fontSize(pt) per char; pt→mm.
  const mmPerPt = 25.4 / 72;
  return (text.length * 0.5 * MARK_LABEL_FONT_PT * mmPerPt) / 2;
}

/**
 * Resolve where a marking label is drawn on this tile.
 * Returns null if this tile is not the label's home tile (label drawn once).
 * Exported for acceptance / diagnostics.
 */
export function resolveMarkLabelOnTile(
  preferredPattern: Point,
  place: Placement,
  tile: MarkTileContext | undefined,
  text: string,
): { page: Point; homeCol: number; homeRow: number } | null {
  const half = approxLabelHalfWidthMm(text);
  if (!tile) {
    const page = patternToPage(preferredPattern, place);
    const w = 210 - 2 * MARGIN;
    const h = 297 - 2 * MARGIN;
    return {
      page: {
        x: Math.min(
          MARGIN + w - MARK_LABEL_SEAM_CLEAR_MM - half,
          Math.max(MARGIN + MARK_LABEL_SEAM_CLEAR_MM + half, page.x),
        ),
        y: Math.min(
          MARGIN + h - MARK_LABEL_SEAM_CLEAR_MM,
          Math.max(MARGIN + MARK_LABEL_SEAM_CLEAR_MM, page.y),
        ),
      },
      homeCol: 0,
      homeRow: 0,
    };
  }
  const home = tileCellForPoint(preferredPattern, tile.box, tile.grid);
  if (home.col !== tile.col || home.row !== tile.row) return null;
  const raw = patternToPage(preferredPattern, place);
  const page = clampMarkLabelPage(raw, half, tile);
  return { page, homeCol: home.col, homeRow: home.row };
}

function drawMarkLabel(
  doc: jsPDF,
  text: string,
  preferredPattern: Point,
  place: Placement,
  tile: MarkTileContext | undefined,
  rgb: [number, number, number],
): void {
  const resolved = resolveMarkLabelOnTile(preferredPattern, place, tile, text);
  if (!resolved) return;
  doc.setFontSize(MARK_LABEL_FONT_PT);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...rgb);
  // Upright only — do not rotate (avoids importing the preview mirrored-text bug).
  doc.text(text, resolved.page.x, resolved.page.y, {
    align: "center",
    baseline: "middle",
  });
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
}

function fillPolygon(
  doc: jsPDF,
  pts: Point[],
  place: Placement,
  rgb: [number, number, number],
): void {
  if (pts.length < 3) return;
  const p = pts.map((pt) => patternToPage(pt, place));
  const deltas = p.slice(1).map((q, i) => [q.x - p[i]!.x, q.y - p[i]!.y]);
  doc.setFillColor(...rgb);
  doc.setDrawColor(...rgb);
  doc.setLineWidth(0.1);
  doc.setLineDashPattern([], 0);
  doc.lines(deltas, p[0]!.x, p[0]!.y, [1, 1], "F", true);
  doc.setFillColor(0, 0, 0);
  doc.setDrawColor(0);
}

function drawMarkings(
  doc: jsPDF,
  piece: PatternPiece,
  place: Placement,
  tile?: MarkTileContext,
): void {
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(0);

  for (const m of piece.markings) {
    switch (m.kind) {
      case "grainline": {
        const { from, to } = m.line;
        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([], 0);
        linePP(doc, from, to, place);
        drawArrowhead(doc, to, unit(to.x - from.x, to.y - from.y), place);
        drawArrowhead(doc, from, unit(from.x - to.x, from.y - to.y), place);
        break;
      }
      case "dart": {
        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([], 0);
        linePP(doc, m.legs[0], m.apex, place);
        linePP(doc, m.legs[1], m.apex, place);
        break;
      }
      case "notch": {
        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([], 0);
        for (const s of notchSegments(piece, m)) {
          linePP(doc, s.from, s.to, place);
        }
        break;
      }
      case "foldLine": {
        // Internal fold/roll — long dash, fold green (distinct from casing dash-dot).
        doc.setDrawColor(...FOLD_MARK_RGB);
        strokePolyline(doc, [m.line.from, m.line.to], place, {
          width: 0.45,
          dash: [16, 10],
        });
        doc.setDrawColor(0);
        break;
      }
      case "placeOnFold": {
        // Cut-on-fold edge bracket + "Place to fold" — solid green, NOT casing style.
        const A = m.line.from;
        const B = m.line.to;
        const n = m.inward;
        const edgeDx = B.x - A.x;
        const edgeDy = B.y - A.y;
        const edgeLen = Math.hypot(edgeDx, edgeDy) || 1;
        const u = { x: edgeDx / edgeLen, y: edgeDy / edgeLen };
        const p1 = { x: A.x + 30 * u.x, y: A.y + 30 * u.y };
        const p2 = { x: p1.x + 15 * n.x, y: p1.y + 15 * n.y };
        const p3 = {
          x: B.x - 30 * u.x + 15 * n.x,
          y: B.y - 30 * u.y + 15 * n.y,
        };
        const p4 = { x: B.x - 30 * u.x, y: B.y - 30 * u.y };
        doc.setDrawColor(...FOLD_MARK_RGB);
        strokePolyline(doc, [p1, p2, p3, p4], place, { width: 0.5 });
        doc.setDrawColor(0);
        const label = m.label ?? "Place to fold";
        const mid = {
          x: (A.x + B.x) / 2 + 25 * n.x,
          y: (A.y + B.y) / 2 + 25 * n.y,
        };
        drawMarkLabel(doc, label, mid, place, tile, FOLD_MARK_RGB);
        break;
      }
      case "casingRegion": {
        fillPolygon(doc, m.outline, place, CASING_REGION_FILL_RGB);
        const mid = m.outline[Math.floor(m.outline.length / 4)] ?? m.outline[0]!;
        const midB =
          m.outline[Math.floor((3 * m.outline.length) / 4)] ??
          m.outline[m.outline.length - 1]!;
        const cx = (mid.x + midB.x) / 2;
        const cy = (mid.y + midB.y) / 2;
        drawMarkLabel(doc, m.label, { x: cx, y: cy }, place, tile, CASING_MARK_RGB);
        break;
      }
      case "casingFold": {
        // Fold-2 / finished top — dash-dot instruction blue (≠ placeOnFold bracket).
        doc.setDrawColor(...CASING_MARK_RGB);
        strokePolyline(doc, m.points, place, {
          width: 0.4,
          dash: [10, 3, 2, 3],
        });
        doc.setDrawColor(0);
        const a = m.points[0]!;
        const b = m.points[m.points.length - 1]!;
        const preferred = {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2 + 14,
        };
        drawMarkLabel(doc, m.label, preferred, place, tile, CASING_MARK_RGB);
        break;
      }
      case "casingHem": {
        // Fold-1 hem crease — shorter dash.
        doc.setDrawColor(...CASING_MARK_RGB);
        strokePolyline(doc, m.points, place, {
          width: 0.3,
          dash: [4, 2],
        });
        doc.setDrawColor(0);
        break;
      }
      case "casingTurndown": {
        doc.setDrawColor(...CASING_TURNDOWN_RGB);
        strokePolyline(doc, m.points, place, {
          width: 0.35,
          dash: [3, 2.5],
        });
        doc.setDrawColor(0);
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

function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if (
      (yi > pt.y) !== (yj > pt.y) &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function distToOutline(pt: Point, poly: Point[]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
    if (d < min) min = d;
  }
  return min;
}

function interiorAnchor(outline: Point[]): Point {
  const b = bbox(outline);
  const NX = 24;
  const NY = 40;
  let best: Point = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  let bestClear = -1;
  for (let iy = 0; iy <= NY; iy++) {
    for (let ix = 0; ix <= NX; ix++) {
      const pt = {
        x: b.minX + ((b.maxX - b.minX) * ix) / NX,
        y: b.minY + ((b.maxY - b.minY) * iy) / NY,
      };
      if (!pointInPolygon(pt, outline)) continue;
      const c = distToOutline(pt, outline);
      if (c > bestClear) {
        bestClear = c;
        best = pt;
      }
    }
  }
  return best;
}

function panelBoxFits(
  panel: { title: string; lines: string[] },
  pat: { boxLeft: number; yTop: number; boxW: number },
  outline: Point[],
): boolean {
  if (pat.boxW < 40) return false;
  const boxH = panelBoxHeight(panel.lines.length);
  const corners: Point[] = [
    { x: pat.boxLeft, y: pat.yTop },
    { x: pat.boxLeft + pat.boxW, y: pat.yTop },
    { x: pat.boxLeft, y: pat.yTop + boxH },
    { x: pat.boxLeft + pat.boxW, y: pat.yTop + boxH },
  ];
  return corners.every((c) => pointInPolygon(c, outline));
}

function drawPieceLineLabel(doc: jsPDF, text: string, at: Point): void {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(text, at.x, at.y, { align: "center", baseline: "middle" });
  doc.setFont("helvetica", "normal");
}

function pieceTileCount(
  piece: PatternPiece,
  printableW: number,
  printableH: number,
): number {
  const cutPts = piece.cuttingOutline ?? piece.outline.map((o) => o.at);
  const grid = tileGrid(bbox(cutPts), printableW, printableH);
  return grid.cols * grid.rows;
}

type SheetCounter = { n: number };

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
  tile?: MarkTileContext,
): void {
  const netPts = piece.outline.map((o) => o.at);
  const cutPts = piece.cuttingOutline ?? netPts;

  strokePolyline(doc, cutPts, place, { width: 0.5 });
  strokePolyline(doc, netPts, place, { width: 0.3, dash: [1.5, 1.5] });
  drawMarkings(doc, piece, place, tile);
}

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

const TILE_LABEL_FONT = 8;
const PAGE_BRAND_FONT = 10;
const PAGE_BRAND_GREY = 100;

function drawPageBrand(doc: jsPDF, x: number, y: number): void {
  doc.setFontSize(PAGE_BRAND_FONT);
  doc.setTextColor(PAGE_BRAND_GREY);
  doc.text("cutonthefold.com", x, y);
  doc.setTextColor(0);
}

function drawTileLabel(
  doc: jsPDF,
  name: string,
  grid: Grid,
  col: number,
  row: number,
  sheetNum?: number,
  totalSheets?: number,
): void {
  const x = MARGIN + 3;
  const y = MARGIN + 5;
  doc.setFontSize(TILE_LABEL_FONT);
  const gridRef =
    grid.cols * grid.rows > 1
      ? `  C${col + 1}/${grid.cols}  R${row + 1}/${grid.rows}`
      : "";
  const sheetRef =
    sheetNum !== undefined && totalSheets !== undefined
      ? `  ·  Sheet ${sheetNum} of ${totalSheets}`
      : "";
  doc.text(`${name}${gridRef}${sheetRef}`, x, y);
  drawPageBrand(doc, x, y + 4);
}

function tilePiece(
  doc: jsPDF,
  piece: PatternPiece,
  spec: PatternSpec | undefined,
  isFirstPieceInDoc: boolean,
  withScaleSquare = false,
  sheetCounter?: SheetCounter,
  totalSheets?: number,
  pdfOptions?: DownloadPatternOptions,
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const printableW = pageW - 2 * MARGIN;
  const printableH = pageH - 2 * MARGIN;

  const cutPts = piece.cuttingOutline ?? piece.outline.map((o) => o.at);
  const box = bbox(cutPts);
  const grid = tileGrid(box, printableW, printableH);

  const panelData = spec ? patternPanel(piece, spec) : null;
  const netOutline = piece.outline.map((o) => o.at);
  const panelPat = panelData ? panelPlacement(piece, panelData) : null;
  const panelFits = !!(
    panelData &&
    panelPat &&
    panelBoxFits(panelData, panelPat, netOutline)
  );
  const anchor = panelData && !panelFits ? interiorAnchor(netOutline) : null;
  const ownPoint: Point =
    panelFits && panelPat
      ? { x: panelPat.boxLeft + panelPat.boxW / 2, y: panelPat.yTop }
      : (anchor ?? { x: box.minX, y: box.minY });
  const ownCol = Math.min(
    grid.cols - 1,
    Math.max(0, Math.floor((ownPoint.x - box.minX) / grid.stepX)),
  );
  const ownRow = Math.min(
    grid.rows - 1,
    Math.max(0, Math.floor((ownPoint.y - box.minY) / grid.stepY)),
  );

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
      const markTile: MarkTileContext = {
        grid,
        box,
        col,
        row,
        printableW,
        printableH,
      };
      drawPiece(doc, piece, place, markTile);
      if (pdfOptions?.includeConstruction) {
        const overlay = constructionForPiece(
          piece.name,
          pdfOptions.construction,
        );
        if (overlay) {
          drawConstructionOverlay(
            doc,
            overlay,
            place,
            printableW,
            printableH,
          );
        }
      }
      if (panelData && col === ownCol && row === ownRow) {
        if (panelFits && panelPat) {
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
        } else if (anchor) {
          drawPieceLineLabel(
            doc,
            panelData.title,
            patternToPage(anchor, place),
          );
        }
      }
      doc.restoreGraphicsState();

      drawTileFrame(doc, printableW, printableH, grid, col, row);
      const sheetNum = sheetCounter?.n;
      drawTileLabel(
        doc,
        piece.name,
        grid,
        col,
        row,
        sheetNum,
        totalSheets,
      );
      if (sheetCounter) {
        sheetCounter.n += 1;
      }
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
  pdfOptions?: DownloadPatternOptions,
): void {
  const doc = new jsPDF({ unit: "mm", format: sheet, orientation: "portrait" });
  const printableW = doc.internal.pageSize.getWidth() - 2 * MARGIN;
  const printableH = doc.internal.pageSize.getHeight() - 2 * MARGIN;
  const tileCounts = pattern.pieces.map((piece) =>
    pieceTileCount(piece, printableW, printableH),
  );
  const tileTotal = tileCounts.reduce((sum, n) => sum + n, 0);

  if (sheet === "a4") {
    const totalSheets = 1 + tileTotal;
    drawCoverSheet(
      doc,
      pattern,
      spec,
      tileCounts,
      totalSheets,
      pdfOptions?.includeConstruction,
    );
    const sheetCounter: SheetCounter = { n: 2 };
    pattern.pieces.forEach((piece) =>
      tilePiece(
        doc,
        piece,
        spec,
        false,
        false,
        sheetCounter,
        totalSheets,
        pdfOptions,
      ),
    );
  } else {
    const totalSheets = tileTotal;
    const sheetCounter: SheetCounter = { n: 1 };
    pattern.pieces.forEach((piece, i) =>
      tilePiece(
        doc,
        piece,
        spec,
        i === 0,
        true,
        sheetCounter,
        totalSheets,
        pdfOptions,
      ),
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

function drawCoverSheet(
  doc: jsPDF,
  pattern: Pattern,
  spec: PatternSpec,
  tileCounts: number[],
  totalSheets: number,
  includeConstruction = false,
): void {
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
  if (includeConstruction) {
    doc.text(
      "Construction overlay: drafting points and lines printed at true scale on the pattern sheets.",
      MARGIN,
      y,
      { maxWidth: printableW },
    );
    y += 8;
  }
  doc.setTextColor(0);

  y += 8;
  doc.setFontSize(12);
  doc.text("Sheets in this pattern:", MARGIN, y);
  y += 7;
  doc.setFontSize(10);
  let sheet = 2;
  for (let i = 0; i < pattern.pieces.length; i++) {
    const piece = pattern.pieces[i];
    const count = tileCounts[i];
    const first = sheet;
    const last = sheet + count - 1;
    sheet = last + 1;
    const range =
      first === last ? `sheet ${first}` : `sheets ${first}–${last}`;
    doc.text(`${piece.name} — ${range}`, MARGIN, y);
    y += 6;
  }
  doc.setFontSize(9);
  doc.setTextColor(70);
  doc.text(`Total: ${totalSheets} sheets (including this cover).`, MARGIN, y);
  doc.setTextColor(0);
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
