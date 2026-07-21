/**
 * Report: crotchStraightRun re-anchor (down from p10).
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
  resolveCrotchStraightRun,
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
const R = body.bodyRise;
const D = body.hipDepth;

const defaults: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
};

const f = trouserFrontPoints(body, defaults);
const defaultRun = resolveCrotchStraightRun(defaults, R, D, f.p10.y);
const hiplineFromTop = D - f.p10.y;

console.log(`Drafted hip ${H}; R=${R} D=${D}; p10.y=${f.p10.y}`);
console.log(
  `Default straight run = ${defaultRun} mm (hipline from top = ${hiplineFromTop})`,
);
console.log(
  `Note: old up-from-crotch default was R−D = ${R - D} mm → P0.y = D; ` +
    `new default D−p10.y = ${hiplineFromTop} → same P0.y.`,
);

const pieceDefault = draftTrouserFront(body, defaults);
const pieceExplicit = draftTrouserFront(body, {
  ...defaults,
  crotchStraightRun: hiplineFromTop,
});
const serDef = serializePiece(pieceDefault);
const serExp = serializePiece(pieceExplicit);
console.log(
  `\nDefault vs explicit hipline: ${serDef === serExp ? "BYTE-IDENTICAL" : "DIFFERS"}`,
);

// Reconstruct old P0 (departure = R−D) and compare to new default P0.
const scale = resolveCrotchExtensionScale(defaults);
const touch = frontCrotchTouch(H) * scale;
const extension = frontCrotchExtension(H, scale);
const arrival = resolveCrotchArrivalAngle(defaults);
const oldP0y = R - (R - D); // = D
const bez = frontCrotchCurve({
  p5: f.p5,
  p9: f.p9,
  p10: f.p10,
  fork: Math.abs(f.p5.x),
  R,
  straightRun: defaultRun,
  extension,
  arrivalAngleDeg: arrival,
  touch,
});
console.log(
  `P0=(${bez.P0.x.toFixed(3)}, ${bez.P0.y.toFixed(3)})  old hipline P0.y=${oldP0y}  ` +
    `match=${Math.abs(bez.P0.y - oldP0y) < 1e-9}`,
);
console.log(`p6=(${f.p6.x.toFixed(3)}, ${f.p6.y.toFixed(3)})  k=${bez.k.toFixed(4)}  miss=${bez.touchMiss.toFixed(3)}`);

// Run = 0
const piece0 = draftTrouserFront(body, { ...defaults, crotchStraightRun: 0 });
const crotch0 = rolePts(piece0, "crotch");
const cf0 = rolePts(piece0, "centre-front");
const nearStart = crotch0[crotch0.length - 1]!;
const nearPrev = crotch0[crotch0.length - 2]!;
const leave = {
  x: nearPrev.x - nearStart.x,
  y: nearPrev.y - nearStart.y,
};
const leaveFromVertical = (Math.atan2(leave.x, leave.y) * 180) / Math.PI;
console.log(`\n=== crotchStraightRun = 0 ===`);
console.log(`crotch samples: ${crotch0.length}`);
console.log(
  `last crotch sample (before shared P0): (${nearStart.x.toFixed(2)}, ${nearStart.y.toFixed(2)})`,
);
console.log(
  `leave from vertical: ${leaveFromVertical.toFixed(2)}° (want ~0)`,
);
console.log(`CF segment points: ${cf0.length} (7–10 / scoop bridge)`);
if (cf0.length) {
  console.log(
    `  CF from (${cf0[0]!.x.toFixed(2)}, ${cf0[0]!.y.toFixed(2)}) to (${cf0[cf0.length - 1]!.x.toFixed(2)}, ${cf0[cf0.length - 1]!.y.toFixed(2)})`,
  );
}
const waist0 = rolePts(piece0, "waist");
console.log(
  `waist CF: (${waist0[0]!.x.toFixed(2)}, ${waist0[0]!.y.toFixed(2)})  p10=(${f.p10.x.toFixed(2)}, ${f.p10.y.toFixed(2)})`,
);
console.log(
  `CF hip notches at D: ` +
    `${piece0.markings.filter((m) => m.kind === "notch" && Math.abs(m.at.y - D) < 2 && m.at.x < -50).length} (want 1 — hipline balance on curve)`,
);

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

const runs: { run: number; label: string; file: string }[] = [
  { run: 0, label: "straightRun=0 (curve from waist)", file: "crotch-straight-run-0.svg" },
  { run: 40, label: "straightRun=40 (Izzy-ish)", file: "crotch-straight-run-40.svg" },
  {
    run: hiplineFromTop,
    label: `straightRun=${hiplineFromTop} (Aldrich hipline)`,
    file: "crotch-straight-run-hipline.svg",
  },
];

for (const { run, label, file } of runs) {
  const piece = draftTrouserFront(body, { ...defaults, crotchStraightRun: run });
  writeFrontSvg(piece, label, file);
}

// Overlay comparison 0 / 40 / hipline
{
  const pieces = runs.map((r) =>
    draftTrouserFront(body, { ...defaults, crotchStraightRun: r.run }),
  );
  const all = pieces.flatMap((p) => [
    ...rolePts(p, "crotch"),
    ...rolePts(p, "centre-front"),
    ...rolePts(p, "waist"),
  ]);
  const minX = Math.min(...all.map((p) => p.x)) - 20;
  const minY = Math.min(...all.map((p) => p.y)) - 20;
  const maxX = Math.max(...all.map((p) => p.x)) + 20;
  const maxY = Math.max(...all.map((p) => p.y)) + 45;
  const w = maxX - minX;
  const h = maxY - minY;
  const sh = (p: Point) => ({ x: p.x - minX, y: p.y - minY });
  const colors = ["#c44", "#d97706", "#2563eb"];
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">`,
    `  <rect width="100%" height="100%" fill="#faf8f5"/>`,
    ...pieces.flatMap((piece, i) => {
      const crotch = rolePts(piece, "crotch");
      const cf = rolePts(piece, "centre-front");
      return [
        `  <path d="${svgPath(crotch.map(sh))}" fill="none" stroke="${colors[i]}" stroke-width="2"/>`,
        cf.length
          ? `  <path d="${svgPath(cf.map(sh))}" fill="none" stroke="${colors[i]}" stroke-width="1.5" opacity="0.7"/>`
          : "",
      ];
    }),
    `  <text x="8" y="14" font-size="11" fill="#c44">0 mm</text>`,
    `  <text x="8" y="28" font-size="11" fill="#d97706">40 mm</text>`,
    `  <text x="8" y="42" font-size="11" fill="#2563eb">hipline ${hiplineFromTop} mm</text>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
  writeFileSync(
    join(process.cwd(), "scripts", "crotch-straight-run-overlay.svg"),
    svg,
  );
  console.log("Wrote scripts/crotch-straight-run-overlay.svg");
}
