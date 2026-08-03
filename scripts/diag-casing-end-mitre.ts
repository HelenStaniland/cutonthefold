/**
 * Dump casing end-corner mitre inputs/outputs.
 * Run: npx tsx scripts/diag-casing-end-mitre.ts
 */
import {
  applyEase,
  type BodyMeasurements,
  type OutlinePoint,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
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

const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const SA = DEFAULT_SEAM_ALLOWANCE.seam;

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function collapse(outline: OutlinePoint[]): OutlinePoint[] {
  const out: OutlinePoint[] = [];
  for (const p of outline) {
    const last = out[out.length - 1];
    if (last && dist(last.at, p.at) < 0.01) continue;
    out.push(p);
  }
  if (out.length > 1 && dist(out[0]!.at, out[out.length - 1]!.at) < 0.01) {
    out.pop();
  }
  return out;
}

function findWaistRun(outline: OutlinePoint[]) {
  const idxs: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    if (outline[i]!.role === "waist") idxs.push(i);
  }
  return { start: idxs[0]!, end: idxs[idxs.length - 1]! };
}

function signedArea(outline: OutlinePoint[]): number {
  let a = 0;
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i]!.at;
    const q = outline[(i + 1) % outline.length]!.at;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function unit(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function outwardNormal(a: Point, b: Point, clockwise: boolean): Point {
  const t = unit(b.x - a.x, b.y - a.y);
  return clockwise ? { x: t.y, y: -t.x } : { x: -t.y, y: t.x };
}

function waistUp(waist: Point[], clockwise: boolean): Point {
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < waist.length - 1; i++) {
    const n = outwardNormal(waist[i]!, waist[i + 1]!, clockwise);
    nx += n.x;
    ny += n.y;
  }
  const u = unit(nx, ny);
  const mid = waist[Math.floor(waist.length / 2)]!;
  if (mid.y + u.y * 10 > mid.y + 0.5) return { x: -u.x, y: -u.y };
  return u;
}

function lineIntersection(
  p1: Point,
  d1: Point,
  p2: Point,
  d2: Point,
): Point | null {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-9) return null;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const t = (dx * d2.y - dy * d2.x) / cross;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
}

function distToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

function resolve(body: BodyMeasurements, pocket: "slant" | "none"): TrouserFrontStyle {
  const s = CARGO_TROUSER_STYLE;
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    frontWaistInset: 0,
    waistTaper: 0,
    ...(pocket === "slant" ? { pocketFront: "slant" as const } : {}),
  };
  return withWaistband(base, 0, "shaped", body);
}

const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
const f = (n: number) => n.toFixed(3);

for (const pocket of ["none", "slant"] as const) {
  const style = resolve(body, pocket);
  const net = draftTrousers(body, style);
  const saPat = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const d = resolveCasingDepths(25);
  const cased = applyTrouserWaistCasingToPattern(saPat, d);
  const p = cased.pieces.find((x) => x.name === "Trouser front")!;
  const col = collapse(p.outline);
  const run = findWaistRun(col);
  const waist: Point[] = [];
  for (let i = run.start; i <= run.end; i++) waist.push(col[i]!.at);
  const clockwise = signedArea(col) > 0;
  const up = waistUp(waist, clockwise);
  const endVertex = waist[waist.length - 1]!;
  const endWaistPrev = waist[waist.length - 2]!;
  const endNext = col[(run.end + 1) % col.length]!.at;
  const waistDirEnd = unit(
    endVertex.x - endWaistPrev.x,
    endVertex.y - endWaistPrev.y,
  );
  const sideDir = unit(endVertex.x - endNext.x, endVertex.y - endNext.y);
  const sideNormal = outwardNormal(endVertex, endNext, clockwise);
  const topStart = {
    x: endVertex.x + up.x * d.totalExtension,
    y: endVertex.y + up.y * d.totalExtension,
  };
  const sideStart = {
    x: endVertex.x + sideNormal.x * SA,
    y: endVertex.y + sideNormal.y * SA,
  };
  const hit = lineIntersection(topStart, waistDirEnd, sideStart, sideDir);
  const bevel = {
    x: endVertex.x + up.x * d.totalExtension + sideNormal.x * SA,
    y: endVertex.y + up.y * d.totalExtension + sideNormal.y * SA,
  };
  const topCount = waist.length;
  const endCorner = p.cuttingOutline![topCount - 1]!;
  const afterTop = p.cuttingOutline![topCount]!;
  const oldEnd = saPat.pieces.find((x) => x.name === "Trouser front")!
    .cuttingOutline![run.end]!;

  console.log(`\n=== front pocket=${pocket} ===`);
  console.log(`  endVertex=${f(endVertex.x)},${f(endVertex.y)} role=${col[run.end]!.role}`);
  console.log(`  endNext=${f(endNext.x)},${f(endNext.y)} role=${col[(run.end + 1) % col.length]!.role}`);
  console.log(`  up=${f(up.x)},${f(up.y)} sideDir=${f(sideDir.x)},${f(sideDir.y)} sideN=${f(sideNormal.x)},${f(sideNormal.y)}`);
  console.log(`  waistDirEnd=${f(waistDirEnd.x)},${f(waistDirEnd.y)}`);
  console.log(`  up·sideN=${f(up.x * sideNormal.x + up.y * sideNormal.y)}`);
  console.log(`  topStart=${f(topStart.x)},${f(topStart.y)} sideStart=${f(sideStart.x)},${f(sideStart.y)}`);
  console.log(
    `  hit=${hit ? `${f(hit.x)},${f(hit.y)} distV=${f(dist(hit, endVertex))}` : "null"}`,
  );
  console.log(`  bevel=${f(bevel.x)},${f(bevel.y)} distToSideLine=${f(distToLine(bevel, endVertex, endNext))}`);
  console.log(`  endCorner(actual)=${f(endCorner.x)},${f(endCorner.y)} distToSideLine=${f(distToLine(endCorner, endVertex, endNext))}`);
  console.log(`  afterTop=${f(afterTop.x)},${f(afterTop.y)} distToSideLine=${f(distToLine(afterTop, endVertex, endNext))}`);
  console.log(`  oldCut[run.end]=${f(oldEnd.x)},${f(oldEnd.y)} distToSideLine=${f(distToLine(oldEnd, endVertex, endNext))}`);
  if (hit) {
    console.log(`  endCorner≡hit? ${dist(endCorner, hit) < 0.01} endCorner≡bevel? ${dist(endCorner, bevel) < 0.01}`);
  }
}
