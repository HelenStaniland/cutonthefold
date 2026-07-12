/**
 * Report: front waist inset + P0-on-p10.x fix.
 * Run: npx tsx scripts/verify-front-waist-inset.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserBack,
  draftTrouserFront,
  frontCrotchCurve,
  frontCrotchExtension,
  frontCrotchTouch,
  frontDartFromCentreFront,
  resolveCrotchArrivalAngle,
  resolveCrotchExtensionScale,
  resolveCrotchStraightRun,
  resolveFrontWaistInset,
  trouserBackPoints,
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

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const H = body.hip;
const R = body.bodyRise;
const D = body.hipDepth;

const base: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
};

// --- P0 fix delta at default inset 10 ---
// Reconstruct old P0 (x = -fork) vs new (x = p10.x) on the same Bézier solve inputs.
{
  const f = trouserFrontPoints(body, base);
  const fork = Math.abs(f.p5.x);
  const scale = resolveCrotchExtensionScale(base);
  const touch = frontCrotchTouch(H) * scale;
  const straightRun = resolveCrotchStraightRun(base, R, D, f.p10.y);
  const extension = frontCrotchExtension(H, scale);
  const arrival = resolveCrotchArrivalAngle(base);

  const neu = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    p10: f.p10,
    fork,
    R,
    straightRun,
    extension,
    arrivalAngleDeg: arrival,
    touch,
  });

  // Departure on true CF (−fork) — same as neu at any p10.x when fork is used.
  const onFork = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    p10: f.p10,
    fork,
    R,
    straightRun,
    extension,
    arrivalAngleDeg: arrival,
    touch,
  });

  console.log(`=== CF departure on −fork (inset ${resolveFrontWaistInset(base)}) ===`);
  console.log(
    `P0=(${neu.P0.x.toFixed(3)}, ${neu.P0.y.toFixed(3)})  p6=(${f.p6.x.toFixed(3)}, ${f.p6.y.toFixed(3)})  ` +
      `P0===p6: ${Math.hypot(neu.P0.x - f.p6.x, neu.P0.y - f.p6.y) < 0.05}`,
  );
  void onFork;

// --- Dart distance ---
{
  for (const inset of [10, 0]) {
    const style = { ...base, frontWaistInset: inset };
    const d = frontDartFromCentreFront(body, style);
    const f = trouserFrontPoints(body, style);
    console.log(
      `dart from CF @ inset ${inset}: ${d.toFixed(3)} mm  (−p10.x=${(-f.p10.x).toFixed(3)}, −p10.x−inset=${(-f.p10.x - inset).toFixed(3)})`,
    );
  }
}

// --- Side-seam waist x front vs back ---
{
  console.log(`\n=== Side-seam waist x (wr.side.x) ===`);
  for (const inset of [10, 0]) {
    const style = { ...base, frontWaistInset: inset };
    const front = draftTrouserFront(body, style);
    const back = draftTrouserBack(body, style);
    const fSide = front.outline.find((o) => o.role === "waist")!;
    // waist runs CF → side: last waist point is side
    const fWaist = rolePts(front, "waist");
    const bWaist = rolePts(back, "waist");
    const fSidePt = fWaist[fWaist.length - 1]!;
    const bSidePt = bWaist[bWaist.length - 1]!;
    const fPts = trouserFrontPoints(body, style);
    const bPts = trouserBackPoints(body, style);
    console.log(
      `inset ${inset}: front side x=${fSidePt.x.toFixed(2)} (p11.x=${fPts.p11.x.toFixed(2)})  ` +
        `back side x=${bSidePt.x.toFixed(2)} (p22.x=${bPts.p22.x.toFixed(2)})`,
    );
    void fSide;
  }
  const s10 = trouserFrontPoints(body, { ...base, frontWaistInset: 10 });
  const s0 = trouserFrontPoints(body, { ...base, frontWaistInset: 0 });
  console.log(
    `front p11 shift (inset10→0): ${(s0.p11.x - s10.p11.x).toFixed(2)} mm ` +
      `(p11 follows p10; −10 in piece +x = toward CF)`,
  );
}

// --- inset 0: vertical CF + departure tangent ---
{
  const style: TrouserFrontStyle = {
    ...base,
    frontWaistInset: 0,
    crotchStraightRun: 50,
  };
  const f = trouserFrontPoints(body, style);
  const scale = resolveCrotchExtensionScale(style);
  const touch = frontCrotchTouch(H) * scale;
  const straightRun = resolveCrotchStraightRun(style, R, D, f.p10.y);
  const bez = frontCrotchCurve({
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
  const n = bez.points.length;
  const atP0 = bez.points[n - 1]!;
  const near = bez.points[n - 2]!;
  const fromP0 = { x: near.x - atP0.x, y: near.y - atP0.y };
  const leaveDeg = (Math.atan2(fromP0.x, fromP0.y) * 180) / Math.PI;
  const cfDx = Math.abs(bez.P0.x - f.p10.x);
  console.log(`\n=== inset 0, straightRun=50 ===`);
  console.log(
    `P0=(${bez.P0.x.toFixed(3)}, ${bez.P0.y.toFixed(3)}) p10.x=${f.p10.x.toFixed(3)} |Δx|=${cfDx.toFixed(4)}`,
  );
  console.log(
    `departure from vertical: ${leaveDeg.toFixed(2)}° (want |·| < 1)`,
  );
  console.log(`cfEdge vertical: p10.x=${f.p10.x.toFixed(3)} p6.x=${f.p6.x.toFixed(3)}`);
}

function writeCfSvg(
  style: TrouserFrontStyle,
  label: string,
  filename: string,
) {
  const piece = draftTrouserFront(body, style);
  const f = trouserFrontPoints(body, style);
  const crotch = rolePts(piece, "crotch");
  const cf = rolePts(piece, "centre-front");
  const waist = rolePts(piece, "waist");
  const all = [...crotch, ...cf, ...waist, f.p10, f.p6];
  const minX = Math.min(...all.map((p) => p.x)) - 25;
  const minY = Math.min(...all.map((p) => p.y)) - 15;
  // Upper rise only
  const maxY = Math.min(Math.max(...all.map((p) => p.y)), minY + 320);
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
    `  <circle cx="${sh(f.p10).x}" cy="${sh(f.p10).y}" r="3" fill="#111"/>`,
    `  <circle cx="${sh(f.p6).x}" cy="${sh(f.p6).y}" r="2.5" fill="#999"/>`,
    `  <text x="8" y="16" font-size="12" fill="#333">${label}</text>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
  writeFileSync(join(process.cwd(), "scripts", filename), svg);
  console.log(`Wrote scripts/${filename}`);
}

writeCfSvg(
  { ...base, frontWaistInset: 10, crotchStraightRun: 50 },
  "inset=10, straightRun=50",
  "front-waist-inset-10-run50.svg",
);
writeCfSvg(
  { ...base, frontWaistInset: 0, crotchStraightRun: 50 },
  "inset=0, straightRun=50 (vertical CF)",
  "front-waist-inset-0-run50.svg",
);
