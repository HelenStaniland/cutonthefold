/**
 * Acceptance: CF join wr.cf→P0, no snap. Run: npx tsx scripts/verify-cf-join-no-snap.ts
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
import { cubicBezier } from "../lib/geometry/curves";

function angleDeg(dx: number, dy: number): number {
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function rolePts(
  piece: ReturnType<typeof draftTrouserFront>,
  role: string,
): Point[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at);
}

function crotchCf(piece: ReturnType<typeof draftTrouserFront>): Point[] {
  return [...rolePts(piece, "crotch"), ...rolePts(piece, "centre-front")];
}

function svgPath(pts: Point[]): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

function countNear(pts: Point[], target: Point, tol = 0.05): number {
  return pts.filter((p) => dist(p, target) < tol).length;
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

console.log("=== CD=0 inset=10 band off — tangents ===");
console.log("FWC\twaistEndDeg\tpostP0Deg\tP0count\tjoinLen");

for (const fwc of [0, 16, 30]) {
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
  const f = trouserFrontPoints(body, style);
  const scale = resolveCrotchExtensionScale(style);
  const R = f.p9.y;
  const D = f.p6.y;
  const bez = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    p10: f.p10,
    fork: Math.abs(f.p5.x),
    R,
    straightRun: resolveCrotchStraightRun(style, R, D, f.p10.y),
    extension: frontCrotchExtension(body.hip, scale),
    arrivalAngleDeg: resolveCrotchArrivalAngle(style),
    touch: frontCrotchTouch(body.hip) * scale,
  });
  const P0 = bez.P0;
  const path = crotchCf(piece);
  const waist = rolePts(piece, "waist");
  const wrCf = waist[0]!;

  // Path is tip→…→P0→wr.cf (or tip→…→wr.cf if coincident).
  const last = path[path.length - 1]!;
  const prev = path[path.length - 2]!;
  const waistEndDeg = angleDeg(last.x - prev.x, last.y - prev.y);

  // Find P0 index (exact once).
  let iP0 = -1;
  for (let i = 0; i < path.length; i++) {
    if (dist(path[i]!, P0) < 0.05) {
      iP0 = i;
      break;
    }
  }
  let postP0Deg = NaN;
  if (iP0 > 0) {
    const a = path[iP0 - 1]!;
    const b = path[iP0]!;
    // Toward waist along CF at P0: from below up to P0.
    postP0Deg = angleDeg(b.x - a.x, b.y - a.y);
  }
  const p0count = countNear(path, P0);
  const joinLen = dist(P0, wrCf);

  console.log(
    [
      fwc,
      waistEndDeg.toFixed(2),
      postP0Deg.toFixed(2),
      p0count,
      joinLen.toFixed(3),
      `wr.cf=(${wrCf.x.toFixed(2)},${wrCf.y.toFixed(2)})`,
      `P0=(${P0.x.toFixed(2)},${P0.y.toFixed(2)})`,
      `end≈wr.cf ${dist(last, wrCf).toFixed(4)}`,
    ].join("\t"),
  );
}

console.log("\n=== inset=0 CD=0 FWC=16 — continuous CF ===");
{
  const style: TrouserFrontStyle = {
    bottomWidth: 220,
    block: "classic",
    waistDrop: 25,
    waistbandMode: "darted",
    waistReduction: 0,
    crotchExtensionScale: 1.0,
    frontWaistInset: 0,
    crotchStraightRun: 0,
    crotchArrivalAngle: 5,
    waistbandDepth: 0,
    waistlineCurveFront: 16,
  };
  const piece = draftTrouserFront(body, style);
  const f = trouserFrontPoints(body, style);
  const scale = resolveCrotchExtensionScale(style);
  const R = f.p9.y;
  const D = f.p6.y;
  const bez = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    p10: f.p10,
    fork: Math.abs(f.p5.x),
    R,
    straightRun: resolveCrotchStraightRun(style, R, D, f.p10.y),
    extension: frontCrotchExtension(body.hip, scale),
    arrivalAngleDeg: resolveCrotchArrivalAngle(style),
    touch: frontCrotchTouch(body.hip) * scale,
  });
  const path = crotchCf(piece);
  const wrCf = rolePts(piece, "waist")[0]!;
  const P0 = bez.P0;
  const iP0 = path.findIndex((p) => dist(p, P0) < 0.05);
  const joinLen = dist(P0, wrCf);
  // Corner at P0: angle between join and curve
  let corner = NaN;
  if (iP0 > 0 && iP0 < path.length - 1) {
    const a = path[iP0 - 1]!;
    const b = path[iP0]!;
    const c = path[iP0 + 1]!;
    const a1 = angleDeg(b.x - a.x, b.y - a.y);
    const a2 = angleDeg(c.x - b.x, c.y - b.y);
    corner = ((a2 - a1 + 540) % 360) - 180;
  }
  console.log(
    `P0count=${countNear(path, P0)} joinLen=${joinLen.toFixed(3)} Δx=${(P0.x - wrCf.x).toFixed(4)} cornerTurn=${corner.toFixed(2)}°`,
  );
  console.log(
    `same x (collinear CF): ${Math.abs(P0.x - wrCf.x) < 0.01}; hasExplicitJoin=${joinLen >= 0.01}`,
  );
}

console.log("\n=== Defaults vs tip→P0→wr.cf (pre-snap-branch geometry) ===");
{
  const defaults: TrouserFrontStyle = {
    bottomWidth: 220,
    block: "classic",
    waistDrop: 0,
  };
  const piece = draftTrouserFront(body, defaults);
  const f = trouserFrontPoints(body, defaults);
  const scale = resolveCrotchExtensionScale(defaults);
  const R = f.p9.y;
  const D = f.p6.y;
  const bez = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    p10: f.p10,
    fork: Math.abs(f.p5.x),
    R,
    straightRun: resolveCrotchStraightRun(defaults, R, D, f.p10.y),
    extension: frontCrotchExtension(body.hip, scale),
    arrivalAngleDeg: resolveCrotchArrivalAngle(defaults),
    touch: frontCrotchTouch(body.hip) * scale,
  });
  const expected = [
    ...cubicBezier(bez.P0, bez.P1, bez.P2, bez.P3, 48).reverse(),
    rolePts(piece, "waist")[0]!,
  ];
  // Dedupe if coincident
  const path = crotchCf(piece);
  let maxDelta = 0;
  const n = Math.min(path.length, expected.length);
  if (path.length !== expected.length) {
    console.log(
      `length mismatch path=${path.length} expected=${expected.length}`,
    );
  }
  for (let i = 0; i < n; i++) {
    maxDelta = Math.max(maxDelta, dist(path[i]!, expected[i]!));
  }
  // Also Hausdorff
  const oneWay = (a: Point[], b: Point[]) => {
    let m = 0;
    for (const p of a) {
      let best = Infinity;
      for (const q of b) best = Math.min(best, dist(p, q));
      m = Math.max(m, best);
    }
    return m;
  };
  const hd = Math.max(oneWay(path, expected), oneWay(expected, path));
  console.log(`max paired delta: ${maxDelta.toFixed(9)} mm`);
  console.log(`Hausdorff: ${hd.toFixed(9)} mm`);
  console.log(`P0 count in outline: ${countNear(path, bez.P0)}`);
}

function writeSvg(
  style: TrouserFrontStyle,
  file: string,
): void {
  const piece = draftTrouserFront(body, style);
  const waist = rolePts(piece, "waist");
  const path = crotchCf(piece);
  const f = trouserFrontPoints(body, style);
  const scale = resolveCrotchExtensionScale(style);
  const R = f.p9.y;
  const D = f.p6.y;
  const bez = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    p10: f.p10,
    fork: Math.abs(f.p5.x),
    R,
    straightRun: resolveCrotchStraightRun(style, R, D, f.p10.y),
    extension: frontCrotchExtension(body.hip, scale),
    arrivalAngleDeg: resolveCrotchArrivalAngle(style),
    touch: frontCrotchTouch(body.hip) * scale,
  });
  const focus = [...waist.slice(0, 6), ...path.slice(-16), bez.P0];
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
  const pad = 40;
  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fx0 - pad} ${fy0 - pad} ${fx1 - fx0 + 2 * pad} ${fy1 - fy0 + 2 * pad}">
  <path d="${svgPath(waist)}" fill="none" stroke="#222" stroke-width="1.2"/>
  <path d="${svgPath(path)}" fill="none" stroke="#c45" stroke-width="1.5"/>
  <circle cx="${bez.P0.x}" cy="${bez.P0.y}" r="2.5" fill="#0a0"/>
  <circle cx="${waist[0]!.x}" cy="${waist[0]!.y}" r="2" fill="#06c"/>
</svg>`;
  writeFileSync(join("scripts", file), svg);
  console.log(`wrote scripts/${file}`);
}

console.log("\n=== SVGs ===");
const base: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 25,
  waistbandMode: "darted",
  waistReduction: 0,
  crotchExtensionScale: 1.0,
  crotchStraightRun: 0,
  crotchArrivalAngle: 5,
  waistbandDepth: 0,
};
writeSvg({ ...base, frontWaistInset: 10, waistlineCurveFront: 0 }, "cf-join-cd0-fwc0.svg");
writeSvg({ ...base, frontWaistInset: 10, waistlineCurveFront: 16 }, "cf-join-cd0-fwc16.svg");
writeSvg({ ...base, frontWaistInset: 10, waistlineCurveFront: 30 }, "cf-join-cd0-fwc30.svg");
writeSvg({ ...base, frontWaistInset: 0, waistlineCurveFront: 16 }, "cf-join-cd0-inset0-fwc16.svg");
