/**
 * Run: npx tsx scripts/debug-back-waist-crotch.ts
 * Verify Aldrich p46–47 back waist slope and crotch guide direction.
 */
import { applyEase } from "../lib/types/measurements";
import { DEFAULT_FIT, easeForFit } from "../lib/pattern/fitPresets";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrousers,
  trouserBackPoints,
  withWaistband,
} from "../lib/patterns/trouserBlock";
import { catmullRom, quadBezier } from "../lib/geometry/curves";
import type { Point } from "../lib/types/measurements";

function turnAngleDeg(a: Point, b: Point, c: Point): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const m1 = Math.hypot(v1.x, v1.y);
  const m2 = Math.hypot(v2.x, v2.y);
  if (m1 < 1e-9 || m2 < 1e-9) return 0;
  const dot = (v1.x * v2.x + v1.y * v2.y) / (m1 * m2);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

function nearestIndex(poly: Point[], target: Point): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = Math.hypot(poly[i].x - target.x, poly[i].y - target.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function checkBlock(block: "classic" | "production") {
  const body = applyEase(bodyForSizeCode("12")!, easeForFit(DEFAULT_FIT)!);
  const style = withWaistband({ bottomWidth: 220, block }, 40, "shaped", body);
  const b = trouserBackPoints(body, style);
  const { p16, p18, p19, p21, p22, p24, guide } = b;

  console.log(`\n=== ${block} block ===`);
  console.log("Back waist (Aldrich 18→20→21):");
  console.log(`  p18.x=${p18.x.toFixed(1)}  p21.x=${p21.x.toFixed(1)}  (p21 inboard/CB: ${p21.x < p18.x})`);
  console.log(`  p21.y=${p21.y.toFixed(1)}  (above waist y=0: ${p21.y < 0})`);
  console.log(`  p22 slope 21→22: dy=${(p22.y - p21.y).toFixed(1)} dx=${(p22.x - p21.x).toFixed(1)} (down to side: ${p22.y > p21.y && p22.x > p21.x})`);

  const ua = { x: p19.x - p16.x, y: p19.y - p16.y };
  const ub = { x: p24.x - p16.x, y: p24.y - p16.y };
  const mid = { x: (p19.x + p24.x) / 2, y: (p19.y + p24.y) / 2 };
  const toMid = { x: mid.x - p16.x, y: mid.y - p16.y };
  const toGuide = { x: guide.x - p16.x, y: guide.y - p16.y };
  const crossBis = ua.x * ub.y - ua.y * ub.x;
  const crossGuide = ua.x * toGuide.y - ua.y * toGuide.x;
  console.log("Crotch guide from p16:");
  console.log(`  guide vs midpoint direction same sign as bisector interior: ${Math.sign(crossGuide) === Math.sign(crossBis) || crossBis === 0}`);

  const catmull = catmullRom([p24, guide, p19, p21]);
  const i19 = nearestIndex(catmull, p19);
  const turnCat = turnAngleDeg(catmull[i19 - 1], catmull[i19], catmull[i19 + 1]);
  console.log(`Catmull kink at p19: turn=${turnCat.toFixed(1)}° (dist to p19=${Math.hypot(catmull[i19].x - p19.x, catmull[i19].y - p19.y).toFixed(2)} mm)`);

  const split = [p21, p19, ...quadBezier(p19, guide, p24).slice(1)];
  const i19s = nearestIndex(split, p19);
  const turnSplit = turnAngleDeg(split[i19s - 1], split[i19s], split[i19s + 1]);
  console.log(`Split quad at p19: turn=${turnSplit.toFixed(1)}°`);

  draftTrousers(body, style);
  console.log("draftTrousers: OK");
}

for (const block of ["classic", "production"] as const) {
  checkBlock(block);
}
