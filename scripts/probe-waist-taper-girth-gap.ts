/**
 * Probe: girth gap at waistTaper=0 decomposed (print only).
 * Run: npx tsx scripts/probe-waist-taper-girth-gap.ts
 */
import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { MILA_TROUSER_STYLE, BLOCK_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  trouserBackPoints,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

function styleWith(
  base: typeof MILA_TROUSER_STYLE,
  body: ReturnType<typeof applyEase>,
  opts: { taper: number; inset?: number },
): TrouserFrontStyle {
  const s: TrouserFrontStyle = {
    bottomWidth: base.legBottomWidth,
    block: blockFromWaistDrop(base.waistDrop),
    waistDrop: base.waistDrop,
    backHemShape: base.backHemShape,
    waistTaper: opts.taper,
    frontWaistInset: opts.inset ?? base.frontWaistInset ?? 0,
    ...(base.crotchDeparture != null
      ? { crotchDeparture: base.crotchDeparture }
      : {}),
    ...(base.frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale: base.frontCrotchExtensionScale }
      : {}),
    ...(base.backCrotchExtensionScale != null
      ? { backCrotchExtensionScale: base.backCrotchExtensionScale }
      : {}),
    ...(base.crotchArrivalAngle != null
      ? { crotchArrivalAngle: base.crotchArrivalAngle }
      : {}),
    ...(base.waistlineCurveFront != null
      ? { waistlineCurveFront: base.waistlineCurveFront }
      : {}),
    ...(base.frontCrotchFullness != null
      ? { frontCrotchFullness: base.frontCrotchFullness }
      : {}),
    ...(base.backCrotchFullness != null
      ? { backCrotchFullness: base.backCrotchFullness }
      : {}),
    ...(base.frontInseamKneeInset != null
      ? { frontInseamKneeInset: base.frontInseamKneeInset }
      : {}),
    ...(base.backInseamKneeInset != null
      ? { backInseamKneeInset: base.backInseamKneeInset }
      : {}),
  };
  return withWaistband(s, base.waistbandDepth, "shaped", body);
}

const body = applyEase(bodyForSizeCode("12")!, MILA_TROUSER_STYLE.ease);

function report(label: string, style: TrouserFrontStyle) {
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const fork = Math.abs(f.p5.x);
  const frontHip = f.p8.x + fork;
  const backHip = b.p25.x - b.p17.x;
  const frontWaist = Math.hypot(f.p11.x - f.p10.x, f.p11.y - f.p10.y);
  const backWaist = Math.hypot(b.p22.x - b.p21.x, b.p22.y - b.p21.y);
  const hipCut = 2 * frontHip + 2 * backHip;
  const waistCut = 2 * frontWaist + 2 * backWaist;
  const backStep = b.p21.x - b.p17.x;
  console.log(`\n${label}`);
  console.log(
    `  inset=${style.frontWaistInset ?? "def"} taper=${style.waistTaper}  hipCut=${hipCut.toFixed(1)} waistCut=${waistCut.toFixed(1)} Δ=${(waistCut - hipCut).toFixed(1)}`,
  );
  console.log(
    `  front: hipHalf=${frontHip.toFixed(1)} waistHalf=${frontWaist.toFixed(1)} loss=${(frontHip - frontWaist).toFixed(1)} (×2=${(2 * (frontHip - frontWaist)).toFixed(1)})`,
  );
  console.log(
    `  back:  hipHalf=${backHip.toFixed(1)} waistChord=${backWaist.toFixed(1)} loss=${(backHip - backWaist).toFixed(1)} (×2=${(2 * (backHip - backWaist)).toFixed(1)})`,
  );
  console.log(
    `  CB: p17.x=${b.p17.x.toFixed(1)} p21.x=${b.p21.x.toFixed(1)} step=${backStep.toFixed(1)} rise=${(-b.p21.y).toFixed(1)}`,
  );
  console.log(
    `  side vertical? F Δx=${(f.p11.x - f.p8.x).toFixed(4)} B Δx=${(b.p22.x - b.p25.x).toFixed(4)}`,
  );
}

report("Mila preset (inset 5) taper=0", styleWith(MILA_TROUSER_STYLE, body, { taper: 0 }));
report("Mila inset 0 taper=0", styleWith(MILA_TROUSER_STYLE, body, { taper: 0, inset: 0 }));

// What if back CB stayed at p17.x (no step) — can't without code change; print theoretical
{
  const style = styleWith(MILA_TROUSER_STYLE, body, { taper: 0, inset: 0 });
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const fork = Math.abs(f.p5.x);
  const frontHip = f.p8.x + fork;
  const backHip = b.p25.x - b.p17.x;
  const frontWaist = frontHip; // inset 0 + vertical
  // If CB were at p17 with no rise: waist = backHip
  const idealWaist = 2 * frontWaist + 2 * backHip;
  const hipCut = 2 * frontHip + 2 * backHip;
  console.log(`\nTheoretical: inset0 + vertical side + CB at hip CB (no step/rise)`);
  console.log(`  waistCut would = hipCut = ${hipCut.toFixed(1)} (ideal ${idealWaist.toFixed(1)})`);
}
