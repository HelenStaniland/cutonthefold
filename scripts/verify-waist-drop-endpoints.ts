/**
 * Endpoint identity, leg/knee invariance, and mid-drop smoke check.
 * Run: npx tsx scripts/verify-waist-drop-endpoints.ts
 */
import { ALDRICH_P46_SIZE_12_BODY } from "@/lib/patterns/aldrichProductionVerify";
import {
  draftTrouserBack,
  draftTrouserFront,
  resolveWaistDrop,
  trouserBackPoints,
  trouserDraftMeasures,
  trouserFramePoints,
  trouserFrontPoints,
  WAIST_DROP_MAX,
  type TrouserFrontStyle,
} from "@/lib/patterns/trouserBlock";
import type { PatternPiece } from "@/lib/types/measurements";

const body = ALDRICH_P46_SIZE_12_BODY;
const base: Omit<TrouserFrontStyle, "block" | "waistDrop"> = {
  bottomWidth: 220,
  waistReduction: 0,
  waistbandMode: "darted",
};

function serializePiece(p: PatternPiece): string {
  return JSON.stringify(
    p.outline.map((o) => ({
      x: o.at.x,
      y: o.at.y,
      role: o.role,
      edge: o.edge,
    })),
  );
}

function compare(label: string, a: TrouserFrontStyle, b: TrouserFrontStyle): boolean {
  const fA = draftTrouserFront(body, a);
  const fB = draftTrouserFront(body, b);
  const bA = draftTrouserBack(body, a);
  const bB = draftTrouserBack(body, b);
  const fMatch = serializePiece(fA) === serializePiece(fB);
  const bMatch = serializePiece(bA) === serializePiece(bB);
  console.log(
    `${label}: front=${fMatch ? "IDENTICAL" : "DIFF"} back=${bMatch ? "IDENTICAL" : "DIFF"}`,
  );
  return fMatch && bMatch;
}

let ok = true;
ok &&= compare(
  "classic vs waistDrop=0",
  { ...base, block: "classic" },
  { ...base, waistDrop: 0 },
);
ok &&= compare(
  "production vs waistDrop=50",
  { ...base, block: "production" },
  { ...base, waistDrop: WAIST_DROP_MAX },
);
ok &&= compare(
  "classic+waistDrop=50 vs production",
  { ...base, block: "classic", waistDrop: 50 },
  { ...base, block: "production" },
);

console.log("\nLeg and knee invariance (Aldrich size 12):");
const legLengths: number[] = [];
const kneeYs: number[] = [];
for (const drop of [0, 25, 50] as const) {
  const style: TrouserFrontStyle = { ...base, waistDrop: drop };
  const m = trouserDraftMeasures(body, style);
  const f = trouserFrontPoints(body, style);
  const frame = trouserFramePoints(body, style);
  const leg = m.F - m.R;
  const kneeToHem = m.F - f.p13.y;
  const kneeToCrotch = f.p13.y - m.R;
  legLengths.push(leg);
  kneeYs.push(f.p13.y);
  console.log(
    `  drop=${drop}: F−R=${leg}, kneeY=${f.p13.y}, knee→hem=${kneeToHem}, knee→crotch=${kneeToCrotch}, frame p3=${frame.p3.y}, p4=${frame.p4.y}`,
  );
}
const legInvariant = legLengths.every((l) => l === legLengths[0]);
// knee→hem and knee→crotch are drop-invariant when F and knee both shift by same drop
const refStyle: TrouserFrontStyle = { ...base, waistDrop: 0 };
const refM = trouserDraftMeasures(body, refStyle);
const refF = trouserFrontPoints(body, refStyle);
const refKneeHem = refM.F - refF.p13.y;
const refKneeCrotch = refF.p13.y - refM.R;
const spacingInvariant = [0, 25, 50].every((drop) => {
  const style: TrouserFrontStyle = { ...base, waistDrop: drop };
  const m = trouserDraftMeasures(body, style);
  const f = trouserFrontPoints(body, style);
  return (
    m.F - f.p13.y === refKneeHem && f.p13.y - m.R === refKneeCrotch
  );
});
console.log(`  F−R invariant: ${legInvariant ? "PASS" : "FAIL"}`);
console.log(`  knee spacing invariant: ${spacingInvariant ? "PASS" : "FAIL"}`);
ok &&= legInvariant && spacingInvariant;

const mid: TrouserFrontStyle = { ...base, waistDrop: 30 };
const m = trouserDraftMeasures(body, mid);
console.log(`\nMid draft waistDrop=30 → d=${resolveWaistDrop(mid)}`);
console.log(`W=${m.W} R=${m.R} D=${m.D} F=${m.F}`);
draftTrouserFront(body, mid);
draftTrouserBack(body, mid);
const f30 = trouserFrontPoints(body, mid);
const b30 = trouserBackPoints(body, mid);
console.log("Mid draft points: front p10", f30.p10, "back p21", b30.p21);
console.log("Mid draft: OK");

console.log("\nInterpolation table (Aldrich size 12 body):");
console.log("| d | W | frontDart | backDart1 | backDart2 | backWaistStep | backCrotchAdd |");
for (const drop of [0, 25, 50] as const) {
  const style: TrouserFrontStyle = { ...base, waistDrop: drop };
  const measures = trouserDraftMeasures(body, style);
  const s = drop / WAIST_DROP_MAX;
  console.log(
    `| ${drop} | ${measures.W.toFixed(1)} | ${(100 - 40 * s).toFixed(1)} | ${(120 - 40 * s).toFixed(1)} | ${(100 - 40 * s).toFixed(1)} | ${(20 - 2.5 * s).toFixed(2)} | ${(8 - 3 * s).toFixed(2)} |`,
  );
}

if (!ok) {
  process.exit(1);
}
