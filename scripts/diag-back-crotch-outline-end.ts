/**
 * Diagnostic: where does the back crotch seam end?
 * Run: npx tsx scripts/diag-back-crotch-outline-end.ts
 * Report only — no source changes.
 */
import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserBack,
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

const raw: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
  crotchExtensionScale: 0.5,
  crotchArrivalAngle: DEFAULT_CROTCH_ARRIVAL_ANGLE,
  waistlineCurveFront: WAISTLINE_CURVE_FRONT,
  frontWaistInset: DEFAULT_FRONT_WAIST_INSET,
  // crotchDeparture omitted → hipline default
};
const style = withWaistband(raw, 0, "darted", body); // band off

console.log("=== Settings ===");
console.log(
  JSON.stringify(
    {
      body: {
        hip: body.hip,
        waist: body.waist,
        bodyRise: body.bodyRise,
        hipDepth: body.hipDepth,
      },
      crotchExtensionScale: 0.5,
      crotchArrivalAngle: DEFAULT_CROTCH_ARRIVAL_ANGLE,
      crotchDeparture: "(default = hipline)",
      waistlineCurveFront: WAISTLINE_CURVE_FRONT,
      frontWaistInset: DEFAULT_FRONT_WAIST_INSET,
      waistDrop: 0,
      bottomWidth: 220,
      block: "classic",
      waistReduction: 0,
      waistbandMode: "darted",
      band: "off",
    },
    null,
    2,
  ),
);

const b = trouserBackPoints(body, style);
const d = draftBackCrotch(b);
const piece = draftTrouserBack(body, style);

const fmt = (p: { x: number; y: number }) =>
  `(${p.x.toFixed(6)}, ${p.y.toFixed(6)})`;

// Bézier p19→K samples; last sample ≈ K
const bezLast = d.P3; // K is P3
// Also take the first sample of the tip→waist crotch polyline after p23
const crotchPts = d.points; // p24, p23, K…p19, p21
const i24 = 0;
const i23 = 1;
const iK = 2; // first of reversed Bézier = K

console.log("\n=== 1. Coordinates ===");
console.log(`p19 = ${fmt(b.p19)}`);
console.log(`K   = ${fmt(d.K)}`);
console.log(`p23 = ${fmt(b.p23)}`);
console.log(`p24 = ${fmt(b.p24)}`);
console.log(`Bézier last sample (P3=K) = ${fmt(bezLast)}`);
console.log(`crotchPts[0] (expect p24) = ${fmt(crotchPts[0]!)}`);
console.log(`crotchPts[1] (expect p23) = ${fmt(crotchPts[1]!)}`);
console.log(`crotchPts[2] (expect K)   = ${fmt(crotchPts[2]!)}`);

const near = (
  a: { x: number; y: number },
  bpt: { x: number; y: number },
  t = 0.05,
) => Math.hypot(a.x - bpt.x, a.y - bpt.y) < t;

const outline = piece.outline;

// Find indices: tip-side Bézier end (K) and inseam start (p24)
let iKout = -1;
let i24out = -1;
let i23out = -1;
for (let i = 0; i < outline.length; i++) {
  const at = outline[i]!.at;
  if (iKout < 0 && near(at, d.K, 0.5)) iKout = i;
  if (near(at, b.p24, 0.05)) i24out = i;
  if (near(at, b.p23, 0.05)) i23out = i;
}

console.log("\n=== 2. Outline (end of Bézier at K → inseam start at p24) ===");
console.log(`outline idx K=${iKout} p23=${i23out} p24=${i24out} len=${outline.length}`);
console.log(`#\trole\tx\ty\tnote`);

type Row = { n: number; role: string; x: number; y: number; note: string };
const rows: Row[] = [];

const noteAt = (at: { x: number; y: number }) => {
  if (near(at, d.K, 0.5)) return "K";
  if (near(at, b.p23, 0.05)) return "p23";
  if (near(at, b.p24, 0.05)) return "p24";
  if (near(at, b.p19, 0.5)) return "p19";
  if (near(at, b.p21, 0.5)) return "p21";
  return "";
};

// Outline order: … inseam → p24 → crotch(p24,p23,K,…) …
// Walk from K tip-ward to p24: decreasing index if K is after p24 in crotch segment
if (iKout >= 0 && i24out >= 0) {
  if (i24out <= iKout) {
    // p24 … K in increasing index — list K down to p24 (tip end of bezier → inseam)
    let n = 0;
    for (let i = iKout; i >= i24out; i--) {
      const o = outline[i]!;
      rows.push({
        n: n++,
        role: o.role ?? "",
        x: o.at.x,
        y: o.at.y,
        note: noteAt(o.at),
      });
    }
  } else {
    let n = 0;
    for (let i = iKout; i <= i24out; i++) {
      const o = outline[i]!;
      rows.push({
        n: n++,
        role: o.role ?? "",
        x: o.at.x,
        y: o.at.y,
        note: noteAt(o.at),
      });
    }
  }
}

for (const r of rows) {
  console.log(
    `${r.n}\t${r.role}\t${r.x.toFixed(6)}\t${r.y.toFixed(6)}\t${r.note}`,
  );
}

// Also: which point is the crotch/inseam join?
const at24 = outline[i24out];
console.log(
  `\ncrotch/inseam join at outline[${i24out}]: role=${at24?.role} ${at24 ? fmt(at24.at) : "?"}`,
);
console.log(
  `Terminate: outline includes p24=${i24out >= 0} p23=${i23out >= 0}; inseam meets crotch at p24`,
);

console.log("\n=== 3. The run ===");
console.log(`horizRun = ${d.horizRun.toFixed(6)} mm`);
const runFrom = d.K;
const runTo = b.p23;
const dx = runTo.x - runFrom.x;
const dy = runTo.y - runFrom.y;
const dist = Math.hypot(dx, dy);
const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
console.log(`segment after Bézier (K → p23):`);
console.log(`  from K  ${fmt(runFrom)}`);
console.log(`  to p23  ${fmt(runTo)}`);
console.log(`  distance = ${dist.toFixed(6)} mm`);
console.log(`  angle = ${angleDeg.toFixed(6)}° (0° = +x horizontal; atan2(dy,dx))`);

const run23to24 = {
  dx: b.p24.x - b.p23.x,
  dy: b.p24.y - b.p23.y,
};
const dist2324 = Math.hypot(run23to24.dx, run23to24.dy);
const ang2324 = (Math.atan2(run23to24.dy, run23to24.dx) * 180) / Math.PI;
console.log(`segment p23 → p24:`);
console.log(`  distance = ${dist2324.toFixed(6)} mm`);
console.log(`  angle = ${ang2324.toFixed(6)}°`);

console.log("\n=== 4. Handles ===");
const drop = d.K.y - d.P0.y;
const chord = Math.hypot(d.K.x - d.P0.x, d.K.y - d.P0.y);
const d1 = d.k1 * drop;
const d2 = d.k2 * chord;
console.log(`k1 = ${d.k1}`);
console.log(`k2 = ${d.k2}`);
console.log(`d1 = ${d1}`);
console.log(`d2 = ${d2}`);
console.log(`touchMiss = ${d.touchMiss}`);
console.log(`P0 (p19) = ${fmt(d.P0)}`);
console.log(`P1 = ${fmt(d.P1)}`);
console.log(`P2 = ${fmt(d.P2)}`);
console.log(`P3 (K) = ${fmt(d.P3)}`);
