/**
 * Experiment: centripetal vs uniform crotch Catmull-Rom.
 * Run: npx tsx scripts/experiment-crotch-centripetal.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { catmullRom, catmullRomCentripetal } from "../lib/geometry/curves";
import {
  draftTrouserBack,
  draftTrouserFront,
  frontCrotchTouch,
  resolveCrotchExtensionScale,
  trouserBackPoints,
  trouserFrontPoints,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function maxDelta(a: Point[], b: Point[]): number {
  const n = Math.min(a.length, b.length);
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, dist(a[i]!, b[i]!));
  return m;
}

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function arrivalAngleAtStart(curve: Point[]): number {
  if (curve.length < 2) return NaN;
  const a = curve[0]!;
  const b = curve[1]!;
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function interiorAngle(u: Point, v: Point): number {
  return (
    (Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) * 180) /
    Math.PI
  );
}

function crotchGuide45(corner: Point, touch: number): Point {
  const c = Math.SQRT1_2;
  return { x: corner.x - touch * c, y: corner.y - touch * c };
}

function svgPath(pts: Point[]): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

function crotchRole(piece: {
  outline: { role?: string; at: Point }[];
}): Point[] {
  return piece.outline.filter((o) => o.role === "crotch").map((o) => o.at);
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const base: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
};

console.log(`Drafted hip ${body.hip} mm\n`);
console.log("=== Max sample Δ: uniform → centripetal (same knots) ===");

for (const scale of [1.0, 0.7, 0.5]) {
  const style = { ...base, crotchExtensionScale: scale };
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const s = resolveCrotchExtensionScale(style);
  const frontGuide = crotchGuide45(f.p5, frontCrotchTouch(body.hip) * s);

  const frontU = catmullRom([f.p9, frontGuide, f.p6]);
  const frontC = catmullRomCentripetal([f.p9, frontGuide, f.p6]);
  const backU = catmullRom([b.p24, b.guide, b.p19, b.p21]);
  const backC = catmullRomCentripetal([b.p24, b.guide, b.p19, b.p21]);

  console.log(
    `scale ${scale.toFixed(1)}: front maxΔ ${maxDelta(frontU, frontC).toFixed(3)} mm (n ${frontU.length}/${frontC.length})  back maxΔ ${maxDelta(backU, backC).toFixed(3)} mm (n ${backU.length}/${backC.length})`,
  );
}

{
  const style = { ...base, crotchExtensionScale: 1.0 };
  const b = trouserBackPoints(body, style);
  const backU = catmullRom([b.p24, b.guide, b.p19, b.p21]);
  const backC = catmullRomCentripetal([b.p24, b.guide, b.p19, b.p21]);
  const backPiece = draftTrouserBack(body, style);
  const inseam = backPiece.outline
    .filter((o) => o.role === "inseam")
    .map((o) => o.at);
  let i24 = -1;
  for (let i = 0; i < inseam.length; i++) {
    if (dist(inseam[i]!, b.p24) < 0.5) {
      i24 = i;
      break;
    }
  }
  const before =
    i24 > 0 ? inseam[i24 - 1]! : { x: b.p24.x, y: b.p24.y + 10 };
  const legIntoP24 = arrivalAngleAtStart([before, b.p24]);
  const crotchLeaveU = arrivalAngleAtStart([backU[0]!, backU[1]!]);
  const crotchLeaveC = arrivalAngleAtStart([backC[0]!, backC[1]!]);
  const vLeg = normalize({ x: b.p24.x - before.x, y: b.p24.y - before.y });
  const vCU = normalize({
    x: backU[1]!.x - b.p24.x,
    y: backU[1]!.y - b.p24.y,
  });
  const vCC = normalize({
    x: backC[1]!.x - b.p24.x,
    y: backC[1]!.y - b.p24.y,
  });
  console.log(`\n=== p24 kink at scale 1.0 (angles from +x, deg) ===`);
  console.log(
    `inside-leg into p24: ${legIntoP24.toFixed(1)}°  crotch leave uniform: ${crotchLeaveU.toFixed(1)}°  centripetal: ${crotchLeaveC.toFixed(1)}°`,
  );
  console.log(
    `interior angle leg→crotch: uniform ${interiorAngle(vLeg, vCU).toFixed(1)}°  centripetal ${interiorAngle(vLeg, vCC).toFixed(1)}°  (180° = smooth; smaller = sharper kink)`,
  );
}

function writeScaleOverlay(
  side: "front" | "back",
  scales: number[],
  filename: string,
) {
  const colors = ["#888", "#4a7", "#c44"];
  const series = scales.map((scale, i) => {
    const style = { ...base, crotchExtensionScale: scale };
    const piece =
      side === "front"
        ? draftTrouserFront(body, style)
        : draftTrouserBack(body, style);
    return { scale, color: colors[i]!, pts: crotchRole(piece) };
  });
  const all = series.flatMap((s) => s.pts);
  const minX = Math.min(...all.map((p) => p.x)) - 15;
  const minY = Math.min(...all.map((p) => p.y)) - 15;
  const w = Math.max(...all.map((p) => p.x)) - minX + 15;
  const h = Math.max(...all.map((p) => p.y)) - minY + 45;
  const paths = series
    .map((s, i) => {
      const d = svgPath(
        s.pts.map((p) => ({ x: p.x - minX, y: p.y - minY })),
      );
      return [
        `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"/>`,
        `<text x="8" y="${14 + i * 16}" font-size="12" fill="${s.color}">${side} scale ${s.scale.toFixed(1)} (centripetal)</text>`,
      ].join("\n  ");
    })
    .join("\n  ");
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">`,
    `  <rect width="100%" height="100%" fill="#faf8f5"/>`,
    `  ${paths}`,
    `</svg>`,
  ].join("\n");
  writeFileSync(join(process.cwd(), "scripts", filename), svg);
  console.log(`Wrote scripts/${filename}`);
}

function writeCompare05(side: "front" | "back", filename: string) {
  const style = { ...base, crotchExtensionScale: 0.5 };
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const s = resolveCrotchExtensionScale(style);
  const frontGuide = crotchGuide45(f.p5, frontCrotchTouch(body.hip) * s);
  let uni =
    side === "front"
      ? catmullRom([f.p9, frontGuide, f.p6])
      : catmullRom([b.p24, b.guide, b.p19, b.p21]);
  let cen =
    side === "front"
      ? catmullRomCentripetal([f.p9, frontGuide, f.p6])
      : catmullRomCentripetal([b.p24, b.guide, b.p19, b.p21]);
  if (side === "back") {
    const trim = (pts: Point[]) => {
      let idx = pts.length - 1;
      for (let i = 0; i < pts.length; i++) {
        if (dist(pts[i]!, b.p19) < 0.5) {
          idx = i;
          break;
        }
      }
      return pts.slice(0, idx + 1);
    };
    uni = trim(uni);
    cen = trim(cen);
  }
  const all = [...uni, ...cen];
  const minX = Math.min(...all.map((p) => p.x)) - 15;
  const minY = Math.min(...all.map((p) => p.y)) - 15;
  const w = Math.max(...all.map((p) => p.x)) - minX + 15;
  const h = Math.max(...all.map((p) => p.y)) - minY + 45;
  const sh = (p: Point) => ({ x: p.x - minX, y: p.y - minY });
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">`,
    `  <rect width="100%" height="100%" fill="#faf8f5"/>`,
    `  <path d="${svgPath(uni.map(sh))}" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="6 4"/>`,
    `  <path d="${svgPath(cen.map(sh))}" fill="none" stroke="#c44" stroke-width="2"/>`,
    `  <text x="8" y="14" font-size="12" fill="#999">${side} @0.5 uniform (dashed)</text>`,
    `  <text x="8" y="30" font-size="12" fill="#c44">${side} @0.5 centripetal</text>`,
    `</svg>`,
  ].join("\n");
  writeFileSync(join(process.cwd(), "scripts", filename), svg);
  console.log(`Wrote scripts/${filename}`);
}

writeScaleOverlay("front", [1.0, 0.7, 0.5], "crotch-centripetal-front-scales.svg");
writeScaleOverlay("back", [1.0, 0.7, 0.5], "crotch-centripetal-back-scales.svg");
writeCompare05("front", "crotch-centripetal-vs-uniform-front-05.svg");
writeCompare05("back", "crotch-centripetal-vs-uniform-back-05.svg");
