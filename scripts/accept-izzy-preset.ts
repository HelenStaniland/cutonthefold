/**
 * Acceptance: Izzy block preset values draft + render.
 * Run: npx tsx scripts/accept-izzy-preset.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { IZZY_PRESET } from "../lib/pattern/blockPresets";
import {
  draftTrouserFront,
  draftTrouserBack,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const m = IZZY_PRESET.measured;
const pr = IZZY_PRESET.provisional;
const body = applyEase(
  { ...chart, hip: 1100 },
  m.ease,
);

const style: TrouserFrontStyle = withWaistband(
  {
    bottomWidth: 220, // leave as-is (unmeasured)
    block: "classic",
    waistDrop: m.waistDrop,
    crotchStraightRun: m.crotchStraightRun,
    frontWaistInset: m.frontWaistInset,
    crotchArrivalAngle: m.crotchArrivalAngle,
    backCrotchDrop: m.backCrotchDrop,
    crotchExtensionScale: pr.crotchExtensionScale,
    waistlineCurveFront: pr.waistlineCurveFront,
  },
  m.waistbandDepth,
  m.waistbandMode,
  body,
);

console.log("Izzy measured:", JSON.stringify(m, null, 2));
console.log("Izzy provisional:", JSON.stringify(pr, null, 2));
console.log("draft style waistReduction", style.waistReduction);

const front = draftTrouserFront(body, style);
const back = draftTrouserBack(body, style);

// Defaults baseline (Aldrich-ish) for "no geometry change at existing settings"
const baseBody = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const baseStyle = withWaistband(
  {
    bottomWidth: 220,
    block: "classic",
    waistDrop: 0,
  },
  0,
  "darted",
  baseBody,
);
const baseFront = draftTrouserFront(baseBody, baseStyle);
const baseBack = draftTrouserBack(baseBody, baseStyle);
console.log(
  "default front outline pts",
  baseFront.outline.length,
  "back",
  baseBack.outline.length,
);
console.log("Izzy front outline pts", front.outline.length, "back", back.outline.length);

function toPts(outline: { at: Point }[]): Point[] {
  return outline.map((o) => o.at);
}
function pathD(pts: Point[]) {
  return pts
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

const fPts = toPts(front.outline);
const bPts = toPts(back.outline);
const all = [...fPts, ...bPts];
let minX = Infinity,
  minY = Infinity,
  maxX = -Infinity,
  maxY = -Infinity;
for (const p of all) {
  minX = Math.min(minX, p.x);
  minY = Math.min(minY, p.y);
  maxX = Math.max(maxX, p.x);
  maxY = Math.max(maxY, p.y);
}
const pad = 30;
const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}">
  <path d="${pathD(fPts)}" fill="none" stroke="#1a5fb4" stroke-width="1.4"/>
  <path d="${pathD(bPts)}" fill="none" stroke="#c64600" stroke-width="1.4"/>
  <text x="${minX}" y="${minY - 8}" font-size="14" fill="#333">Izzy preset (ext scale still 1.0) — blue front, orange back</text>
</svg>`;
writeFileSync(join("scripts", "izzy-preset.svg"), svg);
console.log("wrote scripts/izzy-preset.svg");

// Confirm measured values land on style
console.log("check crotchStraightRun", style.crotchStraightRun, "want", m.crotchStraightRun);
console.log("check frontWaistInset", style.frontWaistInset, "want", m.frontWaistInset);
console.log("check arrival", style.crotchArrivalAngle, "want", m.crotchArrivalAngle);
console.log("check backDrop", style.backCrotchDrop, "want", m.backCrotchDrop);
console.log("check waistDrop", style.waistDrop, "want", m.waistDrop);
console.log("check extScale", style.crotchExtensionScale, "want", pr.crotchExtensionScale);
console.log("check scoop", style.waistlineCurveFront, "want", pr.waistlineCurveFront);
console.log("check band mode", style.waistbandMode, "depth", style.waistReduction);
