import type { Ease } from "@/lib/types/measurements";
import type {
  BackHemShape,
  CrotchDeparture,
  WaistbandMode,
} from "@/lib/patterns/trouserBlock";
import { WAISTLINE_CURVE_FRONT } from "@/lib/patterns/trouserBlock";

/**
 * Named garment modification sets applied on top of the trouser block.
 * Cleo is a *garment*, not a peer "setting" of the block.
 */

export type GarmentMeasured = {
  crotchDeparture: CrotchDeparture;
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
  /**
   * Signed inseam knee inset from the crotch→hem chord (mm).
   * Negative = inboard (flare). Side knee gets k×inset with k = 0.18.
   */
  frontInseamKneeInset: number;
  backInseamKneeInset: number;
  /**
   * Finished one-leg hem width (Aldrich bottomWidth): front = B−10, back = B+10.
   * B = 360 → front hem 350; back drafts 370 vs measured ~373.
   */
  bottomWidth: number;
  /** Shape of the finished back hem edge. */
  backHemShape: BackHemShape;
};

export type GarmentProvisional = {
  /** Cleo yoke-seam curvature unmeasured. */
  waistlineCurveFront: number;
};

export type GarmentPreset = {
  name: string;
  label: string;
  measured: GarmentMeasured;
  provisional: GarmentProvisional;
};

/*
 * Cleo — measured vs provisional
 * -----------------------------
 * MEASURED:
 *   …crotch / waist params as before…
 *   frontInseamKneeInset −8 / backInseamKneeInset −33 — chord insets (mm)
 *   bottomWidth 360 — front hem B−10 = 350
 *   backHemShape straight — measured design edge (Aldrich remains curved)
 *
 * SUPERSEDED: four independent knee/hem widths; provisional bottomWidth 330.
 */
export const CLEO_PRESET: GarmentPreset = {
  name: "cleo",
  label: "Cleo Pants",
  measured: {
    crotchDeparture: "waistEdge",
    frontWaistInset: 0,
    crotchArrivalAngle: 32,
    backCrotchDrop: 0,
    frontCrotchFullness: 0.50,
    backCrotchFullness: 0.30,
    frontCrotchExtensionScale: 0.55,
    backCrotchExtensionScale: 0.88,
    waistDrop: 0,
    ease: { waist: 80, hip: 50 },
    waistbandMode: "shaped",
    waistbandDepth: 120,
    frontInseamKneeInset: -8,
    backInseamKneeInset: -33,
    bottomWidth: 360,
    backHemShape: "straight",
  },
  provisional: {
    waistlineCurveFront: WAISTLINE_CURVE_FRONT,
  },
};

/*
 * Mila — sandbox garment. Geometry inherited from Cleo, then tuned.
 * PROVISIONAL (tuned by eye on the render, not measured):
 *   crotchDeparture 45 (mm above hipline) — replaces the inherited "waistEdge",
 *     which caused the front CF projection at a natural waist
 *   frontWaistInset 5 — Aldrich 10 / Cleo 0
 *   waistband shaped 30
 * All pending confirmation against the commercial pattern on paper.
 */
export const MILA_PRESET: GarmentPreset = {
  name: "mila",
  label: "Mila Pants",
  measured: {
    crotchDeparture: 45,
    frontWaistInset: 5,
    crotchArrivalAngle: 32,
    backCrotchDrop: 0,
    frontCrotchFullness: 0.5,
    backCrotchFullness: 0.3,
    frontCrotchExtensionScale: 0.55,
    backCrotchExtensionScale: 0.88,
    waistDrop: 0,
    ease: { waist: 80, hip: 50 },
    waistbandMode: "shaped",
    waistbandDepth: 30,
    frontInseamKneeInset: -8,
    backInseamKneeInset: -33,
    bottomWidth: 360,
    backHemShape: "straight",
  },
  provisional: {
    waistlineCurveFront: WAISTLINE_CURVE_FRONT,
  },
};

/** @deprecated Prefer CLEO_PRESET / MILA_PRESET directly — kept for diagnostic scripts. */
export const BLOCK_PRESETS: GarmentPreset[] = [CLEO_PRESET, MILA_PRESET];

export function blockPresetByName(name: string): GarmentPreset | undefined {
  return BLOCK_PRESETS.find((p) => p.name === name);
}
