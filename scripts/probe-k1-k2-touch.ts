/**
 * Probe: with k1 fixed at 1, can any k2 meet touch ≤ 0.5 mm?
 */
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { cubicBezier } from "../lib/geometry/curves";
import {
  frontCrotchExtension,
  frontCrotchTouch,
  trouserFrontPoints,
  withWaistband,
} from "../lib/patterns/trouserBlock";

function crotchGuide45(corner: Point, touch: number): Point {
  const c = Math.SQRT1_2;
  return { x: corner.x - touch * c, y: corner.y - touch * c };
}

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
    crotchDeparture: 0,
  },
  0,
  "darted",
  body,
);
const f = trouserFrontPoints(body, style);
const P0: Point = { x: -Math.abs(f.p5.x), y: 0 };
const P3 = f.p9;
const drop = P3.y - P0.y;
const chord = Math.hypot(P3.x - P0.x, P3.y - P0.y);
const extension = frontCrotchExtension(body.hip, 1);
const touch = frontCrotchTouch(body.hip);
const touchPt = crotchGuide45(f.p5, touch);
const theta = (45 * Math.PI) / 180;
const dir = { x: -Math.cos(theta), y: Math.sin(theta) };

function miss(k1: number, k2: number): number {
  const d1 = k1 * drop;
  const d2 = k2 * chord;
  const P1 = { x: P0.x, y: P0.y + d1 };
  const P2 = { x: P3.x - d2 * dir.x, y: P3.y - d2 * dir.y };
  const curve = cubicBezier(P0, P1, P2, P3, 64);
  let best = Infinity;
  for (const p of curve) {
    const d = Math.hypot(p.x - touchPt.x, p.y - touchPt.y);
    if (d < best) best = d;
  }
  return best;
}

console.log({ drop, chord, extension, touch, P0, P3, touchPt });

let best = { k1: 0, k2: 0, m: Infinity };
for (let i = 0; i <= 50; i++) {
  const k1 = 0.1 + (i / 50) * 0.9;
  for (let j = 0; j <= 80; j++) {
    const k2 = 0.05 + (j / 80) * 1.5;
    const m = miss(k1, k2);
    if (m < best.m) best = { k1, k2, m };
  }
}
console.log("best 2D in k1≤1:", best);

let bestK2 = { k2: 0, m: Infinity };
for (let j = 0; j <= 200; j++) {
  const k2 = 0.02 + (j / 200) * 2.5;
  const m = miss(1, k2);
  if (m < bestK2.m) bestK2 = { k2, m };
}
console.log("best k2 at k1=1:", bestK2);

// Old unconstrained
let bestOld = { k: 0, m: Infinity };
for (let i = 0; i <= 80; i++) {
  const k = 0.15 + (i / 80) * 1.85;
  const k1 = k;
  const k2 = (k * extension) / chord;
  const m = miss(k1, k2);
  if (m < bestOld.m) bestOld = { k, m };
}
console.log("old linked (k1=k, k2=k*ext/chord):", bestOld, "k2=", (bestOld.k * extension) / chord);

// cleo-like ratio
let bestIz = { k1: 0, k2: 0, m: Infinity };
for (let i = 0; i <= 50; i++) {
  const k1 = 0.1 + (i / 50) * 0.9;
  const k2 = k1 * (0.34 / 0.84);
  const m = miss(k1, k2);
  if (m < bestIz.m) bestIz = { k1, k2, m };
}
console.log("Cleo ratio k2/k1=0.34/0.84:", bestIz);

// Also check: is crotchGuide45 exported?
