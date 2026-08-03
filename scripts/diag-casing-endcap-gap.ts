/**
 * Dump end-cap gap at casing side corner.
 * Run: npx tsx scripts/diag-casing-endcap-gap.ts
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
} from "../lib/patterns/trouserBlock";

const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;

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
  if (out.length > 1 && dist(out[0]!.at, out[out.length - 1]!.at) < 0.01) out.pop();
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

function waistUp(waist: Point[], clockwise: boolean): Point {
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < waist.length - 1; i++) {
    const t = unit(waist[i + 1]!.x - waist[i]!.x, waist[i + 1]!.y - waist[i]!.y);
    const n = clockwise ? { x: t.y, y: -t.x } : { x: -t.y, y: t.x };
    nx += n.x;
    ny += n.y;
  }
  const u = unit(nx, ny);
  const mid = waist[Math.floor(waist.length / 2)]!;
  if (mid.y + u.y * 10 > mid.y + 0.5) return { x: -u.x, y: -u.y };
  return u;
}

function distToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
const style = withWaistband(
  {
    bottomWidth: CARGO_TROUSER_STYLE.legBottomWidth,
    block: blockFromWaistDrop(CARGO_TROUSER_STYLE.waistDrop),
    waistDrop: CARGO_TROUSER_STYLE.waistDrop,
    backHemShape: CARGO_TROUSER_STYLE.backHemShape,
    frontWaistInset: 0,
    waistTaper: 0,
  },
  0,
  "shaped",
  body,
);
const d = resolveCasingDepths(25);
const sa = withSeamAllowance(draftTrousers(body, style), DEFAULT_SEAM_ALLOWANCE);
const cased = applyTrouserWaistCasingToPattern(sa, d);
const p = cased.pieces.find((x) => x.name === "Trouser front")!;
const col = collapse(p.outline);
const run = findWaistRun(col);
const cut = p.cuttingOutline!;
const waist: Point[] = [];
for (let i = run.start; i <= run.end; i++) waist.push(col[i]!.at);
const clockwise = signedArea(col) > 0;
const up = waistUp(waist, clockwise);
const topCount = waist.length;
const endVertex = waist[waist.length - 1]!;
const endPrev = waist[waist.length - 2]!;
const waistDirEnd = unit(endVertex.x - endPrev.x, endVertex.y - endPrev.y);
const endCorner = cut[topCount - 1]!;
const afterTop = cut[topCount]!;
const simpleEnd = {
  x: endVertex.x + up.x * d.totalExtension,
  y: endVertex.y + up.y * d.totalExtension,
};
const expected = {
  x: endVertex.x + up.x * d.totalExtension + waistDirEnd.x * 10,
  y: endVertex.y + up.y * d.totalExtension + waistDirEnd.y * 10,
};
const endCapB = { x: endVertex.x + up.x * 100, y: endVertex.y + up.y * 100 };
const f = (n: number) => n.toFixed(3);

console.log(`endVertex=${f(endVertex.x)},${f(endVertex.y)}`);
console.log(`up=${f(up.x)},${f(up.y)} waistDirEnd=${f(waistDirEnd.x)},${f(waistDirEnd.y)}`);
console.log(`simpleEnd=${f(simpleEnd.x)},${f(simpleEnd.y)}`);
console.log(`expected(mitre)=${f(expected.x)},${f(expected.y)}`);
console.log(`endCorner=${f(endCorner.x)},${f(endCorner.y)}`);
console.log(`afterTop=${f(afterTop.x)},${f(afterTop.y)}`);
console.log(`dist(endCorner,simpleEnd)=${f(dist(endCorner, simpleEnd))}`);
console.log(`dist(endCorner,expected)=${f(dist(endCorner, expected))}`);
console.log(`gap(endCorner→endcap)=${f(distToLine(endCorner, endVertex, endCapB))}`);
console.log(`gap(afterTop→endcap)=${f(distToLine(afterTop, endVertex, endCapB))}`);
console.log(`gap(simpleEnd→endcap)=${f(distToLine(simpleEnd, endVertex, endCapB))}`);
console.log(`gap(expected→endcap)=${f(distToLine(expected, endVertex, endCapB))}`);
console.log(`cut[topCount-2..topCount+1]:`);
for (let i = topCount - 2; i <= topCount + 1; i++) {
  const q = cut[i]!;
  console.log(
    `  [${i}] ${f(q.x)},${f(q.y)} gap=${f(distToLine(q, endVertex, endCapB))}`,
  );
}
