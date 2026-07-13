/**
 * Probe: time maxBackShapedWaistDepth + find any throw across UI-like styles.
 * Run: npx tsx scripts/repro-slider-hang.ts
 */
import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrousers,
  maxBackShapedWaistDepth,
  trouserConstruction,
  waistbandDepthRange,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function time(label: string, fn: () => void) {
  const t0 = performance.now();
  try {
    fn();
    console.log(`${label}: ${(performance.now() - t0).toFixed(0)} ms OK`);
  } catch (e) {
    console.log(`${label}: ${(performance.now() - t0).toFixed(0)} ms THROW`);
    console.error(e);
    if (e instanceof Error) console.error(e.stack);
  }
}

const base: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 25,
};

time("maxBackShapedWaistDepth", () => {
  const cap = maxBackShapedWaistDepth(body, "classic", 220, 25);
  console.log("  cap =", cap);
});

time("waistbandDepthRange shaped", () => {
  console.log("  range", waistbandDepthRange("shaped", body, "classic", 220, 25));
});

time("full UI-ish render path x1", () => {
  const style = withWaistband(base, 40, "shaped", body);
  draftTrousers(body, style);
  trouserConstruction(body, style);
  maxBackShapedWaistDepth(body, "classic", 220, 25);
  waistbandDepthRange("shaped", body, "classic", 220, 25);
});

// Slider sweep that UI would do
time("slider sweep crotchExtensionScale 1.0→0.5", () => {
  for (const s of [1.0, 0.9, 0.8, 0.7, 0.6, 0.5]) {
    const style = withWaistband(
      { ...base, crotchExtensionScale: s },
      0,
      "darted",
      body,
    );
    draftTrousers(body, style);
  }
});
