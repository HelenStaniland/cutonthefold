/**
 * Confirm restored four-width leg + faired inseam.
 * Run: npx tsx scripts/accept-leg-widths.ts
 */
import { writeFileSync } from "fs";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { pchipByY } from "../lib/geometry/curves";
import {
  trouserFrontPoints,
  trouserBackPoints,
  withWaistband,
  sizeBand,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import { CLEO_PRESET } from "../lib/pattern/blockPresets";

const chart = bodyForSizeCode("12")!;
const blockBody = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const cleoBody = applyEase(
  { ...chart, hip: 1100 },
  CLEO_PRESET.measured.ease,
);

const KNEE_ADD: Record<string, number> = {
  "6-8": 13,
  "10-14": 13,
  "16-20": 15,
  "22-26": 17,
};

function xOn(a: Point, b: Point, y: number) {
  return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
}

function toDraft(
  s: TrouserStyleSettings,
  body: typeof blockBody,
): TrouserFrontStyle {
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    waistDrop: s.waistDrop,
    ...(s.frontKneeWidth != null ? { frontKneeWidth: s.frontKneeWidth } : {}),
    ...(s.frontHemWidth != null ? { frontHemWidth: s.frontHemWidth } : {}),
    ...(s.backKneeWidth != null ? { backKneeWidth: s.backKneeWidth } : {}),
    ...(s.backHemWidth != null ? { backHemWidth: s.backHemWidth } : {}),
    ...(s.frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale: s.frontCrotchExtensionScale }
      : {}),
    ...(s.backCrotchExtensionScale != null
      ? { backCrotchExtensionScale: s.backCrotchExtensionScale }
      : {}),
    ...(s.crotchDeparture != null
      ? { crotchDeparture: s.crotchDeparture }
      : {}),
    ...(s.crotchArrivalAngle != null
      ? { crotchArrivalAngle: s.crotchArrivalAngle }
      : {}),
    ...(s.waistlineCurveFront != null
      ? { waistlineCurveFront: s.waistlineCurveFront }
      : {}),
    ...(s.frontWaistInset != null ? { frontWaistInset: s.frontWaistInset } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
  };
  const depth =
    s.waistbandMode === "darted"
      ? s.dartedWaistFinish === "facing"
        ? 0
        : s.dartedBandDepth
      : s.waistbandDepth;
  return withWaistband(base, depth, s.waistbandMode, body);
}

function expectedAldrich(
  f: ReturnType<typeof trouserFrontPoints>,
  B: number,
  hip: number,
) {
  const kneeAdd = KNEE_ADD[sizeBand(hip)]!;
  const kneeY = f.p13.y;
  const F = f.p12.y;
  const p12 = { x: B / 2 - 5, y: F };
  const p14 = { x: -(B / 2 - 5), y: F };
  const K = B + 2 * kneeAdd;
  const p13 = {
    x: Math.min(K / 2 - 5, xOn(f.p8, p12, kneeY)),
    y: kneeY,
  };
  const p15 = {
    x: Math.max(-(K / 2 - 5), xOn(f.p9, p14, kneeY)),
    y: kneeY,
  };
  return {
    p12,
    p13,
    p14,
    p15,
    p26: { x: p12.x + 10, y: F },
    p28: { x: p14.x - 10, y: F },
    p27: { x: p13.x + 10, y: kneeY },
    p29: { x: p15.x - 10, y: kneeY },
  };
}

function turnAtKnee(poly: Point[], knee: Point): number {
  let ki = -1;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = Math.hypot(poly[i]!.x - knee.x, poly[i]!.y - knee.y);
    if (d < best) {
      best = d;
      ki = i;
    }
  }
  const a = poly[ki - 1]!;
  const k = poly[ki]!;
  const c = poly[ki + 1]!;
  let turn =
    ((Math.atan2(c.x - k.x, c.y - k.y) - Math.atan2(k.x - a.x, k.y - a.y)) *
      180) /
    Math.PI;
  while (turn > 180) turn -= 360;
  while (turn < -180) turn += 360;
  return turn;
}

function writeInseamSvg(
  path: string,
  label: string,
  tip: Point,
  knee: Point,
  hem: Point,
) {
  const poly = pchipByY([tip, knee, hem]);
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs) - 40;
  const maxX = Math.max(...xs) + 40;
  const minY = Math.min(...ys) - 40;
  const maxY = Math.max(...ys) + 40;
  const w = maxX - minX;
  const h = maxY - minY;
  const d = poly
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="320" height="${((320 * h) / w).toFixed(0)}">
  <rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#faf8f5"/>
  <path d="${d}" fill="none" stroke="#c44" stroke-width="2"/>
  <circle cx="${tip.x}" cy="${tip.y}" r="3" fill="#2563eb"/>
  <circle cx="${knee.x}" cy="${knee.y}" r="5" fill="#c00"/>
  <circle cx="${hem.x}" cy="${hem.y}" r="3" fill="#2563eb"/>
  <text x="${minX + 8}" y="${minY + 18}" font-size="11" fill="#333">${label}</text>
</svg>`;
  writeFileSync(path, svg);
}

{
  const style = toDraft(BLOCK_TROUSER_STYLE, blockBody);
  const f = trouserFrontPoints(blockBody, style);
  const b = trouserBackPoints(blockBody, style);
  const exp = expectedAldrich(f, style.bottomWidth, blockBody.hip);
  let max = 0;
  let at = "";
  for (const k of ["p12", "p13", "p14", "p15"] as const) {
    const d = Math.hypot(f[k].x - exp[k].x, f[k].y - exp[k].y);
    if (d > max) {
      max = d;
      at = k;
    }
  }
  for (const k of ["p26", "p27", "p28", "p29"] as const) {
    const d = Math.hypot(b[k].x - exp[k].x, b[k].y - exp[k].y);
    if (d > max) {
      max = d;
      at = k;
    }
  }
  const fTurn = turnAtKnee(pchipByY([f.p9, f.p15, f.p14]), f.p15);
  const bTurn = turnAtKnee(pchipByY([b.p24, b.p29, b.p28]), b.p29);
  console.log("=== Block defaults ===");
  console.log(`  max Δ vs Aldrich KNEE_ADD: ${max.toFixed(6)} mm at ${at || "(none)"}`);
  console.log(
    `  inseam knee turn: front ${fTurn.toFixed(3)}°  back ${bTurn.toFixed(3)}°`,
  );
  writeInseamSvg(
    "scripts/inseam-restored-block-front.svg",
    `Block front turn=${fTurn.toFixed(2)}°`,
    f.p9,
    f.p15,
    f.p14,
  );
  writeInseamSvg(
    "scripts/inseam-restored-block-back.svg",
    `Block back turn=${bTurn.toFixed(2)}°`,
    b.p24,
    b.p29,
    b.p28,
  );
}

{
  const style = toDraft(CLEO_TROUSER_STYLE, cleoBody);
  const f = trouserFrontPoints(cleoBody, style);
  const b = trouserBackPoints(cleoBody, style);
  const fKnee = Math.abs(f.p15.x - f.p13.x);
  const fHem = Math.abs(f.p14.x - f.p12.x);
  const bKnee = Math.abs(b.p29.x - b.p27.x);
  const bHem = Math.abs(b.p28.x - b.p26.x);
  const fTurn = turnAtKnee(pchipByY([f.p9, f.p15, f.p14]), f.p15);
  const bTurn = turnAtKnee(pchipByY([b.p24, b.p29, b.p28]), b.p29);
  console.log("\n=== Cleo preset ===");
  console.log(
    `  F knee ${fKnee.toFixed(3)} (330)  hem ${fHem.toFixed(3)} (350)`,
  );
  console.log(
    `  B knee ${bKnee.toFixed(3)} (365)  hem ${bHem.toFixed(3)} (375)`,
  );
  console.log(
    `  flare: front knee<hem? ${fKnee < fHem}  back knee<hem? ${bKnee < bHem}`,
  );
  console.log(
    `  inseam knee turn: front ${fTurn.toFixed(3)}°  back ${bTurn.toFixed(3)}°`,
  );
  writeInseamSvg(
    "scripts/inseam-restored-cleo-front.svg",
    `Cleo front turn=${fTurn.toFixed(2)}° knee=${fKnee.toFixed(0)}`,
    f.p9,
    f.p15,
    f.p14,
  );
  writeInseamSvg(
    "scripts/inseam-restored-cleo-back.svg",
    `Cleo back turn=${bTurn.toFixed(2)}° knee=${bKnee.toFixed(0)}`,
    b.p24,
    b.p29,
    b.p28,
  );
  console.log(
    "  wrote scripts/inseam-restored-{block,Cleo}-{front,back}.svg",
  );
}
