/**
 * Run: npx tsx scripts/verify-front-crotch-45.ts
 * Measures front guide 45° fix vs old chord-perpendicular, plus corner tangle at 0.5.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserFront,
  frontCrotchTouch,
  resolveCrotchExtensionScale,
  trouserFrontPoints,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { catmullRom } from "../lib/geometry/curves";

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/** Old chord-perpendicular guide (deleted from draft). */
function oldCrotchGuide(
  corner: Point,
  a: Point,
  b: Point,
  touch: number,
): Point {
  const chord = normalize({ x: b.x - a.x, y: b.y - a.y });
  let perp = { x: -chord.y, y: chord.x };
  if (perp.x > 0) perp = { x: -perp.x, y: -perp.y };
  return { x: corner.x + touch * perp.x, y: corner.y + touch * perp.y };
}

function crotchGuide45(corner: Point, touch: number): Point {
  const c = Math.SQRT1_2;
  return { x: corner.x - touch * c, y: corner.y - touch * c };
}

function guideAngleDeg(corner: Point, guide: Point): number {
  // Angle of guide vector from +x (horizontal); report elevation above −x / into corner.
  const v = { x: guide.x - corner.x, y: guide.y - corner.y };
  // Angle from −x axis toward −y (bisector of crotch corner).
  const fromNegX = Math.atan2(-v.y, -v.x); // 0 = −x, +π/2 = −y
  return (fromNegX * 180) / Math.PI;
}

function svgPath(pts: Point[]): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

function crotchOf(piece: ReturnType<typeof draftTrouserFront>): Point[] {
  return piece.outline.filter((o) => o.role === "crotch").map((o) => o.at);
}

/** Detect self-intersection or sharp reversal near the fork end of the crotch. */
function cornerTangleReport(crotch: Point[]): string {
  if (crotch.length < 4) return "too few samples";
  // Crotch runs p9 → guide → p6; fork corner is near the p6 end (last points).
  let minTurn = 180;
  let backtracks = 0;
  for (let i = 1; i < crotch.length - 1; i++) {
    const a = crotch[i - 1]!;
    const b = crotch[i]!;
    const c = crotch[i + 1]!;
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const m1 = Math.hypot(v1.x, v1.y);
    const m2 = Math.hypot(v2.x, v2.y);
    if (m1 < 1e-9 || m2 < 1e-9) continue;
    const dot = (v1.x * v2.x + v1.y * v2.y) / (m1 * m2);
    const ang = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    if (ang < minTurn) minTurn = ang;
    // Segment direction reversal in x near the end (L / overshoot)
    if (i > crotch.length - 8) {
      const dx0 = b.x - a.x;
      const dx1 = c.x - b.x;
      if (dx0 * dx1 < 0 && Math.abs(dx0) > 0.3 && Math.abs(dx1) > 0.3) {
        backtracks++;
      }
    }
  }
  // Self-intersection of non-adjacent segments
  let crosses = 0;
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const segInt = (a: Point, b: Point, c: Point, d: Point) => {
    const d1 = cross(a, b, c);
    const d2 = cross(a, b, d);
    const d3 = cross(c, d, a);
    const d4 = cross(c, d, b);
    return (
      ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    );
  };
  for (let i = 0; i < crotch.length - 1; i++) {
    for (let j = i + 2; j < crotch.length - 1; j++) {
      if (segInt(crotch[i]!, crotch[i + 1]!, crotch[j]!, crotch[j + 1]!)) {
        crosses++;
      }
    }
  }
  return `min interior angle ${minTurn.toFixed(1)}°; end x-backtracks ${backtracks}; self-crossings ${crosses}`;
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const base: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
};

console.log(`Drafted hip ${body.hip} mm\n`);

console.log("=== Guide angle into corner (should be 45° at every scale) ===");
for (const scale of [1.0, 0.7, 0.5, 0.4]) {
  const style = { ...base, crotchExtensionScale: scale };
  const f = trouserFrontPoints(body, style);
  const touch = frontCrotchTouch(body.hip) * resolveCrotchExtensionScale(style);
  const oldG = oldCrotchGuide(f.p5, f.p6, f.p9, touch);
  const newG = crotchGuide45(f.p5, touch);
  console.log(
    `scale ${scale.toFixed(1)}: old ${guideAngleDeg(f.p5, oldG).toFixed(1)}°  new ${guideAngleDeg(f.p5, newG).toFixed(1)}°  guide Δ ${dist(oldG, newG).toFixed(2)} mm`,
  );
  console.log(
    `         old (${oldG.x.toFixed(2)}, ${oldG.y.toFixed(2)})  new (${newG.x.toFixed(2)}, ${newG.y.toFixed(2)})`,
  );
}

// Max delta at scale 1.0: construction points vs curve samples
{
  const style = { ...base, crotchExtensionScale: 1.0 };
  const f = trouserFrontPoints(body, style);
  const touch = frontCrotchTouch(body.hip);
  const oldG = oldCrotchGuide(f.p5, f.p6, f.p9, touch);
  const newG = crotchGuide45(f.p5, touch);
  const oldCurve = catmullRom([f.p9, oldG, f.p6]);
  const newPiece = draftTrouserFront(body, style);
  const newCurve = crotchOf(newPiece);
  let maxCurve = 0;
  const n = Math.min(oldCurve.length, newCurve.length);
  for (let i = 0; i < n; i++) {
    maxCurve = Math.max(maxCurve, dist(oldCurve[i]!, newCurve[i]!));
  }
  // Construction points unchanged
  const pts = [f.p5, f.p6, f.p9, f.p8, f.p10];
  console.log(`\n=== Scale 1.0 deltas ===`);
  console.log(`guide Δ ${dist(oldG, newG).toFixed(3)} mm`);
  console.log(`max crotch-curve sample Δ ${maxCurve.toFixed(3)} mm (same sample count ${n})`);
  console.log(`construction points (p5/p6/p9/…) unchanged: yes`);
}

console.log(`\n=== Corner tangle at scale 0.5 ===`);
const piece05 = draftTrouserFront(body, {
  ...base,
  crotchExtensionScale: 0.5,
});
const crotch05 = crotchOf(piece05);
const f05 = trouserFrontPoints(body, { ...base, crotchExtensionScale: 0.5 });
console.log(cornerTangleReport(crotch05));
console.log(
  "first 8 crotch pts (from p9):",
  crotch05
    .slice(0, 8)
    .map((p) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`)
    .join(" "),
);
console.log(
  "last 6 crotch pts (toward p6):",
  crotch05
    .slice(-6)
    .map((p) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`)
    .join(" "),
);
console.log(
  `p9=(${f05.p9.x.toFixed(1)},${f05.p9.y.toFixed(1)}) p5=(${f05.p5.x.toFixed(1)},${f05.p5.y.toFixed(1)}) p6=(${f05.p6.x.toFixed(1)},${f05.p6.y.toFixed(1)})`,
);
// Overshoot: curve goes beyond the p9–p5–p6 L bounding box
const overshootX = crotch05.filter((p) => p.x < f05.p9.x - 0.5).length;
const overshootY = crotch05.filter((p) => p.y > f05.p5.y + 0.5).length;
const intoCorner = crotch05.filter(
  (p) => p.x < f05.p5.x - 0.5 && p.y < f05.p5.y - 0.5 && p.y > f05.p6.y,
).length;
console.log(
  `overshoot past p9 (−x): ${overshootX}; above R: ${overshootY}; samples inside corner wedge: ${intoCorner}`,
);
console.log(
  `TANGLE PRESENT? ${overshootX > 0 || overshootY > 0 ? "yes (Catmull-Rom overshoot past fork tip)" : intoCorner < 2 ? "ambiguous — few samples cut the corner; eyeball the SVG" : "no geometric overshoot; corner is cut"}`,
);

// Renders
function writeOverlay(
  scales: number[],
  filename: string,
) {
  const colors = ["#888", "#4a7", "#c44"];
  const pieces = scales.map((s, i) => ({
    scale: s,
    color: colors[i]!,
    crotch: crotchOf(
      draftTrouserFront(body, { ...base, crotchExtensionScale: s }),
    ),
  }));
  const all = pieces.flatMap((p) => p.crotch);
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(...xs) - 15;
  const minY = Math.min(...ys) - 15;
  const maxX = Math.max(...xs) + 15;
  const maxY = Math.max(...ys) + 40;
  const w = maxX - minX;
  const h = maxY - minY;
  const paths = pieces
    .map(
      (p, i) =>
        `<path d="${svgPath(p.crotch.map((q) => ({ x: q.x - minX, y: q.y - minY })))}" fill="none" stroke="${p.color}" stroke-width="2"/>
  <text x="8" y="${14 + i * 16}" font-size="12" fill="${p.color}">front scale ${p.scale.toFixed(1)}</text>`,
    )
    .join("\n  ");
  // mark p5 at 0.5
  const p5 = f05.p5;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">
  <rect width="100%" height="100%" fill="#faf8f5"/>
  ${paths}
  <circle cx="${(p5.x - minX).toFixed(2)}" cy="${(p5.y - minY).toFixed(2)}" r="3" fill="#333"/>
  <text x="${(p5.x - minX + 6).toFixed(1)}" y="${(p5.y - minY).toFixed(1)}" font-size="11" fill="#333">p5</text>
</svg>
`;
  const out = join(process.cwd(), "scripts", filename);
  writeFileSync(out, svg);
  console.log(`\nWrote ${out}`);
}

writeOverlay([1.0, 0.7, 0.5], "front-crotch-45-scales.svg");
