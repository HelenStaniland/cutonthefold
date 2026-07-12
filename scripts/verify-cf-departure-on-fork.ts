/**
 * Report: correct CF construction — P0 on −fork, join p10→P0.
 * Run: npx tsx scripts/verify-cf-departure-on-fork.ts
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

function svgPath(pts: Point[]): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

function rolePts(
  piece: ReturnType<typeof draftTrouserFront>,
  role: string,
): Point[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at);
}

function serializeGeom(piece: ReturnType<typeof draftTrouserFront>): string {
  return piece.outline
    .map((o) => `${o.at.x.toFixed(6)},${o.at.y.toFixed(6)}`)
    .join("|");
}

function hausdorff(a: Point[], b: Point[]): number {
  const one = (p: Point[], q: Point[]) => {
    let m = 0;
    for (const pt of p) {
      let best = Infinity;
      for (const qt of q) {
        best = Math.min(best, Math.hypot(pt.x - qt.x, pt.y - qt.y));
      }
      m = Math.max(m, best);
    }
    return m;
  };
  return Math.max(one(a, b), one(b, a));
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
const fork = Math.abs(f.p5.x);
const scale = resolveCrotchExtensionScale(defaults);
const touch = frontCrotchTouch(H) * scale;
const straightRun = resolveCrotchStraightRun(defaults, R, D, f.p10.y);
const bez = frontCrotchCurve({
  p5: f.p5,
  p9: f.p9,
  p10: f.p10,
  fork,
  R,
  straightRun,
  extension: frontCrotchExtension(H, scale),
  arrivalAngleDeg: resolveCrotchArrivalAngle(defaults),
  touch,
});

console.log("=== Parameter choice ===");
console.log(
  "Kept name crotchStraightRun = y-distance below p10.y at which the curve",
);
console.log(
  "leaves the true CF (−fork). Range [0, D], default D (hipline / Aldrich 10–6).",
);
console.log(
  `Resolved default straightRun=${straightRun} (D=${D}, p10.y=${f.p10.y})`,
);

console.log("\n=== Defaults (inset 10, departure = hipline) ===");
console.log(
  `P0=(${bez.P0.x.toFixed(3)}, ${bez.P0.y.toFixed(3)})  p6=(${f.p6.x.toFixed(3)}, ${f.p6.y.toFixed(3)})`,
);
const reachesP6 =
  Math.hypot(bez.P0.x - f.p6.x, bez.P0.y - f.p6.y) < 0.05;
console.log(`P0 === p6: ${reachesP6}`);

const piece = draftTrouserFront(body, defaults);
const cfPath = [
  ...rolePts(piece, "crotch"),
  ...rolePts(piece, "centre-front"),
];
const onOutlineNearP6 = cfPath.some(
  (p) => Math.hypot(p.x - f.p6.x, p.y - f.p6.y) < 0.15,
);
console.log(`Outline CF/crotch reaches p6: ${onOutlineNearP6}`);

// Compare to HEAD geometry expectation: P0=p6, join includes p10→p6.
// Explicit Aldrich path samples for Hausdorff of the straight join.
const aldrichJoin: Point[] = [f.p6, f.p10];
const cfSeg = rolePts(piece, "centre-front");
const joinHd = hausdorff(cfSeg.length >= 2 ? cfSeg : [f.p6, f.p10], aldrichJoin);
console.log(
  `CF role vs Aldrich p6→p10 Hausdorff: ${joinHd.toFixed(4)} mm (scoop may lift end to wr.cf)`,
);

// Byte-identity of omitted vs explicit defaults
const pieceExplicit = draftTrouserFront(body, {
  ...defaults,
  frontWaistInset: 10,
  crotchStraightRun: D,
});
console.log(
  `omitted vs explicit defaults: ${serializeGeom(piece) === serializeGeom(pieceExplicit) ? "BYTE-IDENTICAL" : "DIFFERS"}`,
);

// inset 0, departure = waist
{
  const style: TrouserFrontStyle = {
    ...defaults,
    frontWaistInset: 0,
    crotchStraightRun: 0,
  };
  const f0 = trouserFrontPoints(body, style);
  const fork0 = Math.abs(f0.p5.x);
  const run0 = resolveCrotchStraightRun(style, R, D, f0.p10.y);
  const b0 = frontCrotchCurve({
    p5: f0.p5,
    p9: f0.p9,
    p10: f0.p10,
    fork: fork0,
    R,
    straightRun: run0,
    extension: frontCrotchExtension(H, resolveCrotchExtensionScale(style)),
    arrivalAngleDeg: resolveCrotchArrivalAngle(style),
    touch: frontCrotchTouch(H) * resolveCrotchExtensionScale(style),
  });
  const n = b0.points.length;
  const at = b0.points[n - 1]!;
  const near = b0.points[n - 2]!;
  const leave = (Math.atan2(near.x - at.x, near.y - at.y) * 180) / Math.PI;
  console.log(`\n=== inset 0, departure = waist ===`);
  console.log(
    `p10.x=${f0.p10.x.toFixed(3)} P0=(${b0.P0.x.toFixed(3)}, ${b0.P0.y.toFixed(3)}) join collapsed=${Math.hypot(b0.P0.x - f0.p10.x, b0.P0.y - f0.p10.y) < 0.5}`,
  );
  console.log(`departure from vertical: ${leave.toFixed(2)}°`);
}

// inset 10, departure = waist
{
  const style: TrouserFrontStyle = {
    ...defaults,
    frontWaistInset: 10,
    crotchStraightRun: 0,
  };
  const fW = trouserFrontPoints(body, style);
  const bW = frontCrotchCurve({
    p5: fW.p5,
    p9: fW.p9,
    p10: fW.p10,
    fork: Math.abs(fW.p5.x),
    R,
    straightRun: 0,
    extension: frontCrotchExtension(H, scale),
    arrivalAngleDeg: resolveCrotchArrivalAngle(style),
    touch,
  });
  console.log(`\n=== inset 10, departure = waist ===`);
  console.log(
    `P0=(${bW.P0.x.toFixed(3)}, ${bW.P0.y.toFixed(3)}) p10=(${fW.p10.x.toFixed(3)}, ${fW.p10.y.toFixed(3)})`,
  );
  console.log(
    `join length p10→P0: ${Math.hypot(bW.P0.x - fW.p10.x, bW.P0.y - fW.p10.y).toFixed(2)} mm (≈ inset)`,
  );
}

function writeSvg(style: TrouserFrontStyle, label: string, file: string) {
  const pieceOut = draftTrouserFront(body, style);
  const pts = trouserFrontPoints(body, style);
  const crotch = rolePts(pieceOut, "crotch");
  const cf = rolePts(pieceOut, "centre-front");
  const waist = rolePts(pieceOut, "waist");
  const all = [...crotch, ...cf, ...waist, pts.p10, pts.p6];
  const minX = Math.min(...all.map((p) => p.x)) - 25;
  const minY = Math.min(...all.map((p) => p.y)) - 15;
  const maxY = Math.min(Math.max(...all.map((p) => p.y)), minY + 340);
  const maxX = Math.max(...all.map((p) => p.x)) + 25;
  const w = maxX - minX;
  const h = maxY - minY;
  const sh = (p: Point) => ({ x: p.x - minX, y: p.y - minY });
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">`,
    `  <rect width="100%" height="100%" fill="#faf8f5"/>`,
    `  <path d="${svgPath(waist.map(sh))}" fill="none" stroke="#888" stroke-width="1.5"/>`,
    `  <path d="${svgPath(crotch.map(sh))}" fill="none" stroke="#c44" stroke-width="2.5"/>`,
    cf.length
      ? `  <path d="${svgPath(cf.map(sh))}" fill="none" stroke="#2563eb" stroke-width="2.5"/>`
      : "",
    `  <circle cx="${sh(pts.p10).x}" cy="${sh(pts.p10).y}" r="3" fill="#111"/>`,
    `  <circle cx="${sh(pts.p6).x}" cy="${sh(pts.p6).y}" r="3" fill="#16a34a"/>`,
    `  <text x="8" y="16" font-size="12" fill="#333">${label}</text>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
  writeFileSync(join(process.cwd(), "scripts", file), svg);
  console.log(`Wrote scripts/${file}`);
}

writeSvg(
  defaults,
  "inset=10, departure=hipline (Aldrich)",
  "cf-departure-inset10-hipline.svg",
);
writeSvg(
  { ...defaults, crotchStraightRun: 0 },
  "inset=10, departure=waist",
  "cf-departure-inset10-waist.svg",
);
writeSvg(
  { ...defaults, frontWaistInset: 0, crotchStraightRun: 0 },
  "inset=0, departure=waist (Izzy)",
  "cf-departure-inset0-waist.svg",
);
