/**
 * Acceptance: back crotch ends at p23; 5 mm step is inseam.
 * Run: npx tsx scripts/accept-back-crotch-ends-p23.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type OutlinePoint, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { polylineLength } from "../lib/geometry/curves";
import { withSeamAllowance } from "../lib/geometry/seamAllowance";
import { DEFAULT_SEAM_ALLOWANCE } from "../lib/geometry/seamAllowance";
import {
  draftTrouserBack,
  draftTrouserFront,
  draftBackCrotch,
  trouserBackPoints,
  trouserFrontPoints,
  withWaistband,
  DEFAULT_CROTCH_ARRIVAL_ANGLE,
  WAISTLINE_CURVE_FRONT,
  DEFAULT_FRONT_WAIST_INSET,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const raw: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
  crotchExtensionScale: 0.5,
  crotchArrivalAngle: DEFAULT_CROTCH_ARRIVAL_ANGLE,
  waistlineCurveFront: WAISTLINE_CURVE_FRONT,
  frontWaistInset: DEFAULT_FRONT_WAIST_INSET,
};
const style = withWaistband(raw, 0, "darted", body);

const b = trouserBackPoints(body, style);
const f = trouserFrontPoints(body, style);
const d = draftBackCrotch(b);
const back = draftTrouserBack(body, style);
const front = draftTrouserFront(body, style);

const near = (a: Point, bp: Point, t = 0.05) =>
  Math.hypot(a.x - bp.x, a.y - bp.y) < t;
const fmt = (p: Point) => `(${p.x.toFixed(6)}, ${p.y.toFixed(6)})`;

const outline = back.outline;

let iK = -1;
let i23 = -1;
let i24 = -1;
for (let i = 0; i < outline.length; i++) {
  const at = outline[i]!.at;
  if (iK < 0 && near(at, d.K, 0.5)) iK = i;
  if (near(at, b.p23, 0.05)) i23 = i;
  if (near(at, b.p24, 0.05)) i24 = i;
}

console.log("=== Outline K → … → inseam (tip side) ===");
console.log(`idx K=${iK} p23=${i23} p24=${i24}`);
console.log(`#\trole\tx\ty\tnote`);

// Walk tipward from K to p24 (decreasing index if crotch then inseam toward tip)
const rows: { role: string; x: number; y: number; note: string }[] = [];
const noteAt = (at: Point) => {
  if (near(at, d.K, 0.5)) return "K";
  if (near(at, b.p23, 0.05)) return "p23";
  if (near(at, b.p24, 0.05)) return "p24";
  return "";
};

if (iK >= 0 && i24 >= 0) {
  const lo = Math.min(iK, i24);
  const hi = Math.max(iK, i24);
  // Prefer order K → p23 → p24
  const seq: number[] = [];
  if (iK >= i24) {
    for (let i = iK; i >= i24; i--) seq.push(i);
  } else {
    for (let i = iK; i <= i24; i++) seq.push(i);
  }
  for (const i of seq) {
    const o = outline[i]!;
    rows.push({
      role: o.role ?? "",
      x: o.at.x,
      y: o.at.y,
      note: noteAt(o.at),
    });
  }
}
rows.forEach((r, n) => {
  console.log(`${n}\t${r.role}\t${r.x.toFixed(6)}\t${r.y.toFixed(6)}\t${r.note}`);
});

const crotchAt24 = outline.filter(
  (o) => o.role === "crotch" && near(o.at, b.p24, 0.05),
);
console.log(`crotch-role points at p24: ${crotchAt24.length} (want 0)`);

const lastCrotch = [...outline].reverse().find((o) => o.role === "crotch");
// Actually find last crotch point in tip-ward sense = first crotch when walking from tip
// Final crotch segment = points with role crotch nearest tip: should end at p23
let tipwardCrotch: OutlinePoint | null = null;
for (let i = 0; i < outline.length; i++) {
  if (outline[i]!.role === "crotch") {
    tipwardCrotch = outline[i]!;
    break; // first crotch in outline order after inseam — wait outline order is waist…inseam…crotch
  }
}
// In outline order: … inseam (incl p24→p23) … crotch starts at p23
const firstCrotchIdx = outline.findIndex((o) => o.role === "crotch");
const firstCrotch = outline[firstCrotchIdx];
console.log(
  `first crotch-role point (tip end of crotch seam): ${firstCrotch ? fmt(firstCrotch.at) : "?"} role=${firstCrotch?.role}`,
);
console.log(`matches p23: ${firstCrotch ? near(firstCrotch.at, b.p23) : false}`);

// Final crotch segment angle: first two crotch points tip→waist = p23 → K
const c0 = outline[firstCrotchIdx]!;
const c1 = outline[firstCrotchIdx + 1]!;
const dx = c1.at.x - c0.at.x;
const dy = c1.at.y - c0.at.y;
const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
console.log(`\n=== Final crotch segment (tip → next) ===`);
console.log(`from ${fmt(c0.at)} to ${fmt(c1.at)}`);
console.log(`angle = ${ang.toFixed(6)}° (want 180°)`);

// Inseam lengths: role=inseam polylines
function roleLength(piece: { outline: OutlinePoint[] }, role: string): number {
  const pts: Point[] = [];
  for (const o of piece.outline) {
    if (o.role === role) pts.push(o.at);
  }
  // Also need continuity — gather contiguous runs
  // Simpler: extract all inseam points in order (one run)
  return polylineLength(pts);
}

const frontInseam = roleLength(front, "inseam");
const backInseam = roleLength(back, "inseam");
console.log(`\n=== Inseam lengths ===`);
console.log(`front inseam = ${frontInseam.toFixed(3)} mm`);
console.log(`back inseam  = ${backInseam.toFixed(3)} mm`);
console.log(`back − front = ${(backInseam - frontInseam).toFixed(3)} mm`);

// Geometry unchanged: draftBackCrotch points still have p24,p23,K
console.log(`\n=== Geometry unchanged ===`);
console.log(`p23 ${fmt(b.p23)} p24 ${fmt(b.p24)} K ${fmt(d.K)}`);
console.log(`draftBackCrotch still starts at p24: ${near(d.points[0]!, b.p24)}`);
console.log(`horizRun ${d.horizRun.toFixed(3)} k1=${d.k1.toFixed(4)} touchMiss=${d.touchMiss.toFixed(3)}`);

// Seam allowance at junction
const net = {
  pieces: [front, back],
};
const cut = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
const backCut = cut.pieces.find((p) => p.name === "Trouser back")!;
const cutOutline = backCut.cuttingOutline ?? backCut.outline.map((o) => o.at);

function maxSpike(pts: Point[]): number {
  let worst = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!;
    const bpt = pts[i]!;
    const c = pts[i + 1]!;
    const v1 = { x: bpt.x - a.x, y: bpt.y - a.y };
    const v2 = { x: c.x - bpt.x, y: c.y - bpt.y };
    const cross = v1.x * v2.y - v1.y * v2.x;
    const turn = Math.abs(cross) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
    if (turn > worst) worst = turn;
  }
  return worst;
}

// Find cut points near p23/p24
let nearJunc: Point[] = [];
for (const p of cutOutline) {
  const pt = "at" in p ? (p as OutlinePoint).at : (p as Point);
  if (near(pt, b.p23, 25) || near(pt, b.p24, 25)) nearJunc.push(pt);
}
console.log(`\n=== Seam allowance ===`);
console.log(`cut outline points: ${cutOutline.length}`);
console.log(`points near p23/p24 (±25mm): ${nearJunc.length}`);

// Self-intersection crude: check consecutive edges
function selfIntersect(pts: Point[]): boolean {
  const n = pts.length;
  const seg = (i: number) => {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    return { a, b };
  };
  const orient = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const onSeg = (a: Point, b: Point, c: Point) =>
    Math.min(a.x, b.x) - 1e-9 <= c.x &&
    c.x <= Math.max(a.x, b.x) + 1e-9 &&
    Math.min(a.y, b.y) - 1e-9 <= c.y &&
    c.y <= Math.max(a.y, b.y) + 1e-9;
  const crosses = (a: Point, b: Point, c: Point, d: Point) => {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    if (o1 * o2 < 0 && o3 * o4 < 0) return true;
    return false;
  };
  const pure = pts.map((p) => ("at" in p ? (p as OutlinePoint).at : p));
  for (let i = 0; i < pure.length; i++) {
    for (let j = i + 2; j < pure.length; j++) {
      if (i === 0 && j === pure.length - 1) continue;
      const s1 = seg(i);
      const s2 = seg(j);
      if (crosses(s1.a, s1.b, s2.a, s2.b)) return true;
    }
  }
  return false;
}

const cutPts = cutOutline.map((p) =>
  "at" in (p as object) ? (p as OutlinePoint).at : (p as Point),
);
console.log(`cut self-intersects: ${selfIntersect(cutPts)}`);

// SVG render of back crotch corner with SA
const netPts = outline.map((o) => o.at);
const all = [...netPts, ...cutPts];
let minX = Infinity,
  minY = Infinity,
  maxX = -Infinity,
  maxY = -Infinity;
for (const p of all) {
  minX = Math.min(minX, p.x);
  minY = Math.min(minY, p.y);
  maxX = Math.max(maxX, p.x);
  maxY = Math.max(maxY, p.y);
}
// Zoom to crotch corner
const cx = b.p23.x;
const cy = (b.p23.y + b.p24.y) / 2;
const zoom = 80;
minX = cx - zoom;
maxX = cx + zoom;
minY = cy - zoom;
maxY = cy + zoom;

const pathD = (pts: Point[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

// Color by role for net crotch corner points
let svgPaths = "";
{
  // net full back (clipped visually by viewBox)
  svgPaths += `<path d="${pathD(netPts)}" fill="none" stroke="#1a5fb4" stroke-width="1.2"/>`;
  svgPaths += `<path d="${pathD(cutPts)}" fill="none" stroke="#c64600" stroke-width="0.9" stroke-dasharray="4 2"/>`;
  // mark points
  const marks = [
    [d.K, "K", "#2ec27e"],
    [b.p23, "p23", "#1c71d8"],
    [b.p24, "p24", "#e66100"],
  ] as const;
  for (const [p, lab, col] of marks) {
    svgPaths += `<circle cx="${p.x}" cy="${p.y}" r="1.8" fill="${col}"/>`;
    svgPaths += `<text x="${p.x + 3}" y="${p.y - 3}" font-size="8" fill="${col}">${lab}</text>`;
  }
}

const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}">
  <rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="#faf8f5"/>
  ${svgPaths}
  <text x="${minX + 4}" y="${minY + 12}" font-size="9" fill="#333">back crotch corner — blue=net orange=cut SA</text>
</svg>`;
writeFileSync(join("scripts", "back-crotch-ends-p23.svg"), svg);
console.log(`\nwrote scripts/back-crotch-ends-p23.svg`);
