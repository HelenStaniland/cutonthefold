/**
 * Throwaway diagnostic — waist nick / crossGap vs waistlineCurveFront.
 * Run: npx tsx scripts/diag-waist-nick.ts
 */
import { applyEase } from "../lib/types/measurements";
import type { Millimetres, Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserFront,
  frontCrotchCurve,
  frontCrotchExtension,
  frontCrotchTouch,
  resolveCrotchArrivalAngle,
  resolveCrotchExtensionScale,
  resolveCrotchStraightRun,
  trouserFrontPoints,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

/** Same as private clipPolylineBelowY in trouserBlock.ts — surface its crossGap. */
function clipPolylineBelowY(
  poly: Point[],
  yCut: Millimetres,
  top: Point,
): { points: Point[]; crossGap: Millimetres } {
  if (poly.length === 0) {
    return { points: [{ ...top }], crossGap: 0 };
  }

  const kept: Point[] = [];
  let natural: Point | null = null;

  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    if (p.y >= yCut - 1e-9) {
      kept.push({ ...p });
      continue;
    }
    if (kept.length === 0) {
      break;
    }
    const a = kept[kept.length - 1]!;
    if (Math.abs(p.y - a.y) < 1e-12) {
      natural = { x: a.x, y: yCut };
    } else {
      const t = (yCut - a.y) / (p.y - a.y);
      natural = { x: a.x + t * (p.x - a.x), y: yCut };
    }
    break;
  }

  if (kept.length === 0) {
    return { points: [{ ...top }], crossGap: 0 };
  }

  if (!natural) {
    natural = kept[kept.length - 1]!;
  }
  const crossGap = Math.hypot(natural.x - top.x, natural.y - top.y);
  return { points: kept, crossGap };
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

const curves = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30];

const base: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
  waistbandMode: "darted",
  waistReduction: 0,
  crotchExtensionScale: 1.0,
  frontWaistInset: 10,
};

const f0 = trouserFrontPoints(body, base);
const fork = Math.abs(f0.p5.x);
console.log(`-fork = ${(-fork).toFixed(6)}`);
console.log("waistCurve\twr.cf.x\twr.cf.y\tP0.x\tP0.y\tcrossGap");

for (const waistCurve of curves) {
  const style: TrouserFrontStyle = {
    ...base,
    waistlineCurveFront: waistCurve,
  };
  const piece = draftTrouserFront(body, style);
  const wrCf = piece.outline.find((o) => o.role === "waist")!.at;

  const f = trouserFrontPoints(body, style);
  const H = body.hip;
  const R = body.bodyRise;
  const D = body.hipDepth;
  const scale = resolveCrotchExtensionScale(style);
  const touch = frontCrotchTouch(H) * scale;
  const straightRun = resolveCrotchStraightRun(style, R, D, f.p10.y);
  const frontCrotch = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    p10: f.p10,
    fork: Math.abs(f.p5.x),
    R,
    straightRun,
    extension: frontCrotchExtension(H, scale),
    arrivalAngleDeg: resolveCrotchArrivalAngle(style),
    touch,
  });
  const P0 = frontCrotch.P0;
  const crotchCurve = frontCrotch.points;
  const fullToTop =
    Math.hypot(P0.x - f.p10.x, P0.y - f.p10.y) < 0.5
      ? crotchCurve
      : [...crotchCurve, f.p10];
  const { crossGap } = clipPolylineBelowY(fullToTop, wrCf.y, wrCf);

  console.log(
    [
      waistCurve,
      wrCf.x.toFixed(6),
      wrCf.y.toFixed(6),
      P0.x.toFixed(6),
      P0.y.toFixed(6),
      crossGap.toFixed(6),
    ].join("\t"),
  );
}
