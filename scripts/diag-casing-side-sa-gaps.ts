/**
 * Sample perpendicular cut↔net gaps along casing side walls (CF/CB + side).
 * Run: npx tsx scripts/diag-casing-side-sa-gaps.ts
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
  if (idxs.length === 0) return null;
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
    const t = unit(
      waist[i + 1]!.x - waist[i]!.x,
      waist[i + 1]!.y - waist[i]!.y,
    );
    const n = clockwise ? { x: t.y, y: -t.x } : { x: -t.y, y: t.x };
    nx += n.x;
    ny += n.y;
  }
  const u = unit(nx, ny);
  const mid = waist[Math.floor(waist.length / 2)]!;
  if (mid.y + u.y * 10 > mid.y + 0.5) return { x: -u.x, y: -u.y };
  return u;
}

/** Perp distance from point to infinite line through a→b. */
function distToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

function sampleSeg(a: Point, b: Point, n: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function resolveCargo(body: BodyMeasurements): TrouserFrontStyle {
  const s = CARGO_TROUSER_STYLE;
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    frontWaistInset: 0,
    waistTaper: 0,
    pocketFront: "slant",
  };
  return withWaistband(base, 0, "shaped", body);
}

const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
const style = resolveCargo(body);
const net = draftTrousers(body, style);
const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);

for (const w of [25, 38, 50] as const) {
  const d = resolveCasingDepths(w);
  const cased = applyTrouserWaistCasingToPattern(sa, d);
  console.log(`\n=== Helen Cargo w${w} totalExt=${d.totalExtension} ===`);
  for (const name of ["Trouser front", "Trouser back"] as const) {
    const p = cased.pieces.find((x) => x.name === name)!;
    const col = collapse(p.outline);
    const run = findWaistRun(col)!;
    const cut = p.cuttingOutline!;
    const waist: Point[] = [];
    for (let i = run.start; i <= run.end; i++) waist.push(col[i]!.at);
    const clockwise = signedArea(col) > 0;
    const up = waistUp(waist, clockwise);
    const topCount = waist.length;
    const startCorner = cut[0]!;
    const endCorner = cut[topCount - 1]!;
    // CF/CB wall: last cut point before closing to startCorner is typically
    // the waist-level SA (appended when run.start===0).
    const cfWaistSa = cut[cut.length - 1]!;
    const cfNetA = col[((run.start - 1) % col.length + col.length) % col.length]!.at;
    const cfNetB = waist[0]!;
    const sideNetA = waist[waist.length - 1]!;
    const sideNetB = col[(run.end + 1) % col.length]!.at;

    const cfGaps = sampleSeg(cfWaistSa, startCorner, 8).map((q) =>
      distToLine(q, cfNetA, cfNetB),
    );
    // Side wall: endCorner → first cut after top (≈ oldCut[run.end+1])
    const afterTop = cut[topCount]!;
    const sideGaps = sampleSeg(endCorner, afterTop, 8).map((q) =>
      distToLine(q, sideNetA, sideNetB),
    );
    const midTop = cut[Math.floor(topCount / 2)]!;
    const midNet = waist[Math.floor(waist.length / 2)]!;
    const topGap =
      (midTop.x - midNet.x) * up.x + (midTop.y - midNet.y) * up.y;

    const f = (n: number) => n.toFixed(3);
    console.log(
      `  ${name}: topGap=${f(topGap)} ` +
        `CF/CB gaps [${cfGaps.map(f).join(", ")}] ` +
        `side gaps [${sideGaps.map(f).join(", ")}]`,
    );
    console.log(
      `    startCorner=${f(startCorner.x)},${f(startCorner.y)} ` +
        `endCorner=${f(endCorner.x)},${f(endCorner.y)} ` +
        `cfWaistSa=${f(cfWaistSa.x)},${f(cfWaistSa.y)}`,
    );
  }
}
