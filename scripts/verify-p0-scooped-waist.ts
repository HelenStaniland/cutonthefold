/**
 * Acceptance: P0 anchored to scooped waist (wr.cf.y).
 * Run: npx tsx scripts/verify-p0-scooped-waist.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserFront,
  resolveCrotchStraightRun,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

function dist(a: Point, b: Point) {
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

function angleDeg(dx: number, dy: number) {
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function svgPath(pts: Point[]): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

console.log("=== CD=0 inset=10 band off — wr.cf vs P0 ===");
console.log("FWC\twr.cf\tP0\tΔy\tjoinDy");

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
  const wrCf = rolePts(piece, "waist")[0]!;
  const path = crotchCf(piece);
  const last = path[path.length - 1]!;
  const prev = path[path.length - 2]!;
  // P0 is the point on CF at fork x near wr.cf.y (join other end)
  // Path tip→…→P0→wr.cf, so prev of last if last≈wr.cf is P0; or last is P0 if coincident
  let P0: Point;
  let joinOther: Point;
  if (dist(last, wrCf) < 0.05) {
    P0 = prev;
    joinOther = last;
  } else {
    P0 = last;
    joinOther = wrCf;
  }
  // Prefer: find fork-line point at end of curve
  const forkX = -Math.abs(
    piece.outline.find((o) => o.role === "crotch")!.at.x > -50
      ? 115.833
      : 115.833,
  );
  // Find P0 as point with x≈-fork among last few
  for (let i = path.length - 1; i >= Math.max(0, path.length - 5); i--) {
    const p = path[i]!;
    if (Math.abs(p.x - wrCf.x) > 5) {
      P0 = p;
      break;
    }
  }
  if (dist(path[path.length - 1]!, wrCf) < 0.05) {
    // ends at wr.cf; P0 is previous
    P0 = path[path.length - 2]!;
  }
  const dy = P0.y - wrCf.y;
  console.log(
    `${fwc}\t(${wrCf.x.toFixed(3)},${wrCf.y.toFixed(3)})\t(${P0.x.toFixed(3)},${P0.y.toFixed(3)})\t${dy.toFixed(4)}\tjoin Δy=${(wrCf.y - P0.y).toFixed(4)}`,
  );
}

console.log("\n=== Departure tangent at CD=0,30,60,90 (FWC=16) ===");
for (const cd of [0, 30, 60, 90]) {
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
    waistlineCurveFront: 16,
  };
  const piece = draftTrouserFront(body, style);
  const path = crotchCf(piece);
  const wrCf = rolePts(piece, "waist")[0]!;
  // Find P0: last centre-front/crotch point on fork before wr.cf
  let iP0 = path.length - 1;
  if (dist(path[iP0]!, wrCf) < 0.05) iP0--;
  const P0 = path[iP0]!;
  const below = path[iP0 - 1]!;
  const deg = angleDeg(P0.x - below.x, P0.y - below.y);
  console.log(
    `CD=${cd}\tP0.y=${P0.y.toFixed(2)}\twr.cf.y=${wrCf.y.toFixed(2)}\tpostP0=${deg.toFixed(2)}°`,
  );
}

console.log("\n=== FWC=0 vs reference (byte check on outline) ===");
{
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
    waistlineCurveFront: 0,
  };
  const piece = draftTrouserFront(body, style);
  const wrCf = rolePts(piece, "waist")[0]!;
  const path = crotchCf(piece);
  let P0 = path[path.length - 1]!;
  if (dist(P0, wrCf) < 0.05) P0 = path[path.length - 2]!;
  console.log(
    `wr.cf=(${wrCf.x.toFixed(6)},${wrCf.y.toFixed(6)}) P0=(${P0.x.toFixed(6)},${P0.y.toFixed(6)}) Δy=${(P0.y - wrCf.y).toFixed(6)}`,
  );
}

console.log("\n=== Defaults (CD=hipline, FWC=12) — P0 / clamp ===");
{
  const defaults: TrouserFrontStyle = {
    bottomWidth: 220,
    block: "classic",
    waistDrop: 0,
  };
  const piece = draftTrouserFront(body, defaults);
  const wrCf = rolePts(piece, "waist")[0]!;
  const path = crotchCf(piece);
  // At defaults P0 should be near hipline D
  const D = body.hipDepth;
  const R = body.bodyRise;
  const run = resolveCrotchStraightRun(defaults, R, D, wrCf.y);
  console.log(`wr.cf.y=${wrCf.y.toFixed(4)} D=${D} R=${R}`);
  console.log(`straightRun default/clamp max = ${run.toFixed(4)} (D − wr.cf.y)`);
  console.log(`expected P0.y = wr.cf.y + run = ${(wrCf.y + run).toFixed(4)} (hipline D=${D})`);

  // Find P0 on outline (fork x, near D)
  const fork = Math.abs(
    piece.outline.find((o) => Math.abs(o.at.x + 115.83) < 1)?.at.x ?? 115.83,
  );
  let best: Point | null = null;
  let bestD = Infinity;
  for (const p of path) {
    const d = Math.abs(p.y - D) + Math.abs(p.x + fork);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  console.log(`P0≈(${best!.x.toFixed(4)},${best!.y.toFixed(4)})`);
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
  const path = crotchCf(piece);
  const wrCf = waist[0]!;
  const focus = [...waist.slice(0, 8), ...path.slice(-14)];
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
  <circle cx="${wrCf.x}" cy="${wrCf.y}" r="2.5" fill="#06c"/>
</svg>`;
  writeFileSync(join("scripts", file), svg);
  console.log(`wrote scripts/${file}`);
}

console.log("\n=== SVGs ===");
writeSvg(0, "p0-scoop-cd0-fwc0.svg");
writeSvg(16, "p0-scoop-cd0-fwc16.svg");
writeSvg(30, "p0-scoop-cd0-fwc30.svg");
