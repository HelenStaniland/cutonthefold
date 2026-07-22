/**
 * Acceptance: CF hipline notch at y=D; check back hipline notch.
 * Run: npx tsx scripts/diag-hipline-notch.ts
 */
import {
  applyEase,
  type Point,
  type PatternPiece,
  type Marking,
} from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserFront,
  draftTrouserBack,
  trouserFrontPoints,
  trouserBackPoints,
  resolveCrotchStraightRun,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { CLEO_PRESET } from "../lib/pattern/blockPresets";
import { writeFileSync } from "fs";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function aldrich(style: Partial<TrouserFrontStyle> = {}): TrouserFrontStyle {
  return withWaistband(
    { bottomWidth: 220, block: "classic", waistDrop: 0, ...style },
    0,
    "darted",
    body,
  );
}

function cleoBandOff(): TrouserFrontStyle {
  const m = CLEO_PRESET.measured;
  return withWaistband(
    {
      bottomWidth: 220,
      block: "classic",
      waistDrop: m.waistDrop,
      crotchStraightRun: m.crotchStraightRun,
      frontWaistInset: m.frontWaistInset,
      crotchArrivalAngle: m.crotchArrivalAngle,
      backCrotchDrop: m.backCrotchDrop,
      frontCrotchFullness: m.frontCrotchFullness,
      backCrotchFullness: m.backCrotchFullness,
      frontCrotchExtensionScale: m.frontCrotchExtensionScale,
      backCrotchExtensionScale: m.backCrotchExtensionScale,
      waistlineCurveFront: CLEO_PRESET.provisional.waistlineCurveFront,
    },
    0,
    "darted",
    body,
  );
}

function fmt(p: Point): string {
  return `(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** CF/CB hipline notch: at y≈D, on the centre seam (not the side-hip notch). */
function centreHipNotch(
  piece: PatternPiece,
  D: number,
  sideHipX: number,
): Marking | undefined {
  const candidates = piece.markings.filter(
    (m) =>
      m.kind === "notch" &&
      Math.abs(m.at.y - D) < 0.5 &&
      Math.abs(m.at.x - sideHipX) > 20,
  );
  // Prefer the more inward (more negative / CB-side) point among remaining
  return candidates.sort((a, b) => a.at.x - b.at.x)[0];
}

function maxStraightRun(style: TrouserFrontStyle): number {
  const pts = trouserFrontPoints(body, style);
  // Scooped CF y from the drafted outline: last centre-front / crotch tip→waist endpoint
  const front = draftTrouserFront(body, { ...style, crotchStraightRun: undefined });
  const cfPts = front.outline.filter(
    (o) => o.role === "centre-front" || o.role === "crotch",
  );
  // At default departure, P0 is at D; waist end is the highest (smallest y) on crotch+CF
  const waistY = Math.min(...cfPts.map((o) => o.at.y));
  return resolveCrotchStraightRun(
    { crotchStraightRun: 1e9 },
    pts.p5.y,
    pts.p6.y,
    waistY,
  );
}

const defaultMax = maxStraightRun(aldrich());
const f0 = trouserFrontPoints(body, aldrich());
console.log(
  "Body hip",
  body.hip,
  "D",
  f0.p6.y.toFixed(2),
  "fork",
  Math.abs(f0.p5.x).toFixed(2),
  "maxRun",
  defaultMax.toFixed(2),
);

console.log("\n=== Front CF hipline notch ===");
console.log(
  "run".padStart(8),
  "notch".padStart(28),
  "p6".padStart(28),
  "Δp6".padStart(10),
);

const runs = [0, defaultMax / 2, defaultMax];
for (const run of runs) {
  const style = aldrich({ crotchStraightRun: run });
  const front = draftTrouserFront(body, style);
  const pts = trouserFrontPoints(body, style);
  const n = centreHipNotch(front, pts.p6.y, pts.p8.x);
  const delta = n ? dist(n.at, pts.p6) : NaN;
  console.log(
    run.toFixed(1).padStart(8),
    (n ? fmt(n.at) : "MISSING").padStart(28),
    fmt(pts.p6).padStart(28),
    (n ? delta.toFixed(4) : "—").padStart(10),
  );
}

console.log("\n=== Sweep ===");
let prevX: number | null = null;
for (let i = 0; i <= 10; i++) {
  const run = (defaultMax * i) / 10;
  const style = aldrich({ crotchStraightRun: run });
  const front = draftTrouserFront(body, style);
  const pts = trouserFrontPoints(body, style);
  const n = centreHipNotch(front, pts.p6.y, pts.p8.x);
  const dx = prevX != null && n ? n.at.x - prevX : 0;
  if (n) prevX = n.at.x;
  console.log(
    `  run=${run.toFixed(1).padStart(6)}  present=${!!n}  ${n ? fmt(n.at) : "—"}  Δp6=${n ? dist(n.at, pts.p6).toFixed(4) : "—"}  Δx_step=${n ? dx.toFixed(3) : "—"}`,
  );
}

console.log("\n=== Back CB hipline notch (excludes side p25) ===");
for (const [label, style] of [
  ["Aldrich defaults", aldrich()] as const,
  ["Cleo (band off)", cleoBandOff()] as const,
]) {
  const back = draftTrouserBack(body, style);
  const b = trouserBackPoints(body, style);
  const n = centreHipNotch(back, b.p17.y, b.p25.x);
  console.log(label);
  console.log(
    `  p17 ${fmt(b.p17)}  notch ${n ? fmt(n.at) : "MISSING"}  Δp17 ${n ? dist(n.at, b.p17).toFixed(3) : "—"}`,
  );
}

// SVG at departure 0
{
  const style = aldrich({ crotchStraightRun: 0 });
  const front = draftTrouserFront(body, style);
  const pts = trouserFrontPoints(body, style);
  const hip = centreHipNotch(front, pts.p6.y, pts.p8.x);
  const xs = front.outline.map((o) => o.at.x);
  const ys = front.outline.map((o) => o.at.y);
  const minX = Math.min(...xs) - 40;
  const maxX = Math.max(...xs) + 40;
  const minY = Math.min(...ys) - 40;
  const maxY = Math.max(...ys) + 40;
  const w = maxX - minX;
  const h = maxY - minY;
  const path = front.outline
    .map(
      (o, i) =>
        `${i === 0 ? "M" : "L"}${o.at.x.toFixed(2)},${o.at.y.toFixed(2)}`,
    )
    .join(" ");
  const notches = front.markings
    .filter((m) => m.kind === "notch")
    .map((m) => {
      const isHip =
        hip && Math.hypot(m.at.x - hip.at.x, m.at.y - hip.at.y) < 0.1;
      return `<circle cx="${m.at.x}" cy="${m.at.y}" r="${isHip ? 7 : 3}" fill="${isHip ? "#c00" : "#333"}" />`;
    })
    .join("\n");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="480" height="${((480 * h) / w).toFixed(0)}">
  <rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#faf8f5"/>
  <line x1="${minX}" y1="${pts.p6.y}" x2="${maxX}" y2="${pts.p6.y}" stroke="#88a" stroke-dasharray="4 3" stroke-width="1"/>
  <path d="${path} Z" fill="none" stroke="#222" stroke-width="1.5"/>
  ${notches}
  <text x="${minX + 10}" y="${minY + 24}" font-size="14" fill="#c00">CF hipline notch @ departure 0 (red)</text>
  <text x="${minX + 10}" y="${pts.p6.y - 6}" font-size="11" fill="#88a">y = D</text>
</svg>`;
  writeFileSync("scripts/cf-hipline-notch-departure0.svg", svg);
  console.log("\nWrote scripts/cf-hipline-notch-departure0.svg");
  console.log("Hip notch at departure 0:", hip ? fmt(hip.at) : "MISSING");
}

// Aldrich default (crotchStraightRun omitted) must land on p6
{
  const style = aldrich();
  const front = draftTrouserFront(body, style);
  const pts = trouserFrontPoints(body, style);
  const n = centreHipNotch(front, pts.p6.y, pts.p8.x);
  console.log("\n=== Aldrich default (omit crotchStraightRun) ===");
  console.log(
    `  notch ${n ? fmt(n.at) : "MISSING"}  p6 ${fmt(pts.p6)}  Δ ${n ? dist(n.at, pts.p6).toFixed(4) : "—"}`,
  );
}
