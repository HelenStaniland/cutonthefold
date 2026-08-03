/**
 * Dump pocket-on casing cut near waist end.
 * Run: npx tsx scripts/diag-casing-pocket-end.ts
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

const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
const style = withWaistband(
  {
    bottomWidth: CARGO_TROUSER_STYLE.legBottomWidth,
    block: blockFromWaistDrop(CARGO_TROUSER_STYLE.waistDrop),
    waistDrop: CARGO_TROUSER_STYLE.waistDrop,
    backHemShape: CARGO_TROUSER_STYLE.backHemShape,
    frontWaistInset: 0,
    waistTaper: 0,
    pocketFront: "slant",
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
const cut = p.cuttingOutline!;
const idxs: number[] = [];
for (let i = 0; i < col.length; i++) {
  if (col[i]!.role === "waist") idxs.push(i);
}
const end = idxs[idxs.length - 1]!;
const f = (n: number) => n.toFixed(3);
console.log(`waist ${idxs[0]}..${end} waistLen=${end - idxs[0] + 1} cutLen=${cut.length}`);
for (let i = end - 2; i <= end + 4; i++) {
  const n = col[i]!;
  console.log(`  net[${i}] ${n.role} ${f(n.at.x)},${f(n.at.y)}`);
}
console.log("cut around waistLen:");
const wl = end - idxs[0] + 1;
for (let i = wl - 3; i <= wl + 3; i++) {
  console.log(`  cut[${i}] ${f(cut[i]!.x)},${f(cut[i]!.y)}`);
}
