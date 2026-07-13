import type { Ease } from "@/lib/types/measurements";
import type { WaistbandMode } from "@/lib/patterns/trouserBlock";
import { WAISTLINE_CURVE_FRONT } from "@/lib/patterns/trouserBlock";

/**
 * Pattern-reference (block) presets — distinct from FIT_PRESETS in fitPresets.ts.
 *
 * Fit presets only set wearing ease (waist/hip). Block presets set crotch/waist
 * style parameters measured from a named pattern, plus the ease that pattern
 * uses. Selecting one is a starting point; sliders stay free afterwards.
 */

export type BlockPresetMeasured = {
  crotchStraightRun: number;
  frontWaistInset: number;
  crotchArrivalAngle: number;
  backCrotchDrop: number;
  /** Front crotch Bézier fullness k1 — fitted from measured points. */
  frontCrotchFullness: number;
  /** Back crotch Bézier fullness k1 — fitted from measured points. */
  backCrotchFullness: number;
  /** Front extension scale — Izzy 45 mm ÷ Aldrich 81.875 mm. */
  frontCrotchExtensionScale: number;
  /**
   * Back extension scale on |p16 → p23|. Approximate — see comment block.
   */
  backCrotchExtensionScale: number;
  waistDrop: number;
  ease: Ease;
  waistbandMode: WaistbandMode;
  waistbandDepth: number;
};

export type BlockPresetProvisional = {
  /** Izzy yoke-seam curvature unmeasured. */
  waistlineCurveFront: number;
};

export type BlockPreset = {
  name: string;
  label: string;
  measured: BlockPresetMeasured;
  provisional: BlockPresetProvisional;
};

/*
 * Izzy — measured vs provisional
 * -----------------------------
 * MEASURED (from the Izzy pattern; confident):
 *   crotchStraightRun 0 — curve leaves CF at the waist
 *   frontWaistInset 0 — vertical CF, no Aldrich 7–10
 *   crotchArrivalAngle 32° — fitted
 *   frontCrotchFullness 0.84 — fit to 6 measured points (max Δ 0.15 mm)
 *   backCrotchFullness 0.30 — fit to 34 measured points (max Δ 1.64 mm)
 *   frontCrotchExtensionScale 0.55 — 45 / 81.875 mm at drafted hip 1150
 *   backCrotchDrop 0 — no 23–24 step/hook
 *   waistDrop 0 — natural waist (12 cm yoke + 16 cm rise = 28 = body rise)
 *   hipEase 50 / waistEase 80 — size 44: body 110/84 → finished 115/92
 *   waistbandMode shaped, waistbandDepth 120 — shaped yoke, measured depth
 *
 * APPROXIMATE (geometric inference — expect overlay adjustment):
 *   backCrotchExtensionScale 0.88 — not a direct measure. Izzy's plumb was
 *     dropped from the top of the CB seam (offset from p16's vertical); the
 *     ~28 mm correction was inferred from the CB slant. Unlike every other
 *     Izzy value (measured directly or fitted to ≤2 mm), expect this to need
 *     adjustment against a printed overlay. Do not treat as measured.
 *
 * PROVISIONAL (NOT measured — Aldrich defaults; do not treat as findings):
 *   waistlineCurveFront 12 — Izzy waist is a yoke seam; curvature unmeasured.
 *   bottomWidth — leave as-is (wide leg, not yet measured).
 */
export const IZZY_PRESET: BlockPreset = {
  name: "izzy",
  label: "Izzy",
  measured: {
    crotchStraightRun: 0,
    frontWaistInset: 0,
    crotchArrivalAngle: 32,
    backCrotchDrop: 0,
    frontCrotchFullness: 0.84, // 6-point fit, max Δ 0.15 mm
    backCrotchFullness: 0.30, // 34-point fit, max Δ 1.64 mm
    frontCrotchExtensionScale: 0.55, // 45 / 81.875 mm
    // Approximate — CB-plumb inference, not direct measure; overlay may adjust.
    backCrotchExtensionScale: 0.88,
    waistDrop: 0,
    ease: { waist: 80, hip: 50 },
    waistbandMode: "shaped",
    waistbandDepth: 120,
  },
  provisional: {
    waistlineCurveFront: WAISTLINE_CURVE_FRONT, // 12 — unmeasured
  },
};

export const BLOCK_PRESETS: BlockPreset[] = [IZZY_PRESET];

export function blockPresetByName(name: string): BlockPreset | undefined {
  return BLOCK_PRESETS.find((p) => p.name === name);
}
