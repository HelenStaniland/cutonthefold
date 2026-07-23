/**
 * Phase 1 pre-check: would a literal crotchDepartureAboveHip break
 * "depart at waist" across bodies?
 * Run: npx tsx scripts/diag-cf-departure-literal-body.ts
 */
import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { MILA_PRESET } from "../lib/pattern/blockPresets";
import {
  trouserDraftMeasures,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { draftTrouserFront } from "../lib/patterns/trouserBlock";

const f1 = (n: number) => n.toFixed(1);

function waistCfY(body: ReturnType<typeof applyEase>, style: TrouserFrontStyle) {
  return draftTrouserFront(body, style).outline.find((o) => o.role === "waist")!.at
    .y;
}

const sizes = ["8", "12", "16", "20"] as const;
const ease = MILA_PRESET.measured.ease;

console.log("=== Literal vs 'at waist' semantic across bodies ===\n");
console.log("Mila-like: old crotchDeparture=0 → P0.y should equal waistCfY on every body.\n");
console.log(
  "size | D     | waistCfY | maxAboveHip | P0 old(=wcf) | P0 if lit197 | Δ vs waist",
);
console.log(
  "-----|-------|----------|-------------|--------------|--------------|-----------",
);

const lit = 197; // derived at size 12 accept-mila
for (const sz of sizes) {
  const chart = bodyForSizeCode(sz)!;
  const body = applyEase({ ...chart, hip: 1100 }, ease);
  const style = withWaistband(
    {
      bottomWidth: 360,
      waistDrop: 0,
      backHemShape: "straight",
      crotchDeparture: 0,
      frontWaistInset: 0,
      frontCrotchFullness: 0.5,
      crotchArrivalAngle: 32,
      frontCrotchExtensionScale: 0.55,
      backCrotchExtensionScale: 0.88,
      backCrotchFullness: 0.3,
      frontInseamKneeInset: -8,
      backInseamKneeInset: -33,
    },
    0,
    "darted",
    body,
  );
  const { D } = trouserDraftMeasures(body, style);
  const wcf = waistCfY(body, style);
  const maxAbove = D - wcf;
  const p0Old = wcf; // run=0
  const p0Lit = Math.max(wcf, Math.min(D, D - lit));
  console.log(
    `${sz.padStart(4)} | ${f1(D).padStart(5)} | ${f1(wcf).padStart(8)} | ${f1(maxAbove).padStart(11)} | ${f1(p0Old).padStart(12)} | ${f1(p0Lit).padStart(12)} | ${f1(p0Lit - wcf)}`,
  );
}

console.log(
  "\nIf Δ vs waist ≠ 0 on any size, a literal 197 does not preserve 'depart at waist'.",
);
