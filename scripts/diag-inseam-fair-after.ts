/**
 * Inseam fairing — AFTER metrics (pchip tip→knee→hem).
 * Run: npx tsx scripts/diag-inseam-fair-after.ts
 */
import { writeFileSync, readFileSync } from "fs";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { polylineLength, pchipByY, quadBezier } from "../lib/geometry/curves";
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

function oldInseam(
  tip: Point,
  knee: Point,
  hem: Point,
  bulge: number,
): Point[] {
  const ctrl = insideLegControl(tip, knee, bulge);
  const toFork = quadBezier(knee, ctrl, tip).slice(1);
  return [tip, ...[...toFork].reverse().slice(1), knee, hem];
}

function newInseam(tip: Point, knee: Point, hem: Point): Point[] {
  return pchipByY([tip, knee, hem]);
}

function turnAtKnee(poly: Point[], knee: Point): {
  arrive: number;
  leave: number;
  turn: number;
  kneeOnCurve: number;
} {
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
  return { arrive, leave, turn, kneeOnCurve: best };
}

/** Heading from +x (east), degrees — matches owner's 81.8° / 101.1° style. */
function headingFromEast(a: Point, b: Point): number {
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

function turnAtKneeEast(poly: Point[], knee: Point): {
  arrive: number;
  leave: number;
  turn: number;
} {
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
  const arrive = headingFromEast(a, k);
  const leave = headingFromEast(k, c);
  let turn = leave - arrive;
  while (turn > 180) turn -= 360;
  while (turn < -180) turn += 360;
  return { arrive, leave, turn };
}

function maxDev(a: Point[], b: Point[]): number {
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
): number {
  const midY = (tip.y + knee.y) / 2;
  const chordX = tip.x + ((knee.x - tip.x) * (midY - tip.y)) / (knee.y - tip.y);
  let onX = tip.x;
  for (let i = 0; i < poly.length - 1; i++) {
    const A = poly[i]!;
    const B = poly[i + 1]!;
    if ((A.y <= midY && B.y >= midY) || (B.y <= midY && A.y >= midY)) {
      const t = (midY - A.y) / (B.y - A.y || 1);
      onX = A.x + t * (B.x - A.x);
      break;
    }
  }
  return onX - chordX;
}

function styleFor(bottomWidth: number): TrouserFrontStyle {
  return withWaistband({ bottomWidth, waistDrop: 0 }, 0, "darted", body);
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
  <path d="${d}" fill="none" stroke="#c44" stroke-width="2"/>
  <circle cx="${tip.x}" cy="${tip.y}" r="3" fill="#2563eb"/>
  <circle cx="${knee.x}" cy="${knee.y}" r="5" fill="#c00"/>
  <circle cx="${hem.x}" cy="${hem.y}" r="3" fill="#2563eb"/>
  <text x="${minX + 8}" y="${minY + 18}" font-size="12" fill="#333">${label}</text>
</svg>`;
  writeFileSync(path, svg);
}

function report(label: string, bottomWidth: number, bulgeF: number, bulgeB: number) {
  const style = styleFor(bottomWidth);
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const fOld = oldInseam(f.p9, f.p15, f.p14, bulgeF);
  const bOld = oldInseam(b.p24, b.p29, b.p28, bulgeB);
  const fNew = newInseam(f.p9, f.p15, f.p14);
  const bNew = newInseam(b.p24, b.p29, b.p28);

  const fTurnOld = turnAtKnee(fOld, f.p15);
  const bTurnOld = turnAtKnee(bOld, b.p29);
  const fTurnNew = turnAtKnee(fNew, f.p15);
  const bTurnNew = turnAtKnee(bNew, b.p29);
  const fEastOld = turnAtKneeEast(fOld, f.p15);
  const fEastNew = turnAtKneeEast(fNew, f.p15);

  const front = draftTrouserFront(body, style);
  const back = draftTrouserBack(body, style);
  // Confirm outline passes through knee
  const fOutKnee = front.outline
    .filter((o) => o.role === "inseam")
    .map((o) => o.at)
    .reduce(
      (best, p) => {
        const d = Math.hypot(p.x - f.p15.x, p.y - f.p15.y);
        return d < best.d ? { d, p } : best;
      },
      { d: Infinity, p: f.p15 },
    );
  const bOutKnee = back.outline
    .filter((o) => o.role === "inseam")
    .map((o) => o.at)
    .reduce(
      (best, p) => {
        const d = Math.hypot(p.x - b.p29.x, p.y - b.p29.y);
        return d < best.d ? { d, p } : best;
      },
      { d: Infinity, p: b.p29 },
    );

  console.log(`\n=== ${label} (bottomWidth=${bottomWidth}) ===`);
  console.log(
    `knee width F |p15−p13|=${Math.abs(f.p15.x - f.p13.x).toFixed(3)}  B |p29−p27|=${Math.abs(b.p29.x - b.p27.x).toFixed(3)}`,
  );
  console.log(
    `knee on drafted inseam: F Δ=${fOutKnee.d.toFixed(4)} mm  B Δ=${bOutKnee.d.toFixed(4)} mm`,
  );
  console.log("TURN (heading from +y / down):");
  console.log(
    `  front BEFORE turn ${fTurnOld.turn.toFixed(2)}° (arrive ${fTurnOld.arrive.toFixed(2)} leave ${fTurnOld.leave.toFixed(2)})`,
  );
  console.log(
    `  front AFTER  turn ${fTurnNew.turn.toFixed(2)}° (arrive ${fTurnNew.arrive.toFixed(2)} leave ${fTurnNew.leave.toFixed(2)})`,
  );
  console.log(
    `  back  BEFORE turn ${bTurnOld.turn.toFixed(2)}°`,
  );
  console.log(
    `  back  AFTER  turn ${bTurnNew.turn.toFixed(2)}°`,
  );
  console.log("TURN (heading from +x / east — owner convention):");
  console.log(
    `  front BEFORE arrive ${fEastOld.arrive.toFixed(2)}° leave ${fEastOld.leave.toFixed(2)}° turn ${fEastOld.turn.toFixed(2)}°`,
  );
  console.log(
    `  front AFTER  arrive ${fEastNew.arrive.toFixed(2)}° leave ${fEastNew.leave.toFixed(2)}° turn ${fEastNew.turn.toFixed(2)}°`,
  );

  const devF = Math.max(maxDev(fNew, fOld), maxDev(fOld, fNew));
  const devB = Math.max(maxDev(bNew, bOld), maxDev(bOld, bNew));
  console.log(
    `max deviation new↔old: F ${devF.toFixed(3)} mm  B ${devB.toFixed(3)} mm`,
  );

  const bowFOld = midBow(f.p9, f.p15, fOld);
  const bowFNew = midBow(f.p9, f.p15, fNew);
  const bowBOld = midBow(b.p24, b.p29, bOld);
  const bowBNew = midBow(b.p24, b.p29, bNew);
  console.log(
    `crotch→knee bow (x−chord): F old ${bowFOld.toFixed(3)} → new ${bowFNew.toFixed(3)}  (Δ ${ (bowFNew - bowFOld).toFixed(3)})`,
  );
  console.log(
    `crotch→knee bow (x−chord): B old ${bowBOld.toFixed(3)} → new ${bowBNew.toFixed(3)}  (Δ ${ (bowBNew - bowBOld).toFixed(3)})`,
  );
  console.log(
    `inseam length F old ${polylineLength(fOld).toFixed(2)} new ${polylineLength(fNew).toFixed(2)}`,
  );
  console.log(
    `inseam length B old ${polylineLength(bOld).toFixed(2)} new ${polylineLength(bNew).toFixed(2)}`,
  );

  writeSvg(
    `scripts/inseam-after-front-bw${bottomWidth}.svg`,
    `AFTER front bw=${bottomWidth}`,
    fNew,
    f.p15,
    f.p9,
    f.p14,
  );
  writeSvg(
    `scripts/inseam-after-back-bw${bottomWidth}.svg`,
    `AFTER back bw=${bottomWidth}`,
    bNew,
    b.p29,
    b.p24,
    b.p28,
  );

  return { devF, devB };
}

console.log("AFTER fairing — body hip", body.hip);
report("default hem", BLOCK_TROUSER_STYLE.legBottomWidth, 7.5, 12.5);
report("wide hem", 420, 7.5, 12.5);

// Side seam unchanged check: compare side lengths via points (construction identical)
const style = styleFor(220);
const f = trouserFrontPoints(body, style);
console.log(
  `\nSide/knee landmarks unchanged check: p13 (${f.p13.x.toFixed(3)},${f.p13.y.toFixed(3)}) p15 (${f.p15.x.toFixed(3)},${f.p15.y.toFixed(3)})`,
);

try {
  const before = JSON.parse(
    readFileSync("scripts/inseam-before-polys.json", "utf8"),
  );
  console.log("\nBEFORE snapshot (from prior run):");
  console.log(
    `  default F turn ${before.default.fTurn.turn.toFixed(2)}° B ${before.default.bTurn.turn.toFixed(2)}°`,
  );
  console.log(
    `  wide    F turn ${before.wide.fTurn.turn.toFixed(2)}° B ${before.wide.bTurn.turn.toFixed(2)}°`,
  );
} catch {
  /* optional */
}
