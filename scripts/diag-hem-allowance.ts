/**
 * DIAGNOSTIC ONLY — hem seam-allowance corner behaviour across trouser pieces.
 * Run: npx tsx scripts/diag-hem-allowance.ts
 *
 * Reports, for every piece that has a hem edge, the two hem end corners
 * (side-hem, inseam-hem): net vs cutting coords, deltas, the adjoining seam
 * tangent just above the corner (angle from vertical), and the local hem
 * tangent (angle from horizontal). Changes no source code.
 *
 * Conventions (SVG y-DOWN):
 *   - seam angle from vertical: atan2(dx, -dy) of the vector from the corner
 *     UP the seam; 0° = straight up, +ve leans toward +x.
 *   - hem angle from horizontal: atan2(-dy, dx) of the hem edge vector at the
 *     corner; 0° = horizontal, +ve tips visually up toward +x.
 */
import { applyEase, type Point, type OutlinePoint, type PatternPiece } from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  draftTrousers,
  withWaistband,
  blockFromWaistDrop,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { addSeamAllowance, DEFAULT_SEAM_ALLOWANCE } from "../lib/geometry/seamAllowance";
import {
  BLOCK_TROUSER_STYLE,
  IZZY_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";

const DEG = 180 / Math.PI;

// Resolve TrouserStyleSettings → drafted TrouserFrontStyle exactly as the app
// does (TrousersView): only-set overrides, block from waistDrop, and the
// darted/shaped withWaistband wrap at the app's resolved depth.
function resolveStyle(
  s: TrouserStyleSettings,
  body: ReturnType<typeof applyEase>,
): TrouserFrontStyle {
  const block = blockFromWaistDrop(s.waistDrop);
  const style: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block,
    waistDrop: s.waistDrop,
    ...(s.frontInseamKneeInset != null
      ? { frontInseamKneeInset: s.frontInseamKneeInset }
      : {}),
    ...(s.backInseamKneeInset != null
      ? { backInseamKneeInset: s.backInseamKneeInset }
      : {}),
    ...(s.frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale: s.frontCrotchExtensionScale }
      : {}),
    ...(s.backCrotchExtensionScale != null
      ? { backCrotchExtensionScale: s.backCrotchExtensionScale }
      : {}),
    ...(s.crotchStraightRun != null ? { crotchStraightRun: s.crotchStraightRun } : {}),
    ...(s.crotchArrivalAngle != null ? { crotchArrivalAngle: s.crotchArrivalAngle } : {}),
    ...(s.waistlineCurveFront != null ? { waistlineCurveFront: s.waistlineCurveFront } : {}),
    ...(s.frontWaistInset != null ? { frontWaistInset: s.frontWaistInset } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null ? { frontCrotchFullness: s.frontCrotchFullness } : {}),
    ...(s.backCrotchFullness != null ? { backCrotchFullness: s.backCrotchFullness } : {}),
  };
  const draftWaistDepth =
    s.waistbandMode === "darted"
      ? s.dartedWaistFinish === "facing"
        ? 0
        : s.dartedBandDepth
      : s.waistbandDepth;
  if (s.waistbandMode === "darted") {
    return withWaistband(style, draftWaistDepth, "darted", body);
  }
  return draftWaistDepth > 0
    ? withWaistband(style, draftWaistDepth, "shaped", body)
    : style;
}

// collapseDuplicateVertices mirror (not exported) — so our indices line up with
// addSeamAllowance's cuttingOutline, which is built from the collapsed outline.
const DUP_TOL = 0.01;
function collapse(outline: OutlinePoint[]): OutlinePoint[] {
  if (outline.length === 0) return outline;
  const out: OutlinePoint[] = [];
  for (const p of outline) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.at.x - last.at.x, p.at.y - last.at.y) < DUP_TOL) continue;
    out.push(p);
  }
  if (out.length > 1) {
    const f = out[0];
    const l = out[out.length - 1];
    if (Math.hypot(f.at.x - l.at.x, f.at.y - l.at.y) < DUP_TOL) out.pop();
  }
  return out;
}

function seamFromVertical(corner: Point, up: Point): number {
  const dx = up.x - corner.x;
  const dy = up.y - corner.y;
  return Math.atan2(dx, -dy) * DEG;
}
function hemFromHorizontal(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.atan2(-dy, dx) * DEG;
}
const f2 = (n: number) => n.toFixed(3);
const pt = (p: Point) => `(${f2(p.x)}, ${f2(p.y)})`;

function reportPiece(label: string, piece: PatternPiece) {
  const net = collapse(piece.outline);
  const withSA = addSeamAllowance(piece, DEFAULT_SEAM_ALLOWANCE);
  const cutting = withSA.cuttingOutline!;
  const n = net.length;

  console.log(`\n########## ${label} — ${piece.name} ##########`);
  console.log(`  net outline pts: ${n}   cutting pts: ${cutting.length}   (must match)`);

  // Maximal contiguous run of hem-tagged outline points.
  const hemIdx = net.map((p, i) => (p.edge === "hem" ? i : -1)).filter((i) => i >= 0);
  if (hemIdx.length === 0) {
    console.log("  (no hem edge on this piece)");
    return;
  }
  const runStart = hemIdx[0];
  const runEnd = hemIdx[hemIdx.length - 1];
  // Physical hem-edge end corners: the first tagged point (side-hem) and the
  // point one past the last tagged point (the hem→inseam junction, inseam-hem).
  const sideCorner = runStart;
  const inseamCorner = (runEnd + 1) % n;

  const corners: { name: string; idx: number; seamDir: "back" | "fwd" }[] = [
    { name: "side-hem", idx: sideCorner, seamDir: "back" },
    { name: "inseam-hem", idx: inseamCorner, seamDir: "fwd" },
  ];

  for (const c of corners) {
    const i = c.idx;
    const netP = net[i].at;
    const cutP = cutting[i];
    const dx = cutP.x - netP.x;
    const dy = cutP.y - netP.y;

    // Adjoining seam tangent, sampled up the seam away from the hem.
    const step = c.seamDir === "back" ? -1 : 1;
    const s1 = net[(i + step + n) % n].at;
    const s2 = net[(i + 2 * step + n) % n].at;
    const s3 = net[(i + 3 * step + n) % n].at;
    const angSeam1 = seamFromVertical(netP, s1);
    const angSeam2 = seamFromVertical(netP, s2);
    const angSeam3 = seamFromVertical(netP, s3);

    // Local hem tangent at the corner (along the hem edge).
    const hemNeighbour =
      c.seamDir === "back" ? net[(i + 1) % n].at : net[(i - 1 + n) % n].at;
    const hemA = c.seamDir === "back" ? netP : hemNeighbour;
    const hemB = c.seamDir === "back" ? hemNeighbour : netP;
    const angHem = hemFromHorizontal(hemA, hemB);

    console.log(`\n  --- ${c.name} corner (outline idx ${i}, role "${net[i].role ?? "?"}") ---`);
    console.log(`    net corner     : ${pt(netP)}`);
    console.log(`    cutting corner : ${pt(cutP)}`);
    console.log(`    delta (cut−net): dx ${f2(dx)}   dy ${f2(dy)}   |Δ| ${f2(Math.hypot(dx, dy))}`);
    console.log(
      `    seam tangent (from vertical): ${f2(angSeam1)}° / ${f2(angSeam2)}° / ${f2(angSeam3)}°  (1,2,3 pts up the seam)`,
    );
    console.log(`    hem tangent (from horizontal): ${f2(angHem)}°`);
  }
}

// --- Bodies & styles ------------------------------------------------------
const base = bodyForSizeCode(DEFAULT_SIZE_CODE)!;

const cases: { label: string; settings: TrouserStyleSettings }[] = [
  { label: "Aldrich block (waistDrop 0)", settings: { ...BLOCK_TROUSER_STYLE, waistDrop: 0 } },
  { label: "Production (waistDrop 50)", settings: { ...BLOCK_TROUSER_STYLE, waistDrop: 50 } },
  { label: "Izzy preset", settings: IZZY_TROUSER_STYLE },
];

console.log("SEAM-ALLOWANCE POLICY:", JSON.stringify(DEFAULT_SEAM_ALLOWANCE), "(seam, hem in mm)");
console.log(`BASE BODY: size ${DEFAULT_SIZE_CODE} ${JSON.stringify(base)}`);

for (const c of cases) {
  const body = applyEase(base, c.settings.ease);
  console.log(
    `\n==================== ${c.label} ====================\n  ease ${JSON.stringify(
      c.settings.ease,
    )} → drafted body hip ${body.hip}, waist ${body.waist}`,
  );
  const style = resolveStyle(c.settings, body);
  const pattern = draftTrousers(body, style);
  const front = pattern.pieces.find((p) => p.name === "Trouser front")!;
  const back = pattern.pieces.find((p) => p.name === "Trouser back")!;
  reportPiece(c.label, front);
  reportPiece(c.label, back);
}
