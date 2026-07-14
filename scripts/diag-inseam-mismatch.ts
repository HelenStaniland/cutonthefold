/**
 * Current HEAD — inseam mismatch decomposition.
 * Run: npx tsx scripts/diag-inseam-mismatch.ts
 * Report only — change no product code.
 */
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { polylineLength, quadBezier } from "../lib/geometry/curves";
import {
  trouserFrontPoints,
  trouserBackPoints,
  withWaistband,
  resolveBackCrotchDrop,
} from "../lib/patterns/trouserBlock";

function normalize(v: Point): Point {
  const L = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / L, y: v.y / L };
}

/** Mirror of trouserBlock.insideLegControl (not exported). */
function insideLegControl(a: Point, b: Point, bulge = 7.5): Point {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const d = { x: b.x - a.x, y: b.y - a.y };
  let n = normalize({ x: d.y, y: -d.x });
  if (n.x < 0) n = { x: -n.x, y: -n.y };
  return { x: m.x + 2 * bulge * n.x, y: m.y + 2 * bulge * n.y };
}

function chord(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Curve length tip→knee matching draft (quadBezier knee→ctrl→tip). */
function upperCurve(tip: Point, knee: Point, bulge: number): {
  curve: number;
  chord: number;
  add: number;
  ctrl: Point;
} {
  const ctrl = insideLegControl(tip, knee, bulge);
  const curve = polylineLength(quadBezier(knee, ctrl, tip));
  const c = chord(tip, knee);
  return { curve, chord: c, add: curve - c, ctrl };
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const style = withWaistband(
  { bottomWidth: 220, block: "classic", waistDrop: 0 },
  0,
  "darted",
  body,
);

const f = trouserFrontPoints(body, style);
const b = trouserBackPoints(body, style);
const drop = resolveBackCrotchDrop(style);

const fU = upperCurve(f.p9, f.p15, 7.5);
const bU = upperCurve(b.p24, b.p29, 12.5);
const fL = chord(f.p15, f.p14);
const bL = chord(b.p29, b.p28);
const fTot = fU.curve + fL;
const bTot = bU.curve + bL;

console.log("HEAD (working tree) — Aldrich defaults");
console.log("Body: size 12, hip 1100 + ease waist 10 / hip 50 → hip", body.hip);
console.log("backCrotchDrop:", drop);
console.log("");

console.log("=== 2. Segment lengths ===");
console.log(
  "segment              | curve/len   | chord      | curve−chord",
);
console.log(
  "---------------------|-------------|------------|------------",
);
console.log(
  `F p9→p15 (bulge 7.5) | ${fU.curve.toFixed(4).padStart(11)} | ${fU.chord.toFixed(4).padStart(10)} | ${fU.add.toFixed(4).padStart(10)}`,
);
console.log(
  `F p15→p14 (straight) | ${fL.toFixed(4).padStart(11)} | ${fL.toFixed(4).padStart(10)} | ${"0".padStart(10)}`,
);
console.log(
  `B p24→p29 (bulge 12.5)| ${bU.curve.toFixed(4).padStart(10)} | ${bU.chord.toFixed(4).padStart(10)} | ${bU.add.toFixed(4).padStart(10)}`,
);
console.log(
  `B p29→p28 (straight) | ${bL.toFixed(4).padStart(11)} | ${bL.toFixed(4).padStart(10)} | ${"0".padStart(10)}`,
);
console.log("");
console.log(`F total inseam: ${fTot.toFixed(4)}`);
console.log(`B total inseam: ${bTot.toFixed(4)}`);
console.log(`Δ (B−F): ${(bTot - fTot).toFixed(4)}`);
console.log("");

// Decomposition of Δ
const dUpperChord = bU.chord - fU.chord;
const dUpperAdd = bU.add - fU.add;
const dLower = bL - fL;
console.log("=== Δ breakdown (B − F) ===");
console.log(`upper chord Δ:     ${dUpperChord.toFixed(4)}`);
console.log(`upper curve-add Δ: ${dUpperAdd.toFixed(4)}  (back bulge 12.5 vs front 7.5)`);
console.log(`lower chord Δ:     ${dLower.toFixed(4)}`);
console.log(
  `sum:               ${(dUpperChord + dUpperAdd + dLower).toFixed(4)}`,
);
console.log("");

// Tip geometry vs drop
console.log("=== Tip / knee geometry ===");
console.log(
  `p9  (${f.p9.x.toFixed(3)}, ${f.p9.y.toFixed(3)})  tip y = R`,
);
console.log(
  `p24 (${b.p24.x.toFixed(3)}, ${b.p24.y.toFixed(3)})  tip y = R+drop`,
);
console.log(`Δ tip y (p24−p9): ${(b.p24.y - f.p9.y).toFixed(4)}  (drop=${drop})`);
console.log(
  `Δ tip→knee vertical span: F ${(f.p15.y - f.p9.y).toFixed(4)}  B ${(b.p29.y - b.p24.y).toFixed(4)}  Δ ${(b.p29.y - b.p24.y) - (f.p15.y - f.p9.y)}`,
);
console.log("");

console.log("=== 4. Knee positions ===");
console.log(`p15 (${f.p15.x.toFixed(3)}, ${f.p15.y.toFixed(3)})`);
console.log(`p29 (${b.p29.x.toFixed(3)}, ${b.p29.y.toFixed(3)})`);
console.log(`knee line y: front ${f.p15.y.toFixed(4)}  back ${b.p29.y.toFixed(4)}  Δy ${(b.p29.y - f.p15.y).toFixed(4)}`);
console.log(
  `same horizontal: ${Math.abs(f.p15.y - b.p29.y) < 0.01 ? "YES" : "NO"}`,
);
console.log(`hem y p14/p28: ${f.p14.y.toFixed(4)} / ${b.p28.y.toFixed(4)}`);
console.log("");

// Aldrich construction expectation from chords + known bulges alone
// If tips were at same height offset only by drop, upper back chord would be ~front−drop
// (vertical span shorter by drop) — plus wider tip (back extension).
console.log("=== 3. Design context ===");
console.log(
  "Aldrich: front 9–15 inward 0.75 cm (7.5 mm); back 24–29 inward 1.25 cm (12.5 mm).",
);
console.log(
  `Observed curve addition: front +${fU.add.toFixed(3)} mm; back +${bU.add.toFixed(3)} mm; Δadd ${(bU.add - fU.add).toFixed(3)} mm.`,
);
console.log(
  `If only bulge differed on identical chords, expect Δadd ≈ ${(bU.add - fU.add).toFixed(3)} (same as observed — chords differ too).`,
);
console.log(
  `Upper chords differ by ${dUpperChord.toFixed(3)} mm — not only drop; tip x also differs (back crotch longer).`,
);
console.log(
  `|p9.x|=${Math.abs(f.p9.x).toFixed(3)}  |p24.x|=${Math.abs(b.p24.x).toFixed(3)}  Δx tip ${ (Math.abs(b.p24.x) - Math.abs(f.p9.x)).toFixed(3)}`,
);
console.log(
  `|p15.x|=${Math.abs(f.p15.x).toFixed(3)}  |p29.x|=${Math.abs(b.p29.x).toFixed(3)}`,
);

// Hypothetical: same chord length as front upper, but back bulge only
const hypoBackOnFrontChord = (() => {
  // place a virtual tip on front chord direction shortened? simpler: measure curve add ratio
  // Rebuild control on front tip/knee but with 12.5 bulge
  const c = upperCurve(f.p9, f.p15, 12.5);
  return c;
})();
console.log("");
console.log(
  `If back used front tip–knee with bulge 12.5 only: curve ${hypoBackOnFrontChord.curve.toFixed(4)}, add ${hypoBackOnFrontChord.add.toFixed(4)} (vs front add ${fU.add.toFixed(4)}; Δadd-only ${(hypoBackOnFrontChord.add - fU.add).toFixed(4)})`,
);
console.log(
  `→ bulge-alone Δ on identical endpoints: ${(hypoBackOnFrontChord.add - fU.add).toFixed(4)} mm (not ~12 mm).`,
);
