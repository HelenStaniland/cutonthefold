/**
 * Dump net roles around waist end (front, pocket none).
 * Run: npx tsx scripts/diag-waist-end-roles.ts
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
  },
  0,
  "shaped",
  body,
);
const sa = withSeamAllowance(draftTrousers(body, style), DEFAULT_SEAM_ALLOWANCE);
const p = sa.pieces.find((x) => x.name === "Trouser front")!;
const col = collapse(p.outline);
const cut = p.cuttingOutline!;
const idxs: number[] = [];
for (let i = 0; i < col.length; i++) {
  if (col[i]!.role === "waist") idxs.push(i);
}
const end = idxs[idxs.length - 1]!;
const f = (n: number) => n.toFixed(3);
console.log(`waist run ${idxs[0]}..${end}, n=${col.length}`);
for (let i = end - 2; i <= end + 5; i++) {
  const j = ((i % col.length) + col.length) % col.length;
  const n = col[j]!;
  const c = cut[j]!;
  console.log(
    `  [${j}] role=${n.role} net=${f(n.at.x)},${f(n.at.y)} cut=${f(c.x)},${f(c.y)}`,
  );
}
