/**
 * PHASE 0 ONLY — front CF departure re-anchor prerequisites.
 * Run: npx tsx scripts/diag-cf-departure-reanchor-phase0.ts
 *
 * Print only. Changes no product code. Stop after report.
 */
import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { MILA_PRESET } from "../lib/pattern/blockPresets";
import {
  milaTrouserStyle,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserFront,
  resolveCrotchStraightRun,
  trouserDraftMeasures,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
  type WaistbandMode,
} from "../lib/patterns/trouserBlock";

const f3 = (n: number) => n.toFixed(3);

const chart = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
const body = applyEase({ ...chart, hip: 1100 }, MILA_PRESET.measured.ease);

function toDraft(
  s: TrouserStyleSettings,
  mode: WaistbandMode,
  depth: number,
): TrouserFrontStyle {
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale: s.frontCrotchExtensionScale }
      : {}),
    ...(s.backCrotchExtensionScale != null
      ? { backCrotchExtensionScale: s.backCrotchExtensionScale }
      : {}),
    ...(s.crotchDeparture != null
      ? { crotchDeparture: s.crotchDeparture }
      : {}),
    ...(s.crotchArrivalAngle != null
      ? { crotchArrivalAngle: s.crotchArrivalAngle }
      : {}),
    ...(s.waistlineCurveFront != null
      ? { waistlineCurveFront: s.waistlineCurveFront }
      : {}),
    ...(s.frontWaistInset != null ? { frontWaistInset: s.frontWaistInset } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
    ...(s.frontInseamKneeInset != null
      ? { frontInseamKneeInset: s.frontInseamKneeInset }
      : {}),
    ...(s.backInseamKneeInset != null
      ? { backInseamKneeInset: s.backInseamKneeInset }
      : {}),
  };
  return withWaistband(base, depth, mode, body);
}

console.log("=== PHASE 0: CF departure re-anchor prerequisites ===\n");
console.log(
  `Body: size ${DEFAULT_SIZE_CODE}, ease {waist:80,hip:50}, hip 1100 (accept-mila)\n`,
);

const mila = milaTrouserStyle();
const finishes: { label: string; mode: WaistbandMode; depth: number }[] = [
  { label: "darted/0", mode: "darted", depth: 0 },
  { label: "shaped/60", mode: "shaped", depth: 60 },
  { label: "shaped/120", mode: "shaped", depth: 120 },
];

console.log("## 1. hiplineY vs waist finish (must be invariant)\n");
console.log(
  "finish       | waistRed | waistCfY | D (draft) | p6.y | hipline notch y | P0.y (current)",
);
console.log(
  "-------------|----------|----------|-----------|------|-----------------|----------------",
);

const hipYs: number[] = [];
for (const fin of finishes) {
  const style = toDraft(mila, fin.mode, fin.depth);
  const { D } = trouserDraftMeasures(body, style);
  const f = trouserFrontPoints(body, style);
  const piece = draftTrouserFront(body, style);
  const waistCfY = piece.outline.find((o) => o.role === "waist")!.at.y;
  const hipNotch = piece.markings?.find(
    (m) => m.kind === "notch" && m.label === "hipline",
  );
  const hipNotchY = hipNotch?.at.y ?? NaN;
  const straightRun = resolveCrotchStraightRun(style, f.p9.y, D, waistCfY);
  const P0y = waistCfY + straightRun;
  hipYs.push(D);
  console.log(
    `${fin.label.padEnd(12)} | ${String(style.waistReduction ?? 0).padStart(8)} | ${f3(waistCfY).padStart(8)} | ${f3(D).padStart(9)} | ${f3(f.p6.y).padStart(4)} | ${f3(hipNotchY).padStart(15)} | ${f3(P0y).padStart(14)}`,
  );
}

const hipSpread = Math.max(...hipYs) - Math.min(...hipYs);
console.log(`\nD (hipline) range across finishes: ${f3(hipSpread)} mm`);
console.log(
  hipSpread < 1e-9
    ? "  ok: hiplineY invariant to waist finish — plan is viable"
    : "  FAIL: hiplineY moves with waist finish — STOP, rethink plan",
);

console.log("\n## 3. Aldrich default → hipline (expression)\n");
{
  const style = toDraft(
    {
      ...mila,
      crotchDeparture: null as unknown as number,
    } as TrouserStyleSettings,
    "darted",
    0,
  );
  // True Aldrich: omit crotchDeparture
  const aldrichStyle: TrouserFrontStyle = withWaistband(
    {
      bottomWidth: 220,
      waistDrop: 0,
      backHemShape: "curved",
      // crotchDeparture omitted
    },
    0,
    "darted",
    body,
  );
  const { D, R } = trouserDraftMeasures(body, aldrichStyle);
  const piece = draftTrouserFront(body, aldrichStyle);
  const waistCfY = piece.outline.find((o) => o.role === "waist")!.at.y;
  const resolved = resolveCrotchStraightRun(aldrichStyle, R, D, waistCfY);
  const P0y = waistCfY + resolved;
  console.log("  resolveCrotchStraightRun when crotchDeparture is undefined:");
  console.log("    hiplineFromWaist = max(0, D − waistCfY)");
  console.log("    raw = style.crotchDeparture ?? hiplineFromWaist");
  console.log("    return clamp(raw, MIN=0, max=hiplineFromWaist)");
  console.log(
    `  At this body: D=${f3(D)} waistCfY=${f3(waistCfY)} → default run=${f3(resolved)} → P0.y=${f3(P0y)} (expect = D)`,
  );
  console.log(
    Math.abs(P0y - D) < 1e-9
      ? "  ok: omitted run lands P0 on hipline (y = D)"
      : `  FAIL: P0.y ≠ D (Δ=${f3(P0y - D)})`,
  );
}

console.log("\n## Expected translation table (derive at this body, Mila geometry)\n");
{
  const { D } = trouserDraftMeasures(body, toDraft(mila, "darted", 0));
  const rows = [
    { name: "Aldrich-like P0 at D", P0y: D },
    {
      name: "Cleo-like (shaped/120 on Mila geo)",
      P0y: (() => {
        const st = toDraft(mila, "shaped", 120);
        const piece = draftTrouserFront(body, st);
        const wcf = piece.outline.find((o) => o.role === "waist")!.at.y;
        const run = resolveCrotchStraightRun(st, 0, D, wcf);
        return wcf + run;
      })(),
    },
    {
      name: "Mila darted/0",
      P0y: (() => {
        const st = toDraft(mila, "darted", 0);
        const piece = draftTrouserFront(body, st);
        const wcf = piece.outline.find((o) => o.role === "waist")!.at.y;
        const run = resolveCrotchStraightRun(st, 0, D, wcf);
        return wcf + run;
      })(),
    },
  ];
  console.log(`  hiplineY D = ${f3(D)}`);
  console.log("  garment                         | P0.y    | new = D − P0.y (above hipline)");
  console.log("  --------------------------------|---------|--------------------------------");
  for (const r of rows) {
    console.log(
      `  ${r.name.padEnd(31)} | ${f3(r.P0y).padStart(7)} | ${f3(D - r.P0y)}`,
    );
  }
}

console.log("\n=== end Phase 0 (no code changed) — STOP ===");
