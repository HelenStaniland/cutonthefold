/**
 * Run: npx tsx scripts/verify-waistline-curve-front.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserFront,
  WAISTLINE_CURVE_FRONT,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

function svgPath(pts: Point[]): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

function waistOf(piece: ReturnType<typeof draftTrouserFront>): Point[] {
  return piece.outline.filter((o) => o.role === "waist").map((o) => o.at);
}

function cfOf(piece: ReturnType<typeof draftTrouserFront>): Point[] {
  return piece.outline
    .filter((o) => o.role === "centre-front")
    .map((o) => o.at);
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const base: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
};

const omitted = draftTrouserFront(body, base);
const explicit12 = draftTrouserFront(body, {
  ...base,
  waistlineCurveFront: WAISTLINE_CURVE_FRONT,
});
const identical =
  JSON.stringify(omitted.outline) === JSON.stringify(explicit12.outline) &&
  JSON.stringify(omitted.markings) === JSON.stringify(explicit12.markings);
console.log(
  `Default omitted vs explicit ${WAISTLINE_CURVE_FRONT}: byte-identical = ${identical}`,
);

function writeWaist(scoop: number, filename: string) {
  const piece = draftTrouserFront(body, {
    ...base,
    waistlineCurveFront: scoop,
  });
  const waist = waistOf(piece);
  const cf = cfOf(piece);
  const all = [...waist, ...cf];
  const minX = Math.min(...all.map((p) => p.x)) - 10;
  const minY = Math.min(...all.map((p) => p.y)) - 10;
  const maxX = Math.max(...all.map((p) => p.x)) + 10;
  const maxY = Math.max(...all.map((p) => p.y)) + 30;
  const w = maxX - minX;
  const h = maxY - minY;
  const sh = (p: Point) => ({ x: p.x - minX, y: p.y - minY });
  const cfEnd = waist[0]!;
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">`,
    `  <rect width="100%" height="100%" fill="#faf8f5"/>`,
    `  <path d="${svgPath(waist.map(sh))}" fill="none" stroke="#c44" stroke-width="2"/>`,
    `  <path d="${svgPath(cf.map(sh))}" fill="none" stroke="#48a" stroke-width="2"/>`,
    `  <circle cx="${(cfEnd.x - minX).toFixed(2)}" cy="${(cfEnd.y - minY).toFixed(2)}" r="3" fill="#333"/>`,
    `  <text x="8" y="16" font-size="12" fill="#333">scoop ${scoop} mm — red waist, blue CF</text>`,
    `</svg>`,
  ].join("\n");
  writeFileSync(join(process.cwd(), "scripts", filename), svg);
  console.log(`Wrote scripts/${filename}`);
  const side = waist[waist.length - 1]!;
  console.log(
    `  scoop ${scoop}: CF y=${cfEnd.y.toFixed(2)} side y=${side.y.toFixed(2)} Δy=${(side.y - cfEnd.y).toFixed(2)}`,
  );
}

for (const s of [0, 12, 24]) {
  writeWaist(s, `waistline-curve-front-${s}.svg`);
}
