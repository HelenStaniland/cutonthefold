/** Inseam length breakdown. Run: npx tsx scripts/diag-inseam-delta.ts */
import { applyEase, type OutlinePoint, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { polylineLength } from "../lib/geometry/curves";
import {
  draftTrouserBack,
  draftTrouserFront,
  trouserBackPoints,
  withWaistband,
  DEFAULT_CROTCH_ARRIVAL_ANGLE,
  WAISTLINE_CURVE_FRONT,
  DEFAULT_FRONT_WAIST_INSET,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const style = withWaistband(
  {
    bottomWidth: 220,
    block: "classic",
    waistDrop: 0,
    crotchExtensionScale: 0.5,
    crotchArrivalAngle: DEFAULT_CROTCH_ARRIVAL_ANGLE,
    waistlineCurveFront: WAISTLINE_CURVE_FRONT,
    frontWaistInset: DEFAULT_FRONT_WAIST_INSET,
  },
  0,
  "darted",
  body,
);
const b = trouserBackPoints(body, style);
const front = draftTrouserFront(body, style);
const back = draftTrouserBack(body, style);

function rolePts(piece: { outline: OutlinePoint[] }, role: string): Point[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at);
}

const fIn = rolePts(front, "inseam");
const bIn = rolePts(back, "inseam");
// Back without last point if it's p23 (the step end)
const bInLegOnly = bIn.filter(
  (p) => Math.hypot(p.x - b.p23.x, p.y - b.p23.y) > 0.05,
);
console.log("front inseam pts", fIn.length, "len", polylineLength(fIn).toFixed(3));
console.log("back inseam pts", bIn.length, "len", polylineLength(bIn).toFixed(3));
console.log("back without p23", bInLegOnly.length, "len", polylineLength(bInLegOnly).toFixed(3));
console.log("step p24→p23", Math.hypot(b.p23.x - b.p24.x, b.p23.y - b.p24.y));
console.log("delta full", (polylineLength(bIn) - polylineLength(fIn)).toFixed(3));
console.log("delta without step", (polylineLength(bInLegOnly) - polylineLength(fIn)).toFixed(3));
