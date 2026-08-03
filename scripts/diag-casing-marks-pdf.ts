/**
 * Diagnostic: why casing marks are missing from PDF, and A4 tiling survival.
 * Change no production code. Run: npx tsx scripts/diag-casing-marks-pdf.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyEase,
  type BodyMeasurements,
  type Marking,
  type PatternPiece,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import { applyTrouserHemTurnbackToPattern } from "../lib/geometry/trouserHemTurnback";
import {
  applyTrouserWaistCasingToPattern,
  resolveCasingDepths,
} from "../lib/geometry/trouserWaistCasing";
import { CARGO_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrousers,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

// Match lib/export/pdf.ts (private constants — duplicated for diagnosis only).
const A4_W = 210;
const A4_H = 297;
const MARGIN = 10;
const OVERLAP = 20;
const PRINTABLE_W = A4_W - 2 * MARGIN; // 190
const PRINTABLE_H = A4_H - 2 * MARGIN; // 277
const STEP_X = PRINTABLE_W - OVERLAP; // 170
const STEP_Y = PRINTABLE_H - OVERLAP; // 257

const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const f1 = (n: number) => n.toFixed(1);
const f3 = (n: number) => n.toFixed(3);

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

function resolveCargo(body: BodyMeasurements): TrouserFrontStyle {
  const s = CARGO_TROUSER_STYLE;
  return withWaistband(
    {
      bottomWidth: s.legBottomWidth,
      block: blockFromWaistDrop(s.waistDrop),
      waistDrop: s.waistDrop,
      backHemShape: s.backHemShape,
      frontWaistInset: 0,
      waistTaper: 0,
      pocketFront: "slant",
    },
    0,
    "shaped",
    body,
  );
}

function bbox(pts: Point[]) {
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

function tileGrid(box: ReturnType<typeof bbox>) {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const cols = Math.max(1, Math.ceil((w - OVERLAP) / STEP_X));
  const rows = Math.max(1, Math.ceil((h - OVERLAP) / STEP_Y));
  return { cols, rows, stepX: STEP_X, stepY: STEP_Y, box };
}

/** Tile (col,row) for a pattern point (same formula as pdf.ts tilePiece). */
function tileOf(
  p: Point,
  grid: ReturnType<typeof tileGrid>,
): { col: number; row: number } {
  const { box } = grid;
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

/** Page coords if this point were drawn on its home tile. */
function pageOnHomeTile(
  p: Point,
  grid: ReturnType<typeof tileGrid>,
): Point {
  const { col, row } = tileOf(p, grid);
  return {
    x: p.x + (MARGIN - grid.box.minX - col * grid.stepX),
    y: p.y + (MARGIN - grid.box.minY - row * grid.stepY),
  };
}

function distToHSeam(p: Point, grid: ReturnType<typeof tileGrid>): number {
  // Horizontal tile seams in pattern space at box.minY + k*stepY (k=1..rows-1)
  let best = Infinity;
  for (let k = 1; k < grid.rows; k++) {
    const y = grid.box.minY + k * grid.stepY;
    best = Math.min(best, Math.abs(p.y - y));
  }
  return best;
}

function distToVSeam(p: Point, grid: ReturnType<typeof tileGrid>): number {
  let best = Infinity;
  for (let k = 1; k < grid.cols; k++) {
    const x = grid.box.minX + k * grid.stepX;
    best = Math.min(best, Math.abs(p.x - x));
  }
  return best;
}

function lineCrossesHSeam(
  pts: Point[],
  grid: ReturnType<typeof tileGrid>,
): { crosses: boolean; seams: number[] } {
  const seams: number[] = [];
  for (let k = 1; k < grid.rows; k++) {
    const y = grid.box.minY + k * grid.stepY;
    const ys = pts.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (minY < y && maxY > y) seams.push(k);
  }
  return { crosses: seams.length > 0, seams };
}

function lineCrossesVSeam(
  pts: Point[],
  grid: ReturnType<typeof tileGrid>,
): { crosses: boolean; seams: number[] } {
  const seams: number[] = [];
  for (let k = 1; k < grid.cols; k++) {
    const x = grid.box.minX + k * grid.stepX;
    const xs = pts.map((p) => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    if (minX < x && maxX > x) seams.push(k);
  }
  return { crosses: seams.length > 0, seams };
}

function tilesTouched(
  pts: Point[],
  grid: ReturnType<typeof tileGrid>,
): string[] {
  const set = new Set<string>();
  for (const p of pts) {
    const t = tileOf(p, grid);
    set.add(`C${t.col + 1}R${t.row + 1}`);
  }
  // Also sample midpoints of consecutive segments
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    for (const t of [0.25, 0.5, 0.75]) {
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const cell = tileOf(q, grid);
      set.add(`C${cell.col + 1}R${cell.row + 1}`);
    }
  }
  return [...set].sort();
}

function approxLabelWidthMm(text: string, fontSizePt: number): number {
  // Helvetica-ish: ~0.5 × fontSize(pt) per char, convert pt→mm (1pt = 25.4/72 mm).
  const mmPerPt = 25.4 / 72;
  return text.length * 0.5 * fontSizePt * mmPerPt;
}

// ---------------------------------------------------------------------------
console.log("=== DIAG: casing marks in PDF export + A4 tiling ===\n");

// ---------------------------------------------------------------------------
console.log("=== PART 1 — PDF vs preview render path ===\n");

const pdfSrc = readFileSync(join(process.cwd(), "lib", "export", "pdf.ts"), "utf8");
const viewSrc = readFileSync(
  join(process.cwd(), "app", "garments", "TrousersView.tsx"),
  "utf8",
);

const pdfHasDrawMarkings = pdfSrc.includes("function drawMarkings");
const pdfCases = {
  grainline: /case "grainline"/.test(pdfSrc),
  dart: /case "dart"/.test(pdfSrc),
  notch: /case "notch"/.test(pdfSrc),
  casingFold: /case "casingFold"/.test(pdfSrc),
  casingTurndown: /case "casingTurndown"/.test(pdfSrc),
  casingRegion: /case "casingRegion"/.test(pdfSrc),
  foldLine: /case "foldLine"/.test(pdfSrc),
  placeOnFold: /case "placeOnFold"/.test(pdfSrc),
};
const pdfDefaultBreak = /default:\s*\n\s*break;/.test(pdfSrc);
const viewCases = {
  casingFold: viewSrc.includes('case "casingFold"'),
  casingTurndown: viewSrc.includes('case "casingTurndown"'),
  casingRegion: viewSrc.includes('case "casingRegion"'),
};
const sharedRenderer =
  pdfSrc.includes("TrousersView") || viewSrc.includes("drawMarkings");

console.log(`  PDF has its own drawMarkings(): ${pdfHasDrawMarkings}`);
console.log(`  Preview draws casing in TrousersView SVG switch: ${JSON.stringify(viewCases)}`);
console.log(`  Shared renderer (preview imports PDF draw / vice versa): ${sharedRenderer}`);
console.log(`  PDF drawMarkings cases handled:`);
for (const [k, v] of Object.entries(pdfCases)) {
  console.log(`    ${k}: ${v ? "YES" : "NO"}`);
}
console.log(`  PDF default: break (silently drops unknown kinds): ${pdfDefaultBreak}`);
console.log(
  `\n  HEADLINE 1: cause (1) — SEPARATE PATH.\n` +
    `  Preview draws casingFold / casingTurndown / casingRegion in TrousersView.tsx.\n` +
    `  PDF drawPiece → drawMarkings only switches grainline / dart / notch;\n` +
    `  casing kinds hit default and are dropped. Not a shared-renderer filter.\n` +
    `  Fix shape would be: teach the PDF path to draw them (not flip a filter flag).\n`,
);

// Confirm marks exist on the piece the PDF would receive
const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
const style = resolveCargo(body);
const depths = resolveCasingDepths(25);
const net = draftTrousers(body, style);
const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
const cased = applyTrouserWaistCasingToPattern(sa, depths);
const hemmed = applyTrouserHemTurnbackToPattern(cased);

console.log("  Marks present on hemmed Cargo pieces (what PDF receives):");
for (const name of ["Trouser front", "Trouser back"] as const) {
  const p = hemmed.pieces.find((x) => x.name === name)!;
  const kinds = p.markings.map((m) => m.kind);
  const casing = kinds.filter((k) =>
    k === "casingFold" || k === "casingTurndown" || k === "casingRegion",
  );
  console.log(
    `    ${name}: ${casing.length} casing marks (${casing.join(", ")}) — ` +
      `data is on the piece; PDF just never draws them`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n=== PART 2 — A4 tiling survival (Helen Cargo, elastic 25) ===\n");
console.log(
  `  A4 printable ${PRINTABLE_W}×${PRINTABLE_H} mm, overlap ${OVERLAP}, ` +
    `step ${STEP_X}×${STEP_Y} (matches pdf.ts MARGIN/OVERLAP)\n`,
);

// Off-seam logic in PDF?
const hasClampPanel = pdfSrc.includes("clampPanelPage");
const hasOwnTile = pdfSrc.includes("ownCol") && pdfSrc.includes("ownRow");
const hasPanelFits = pdfSrc.includes("panelBoxFits");
console.log("  Existing off-seam / single-tile logic in pdf.ts:");
console.log(`    clampPanelPage (keep panel inside printable): ${hasClampPanel}`);
console.log(`    ownCol/ownRow (draw panel on one home tile only): ${hasOwnTile}`);
console.log(`    panelBoxFits / interiorAnchor fallback: ${hasPanelFits}`);
console.log(
  `    → applies to the piece info PANEL / title, NOT to marking labels.\n` +
    `    No general “keep labels off tile seams” for grainline/casing text.\n`,
);

type CasingBundle = {
  fold?: Extract<Marking, { kind: "casingFold" }>;
  turndown?: Extract<Marking, { kind: "casingTurndown" }>;
  region?: Extract<Marking, { kind: "casingRegion" }>;
  grain?: Extract<Marking, { kind: "grainline" }>;
};

function casingOf(piece: PatternPiece): CasingBundle {
  const out: CasingBundle = {};
  for (const m of piece.markings) {
    if (m.kind === "casingFold") out.fold = m;
    if (m.kind === "casingTurndown") out.turndown = m;
    if (m.kind === "casingRegion") out.region = m;
    if (m.kind === "grainline") out.grain = m;
  }
  return out;
}

/** Preview places fold label at mid-fold + 14 mm toward turndown (+y). */
function foldLabelPos(fold: Point[]): Point {
  const a = fold[0]!;
  const b = fold[fold.length - 1]!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 14 };
}

function regionLabelPos(outline: Point[]): Point {
  const mid = outline[Math.floor(outline.length / 4)] ?? outline[0]!;
  const midB =
    outline[Math.floor((3 * outline.length) / 4)] ??
    outline[outline.length - 1]!;
  return { x: (mid.x + midB.x) / 2, y: (mid.y + midB.y) / 2 };
}

let anySeamSlice = false;

for (const name of ["Trouser front", "Trouser back"] as const) {
  const piece = hemmed.pieces.find((x) => x.name === name)!;
  const cutPts = piece.cuttingOutline ?? piece.outline.map((o) => o.at);
  const grid = tileGrid(bbox(cutPts));
  const c = casingOf(piece);
  console.log(`--- ${name} ---`);
  console.log(
    `  cut bbox: (${f1(grid.box.minX)},${f1(grid.box.minY)})–` +
      `(${f1(grid.box.maxX)},${f1(grid.box.maxY)})  ` +
      `tiles ${grid.cols}×${grid.rows} = ${grid.cols * grid.rows}`,
  );

  if (!c.fold || !c.turndown || !c.region) {
    console.log("  MISSING casing marks on piece");
    continue;
  }

  const foldPts = c.fold.points;
  const turnPts = c.turndown.points;
  const regionPts = c.region.outline;
  const foldLab = foldLabelPos(foldPts);
  const regionLab = regionLabelPos(regionPts);

  const foldH = lineCrossesHSeam(foldPts, grid);
  const foldV = lineCrossesVSeam(foldPts, grid);
  const turnH = lineCrossesHSeam(turnPts, grid);
  const turnV = lineCrossesVSeam(turnPts, grid);
  const regH = lineCrossesHSeam(regionPts, grid);
  const regV = lineCrossesVSeam(regionPts, grid);

  const foldTiles = tilesTouched(foldPts, grid);
  const turnTiles = tilesTouched(turnPts, grid);
  const regTiles = tilesTouched(regionPts, grid);

  console.log(`  Fold line "${c.fold.label}":`);
  console.log(
    `    y span ${f1(Math.min(...foldPts.map((p) => p.y)))}…` +
      `${f1(Math.max(...foldPts.map((p) => p.y)))}  ` +
      `tiles ${foldTiles.join(",")}  ` +
      `cross H-seam=${foldH.crosses} V-seam=${foldV.crosses}`,
  );
  if (foldH.crosses || foldV.crosses) anySeamSlice = true;

  console.log(`  Turndown line:`);
  console.log(
    `    y span ${f1(Math.min(...turnPts.map((p) => p.y)))}…` +
      `${f1(Math.max(...turnPts.map((p) => p.y)))}  ` +
      `tiles ${turnTiles.join(",")}  ` +
      `cross H-seam=${turnH.crosses} V-seam=${turnV.crosses}`,
  );
  if (turnH.crosses || turnV.crosses) anySeamSlice = true;

  console.log(`  Casing region "${c.region.label}":`);
  console.log(
    `    tiles ${regTiles.join(",")}  cross H-seam=${regH.crosses} V-seam=${regV.crosses}`,
  );
  if (regH.crosses || regV.crosses) anySeamSlice = true;

  // Labels
  for (const [tag, lab, text] of [
    ["fold-label", foldLab, c.fold.label] as const,
    ["region-label", regionLab, c.region.label] as const,
  ]) {
    const cell = tileOf(lab, grid);
    const page = pageOnHomeTile(lab, grid);
    const dH = distToHSeam(lab, grid);
    const dV = distToVSeam(lab, grid);
    const nearSeam = dH < 8 || dV < 8;
    if (nearSeam) anySeamSlice = true;
    console.log(
      `  ${tag} "${text}": pattern (${f1(lab.x)},${f1(lab.y)}) → ` +
        `tile C${cell.col + 1}R${cell.row + 1}  ` +
        `page (${f1(page.x)},${f1(page.y)}) mm  ` +
        `distHSeam=${dH === Infinity ? "n/a" : f1(dH)} ` +
        `distVSeam=${dV === Infinity ? "n/a" : f1(dV)}` +
        (nearSeam ? "  ⚠ near seam (<8 mm)" : "  clear of seams"),
    );
  }

  // Casing band vs first horizontal tile seam
  if (grid.rows > 1) {
    const seamY = grid.box.minY + grid.stepY;
    const foldY = (foldPts[0]!.y + foldPts[foldPts.length - 1]!.y) / 2;
    const turnY = (turnPts[0]!.y + turnPts[turnPts.length - 1]!.y) / 2;
    console.log(
      `  First H-seam at pattern y=${f1(seamY)}; ` +
        `fold≈${f1(foldY)} turndown≈${f1(turnY)} ` +
        `(band is ${foldY < seamY && turnY < seamY ? "ENTIRELY above first H-seam (top tile)" : "relative to seam — see crosses above"})`,
    );
  } else {
    console.log("  Single-row tiling — no horizontal tile seam.");
  }
  console.log("");
}

// ---------------------------------------------------------------------------
console.log("=== PART 3 — legibility at print scale (if taught to PDF) ===\n");

{
  const front = hemmed.pieces.find((p) => p.name === "Trouser front")!;
  const c = casingOf(front);
  const fold = c.fold!.points;
  const turn = c.turndown!.points;
  const channel =
    Math.hypot(
      fold[Math.floor(fold.length / 2)]!.x -
        turn[Math.floor(turn.length / 2)]!.x,
      fold[Math.floor(fold.length / 2)]!.y -
        turn[Math.floor(turn.length / 2)]!.y,
    );
  const foldLab = foldLabelPos(fold);
  const regionLab = regionLabelPos(c.region!.outline);
  const labelText = c.fold!.label;
  // Preview CSS: 11px in an SVG whose user units are mm. At 1:1 CSS px≈mm on
  // many screens; PDF piece labels use setFontSize(11) pt ≈ 3.9 mm tall.
  const previewCssPx = 11;
  const pdfTitlePt = 11;
  const pdfTitleMm = pdfTitlePt * (25.4 / 72);
  const wPreviewApprox = labelText.length * 0.5 * previewCssPx; // mm if 1ux=1mm
  const wPdfTitle = approxLabelWidthMm(labelText, pdfTitlePt);
  const bandClear = channel; // fold→turndown
  const labelOffsetIntoBand = 14; // preview: my+14

  console.log(`  Channel depth (fold↔turndown): ${f1(channel)} mm (expect ${depths.channelDepth})`);
  console.log(`  Preview .casingLabel font-size: ${previewCssPx}px in mm-user-unit SVG`);
  console.log(
    `    If drawn 1:1, glyph height ~${previewCssPx} mm — large vs ${f1(channel)} mm band;`,
  );
  console.log(
    `    label sits ${labelOffsetIntoBand} mm below fold (toward turndown).`,
  );
  console.log(
    `    Approx string width at that size: ~${f1(wPreviewApprox)} mm for "${labelText}"`,
  );
  console.log(
    `  PDF drawPieceLineLabel uses ${pdfTitlePt} pt (~${f1(pdfTitleMm)} mm tall); ` +
      `approx width ~${f1(wPdfTitle)} mm — more print-sensible if reused.`,
  );
  console.log(
    `  Band height ${f1(bandClear)} mm vs 11 mm preview glyphs: ` +
      (previewCssPx > bandClear * 0.45
        ? "preview size is LARGE for the band; PDF should not copy 11 mm literally"
        : "OK"),
  );

  // Grainline collision
  if (c.grain) {
    const g0 = c.grain.line.from;
    const g1 = c.grain.line.to;
    const distPointSeg = (p: Point, a: Point, b: Point) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };
    const dFold = distPointSeg(foldLab, g0, g1);
    const dReg = distPointSeg(regionLab, g0, g1);
    console.log(
      `  Dist fold-label → grainline: ${f1(dFold)} mm; ` +
        `region-label → grainline: ${f1(dReg)} mm` +
        (Math.min(dFold, dReg) < 15 ? "  ⚠ close (<15 mm)" : "  clear"),
    );
  } else {
    console.log("  No grainline on front.");
  }

  // Fold/turndown collision with label
  const midFold = fold[Math.floor(fold.length / 2)]!;
  const midTurn = turn[Math.floor(turn.length / 2)]!;
  console.log(
    `  Fold-label vs fold line: ${f1(Math.abs(foldLab.y - midFold.y))} mm (offset by design); ` +
      `vs turndown: ${f1(Math.abs(foldLab.y - midTurn.y))} mm`,
  );

  console.log(
    `\n  Mirrored/doubled-text bug: casing labels are NOT drawn in PDF today,\n` +
      `  so that preview-only issue is not present in the export. Separate brief.`,
  );
}

console.log("\n=== REPORT SUMMARY ===\n");
console.log(
  "  HEADLINE 1: Cause (1) — SEPARATE PATH. PDF drawMarkings never taught\n" +
    "  casingFold / casingTurndown / casingRegion (default: break). Teach the PDF path.\n",
);
console.log(
  anySeamSlice
    ? "  HEADLINE 2: TILING — at least one mark/label sits on or crosses a tile seam\n" +
        "  (see Part 2). Lines would continue across sheets via clip+overlap if drawn;\n" +
        "  labels have NO off-seam logic (only the piece panel does via ownCol/clampPanelPage).\n"
    : "  HEADLINE 2: TILING — casing band + labels sit on a single top tile for Helen\n" +
        "  Cargo (no seam slice). Lines would survive via clip+overlap if drawn elsewhere.\n" +
        "  Off-seam logic exists only for the piece panel, not marking labels — reuse that\n" +
        "  pattern if a future size puts the label on a seam.\n",
);
console.log(
  "  LEGIBILITY: preview 11px-in-mm SVG is oversized for a ~31 mm channel;\n" +
    "  a PDF teach-in should size like other print labels (~8–11 pt), not copy CSS px as mm.\n" +
    "  Propose no fix — report only.\n",
);
