/**
 * Accept inseam-inset + k=0.18 leg model.
 * Run: npx tsx scripts/accept-knee-inset.ts
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
const K_SIDE = 0.18;

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
    ...(s.frontInseamKneeInset != null
      ? { frontInseamKneeInset: s.frontInseamKneeInset }
      : {}),
    ...(s.backInseamKneeInset != null
      ? { backInseamKneeInset: s.backInseamKneeInset }
      : {}),
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

function turnAt(poly: Point[], knee: Point): number {
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

function writeSvg(
  path: string,
  label: string,
  tip: Point,
  hipSide: Point,
  kneeIn: Point,
  kneeSide: Point,
  hemIn: Point,
  hemSide: Point,
) {
  const inseam = pchipByY([tip, kneeIn, hemIn]);
  const side = pchipByY([hipSide, kneeSide, hemSide]);
  const xs = [...inseam, ...side].map((p) => p.x);
  const ys = [...inseam, ...side].map((p) => p.y);
  const minX = Math.min(...xs) - 30;
  const maxX = Math.max(...xs) + 30;
  const minY = Math.min(...ys) - 30;
  const maxY = Math.max(...ys) + 30;
  const w = maxX - minX;
  const h = maxY - minY;
  const dIn = inseam
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const dSide = side
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const cIn = `M${tip.x.toFixed(1)},${tip.y.toFixed(1)} L${hemIn.x.toFixed(1)},${hemIn.y.toFixed(1)}`;
  const cSide = `M${hipSide.x.toFixed(1)},${hipSide.y.toFixed(1)} L${hemSide.x.toFixed(1)},${hemSide.y.toFixed(1)}`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="320" height="${((320 * h) / w).toFixed(0)}">
  <rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#faf8f5"/>
  <path d="${cIn}" fill="none" stroke="#ccc" stroke-width="1" stroke-dasharray="5 4"/>
  <path d="${cSide}" fill="none" stroke="#cde" stroke-width="1" stroke-dasharray="5 4"/>
  <path d="${dSide}" fill="none" stroke="#2563eb" stroke-width="1.5"/>
  <path d="${dIn}" fill="none" stroke="#c44" stroke-width="2"/>
  <line x1="${kneeIn.x}" y1="${kneeIn.y}" x2="${kneeSide.x}" y2="${kneeSide.y}" stroke="#c00" stroke-width="1.5"/>
  <circle cx="${kneeIn.x}" cy="${kneeIn.y}" r="4" fill="#c00"/>
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
  // Report Aldrich chord offsets (info only — not used as defaults)
  const fSideCh = xOn(f.p8, f.p12, f.p13.y);
  const fInCh = xOn(f.p9, f.p14, f.p15.y);
  const bSideCh = xOn(b.p25, b.p26, b.p27.y);
  const bInCh = xOn(b.p24, b.p28, b.p29.y);
  // Pattern: inseam inset = chord − knee (so negative inset ⇒ knee inboard ⇒ larger x)
  const fInInset = fInCh - f.p15.x;
  const fSideInset = f.p13.x - fSideCh;
  const bInInset = bInCh - b.p29.x;
  const bSideInset = b.p27.x - bSideCh;

  console.log("=== Block defaults (insets absent → Aldrich KNEE_ADD path) ===");
  console.log(`  max Δ vs Aldrich: ${max.toFixed(6)} mm at ${at || "(none)"}`);
  console.log(
    `  Aldrich knee chord offsets (info): F inseam ${fInInset.toFixed(2)} / side ${fSideInset.toFixed(2)}; B inseam ${bInInset.toFixed(2)} / side ${bSideInset.toFixed(2)}`,
  );
  console.log(
    `  (Block does NOT use k=${K_SIDE} — separate path when insets absent.)`,
  );
  writeSvg(
    "scripts/aldrich-leg-front.svg",
    "Aldrich front",
    f.p9,
    f.p8,
    f.p15,
    f.p13,
    f.p14,
    f.p12,
  );
  writeSvg(
    "scripts/aldrich-leg-back.svg",
    "Aldrich back",
    b.p24,
    b.p25,
    b.p29,
    b.p27,
    b.p28,
    b.p26,
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

  const fSideCh = xOn(f.p8, f.p12, f.p13.y);
  const fInCh = xOn(f.p9, f.p14, f.p15.y);
  const bSideCh = xOn(b.p25, b.p26, b.p27.y);
  const bInCh = xOn(b.p24, b.p28, b.p29.y);
  // Pattern deltas matching the model: sideOut = knee−chord; inOut for inseam = chord−knee
  const fSideOff = f.p13.x - fSideCh;
  const fInOff = fInCh - f.p15.x; // should ≈ −inset if inset = −8 → wait
  // Model: inseam.x = chord - inset; inset=-8 → inseam = chord+8 → chord - inseam = -8 = inset
  const fInApplied = fInCh - f.p15.x;
  const bSideOff = b.p27.x - bSideCh;
  const bInApplied = bInCh - b.p29.x;

  const fInTurn = turnAt(pchipByY([f.p9, f.p15, f.p14]), f.p15);
  const fSideTurn = turnAt(pchipByY([f.p8, f.p13, f.p12]), f.p13);
  const bInTurn = turnAt(pchipByY([b.p24, b.p29, b.p28]), b.p29);
  const bSideTurn = turnAt(pchipByY([b.p25, b.p27, b.p26]), b.p27);

  console.log("\n=== Cleo preset ===");
  console.log(
    `  bottomWidth=${style.bottomWidth}  insets F=${style.frontInseamKneeInset} B=${style.backInseamKneeInset}`,
  );
  console.log(
    `  drafted F knee ${fKnee.toFixed(2)} (expect ~332)  hem ${fHem.toFixed(2)}`,
  );
  console.log(
    `  drafted B knee ${bKnee.toFixed(2)} (expect ~365)  hem ${bHem.toFixed(2)}`,
  );
  console.log(
    `  side vs chord (outboard +): F ${fSideOff.toFixed(2)} mm (expect k·inset=${(K_SIDE * (style.frontInseamKneeInset ?? 0)).toFixed(2)})`,
  );
  console.log(
    `  side vs chord (outboard +): B ${bSideOff.toFixed(2)} mm (expect ${(K_SIDE * (style.backInseamKneeInset ?? 0)).toFixed(2)})`,
  );
  console.log(
    `  inseam applied inset (chord−knee): F ${fInApplied.toFixed(2)}  B ${bInApplied.toFixed(2)}`,
  );
  console.log(
    `  turn angles — F inseam ${fInTurn.toFixed(3)}° side ${fSideTurn.toFixed(3)}°; B inseam ${bInTurn.toFixed(3)}° side ${bSideTurn.toFixed(3)}°`,
  );
  writeSvg(
    "scripts/cleo-leg-front.svg",
    `Cleo front knee=${fKnee.toFixed(0)}`,
    f.p9,
    f.p8,
    f.p15,
    f.p13,
    f.p14,
    f.p12,
  );
  writeSvg(
    "scripts/cleo-leg-back.svg",
    `Cleo back knee=${bKnee.toFixed(0)}`,
    b.p24,
    b.p25,
    b.p29,
    b.p27,
    b.p28,
    b.p26,
  );
  console.log("  wrote scripts/{aldrich,Cleo}-leg-{front,back}.svg");
}
