/**
 * List every front-outline point from p11 to P0.
 * Run: npx tsx scripts/list-outline-p11-to-p0.ts
 */
import { applyEase } from "../lib/types/measurements";
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

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const style: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 25,
  waistbandMode: "darted",
  waistReduction: 0,
  crotchExtensionScale: 1.0,
  frontWaistInset: 10,
  crotchStraightRun: 0,
  crotchArrivalAngle: 5,
  waistbandDepth: 0,
  waistlineCurveFront: 30,
};

const piece = draftTrouserFront(body, style);
const f = trouserFrontPoints(body, style);
const scale = resolveCrotchExtensionScale(style);
const R = f.p9.y;
const D = f.p6.y;
const bez = frontCrotchCurve({
  p5: f.p5,
  p9: f.p9,
  p10: f.p10,
  fork: Math.abs(f.p5.x),
  R,
  straightRun: resolveCrotchStraightRun(style, R, D, f.p10.y),
  extension: frontCrotchExtension(body.hip, scale),
  arrivalAngleDeg: resolveCrotchArrivalAngle(style),
  touch: frontCrotchTouch(body.hip) * scale,
});

const P0 = bez.P0;
const p11 = f.p11;
const outline = piece.outline;

const near = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  t = 0.5,
) => Math.hypot(a.x - b.x, a.y - b.y) < t;

let i11 = -1;
let iP0 = -1;
for (let i = 0; i < outline.length; i++) {
  if (i11 < 0 && near(outline[i]!.at, p11, 1.0)) i11 = i;
  if (near(outline[i]!.at, P0, 0.05)) iP0 = i;
}

console.log(`p11 = (${p11.x.toFixed(6)}, ${p11.y.toFixed(6)})  outline idx ${i11}`);
console.log(`P0  = (${P0.x.toFixed(6)}, ${P0.y.toFixed(6)})  outline idx ${iP0}`);
console.log(`outline length ${outline.length}`);

if (i11 < 0 || iP0 < 0) {
  console.error("Could not find p11 and/or P0 on outline");
  process.exit(1);
}

type Row = { i: number; role: string; x: number; y: number; note: string };
const rows: Row[] = [];
const push = (idx: number) => {
  const o = outline[idx]!;
  let note = "";
  if (near(o.at, p11, 1)) note = "p11";
  else if (near(o.at, P0, 0.05)) note = "P0";
  else if (near(o.at, f.p10, 1)) note = "~p10";
  else if (near(o.at, f.p8, 1)) note = "~p8";
  else if (near(o.at, f.p12, 1)) note = "~p12";
  else if (near(o.at, f.p13, 1)) note = "~p13";
  else if (near(o.at, f.p14, 1)) note = "~p14";
  else if (near(o.at, f.p15, 1)) note = "~p15";
  else if (near(o.at, f.p9, 1)) note = "~p9";
  else if (near(o.at, f.p6, 1)) note = "~p6";
  else if (near(o.at, f.p5, 1)) note = "~p5";
  rows.push({ i: idx, role: o.role ?? "", x: o.at.x, y: o.at.y, note });
};

if (i11 <= iP0) {
  for (let i = i11; i <= iP0; i++) push(i);
} else {
  for (let i = i11; i < outline.length; i++) push(i);
  for (let i = 0; i <= iP0; i++) push(i);
}

console.log(`\n#\trole\tx\ty\tnote`);
rows.forEach((r, n) => {
  console.log(
    `${n}\t${r.role}\t${r.x.toFixed(6)}\t${r.y.toFixed(6)}\t${r.note}`,
  );
});
console.log(`\n${rows.length} points (inclusive p11 … P0)`);
