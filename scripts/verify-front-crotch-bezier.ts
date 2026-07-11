/**
 * Report: front crotch cubic Bézier (updated for crotchStraightRun).
 * Run: npx tsx scripts/verify-front-crotch-bezier.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { catmullRomCentripetal } from "../lib/geometry/curves";
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

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function hausdorff(a: Point[], b: Point[]): number {
  const oneWay = (p: Point[], q: Point[]) => {
    let m = 0;
    for (const pt of p) {
      let best = Infinity;
      for (const qt of q) best = Math.min(best, dist(pt, qt));
      m = Math.max(m, best);
    }
    return m;
  };
  return Math.max(oneWay(a, b), oneWay(b, a));
}

function svgPath(pts: Point[]): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

function crotchOf(piece: ReturnType<typeof draftTrouserFront>): Point[] {
  return piece.outline.filter((o) => o.role === "crotch").map((o) => o.at);
}

function crotchGuide45(corner: Point, touch: number): Point {
  const c = Math.SQRT1_2;
  return { x: corner.x - touch * c, y: corner.y - touch * c };
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const H = body.hip;
const R = body.bodyRise;
const D = body.hipDepth;

const defaults: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
};

const f = trouserFrontPoints(body, defaults);
const scale = resolveCrotchExtensionScale(defaults);
const touch = frontCrotchTouch(H) * scale;
const guide = crotchGuide45(f.p5, touch);
const oldCurve = catmullRomCentripetal([f.p9, guide, f.p6]);

const straightRun = resolveCrotchStraightRun(defaults, R, D, f.p10.y);
const extension = frontCrotchExtension(H, scale);
const arrival = resolveCrotchArrivalAngle(defaults);
const bez = frontCrotchCurve({
  p5: f.p5,
  p9: f.p9,
  p10: f.p10,
  fork: Math.abs(f.p5.x),
  R,
  straightRun,
  extension,
  arrivalAngleDeg: arrival,
  touch,
});

console.log(
  `Drafted hip ${H} mm; R=${R} D=${D}; default straightRun ${straightRun} mm (hipline)`,
);
console.log(`\n=== Defaults (straightRun=${straightRun} mm, arrival=${arrival}°) ===`);
console.log(`solved k = ${bez.k.toFixed(4)}`);
console.log(`touch miss = ${bez.touchMiss.toFixed(3)} mm`);
console.log(
  `max Hausdorff vs old Catmull = ${hausdorff(bez.points, oldCurve).toFixed(3)} mm`,
);

const n = bez.points.length;
const nearP0 = bez.points[n - 2]!;
const atP0 = bez.points[n - 1]!;
const fromP0 = { x: nearP0.x - atP0.x, y: nearP0.y - atP0.y };
const leaveAngleFromVertical =
  (Math.atan2(fromP0.x, fromP0.y) * 180) / Math.PI;
console.log(
  `departure leave from vertical: ${leaveAngleFromVertical.toFixed(2)}° (want ~0)`,
);
console.log(
  `P0=(${bez.P0.x.toFixed(2)}, ${bez.P0.y.toFixed(2)}) p6=(${f.p6.x.toFixed(2)}, ${f.p6.y.toFixed(2)})`,
);

console.log("\n=== Arrival-angle scan (defaults otherwise) ===");
for (const ang of [8, 10, 12, 14, 16, 18, 20, 24, 28, 32]) {
  const b = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    p10: f.p10,
    fork: Math.abs(f.p5.x),
    R,
    straightRun,
    extension,
    arrivalAngleDeg: ang,
    touch,
  });
  console.log(
    `  ${ang}°  k=${b.k.toFixed(3)}  miss=${b.touchMiss.toFixed(3)}  Hausdorff=${hausdorff(b.points, oldCurve).toFixed(3)} mm`,
  );
}

{
  let worst = 0;
  let at: Point = bez.points[0]!;
  for (const p of bez.points) {
    let best = Infinity;
    for (const q of oldCurve) best = Math.min(best, dist(p, q));
    if (best > worst) {
      worst = best;
      at = p;
    }
  }
  console.log(
    `\nWorst new→old gap ${worst.toFixed(3)} mm at (${at.x.toFixed(1)}, ${at.y.toFixed(1)})`,
  );
}

// Izzy: ~40 mm straight from top + short extension + steeper arrival.
const izzy: TrouserFrontStyle = {
  ...defaults,
  crotchExtensionScale: 0.5,
  crotchStraightRun: 40,
  crotchArrivalAngle: 32,
};
const fI = trouserFrontPoints(body, izzy);
const sI = resolveCrotchExtensionScale(izzy);
const touchI = frontCrotchTouch(H) * sI;
const runI = resolveCrotchStraightRun(izzy, R, D, fI.p10.y);
const extI = frontCrotchExtension(H, sI);
const arrI = resolveCrotchArrivalAngle(izzy);
const bezI = frontCrotchCurve({
  p5: fI.p5,
  p9: fI.p9,
  p10: fI.p10,
  fork: Math.abs(fI.p5.x),
  R,
  straightRun: runI,
  extension: extI,
  arrivalAngleDeg: arrI,
  touch: touchI,
});
console.log(`\n=== Izzy-ish (ext 0.5, straightRun ${runI}, arr ${arrI}°) ===`);
console.log(`solved k = ${bezI.k.toFixed(4)}`);
console.log(`touch miss = ${bezI.touchMiss.toFixed(3)} mm`);

function writeSvg(pts: Point[], label: string, filename: string) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs) - 15;
  const minY = Math.min(...ys) - 15;
  const w = Math.max(...xs) - minX + 15;
  const h = Math.max(...ys) - minY + 40;
  const sh = (p: Point) => ({ x: p.x - minX, y: p.y - minY });
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">`,
    `  <rect width="100%" height="100%" fill="#faf8f5"/>`,
    `  <path d="${svgPath(pts.map(sh))}" fill="none" stroke="#c44" stroke-width="2"/>`,
    `  <text x="8" y="16" font-size="12" fill="#333">${label}</text>`,
    `</svg>`,
  ].join("\n");
  writeFileSync(join(process.cwd(), "scripts", filename), svg);
  console.log(`Wrote scripts/${filename}`);
}

const pieceDef = draftTrouserFront(body, defaults);
const pieceIzzy = draftTrouserFront(body, izzy);
writeSvg(
  crotchOf(pieceDef),
  "front crotch defaults (Bézier)",
  "front-crotch-bezier-defaults.svg",
);
writeSvg(
  crotchOf(pieceIzzy),
  "front crotch Izzy-ish (0.5 / 40 / 32°)",
  "front-crotch-bezier-izzy.svg",
);

{
  const all = [...oldCurve, ...bez.points];
  const minX = Math.min(...all.map((p) => p.x)) - 15;
  const minY = Math.min(...all.map((p) => p.y)) - 15;
  const w = Math.max(...all.map((p) => p.x)) - minX + 15;
  const h = Math.max(...all.map((p) => p.y)) - minY + 45;
  const sh = (p: Point) => ({ x: p.x - minX, y: p.y - minY });
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">`,
    `  <rect width="100%" height="100%" fill="#faf8f5"/>`,
    `  <path d="${svgPath(oldCurve.map(sh))}" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="6 4"/>`,
    `  <path d="${svgPath(bez.points.map(sh))}" fill="none" stroke="#c44" stroke-width="2"/>`,
    `  <text x="8" y="14" font-size="12" fill="#999">old Catmull (dashed)</text>`,
    `  <text x="8" y="30" font-size="12" fill="#c44">new Bézier defaults</text>`,
    `</svg>`,
  ].join("\n");
  writeFileSync(
    join(process.cwd(), "scripts", "front-crotch-bezier-vs-catmull-defaults.svg"),
    svg,
  );
  console.log("Wrote scripts/front-crotch-bezier-vs-catmull-defaults.svg");
}
