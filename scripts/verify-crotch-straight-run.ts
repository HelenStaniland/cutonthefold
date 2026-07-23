/**
 * Report: crotchDeparture (mm above hipline, or "waistEdge").
 * Run: npx tsx scripts/verify-crotch-straight-run.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEase, notchCount, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserFront,
  frontCrotchCurve,
  frontCrotchExtension,
  frontCrotchTouch,
  resolveCrotchArrivalAngle,
  resolveCrotchExtensionScale,
  resolveCrotchP0Y,
  resolveWaistlineCurveFront,
  trouserFrontPoints,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

function svgPath(pts: Point[]): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

function serializePiece(piece: ReturnType<typeof draftTrouserFront>): string {
  const outline = piece.outline
    .map(
      (o) =>
        `${o.role}:${o.at.x.toFixed(6)},${o.at.y.toFixed(6)}`,
    )
    .join("|");
  const marks = piece.markings
    .map((m) => {
      if (m.kind === "notch") {
        return `notch:${m.at.x.toFixed(6)},${m.at.y.toFixed(6)}:${m.role}:${notchCount(m)}`;
      }
      if (m.kind === "grainline") {
        return `grain:${m.line.from.x.toFixed(6)},${m.line.from.y.toFixed(6)}-${m.line.to.x.toFixed(6)},${m.line.to.y.toFixed(6)}`;
      }
      return m.kind;
    })
    .join("|");
  return `${outline}||${marks}`;
}

function rolePts(
  piece: ReturnType<typeof draftTrouserFront>,
  role: string,
): Point[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at);
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const H = body.hip;

const defaults: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
};

const f = trouserFrontPoints(body, defaults);
const waistCfY = resolveWaistlineCurveFront(defaults);
const R = f.p9.y;
const D = f.p6.y;
const maxAbove = Math.max(0, D - waistCfY);

console.log(`Drafted hip ${H}; R=${R} D=${D}; waistCfY=${waistCfY}`);
console.log(`Default crotchDeparture omitted → P0.y = D = ${D}`);

const pieceDefault = draftTrouserFront(body, defaults);
const pieceExplicit = draftTrouserFront(body, {
  ...defaults,
  crotchDeparture: 0,
});
const serDef = serializePiece(pieceDefault);
const serExp = serializePiece(pieceExplicit);
console.log(
  `\nOmitted vs explicit 0 (hipline): ${serDef === serExp ? "BYTE-IDENTICAL" : "DIFFERS"}`,
);

const scale = resolveCrotchExtensionScale(defaults);
const touch = frontCrotchTouch(H) * scale;
const extension = frontCrotchExtension(H, scale);
const arrival = resolveCrotchArrivalAngle(defaults);
const p0Y = resolveCrotchP0Y(defaults, D, waistCfY);
const bez = frontCrotchCurve({
  p5: f.p5,
  p9: f.p9,
  fork: Math.abs(f.p5.x),
  R,
  waistCfY,
  p0Y,
  extension,
  arrivalAngleDeg: arrival,
  touch,
});
console.log(
  `P0=(${bez.P0.x.toFixed(3)}, ${bez.P0.y.toFixed(3)})  D=${D}  match hipline=${Math.abs(bez.P0.y - D) < 1e-9}`,
);
console.log(`p6=(${f.p6.x.toFixed(3)}, ${f.p6.y.toFixed(3)})  k=${bez.k.toFixed(4)}  miss=${bez.touchMiss.toFixed(3)}`);

const pieceWaist = draftTrouserFront(body, {
  ...defaults,
  crotchDeparture: "waistEdge",
});
const crotchW = rolePts(pieceWaist, "crotch");
const cfW = rolePts(pieceWaist, "centre-front");
const nearStart = crotchW[crotchW.length - 1]!;
const nearPrev = crotchW[crotchW.length - 2]!;
const leave = {
  x: nearPrev.x - nearStart.x,
  y: nearPrev.y - nearStart.y,
};
const leaveFromVertical = (Math.atan2(leave.x, leave.y) * 180) / Math.PI;
console.log(`\n=== crotchDeparture = "waistEdge" ===`);
console.log(`P0.y=${resolveCrotchP0Y({ crotchDeparture: "waistEdge" }, D, waistCfY)} waistCfY=${waistCfY}`);
console.log(`crotch samples: ${crotchW.length}`);
console.log(`leave from vertical: ${leaveFromVertical.toFixed(2)}°`);
console.log(`CF segment points: ${cfW.length}`);

function writeFrontSvg(
  piece: ReturnType<typeof draftTrouserFront>,
  label: string,
  filename: string,
) {
  const crotch = rolePts(piece, "crotch");
  const cf = rolePts(piece, "centre-front");
  const waist = rolePts(piece, "waist");
  const all = [...crotch, ...cf, ...waist];
  const minX = Math.min(...all.map((p) => p.x)) - 20;
  const minY = Math.min(...all.map((p) => p.y)) - 20;
  const maxX = Math.max(...all.map((p) => p.x)) + 20;
  const maxY = Math.max(...all.map((p) => p.y)) + 30;
  const w = maxX - minX;
  const h = maxY - minY;
  const sh = (p: Point) => ({ x: p.x - minX, y: p.y - minY });
  const p0 = crotch[crotch.length - 1]!;
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">`,
    `  <rect width="100%" height="100%" fill="#faf8f5"/>`,
    `  <path d="${svgPath(waist.map(sh))}" fill="none" stroke="#888" stroke-width="1.5"/>`,
    `  <path d="${svgPath(crotch.map(sh))}" fill="none" stroke="#c44" stroke-width="2.5"/>`,
    cf.length
      ? `  <path d="${svgPath(cf.map(sh))}" fill="none" stroke="#2563eb" stroke-width="2"/>`
      : "",
    `  <circle cx="${sh(p0).x}" cy="${sh(p0).y}" r="3" fill="#c44"/>`,
    `  <text x="8" y="16" font-size="12" fill="#333">${label}</text>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
  writeFileSync(join(process.cwd(), "scripts", filename), svg);
  console.log(`Wrote scripts/${filename}`);
}

const cases: {
  dep: TrouserFrontStyle["crotchDeparture"];
  label: string;
  file: string;
}[] = [
  {
    dep: "waistEdge",
    label: 'crotchDeparture="waistEdge"',
    file: "crotch-departure-waist-edge.svg",
  },
  {
    dep: 40,
    label: "crotchDeparture=40 mm above hipline",
    file: "crotch-departure-40.svg",
  },
  {
    dep: 0,
    label: "crotchDeparture=0 (Aldrich hipline)",
    file: "crotch-departure-hipline.svg",
  },
];

for (const { dep, label, file } of cases) {
  const piece = draftTrouserFront(body, { ...defaults, crotchDeparture: dep });
  writeFrontSvg(piece, label, file);
}

console.log(`\nmax above hipline (waist edge) = ${maxAbove.toFixed(1)} mm`);
