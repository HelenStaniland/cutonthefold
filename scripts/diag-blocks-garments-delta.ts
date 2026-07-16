/**
 * Acceptance: block defaults + Izzy garment style deltas.
 * Run: npx tsx scripts/diag-blocks-garments-delta.ts
 */
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  trouserFrontPoints,
  trouserBackPoints,
  withWaistband,
  type TrouserFrontStyle,
  WAIST_DROP_MAX,
} from "../lib/patterns/trouserBlock";
import { IZZY_PRESET } from "../lib/pattern/blockPresets";
import {
  BLOCK_TROUSER_STYLE,
  izzyTrouserStyle,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function toDraftStyle(
  s: TrouserStyleSettings,
  waistDrop: number,
): TrouserFrontStyle {
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    waistDrop,
    ...(s.frontInseamKneeInset != null
      ? { frontInseamKneeInset: s.frontInseamKneeInset }
      : {}),
    ...(s.backInseamKneeInset != null
      ? { backInseamKneeInset: s.backInseamKneeInset }
      : {}),
    ...(s.frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale: s.frontCrotchExtensionScale }
      : {}),
    ...(s.backCrotchExtensionScale != null
      ? { backCrotchExtensionScale: s.backCrotchExtensionScale }
      : {}),
    ...(s.crotchStraightRun != null
      ? { crotchStraightRun: s.crotchStraightRun }
      : {}),
    ...(s.crotchArrivalAngle != null
      ? { crotchArrivalAngle: s.crotchArrivalAngle }
      : {}),
    ...(s.waistlineCurveFront != null
      ? { waistlineCurveFront: s.waistlineCurveFront }
      : {}),
    ...(s.frontWaistInset != null ? { frontWaistInset: s.frontWaistInset } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
  };
  const depth =
    s.waistbandMode === "darted"
      ? s.dartedWaistFinish === "facing"
        ? 0
        : s.dartedBandDepth
      : s.waistbandDepth;
  return withWaistband(base, depth, s.waistbandMode, body);
}

function pts(style: TrouserFrontStyle): { id: string; at: Point }[] {
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const out: { id: string; at: Point }[] = [];
  for (const [id, at] of Object.entries(f)) out.push({ id: `F.${id}`, at: at as Point });
  for (const [id, at] of Object.entries(b)) out.push({ id: `B.${id}`, at: at as Point });
  return out;
}

function maxDelta(
  a: { id: string; at: Point }[],
  b: { id: string; at: Point }[],
): number {
  const map = new Map(b.map((p) => [p.id, p.at]));
  let max = 0;
  for (const p of a) {
    const q = map.get(p.id);
    if (!q) continue;
    max = Math.max(max, Math.hypot(p.at.x - q.x, p.at.y - q.y));
  }
  return max;
}

console.log("=== Trouser Block defaults vs cleared geometry (no overrides) ===");
for (const drop of [0, WAIST_DROP_MAX]) {
  const blockStyle = toDraftStyle(BLOCK_TROUSER_STYLE, drop);
  const clearedOnly = withWaistband(
    { bottomWidth: 220, waistDrop: drop },
    0,
    "darted",
    body,
  );
  const d = maxDelta(pts(blockStyle), pts(clearedOnly));
  console.log(`waistDrop=${drop}: maxΔ=${d.toFixed(6)} mm`);
}

console.log("\n=== Izzy garment style vs IZZY_PRESET measured fields ===");
const fromFn = izzyTrouserStyle();
const m = IZZY_PRESET.measured;
const pr = IZZY_PRESET.provisional;
const fromPreset: TrouserStyleSettings = {
  legBottomWidth: 220,
  frontInseamKneeInset: m.frontInseamKneeInset,
  backInseamKneeInset: m.backInseamKneeInset,
  waistDrop: m.waistDrop,
  waistbandDepth: m.waistbandDepth,
  waistbandMode: m.waistbandMode,
  dartedWaistFinish: "waistband",
  dartedBandDepth: 25,
  zipLength: 180,
  ease: { ...m.ease },
  frontCrotchExtensionScale: m.frontCrotchExtensionScale,
  backCrotchExtensionScale: m.backCrotchExtensionScale,
  crotchStraightRun: m.crotchStraightRun,
  crotchArrivalAngle: m.crotchArrivalAngle,
  waistlineCurveFront: pr.waistlineCurveFront,
  frontWaistInset: m.frontWaistInset,
  backCrotchDrop: m.backCrotchDrop,
  frontCrotchFullness: m.frontCrotchFullness,
  backCrotchFullness: m.backCrotchFullness,
};
const dIzzy = maxDelta(
  pts(toDraftStyle(fromFn, fromFn.waistDrop)),
  pts(toDraftStyle(fromPreset, fromPreset.waistDrop)),
);
console.log(`Izzy: maxΔ=${dIzzy.toFixed(6)} mm`);

console.log("\nBlock band defaults:");
console.log({
  mode: BLOCK_TROUSER_STYLE.waistbandMode,
  finish: BLOCK_TROUSER_STYLE.dartedWaistFinish,
  depth: BLOCK_TROUSER_STYLE.waistbandDepth,
});
console.log("Izzy band defaults:");
console.log({
  mode: fromFn.waistbandMode,
  depth: fromFn.waistbandDepth,
});
