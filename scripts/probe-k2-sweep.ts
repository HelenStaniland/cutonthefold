import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { cubicBezier } from "../lib/geometry/curves";
import {
  frontCrotchTouch,
  trouserFrontPoints,
  withWaistband,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const style = withWaistband(
  {
    bottomWidth: 220,
    block: "classic",
    waistDrop: 25,
    crotchExtensionScale: 1,
    crotchArrivalAngle: 45,
    waistlineCurveFront: 0,
    frontWaistInset: 10,
    crotchStraightRun: 0,
  },
  0,
  "darted",
  body,
);
const f = trouserFrontPoints(body, style);
const P0 = { x: -Math.abs(f.p5.x), y: 0 };
const P3 = f.p9;
const drop = P3.y - P0.y;
const chord = Math.hypot(P3.x - P0.x, P3.y - P0.y);
const touch = frontCrotchTouch(body.hip);
const c = Math.SQRT1_2;
const touchPt = { x: f.p5.x - touch * c, y: f.p5.y - touch * c };

function miss(
  k1: number,
  k2: number,
  ang: number,
): number {
  const th = (ang * Math.PI) / 180;
  const dir = { x: -Math.cos(th), y: Math.sin(th) };
  const d1 = k1 * drop;
  const d2 = k2 * chord;
  const P1 = { x: P0.x, y: P0.y + d1 };
  const P2 = { x: P3.x - d2 * dir.x, y: P3.y - d2 * dir.y };
  const curve = cubicBezier(P0, P1, P2, P3, 96);
  let best = Infinity;
  for (const p of curve) {
    best = Math.min(best, Math.hypot(p.x - touchPt.x, p.y - touchPt.y));
  }
  return best;
}

for (const k2 of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.5, 2, 3]) {
  console.log(`k1=1 k2=${k2} arr45`, miss(1, k2, 45).toFixed(3));
}
console.log("k1=0.84 k2=0.34 arr45", miss(0.84, 0.34, 45).toFixed(3));
console.log("k1=0.84 k2=0.34 arr32", miss(0.84, 0.34, 32).toFixed(3));

// hipline departure (default straightRun)
const P0h = { x: P0.x, y: f.p6.y };
const droph = P3.y - P0h.y;
const chordh = Math.hypot(P3.x - P0h.x, P3.y - P0h.y);
function missH(k1: number, k2: number, ang: number): number {
  const th = (ang * Math.PI) / 180;
  const dir = { x: -Math.cos(th), y: Math.sin(th) };
  const d1 = k1 * droph;
  const d2 = k2 * chordh;
  const P1 = { x: P0h.x, y: P0h.y + d1 };
  const P2 = { x: P3.x - d2 * dir.x, y: P3.y - d2 * dir.y };
  const curve = cubicBezier(P0h, P1, P2, P3, 96);
  let best = Infinity;
  for (const p of curve) {
    best = Math.min(best, Math.hypot(p.x - touchPt.x, p.y - touchPt.y));
  }
  return best;
}
console.log("\nhipline drop", droph, "chord", chordh);
for (const k of [0.4, 0.55, 0.62, 0.7, 0.85, 1]) {
  const k2 = (k * 81.875) / chordh;
  console.log(
    `hipline s=${k} k2=${k2.toFixed(3)} arr14`,
    missH(k, k2, 14).toFixed(3),
  );
}
