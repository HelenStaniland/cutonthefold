import type { Ease } from "@/lib/types/measurements";
import type { WaistbandMode } from "@/lib/patterns/trouserBlock";
import { WAISTLINE_CURVE_FRONT } from "@/lib/patterns/trouserBlock";

/**
 * Named garment modification sets applied on top of the trouser block.
 * Izzy is a *garment*, not a peer "setting" of the block.
 */

export type GarmentMeasured = {
  crotchStraightRun: number;
  frontWaistInset: number;
  crotchArrivalAngle: number;
  backCrotchDrop: number;
  frontCrotchFullness: number;
  backCrotchFullness: number;
  frontCrotchExtensionScale: number;
  /**
   * Approximate — CB-plumb inference, not direct measure; overlay may adjust.
   */
  backCrotchExtensionScale: number;
  waistDrop: number;
  ease: Ease;
  waistbandMode: WaistbandMode;
  waistbandDepth: number;
};

export type GarmentProvisional = {
  /** Izzy yoke-seam curvature unmeasured. */
  waistlineCurveFront: number;
  /**
   * Finished width of one leg, inseam to side seam (mm).
   * PROVISIONAL — not measured. Eyeballed so the preview reads as a wide leg.
   */
  bottomWidth: number;
};

export type GarmentPreset = {
  name: string;
  label: string;
  measured: GarmentMeasured;
  provisional: GarmentProvisional;
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
 *   backCrotchExtensionScale 0.88 — not a direct measure.
 *
 * PROVISIONAL (NOT measured — do not treat as findings):
 *   waistlineCurveFront 12 — Izzy waist is a yoke seam; curvature unmeasured.
 *   bottomWidth 330 — not measured. Eyeballed so the preview reads as a wide
 *     leg. Izzy's finished-garment table gives a hem CIRCUMFERENCE of 72.3 cm
 *     at size 44; our bottomWidth is the finished width of ONE leg, inseam to
 *     side seam, so the correct value should be derivable from that — but the
 *     relationship has not been confirmed against the pattern piece. Measure
 *     the hem width on the printed piece and replace this.
 */
export const IZZY_PRESET: GarmentPreset = {
  name: "izzy",
  label: "Izzy Pants",
  measured: {
    crotchStraightRun: 0,
    frontWaistInset: 0,
    crotchArrivalAngle: 32,
    backCrotchDrop: 0,
    frontCrotchFullness: 0.84,
    backCrotchFullness: 0.30,
    frontCrotchExtensionScale: 0.55,
    backCrotchExtensionScale: 0.88,
    waistDrop: 0,
    ease: { waist: 80, hip: 50 },
    waistbandMode: "shaped",
    waistbandDepth: 120,
  },
  provisional: {
    waistlineCurveFront: WAISTLINE_CURVE_FRONT,
    // PROVISIONAL — not measured. Eyeballed so the preview reads as a wide leg.
    // Izzy's finished-garment table gives a hem CIRCUMFERENCE of 72.3 cm at size 44;
    // our bottomWidth is the finished width of ONE leg, inseam to side seam, so the
    // correct value should be derivable from that — but the relationship has not been
    // confirmed against the pattern piece. Measure the hem width on the printed piece
    // and replace this.
    bottomWidth: 330,
  },
};

/** @deprecated Prefer IZZY_PRESET directly — kept for diagnostic scripts. */
export const BLOCK_PRESETS: GarmentPreset[] = [IZZY_PRESET];

export function blockPresetByName(name: string): GarmentPreset | undefined {
  return BLOCK_PRESETS.find((p) => p.name === name);
}
