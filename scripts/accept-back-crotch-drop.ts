/**
 * Acceptance: backCrotchDrop terminus (Aldrich hook vs Izzy flat).
 * Run: npx tsx scripts/accept-back-crotch-drop.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyEase,
  type OutlinePoint,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { polylineLength } from "../lib/geometry/curves";
import {
  withSeamAllowance,
  DEFAULT_SEAM_ALLOWANCE,
} from "../lib/geometry/seamAllowance";
import {
  draftTrouserBack,
  draftTrouserFront,
  draftBackCrotch,
  trouserBackPoints,
  withWaistband,
  DEFAULT_CROTCH_ARRIVAL_ANGLE,
  WAISTLINE_CURVE_FRONT,
  DEFAULT_FRONT_WAIST_INSET,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function base(drop: number): TrouserFrontStyle {
  return withWaistband(
    {
      bottomWidth: 220,
      block: "classic",
      waistDrop: 0,
      crotchExtensionScale: 0.5,
      crotchArrivalAngle: DEFAULT_CROTCH_ARRIVAL_ANGLE,
      waistlineCurveFront: WAISTLINE_CURVE_FRONT,
      frontWaistInset: DEFAULT_FRONT_WAIST_INSET,
      backCrotchDrop: drop,
    },
    0,
    "darted",
    body,
  );
}

const near = (a: Point, b: Point, t = 0.08) =>
  Math.hypot(a.x - b.x, a.y - b.y) < t;
const fmt = (p: Point) => `(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`;

function rolePts(outline: OutlinePoint[], role: string): Point[] {
  return outline.filter((o) => o.role === role).map((o) => o.at);
}

function turnAngleDeg(a: Point, b: Point, c: Point): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot =
    (v1.x * v2.x + v1.y * v2.y) /
    (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

function selfIntersect(pts: Point[]): boolean {
  const n = pts.length;
  const orient = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const crosses = (a: Point, b: Point, c: Point, d: Point) => {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    return o1 * o2 < 0 && o3 * o4 < 0;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const c = pts[j]!;
      const d = pts[(j + 1) % n]!;
      if (crosses(a, b, c, d)) return true;
    }
  }
  return false;
}

function dumpJunction(drop: number) {
  const style = base(drop);
  const b = trouserBackPoints(body, style);
  const d = draftBackCrotch(b);
  const back = draftTrouserBack(body, style);
  const front = draftTrouserFront(body, style);
  const outline = back.outline;
  const T = d.T;

  console.log(`\n========== drop = ${drop} ==========`);
  console.log(`T = ${fmt(T)}  p23 = ${fmt(b.p23)}  p24 = ${fmt(b.p24)}  K = ${fmt(d.K)}`);
  console.log(`crotchDrop=${d.crotchDrop} horizRun=${d.horizRun.toFixed(3)} touchMiss=${d.touchMiss.toFixed(3)}`);
  console.log(`P3=${fmt(d.P3)} (bezier end)`);

  // Find T on outline
  let iT = -1;
  for (let i = 0; i < outline.length; i++) {
    if (near(outline[i]!.at, T, 0.1)) {
      iT = i;
      break;
    }
  }
  console.log(`outline idx at T: ${iT} role=${outline[iT]?.role}`);

  // Dump around junction: a few points before and after T
  console.log(`#\trole\tx\ty\tnote`);
  const lo = Math.max(0, iT - 3);
  const hi = Math.min(outline.length - 1, iT + 4);
  for (let i = lo; i <= hi; i++) {
    const o = outline[i]!;
    let note = "";
    if (near(o.at, T, 0.1)) note = "T";
    else if (near(o.at, b.p23, 0.1)) note = "p23";
    else if (near(o.at, d.K, 0.5)) note = "K";
    else if (near(o.at, b.p19, 0.5)) note = "p19";
    console.log(
      `${i - lo}\t${o.role}\t${o.at.x.toFixed(3)}\t${o.at.y.toFixed(3)}\t${note}`,
    );
  }

  // Step check: any vertical crotch segment at tip?
  const crotch = rolePts(outline, "crotch");
  let stepInCrotch = false;
  for (let i = 0; i < crotch.length - 1; i++) {
    const a = crotch[i]!;
    const c = crotch[i + 1]!;
    if (Math.abs(a.x - c.x) < 0.05 && Math.abs(a.y - c.y) > 1) {
      stepInCrotch = true;
    }
  }
  console.log(`vertical step inside crotch role: ${stepInCrotch} (want false)`);

  // Turn at T: crotch → inseam. Outline order: … inseam … T … crotch …
  // At junction, T has crotch role (edge leaving T is crotch).
  // Incoming inseam: previous point → T; outgoing crotch: T → next.
  const prev = outline[iT - 1]!;
  const at = outline[iT]!;
  const next = outline[iT + 1]!;
  const turn = turnAngleDeg(prev.at, at.at, next.at);
  console.log(
    `junction turn (inseam→crotch at T): ${turn.toFixed(2)}°  prev role=${prev.role} next role=${next.role}`,
  );
  console.log(`  prev ${fmt(prev.at)} → T ${fmt(at.at)} → next ${fmt(next.at)}`);

  const fIn = polylineLength(rolePts(front.outline, "inseam"));
  const bIn = polylineLength(rolePts(back.outline, "inseam"));
  console.log(`inseam front=${fIn.toFixed(3)} back=${bIn.toFixed(3)} Δ=${(bIn - fIn).toFixed(3)}`);

  // Arrival direction used
  if (drop < 1e-9) {
    console.log(`arrival: horizontal at K`);
  } else {
    const ax = T.x - d.K.x;
    const ay = T.y - d.K.y;
    const ang = (Math.atan2(ay, ax) * 180) / Math.PI;
    console.log(
      `arrival: direction K→T = (${ax.toFixed(3)}, ${ay.toFixed(3)}) angle ${ang.toFixed(2)}° from +x`,
    );
  }

  // SA
  const cut = withSeamAllowance(
    { pieces: [front, back] },
    DEFAULT_SEAM_ALLOWANCE,
  );
  const backCut = cut.pieces.find((p) => p.name === "Trouser back")!;
  const cutPts = (backCut.cuttingOutline ?? backCut.outline.map((o) => o.at)).map(
    (p) => ("at" in (p as object) ? (p as OutlinePoint).at : (p as Point)),
  );
  console.log(`SA self-intersects: ${selfIntersect(cutPts)}`);

  // SVG
  const netPts = outline.map((o) => o.at);
  const cx = T.x;
  const cy = T.y;
  const zoom = 70;
  const pathD = (pts: Point[]) =>
    pts
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cx - zoom} ${cy - zoom} ${2 * zoom} ${2 * zoom}">
  <rect x="${cx - zoom}" y="${cy - zoom}" width="${2 * zoom}" height="${2 * zoom}" fill="#faf8f5"/>
  <path d="${pathD(netPts)}" fill="none" stroke="#1a5fb4" stroke-width="1.2"/>
  <path d="${pathD(cutPts)}" fill="none" stroke="#c64600" stroke-width="0.9" stroke-dasharray="4 2"/>
  <circle cx="${d.K.x}" cy="${d.K.y}" r="1.6" fill="#2ec27e"/><text x="${d.K.x + 2}" y="${d.K.y - 2}" font-size="7" fill="#2ec27e">K</text>
  <circle cx="${b.p23.x}" cy="${b.p23.y}" r="1.6" fill="#1c71d8"/><text x="${b.p23.x + 2}" y="${b.p23.y - 2}" font-size="7" fill="#1c71d8">p23</text>
  <circle cx="${T.x}" cy="${T.y}" r="1.6" fill="#e66100"/><text x="${T.x + 2}" y="${T.y + 8}" font-size="7" fill="#e66100">T</text>
  <text x="${cx - zoom + 4}" y="${cy - zoom + 12}" font-size="9">drop=${drop} — blue net, orange SA</text>
</svg>`;
  const file = join("scripts", `back-crotch-drop-${drop}.svg`);
  writeFileSync(file, svg);
  console.log(`wrote ${file}`);
}

dumpJunction(5);
dumpJunction(0);
