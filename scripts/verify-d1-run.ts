/**
 * Acceptance for d1 = k·(p9.y − P0.y): angles, touch, default delta vs HEAD formula.
 * Run: npx tsx scripts/verify-d1-run.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
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

function angleDeg(dx: number, dy: number): number {
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function rolePts(
  piece: ReturnType<typeof draftTrouserFront>,
  role: string,
): Point[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at);
}

function svgPath(pts: Point[]): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

/** Previous checked-in scale: max(20, R − P0.y). Same as p9.y−P0.y when p9.y===R. */
function frontCrotchCurveHeadFormula(args: {
  p5: Point;
  p9: Point;
  p10: Point;
  fork: number;
  R: number;
  straightRun: number;
  extension: number;
  arrivalAngleDeg: number;
  touch: number;
}): { points: Point[]; P0: Point; P1: Point; P2: Point; P3: Point; k: number; touchMiss: number } {
  const { p5, p9, p10, fork, R, straightRun, extension, arrivalAngleDeg, touch } =
    args;
  const P0: Point = { x: -fork, y: p10.y + straightRun };
  const P3 = p9;
  const dropToCrotch = Math.max(20, R - P0.y);
  const theta = (arrivalAngleDeg * Math.PI) / 180;
  const dir = { x: -Math.cos(theta), y: Math.sin(theta) };
  const c = Math.SQRT1_2;
  const touchPt = { x: p5.x - touch * c, y: p5.y - touch * c };

  const handlesForK = (k: number) => {
    const d1 = k * dropToCrotch;
    const d2 = k * extension;
    return {
      P1: { x: P0.x, y: P0.y + d1 },
      P2: { x: P3.x - d2 * dir.x, y: P3.y - d2 * dir.y },
    };
  };
  const miss = (k: number) => {
    const { P1, P2 } = handlesForK(k);
    // coarse sample
    let best = Infinity;
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const u = 1 - t;
      const p = {
        x:
          u * u * u * P0.x +
          3 * u * u * t * P1.x +
          3 * u * t * t * P2.x +
          t * t * t * P3.x,
        y:
          u * u * u * P0.y +
          3 * u * u * t * P1.y +
          3 * u * t * t * P2.y +
          t * t * t * P3.y,
      };
      best = Math.min(best, Math.hypot(p.x - touchPt.x, p.y - touchPt.y));
    }
    return best;
  };
  let bestK = 0.55;
  let bestMiss = miss(bestK);
  for (let i = 0; i <= 40; i++) {
    const k = 0.15 + (i / 40) * 1.85;
    const m = miss(k);
    if (m < bestMiss) {
      bestMiss = m;
      bestK = k;
    }
  }
  let lo = Math.max(0.05, bestK - 0.08);
  let hi = bestK + 0.08;
  for (let iter = 0; iter < 24; iter++) {
    const mid = (lo + hi) / 2;
    if (miss(mid - 1e-3) < miss(mid + 1e-3)) hi = mid;
    else lo = mid;
  }
  const k = (lo + hi) / 2;
  const { P1, P2 } = handlesForK(k);
  return { points: [], P0, P1, P2, P3, k, touchMiss: miss(k) };
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

const cds = [0, 30, 60, 90, 120, 180];

console.log("=== Bézier departure (toward waist = outline convention) ===");
console.log("CD\trun\td1\tk\ttouchMiss\tdepartDeg");

for (const cd of cds) {
  const style: TrouserFrontStyle = {
    bottomWidth: 220,
    block: "classic",
    waistDrop: 25,
    waistbandMode: "darted",
    waistReduction: 0,
    crotchExtensionScale: 1.0,
    frontWaistInset: 10,
    crotchStraightRun: cd,
    crotchArrivalAngle: 5,
    waistbandDepth: 0,
    waistlineCurveFront: 0,
  };
  const f = trouserFrontPoints(body, style);
  const scale = resolveCrotchExtensionScale(style);
  const R = f.p9.y; // dropped rise
  const D = f.p6.y;
  const straightRun = resolveCrotchStraightRun(style, R, D, f.p10.y);
  const bez = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    p10: f.p10,
    fork: Math.abs(f.p5.x),
    R,
    straightRun,
    extension: frontCrotchExtension(body.hip, scale),
    arrivalAngleDeg: resolveCrotchArrivalAngle(style),
    touch: frontCrotchTouch(body.hip) * scale,
  });
  const run = bez.P3.y - bez.P0.y;
  const d1 = bez.P1.y - bez.P0.y;
  // Toward waist along CF: opposite of P1−P0
  const departDeg = angleDeg(bez.P0.x - bez.P1.x, bez.P0.y - bez.P1.y);
  console.log(
    [
      straightRun.toFixed(1),
      run.toFixed(2),
      d1.toFixed(2),
      bez.k.toFixed(4),
      bez.touchMiss.toFixed(4),
      departDeg.toFixed(2),
    ].join("\t"),
  );
}

{
  const defaults: TrouserFrontStyle = {
    bottomWidth: 220,
    block: "classic",
    waistDrop: 0,
  };
  const f = trouserFrontPoints(body, defaults);
  const scale = resolveCrotchExtensionScale(defaults);
  const R = f.p9.y;
  const D = f.p6.y;
  const straightRun = resolveCrotchStraightRun(defaults, R, D, f.p10.y);
  const args = {
    p5: f.p5,
    p9: f.p9,
    p10: f.p10,
    fork: Math.abs(f.p5.x),
    R,
    straightRun,
    extension: frontCrotchExtension(body.hip, scale),
    arrivalAngleDeg: resolveCrotchArrivalAngle(defaults),
    touch: frontCrotchTouch(body.hip) * scale,
  };
  const now = frontCrotchCurve(args);
  const head = frontCrotchCurveHeadFormula(args);
  const deltas = [
    Math.hypot(now.P0.x - head.P0.x, now.P0.y - head.P0.y),
    Math.hypot(now.P1.x - head.P1.x, now.P1.y - head.P1.y),
    Math.hypot(now.P2.x - head.P2.x, now.P2.y - head.P2.y),
    Math.hypot(now.P3.x - head.P3.x, now.P3.y - head.P3.y),
    Math.abs(now.k - head.k),
  ];
  const piece = draftTrouserFront(body, defaults);
  const pts = piece.outline.map((o) => o.at);
  console.log("\n=== Defaults vs previous dropToCrotch formula ===");
  console.log(`run=${now.P3.y - now.P0.y} R-P0.y=${R - now.P0.y}`);
  console.log(`max handle/endpoint delta: ${Math.max(...deltas).toFixed(9)}`);
  console.log(`k now=${now.k} head=${head.k}`);
  console.log(`touchMiss default=${now.touchMiss.toFixed(4)} mm`);
  console.log(`drafted outline points: ${pts.length}`);

  // CD=0 touch
  const style0: TrouserFrontStyle = {
    ...defaults,
    waistDrop: 25,
    crotchStraightRun: 0,
    frontWaistInset: 10,
    crotchArrivalAngle: 5,
    crotchExtensionScale: 1.0,
    waistbandDepth: 0,
  };
  const f0 = trouserFrontPoints(body, style0);
  const R0 = f0.p9.y;
  const D0 = f0.p6.y;
  const s0 = resolveCrotchExtensionScale(style0);
  const bez0 = frontCrotchCurve({
    p5: f0.p5,
    p9: f0.p9,
    p10: f0.p10,
    fork: Math.abs(f0.p5.x),
    R: R0,
    straightRun: resolveCrotchStraightRun(style0, R0, D0, f0.p10.y),
    extension: frontCrotchExtension(body.hip, s0),
    arrivalAngleDeg: resolveCrotchArrivalAngle(style0),
    touch: frontCrotchTouch(body.hip) * s0,
  });
  console.log(`touchMiss CD=0: ${bez0.touchMiss.toFixed(4)} mm`);
}

console.log("\n=== Outline waist-end tangent (NOT Bézier at P0) — nick metric ===");
console.log("CD\tFWC\toutlineDeg");
for (const cd of [0]) {
  for (const fwc of [0, 16, 30]) {
    const style: TrouserFrontStyle = {
      bottomWidth: 220,
      block: "classic",
      waistDrop: 25,
      waistbandMode: "darted",
      waistReduction: 0,
      crotchExtensionScale: 1.0,
      frontWaistInset: 10,
      crotchStraightRun: cd,
      crotchArrivalAngle: 5,
      waistbandDepth: 0,
      waistlineCurveFront: fwc,
    };
    const piece = draftTrouserFront(body, style);
    const crotchCf = [
      ...rolePts(piece, "crotch"),
      ...rolePts(piece, "centre-front"),
    ];
    const c0 = crotchCf[crotchCf.length - 2]!;
    const c1 = crotchCf[crotchCf.length - 1]!;
    console.log(
      `${cd}\t${fwc}\t${angleDeg(c1.x - c0.x, c1.y - c0.y).toFixed(2)}`,
    );
  }
}

function writeSvg(fwc: number, file: string) {
  const style: TrouserFrontStyle = {
    bottomWidth: 220,
    block: "classic",
    waistDrop: 25,
    waistbandMode: "darted",
    waistReduction: 0,
    crotchExtensionScale: 1.0,
    frontWaistInset: 10,
    crotchStraightRun: 0,
    crotchArrivalAngle: 5,
    waistbandDepth: 0,
    waistlineCurveFront: fwc,
  };
  const piece = draftTrouserFront(body, style);
  const waist = rolePts(piece, "waist");
  const crotch = rolePts(piece, "crotch");
  const cf = rolePts(piece, "centre-front");
  const focus = [...waist.slice(0, 8), ...[...crotch, ...cf].slice(-12)];
  let fx0 = Infinity,
    fy0 = Infinity,
    fx1 = -Infinity,
    fy1 = -Infinity;
  for (const p of focus) {
    fx0 = Math.min(fx0, p.x);
    fy0 = Math.min(fy0, p.y);
    fx1 = Math.max(fx1, p.x);
    fy1 = Math.max(fy1, p.y);
  }
  const fpad = 40;
  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fx0 - fpad} ${fy0 - fpad} ${fx1 - fx0 + 2 * fpad} ${fy1 - fy0 + 2 * fpad}">
  <path d="${svgPath(waist)}" fill="none" stroke="#222" stroke-width="1.2"/>
  <path d="${svgPath([...crotch, ...cf])}" fill="none" stroke="#c45" stroke-width="1.5"/>
  <circle cx="${waist[0]!.x}" cy="${waist[0]!.y}" r="2" fill="#06c"/>
</svg>`;
  writeFileSync(join("scripts", file), svg);
  console.log(`wrote scripts/${file}`);
}

console.log("\n=== SVGs ===");
writeSvg(0, "d1-run-cd0-fwc0.svg");
writeSvg(16, "d1-run-cd0-fwc16.svg");
writeSvg(30, "d1-run-cd0-fwc30.svg");
