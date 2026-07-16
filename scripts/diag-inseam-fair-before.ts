/**
 * Inseam fairing — BEFORE metrics (curve+straight).
 * Run before the code change: npx tsx scripts/diag-inseam-fair-before.ts
 */
import { writeFileSync } from "fs";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { polylineLength, quadBezier } from "../lib/geometry/curves";
import {
  trouserFrontPoints,
  trouserBackPoints,
  draftTrouserFront,
  draftTrouserBack,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { BLOCK_TROUSER_STYLE } from "../lib/pattern/garmentStyles";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function normalize(v: Point): Point {
  const L = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / L, y: v.y / L };
}

function insideLegControl(a: Point, b: Point, bulge = 7.5): Point {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const d = { x: b.x - a.x, y: b.y - a.y };
  let n = normalize({ x: d.y, y: -d.x });
  if (n.x < 0) n = { x: -n.x, y: -n.y };
  return { x: m.x + 2 * bulge * n.x, y: m.y + 2 * bulge * n.y };
}

/** Old inseam tip→knee→hem (curve then straight), matching current draft. */
function oldInseam(
  tip: Point,
  knee: Point,
  hem: Point,
  bulge: number,
): Point[] {
  const ctrl = insideLegControl(tip, knee, bulge);
  const toFork = quadBezier(knee, ctrl, tip).slice(1); // excludes knee, ends at tip
  // tip → … → knee → hem
  return [tip, ...[...toFork].reverse().slice(1), knee, hem];
}

function turnAtKnee(poly: Point[], knee: Point): {
  arrive: number;
  leave: number;
  turn: number;
} {
  // find knee index
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
  const b = poly[ki + 1]!;
  const arrive = (Math.atan2(k.x - a.x, k.y - a.y) * 180) / Math.PI;
  const leave = (Math.atan2(b.x - k.x, b.y - k.y) * 180) / Math.PI;
  let turn = leave - arrive;
  while (turn > 180) turn -= 360;
  while (turn < -180) turn += 360;
  return { arrive, leave, turn };
}

function maxDev(a: Point[], b: Point[]): number {
  // sample a denser, measure distance to b
  let max = 0;
  for (const p of a) {
    let best = Infinity;
    for (let i = 0; i < b.length - 1; i++) {
      const A = b[i]!;
      const B = b[i + 1]!;
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const seg = Math.hypot(dx, dy) || 1;
      const t = Math.max(
        0,
        Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / (seg * seg)),
      );
      const d = Math.hypot(p.x - (A.x + t * dx), p.y - (A.y + t * dy));
      if (d < best) best = d;
    }
    if (best > max) max = best;
  }
  return max;
}

function midBow(
  tip: Point,
  knee: Point,
  poly: Point[],
): { chordMid: Point; onCurve: Point; bow: number } {
  const midY = (tip.y + knee.y) / 2;
  const chordX = tip.x + ((knee.x - tip.x) * (midY - tip.y)) / (knee.y - tip.y);
  // find poly at midY
  let on = poly[0]!;
  for (let i = 0; i < poly.length - 1; i++) {
    const A = poly[i]!;
    const B = poly[i + 1]!;
    if (
      (A.y <= midY && B.y >= midY) ||
      (B.y <= midY && A.y >= midY)
    ) {
      const t = (midY - A.y) / (B.y - A.y || 1);
      on = { x: A.x + t * (B.x - A.x), y: midY };
      break;
    }
  }
  return {
    chordMid: { x: chordX, y: midY },
    onCurve: on,
    bow: on.x - chordX, // signed; inward typically more negative on front
  };
}

function styleFor(bottomWidth: number): TrouserFrontStyle {
  return withWaistband(
    {
      bottomWidth,
      waistDrop: 0,
    },
    0,
    "darted",
    body,
  );
}

function writeSvg(
  path: string,
  label: string,
  inseam: Point[],
  knee: Point,
  tip: Point,
  hem: Point,
) {
  const xs = inseam.map((p) => p.x);
  const ys = inseam.map((p) => p.y);
  const minX = Math.min(...xs) - 40;
  const maxX = Math.max(...xs) + 40;
  const minY = Math.min(...ys) - 40;
  const maxY = Math.max(...ys) + 40;
  const w = maxX - minX;
  const h = maxY - minY;
  const d = inseam
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="360" height="${((360 * h) / w).toFixed(0)}">
  <rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#faf8f5"/>
  <path d="${d}" fill="none" stroke="#222" stroke-width="2"/>
  <circle cx="${tip.x}" cy="${tip.y}" r="3" fill="#2563eb"/>
  <circle cx="${knee.x}" cy="${knee.y}" r="5" fill="#c00"/>
  <circle cx="${hem.x}" cy="${hem.y}" r="3" fill="#2563eb"/>
  <text x="${minX + 8}" y="${minY + 18}" font-size="12" fill="#333">${label}</text>
</svg>`;
  writeFileSync(path, svg);
}

function report(label: string, bottomWidth: number) {
  const style = styleFor(bottomWidth);
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const fIn = oldInseam(f.p9, f.p15, f.p14, 7.5);
  const bIn = oldInseam(b.p24, b.p29, b.p28, 12.5);
  const fTurn = turnAtKnee(fIn, f.p15);
  const bTurn = turnAtKnee(bIn, b.p29);
  const fBow = midBow(f.p9, f.p15, fIn);
  const bBow = midBow(b.p24, b.p29, bIn);

  // Also from drafted piece outline (authoritative)
  const front = draftTrouserFront(body, style);
  const back = draftTrouserBack(body, style);
  const fOut = front.outline
    .filter((o) => o.role === "inseam")
    .map((o) => o.at);
  const bOut = back.outline
    .filter((o) => o.role === "inseam")
    .map((o) => o.at);

  console.log(`\n=== ${label} (bottomWidth=${bottomWidth}) ===`);
  console.log(
    `front knee width |p15−p13|=${Math.abs(f.p15.x - f.p13.x).toFixed(3)}`,
  );
  console.log(
    `back  knee width |p29−p27|=${Math.abs(b.p29.x - b.p27.x).toFixed(3)}`,
  );
  console.log(
    `front turn at knee: arrive ${fTurn.arrive.toFixed(2)}° leave ${fTurn.leave.toFixed(2)}° turn ${fTurn.turn.toFixed(2)}°`,
  );
  console.log(
    `back  turn at knee: arrive ${bTurn.arrive.toFixed(2)}° leave ${bTurn.leave.toFixed(2)}° turn ${bTurn.turn.toFixed(2)}°`,
  );
  console.log(
    `front crotch→knee bow (x−chord at midY): ${fBow.bow.toFixed(3)} mm`,
  );
  console.log(
    `back  crotch→knee bow (x−chord at midY): ${bBow.bow.toFixed(3)} mm`,
  );
  console.log(`old inseam lengths F ${polylineLength(fIn).toFixed(2)} B ${polylineLength(bIn).toFixed(2)}`);
  console.log(`outline inseam pts F ${fOut.length} B ${bOut.length}`);

  writeSvg(
    `scripts/inseam-before-front-bw${bottomWidth}.svg`,
    `BEFORE front bw=${bottomWidth}`,
    fIn,
    f.p15,
    f.p9,
    f.p14,
  );
  writeSvg(
    `scripts/inseam-before-back-bw${bottomWidth}.svg`,
    `BEFORE back bw=${bottomWidth}`,
    bIn,
    b.p29,
    b.p24,
    b.p28,
  );

  return { fIn, bIn, f, b, fTurn, bTurn, fBow, bBow };
}

console.log("BEFORE fairing — body hip", body.hip);
const def = report("default hem", BLOCK_TROUSER_STYLE.legBottomWidth);
const wide = report("wide hem", 420);

// Persist before polys for after-compare
writeFileSync(
  "scripts/inseam-before-polys.json",
  JSON.stringify({
    default: {
      fIn: def.fIn,
      bIn: def.bIn,
      fKnee: def.f.p15,
      bKnee: def.b.p29,
      fBow: def.fBow,
      bBow: def.bBow,
      fTurn: def.fTurn,
      bTurn: def.bTurn,
      fKneeW: Math.abs(def.f.p15.x - def.f.p13.x),
      bKneeW: Math.abs(def.b.p29.x - def.b.p27.x),
    },
    wide: {
      fTurn: wide.fTurn,
      bTurn: wide.bTurn,
      fKneeW: Math.abs(wide.f.p15.x - wide.f.p13.x),
      bKneeW: Math.abs(wide.b.p29.x - wide.b.p27.x),
    },
  }),
);
console.log("\nWrote scripts/inseam-before-*.svg and inseam-before-polys.json");
