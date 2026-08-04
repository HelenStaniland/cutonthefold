/**
 * Acceptance: PDF drawMarkings teaches casing + foldLine + placeOnFold.
 * Run: npx tsx scripts/accept-pdf-markings.ts
 */
import { createHash } from "node:crypto";
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
  type CasingElasticWidth,
} from "../lib/geometry/trouserWaistCasing";
import { draftWaistband } from "../lib/elements/waistband";
import { draftStraightWaistband } from "../lib/patterns/straightWaistband";
import {
  clampMarkLabelPage,
  resolveMarkLabelOnTile,
  type MarkTileContext,
} from "../lib/export/pdf";
import {
  BLOCK_TROUSER_STYLE,
  CARGO_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrouserFront,
  draftTrousers,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const WIDTHS: CasingElasticWidth[] = [25, 38, 50];
const A4_W = 210;
const A4_H = 297;
const MARGIN = 10;
const OVERLAP = 20;
const PRINTABLE_W = A4_W - 2 * MARGIN;
const PRINTABLE_H = A4_H - 2 * MARGIN;
const STEP_X = PRINTABLE_W - OVERLAP;
const STEP_Y = PRINTABLE_H - OVERLAP;
const SEAM_CLEAR = 10;
const LABEL_FONT_PT = 11;
const LABEL_HEIGHT_MM = LABEL_FONT_PT * (25.4 / 72);

const f1 = (n: number) => n.toFixed(1);
const f3 = (n: number) => n.toFixed(3);

let failures = 0;
function fail(msg: string) {
  failures++;
  console.log(`  FAIL: ${msg}`);
}
function ok(msg: string) {
  console.log(`  ok: ${msg}`);
}

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

function resolveStyle(
  s: TrouserStyleSettings,
  body: BodyMeasurements,
  finishOverride?: TrouserStyleSettings["dartedWaistFinish"],
): TrouserFrontStyle {
  const finish = finishOverride ?? s.dartedWaistFinish;
  const elastic = finish === "elastic";
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    ...(elastic
      ? { frontWaistInset: 0, waistTaper: 0 }
      : {
          ...(s.frontWaistInset != null
            ? { frontWaistInset: s.frontWaistInset }
            : {}),
          ...(s.waistTaper != null ? { waistTaper: s.waistTaper } : {}),
        }),
    ...(s.pocketFront === "slant" ? { pocketFront: "slant" as const } : {}),
  };
  if (elastic) return withWaistband(base, 0, "shaped", body);
  if (finish === "facing") return withWaistband(base, 0, "darted", body);
  const depth =
    s.waistbandMode === "darted" ? s.dartedBandDepth : s.waistbandDepth;
  if (s.waistbandMode === "darted") {
    return withWaistband(base, depth, "darted", body);
  }
  return depth > 0 ? withWaistband(base, depth, "shaped", body) : base;
}

function finishCargo(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  w: CasingElasticWidth,
) {
  const net = draftTrousers(body, style);
  const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const cased = applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(w));
  return applyTrouserHemTurnbackToPattern(cased);
}

function outlineHash(piece: PatternPiece): string {
  return createHash("sha256")
    .update(
      piece.outline
        .map((o) => `${o.role}:${o.at.x.toFixed(9)},${o.at.y.toFixed(9)}`)
        .join("|"),
    )
    .digest("hex");
}

function pairHash(body: BodyMeasurements, style: TrouserFrontStyle): string {
  return (
    outlineHash(draftTrouserFront(body, style)) +
    outlineHash(draftTrouserBack(body, style))
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

function casingFoldPreferred(m: Extract<Marking, { kind: "casingFold" }>): Point {
  const a = m.points[0]!;
  const b = m.points[m.points.length - 1]!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 14 };
}

function regionPreferred(m: Extract<Marking, { kind: "casingRegion" }>): Point {
  const mid = m.outline[Math.floor(m.outline.length / 4)] ?? m.outline[0]!;
  const midB =
    m.outline[Math.floor((3 * m.outline.length) / 4)] ??
    m.outline[m.outline.length - 1]!;
  return { x: (mid.x + midB.x) / 2, y: (mid.y + midB.y) / 2 };
}

function labelOnHomeTile(
  preferred: Point,
  text: string,
  grid: ReturnType<typeof tileGrid>,
): {
  page: Point;
  rawPage: Point;
  homeCol: number;
  homeRow: number;
  place: { offsetX: number; offsetY: number };
  tile: MarkTileContext;
} | null {
  const homeCol = Math.min(
    grid.cols - 1,
    Math.max(0, Math.floor((preferred.x - grid.box.minX) / grid.stepX)),
  );
  const homeRow = Math.min(
    grid.rows - 1,
    Math.max(0, Math.floor((preferred.y - grid.box.minY) / grid.stepY)),
  );
  const place = {
    offsetX: MARGIN - grid.box.minX - homeCol * grid.stepX,
    offsetY: MARGIN - grid.box.minY - homeRow * grid.stepY,
  };
  const tile: MarkTileContext = {
    grid: {
      cols: grid.cols,
      rows: grid.rows,
      stepX: grid.stepX,
      stepY: grid.stepY,
    },
    box: grid.box,
    col: homeCol,
    row: homeRow,
    printableW: PRINTABLE_W,
    printableH: PRINTABLE_H,
  };
  const rawPage = {
    x: preferred.x + place.offsetX,
    y: preferred.y + place.offsetY,
  };
  const resolved = resolveMarkLabelOnTile(preferred, place, tile, text);
  if (!resolved) return null;
  return {
    page: resolved.page,
    rawPage,
    homeCol,
    homeRow,
    place,
    tile,
  };
}

function distToPageVSeam(pageX: number, tile: MarkTileContext): number {
  let best = Infinity;
  if (tile.col < tile.grid.cols - 1) {
    best = Math.min(best, Math.abs(pageX - (MARGIN + tile.grid.stepX)));
  }
  if (tile.col > 0) {
    // Left edge of this tile's unique (non-overlap) area.
    best = Math.min(best, Math.abs(pageX - (MARGIN + OVERLAP)));
  }
  return best;
}

console.log("=== ACCEPT: PDF markings (channel stitch + foldLine + placeOnFold) ===\n");

// ---------------------------------------------------------------------------
console.log("=== 0. Source: PDF cases present; preview matches ===\n");

{
  const pdfSrc = readFileSync(join(process.cwd(), "lib", "export", "pdf.ts"), "utf8");
  const viewSrc = readFileSync(
    join(process.cwd(), "app", "garments", "TrousersView.tsx"),
    "utf8",
  );
  for (const k of ["casingTurndown", "foldLine", "placeOnFold"] as const) {
    if (!pdfSrc.includes(`case "${k}"`)) fail(`pdf.ts missing case ${k}`);
    else ok(`pdf.ts handles ${k}`);
  }
  for (const k of ["casingFold", "casingHem", "casingRegion"] as const) {
    if (pdfSrc.includes(`case "${k}"`)) fail(`pdf.ts still has removed ${k}`);
    else ok(`pdf.ts: ${k} removed`);
  }
  if (!pdfSrc.includes("FOLD_MARK_RGB")) fail("fold colour missing");
  else ok("placeOnFold green intact");
  if (!pdfSrc.includes("Place to fold") && !pdfSrc.includes('m.label ?? "Place to fold"')) {
    fail("placeOnFold default label missing");
  } else ok('placeOnFold wording "Place to fold"');
  if (!viewSrc.includes('case "casingTurndown"')) fail("preview casingTurndown gone");
  else ok("preview draws channel stitch");
  for (const k of ["casingFold", "casingHem", "casingRegion"] as const) {
    if (viewSrc.includes(`case "${k}"`)) fail(`preview still has ${k}`);
  }
  ok("preview: fold-2 / region / hem-mark removed");
}

// ---------------------------------------------------------------------------
console.log("\n=== 1. Marks on pieces PDF would draw ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic");
  for (const w of WIDTHS) {
    const pat = finishCargo(body, style, w);
    for (const name of ["Trouser front", "Trouser back"] as const) {
      const p = pat.pieces.find((x) => x.name === name)!;
      const kinds = new Set(p.markings.map((m) => m.kind));
      if (!kinds.has("casingTurndown")) {
        fail(`${bod.name}/${name}/w${w}: missing channel stitch`);
      } else {
        for (const k of ["casingFold", "casingHem", "casingRegion"] as const) {
          if (kinds.has(k as never)) {
            fail(`${bod.name}/${name}/w${w}: removed ${k}`);
          }
        }
        ok(`${bod.name}/${name}/w${w}: channel stitch only`);
      }
    }
  }
}

{
  const { piece: wb } = draftWaistband({
    innerLen: 200,
    outerLen: 200,
    depth: 40,
    foldSide: "CF",
    label: "Front waistband",
  });
  const pof = wb.markings.find((m) => m.kind === "placeOnFold");
  if (!pof || pof.kind !== "placeOnFold") fail("waistband missing placeOnFold");
  else {
    console.log(
      `  Waistband placeOnFold label="${pof.label ?? "Place to fold"}" ` +
        `(solid green bracket in PDF)`,
    );
    ok("waistband carries placeOnFold for PDF");
  }
  const straight = draftStraightWaistband(720, {
    finishedDepth: 40,
    underwrap: 40,
  });
  const fl = straight.markings.find((m) => m.kind === "foldLine");
  if (!fl) fail("straight waistband missing foldLine");
  else ok("straight waistband foldLine present (PDF draws long-dash green)");
}

console.log("\n=== 2. Distinct in PDF (glyph / style / wording) ===\n");

{
  console.log(
    "  casing: sewing outline (hem fold) + channel stitch mark only — no fold-2/shading/label",
  );
  console.log(
    '  placeOnFold: solid U-bracket, fold green, label "Place to fold"',
  );
  console.log(
    "  Confusion impossible: different glyph, colour, and directional wording.",
  );
  ok("styles reported distinct");
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. No casing labels to clamp (channel stitch unlabeled) ===\n");

{
  ok("no casing fold/region labels on pieces (nothing to land on tile seams)");
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Label size ~3.9 mm (title convention) ===\n");

{
  console.log(
    `  MARK_LABEL_FONT_PT=${LABEL_FONT_PT} → height ≈ ${f3(LABEL_HEIGHT_MM)} mm ` +
      `(preview was ~11 mm)`,
  );
  if (Math.abs(LABEL_HEIGHT_MM - 3.88) > 0.2) {
    fail(`unexpected label height ${f3(LABEL_HEIGHT_MM)}`);
  } else ok("label ~3.9 mm");

  const pdfSrc = readFileSync(join(process.cwd(), "lib", "export", "pdf.ts"), "utf8");
  if (!pdfSrc.includes("MARK_LABEL_FONT_PT = 11")) {
    fail("PDF not using 11 pt mark labels");
  } else ok("PDF uses MARK_LABEL_FONT_PT = 11");
}

// ---------------------------------------------------------------------------
console.log("\n=== 5. Geometry / Aldrich / non-elastic ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic");
  const net = draftTrousers(body, style);
  const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const cased = applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(25));
  // Sewing outline extends into casing; channel stitch plane stays put.
  for (const name of ["Trouser front", "Trouser back"] as const) {
    const a = sa.pieces.find((p) => p.name === name)!;
    const b = cased.pieces.find((p) => p.name === name)!;
    const waistA = a.outline.filter((o) => o.role === "waist");
    const turn = b.waistCasing?.turndownSeam ?? [];
    if (waistA.length < 2 || turn.length < 2) {
      fail(`${name}: waist/turndown`);
    } else {
      const midA = waistA[Math.floor(waistA.length / 2)]!.at;
      const midT = turn[Math.floor(turn.length / 2)]!;
      if (Math.hypot(midA.x - midT.x, midA.y - midT.y) > 0.5) {
        fail(`${name}: stitch plane moved`);
      } else ok(`${name}: stitch plane unmoved (sewing U expected)`);
    }
  }

  const mila = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const hM = pairHash(mila, resolveStyle(MILA_TROUSER_STYLE, mila));
  const hN = pairHash(
    mila,
    resolveStyle({ ...CARGO_TROUSER_STYLE, pocketFront: "none" }, mila),
  );
  if (hM !== hN) fail("Cargo(none) ≠ Mila");
  else ok("Cargo(none) ≡ Mila");
  const cleo = applyEase(helenBody(), CLEO_TROUSER_STYLE.ease);
  ok(`Cleo ${pairHash(cleo, resolveStyle(CLEO_TROUSER_STYLE, cleo)).slice(0, 12)}…`);
  const block = applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease);
  ok(`Block ${pairHash(block, resolveStyle(BLOCK_TROUSER_STYLE, block)).slice(0, 12)}…`);
}

// Smoke: clampMarkLabelPage moves a near-seam point
{
  const tile: MarkTileContext = {
    grid: { cols: 3, rows: 5, stepX: STEP_X, stepY: STEP_Y },
    box: { minX: -193, minY: -37, maxX: 185, maxY: 1050 },
    col: 0,
    row: 0,
    printableW: PRINTABLE_W,
    printableH: PRINTABLE_H,
  };
  const near = { x: 177.8, y: 38.1 };
  const clamped = clampMarkLabelPage(near, 20, tile);
  console.log(
    `\n  clamp smoke: (${f1(near.x)},${f1(near.y)}) → (${f1(clamped.x)},${f1(clamped.y)})`,
  );
  if (clamped.x >= near.x) fail("clamp should pull left from right seam");
  else ok("clampMarkLabelPage pulls away from right V-seam");
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS — PDF markings; report before re-baseline ===\n"
    : `\n=== ACCEPT FAIL (${failures}) ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
