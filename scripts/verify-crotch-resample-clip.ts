/**
 * Verify crotch re-sample clip (no sawtooth nick).
 * Run: npx tsx scripts/verify-crotch-resample-clip.ts
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
  resolveCrotchP0Y,
  resolveWaistlineCurveFront,
  trouserFrontPoints,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { cubicBezier } from "../lib/geometry/curves";

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

function angleDeg(dx: number, dy: number): number {
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

const ownerStyle: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 25,
  waistbandMode: "darted",
  waistReduction: 0,
  crotchExtensionScale: 1.0,
  frontWaistInset: 10,
  crotchDeparture: "waistEdge",
  crotchArrivalAngle: 5,
};

const curves = [0, 3, 5, 8, 11, 14, 16, 18, 20, 22, 25, 28, 30];
console.log("waistCurve\tcrotchTangentDeg\tjointGapMm");
const tangents: number[] = [];
for (const waistCurve of curves) {
  const piece = draftTrouserFront(body, {
    ...ownerStyle,
    waistlineCurveFront: waistCurve,
  });
  const waist = rolePts(piece, "waist");
  const crotchCf = [
    ...rolePts(piece, "crotch"),
    ...rolePts(piece, "centre-front"),
  ];
  const w0 = waist[0]!;
  const c0 = crotchCf[crotchCf.length - 2]!;
  const c1 = crotchCf[crotchCf.length - 1]!;
  const tan = angleDeg(c1.x - c0.x, c1.y - c0.y);
  const gap = Math.hypot(w0.x - c1.x, w0.y - c1.y);
  tangents.push(tan);
  console.log(`${waistCurve}\t${tan.toFixed(3)}\t${gap.toFixed(6)}`);
}

// Sawtooth check: no large snap-backs toward more negative while ramping up
let snaps = 0;
for (let i = 1; i < tangents.length; i++) {
  const d = tangents[i]! - tangents[i - 1]!;
  // snap-back: large drop (more negative) after climbing
  if (d < -20) snaps++;
}
console.log(`\nsnap-backs (|Δ| drop > 20°): ${snaps} (want 0)`);

// Shape deviation at Aldrich defaults (hipline departure, scoop 12)
{
  const defaults: TrouserFrontStyle = {
    bottomWidth: 220,
    block: "classic",
    waistDrop: 0,
  };
  const f = trouserFrontPoints(body, defaults);
  const H = body.hip;
  const R = body.bodyRise;
  const D = body.hipDepth;
  const scale = resolveCrotchExtensionScale(defaults);
  const waistCfY = resolveWaistlineCurveFront(defaults);
  const bez = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    fork: Math.abs(f.p5.x),
    R,
    waistCfY,
    p0Y: resolveCrotchP0Y(defaults, D, waistCfY),
    extension: frontCrotchExtension(H, scale),
    arrivalAngleDeg: resolveCrotchArrivalAngle(defaults),
    touch: frontCrotchTouch(H) * scale,
  });
  // Old full sampling (tip→P0) vs new draft crotch+CF (tip→wr.cf); at defaults
  // wr.cf is scoop-offset from p10, path is tip→P0→wr.cf. Compare Bézier portion.
  const oldBez = cubicBezier(bez.P0, bez.P1, bez.P2, bez.P3, 48).reverse();
  const piece = draftTrouserFront(body, defaults);
  const newPath = [
    ...rolePts(piece, "crotch"),
    ...rolePts(piece, "centre-front"),
  ];
  // Bézier portion ends at P0; strip trailing join after P0
  let cut = newPath.length;
  for (let i = newPath.length - 1; i >= 0; i--) {
    if (Math.hypot(newPath[i]!.x - bez.P0.x, newPath[i]!.y - bez.P0.y) < 0.5) {
      cut = i + 1;
      break;
    }
  }
  const newBez = newPath.slice(0, cut);
  console.log(
    `\nDefaults Bézier Hausdorff old vs new sampling: ${hausdorff(oldBez, newBez).toFixed(4)} mm`,
  );
}

function writeSvg(scoop: number, file: string) {
  const piece = draftTrouserFront(body, {
    ...ownerStyle,
    waistlineCurveFront: scoop,
  });
  const waist = rolePts(piece, "waist");
  const crotch = rolePts(piece, "crotch");
  const cf = rolePts(piece, "centre-front");
  const all = [...waist, ...crotch, ...cf];
  const minX = Math.min(...all.map((p) => p.x)) - 20;
  const minY = Math.min(...all.map((p) => p.y)) - 15;
  const maxX = Math.max(...all.map((p) => p.x)) + 20;
  const maxY = Math.min(Math.max(...all.map((p) => p.y)), minY + 280);
  const w = maxX - minX;
  const h = maxY - minY;
  const sh = (p: Point) => ({ x: p.x - minX, y: p.y - minY });
  const wrCf = waist[0]!;
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">`,
    `  <rect width="100%" height="100%" fill="#faf8f5"/>`,
    `  <path d="${svgPath(waist.map(sh))}" fill="none" stroke="#888" stroke-width="1.5"/>`,
    `  <path d="${svgPath(crotch.map(sh))}" fill="none" stroke="#c44" stroke-width="2.5"/>`,
    cf.length
      ? `  <path d="${svgPath(cf.map(sh))}" fill="none" stroke="#2563eb" stroke-width="2.5"/>`
      : "",
    `  <circle cx="${sh(wrCf).x}" cy="${sh(wrCf).y}" r="3.5" fill="#111"/>`,
    `  <text x="8" y="16" font-size="12" fill="#333">scoop=${scoop}</text>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
  writeFileSync(join(process.cwd(), "scripts", file), svg);
  console.log(`Wrote scripts/${file}`);
}

for (const s of [5, 16, 22]) {
  writeSvg(s, `crotch-resample-scoop-${s}.svg`);
}
