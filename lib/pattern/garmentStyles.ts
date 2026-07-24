/**
 * Per-garment / per-block default style payloads.
 * Soft dependency only — no React. Safe to import from Server Components.
 */
import type { Ease } from "@/lib/types/measurements";
import type {
  BackHemShape,
  CrotchDeparture,
  WaistbandMode,
} from "@/lib/patterns/trouserBlock";
import { DEFAULT_FIT, easeForFit } from "@/lib/pattern/fitPresets";
import { CLEO_PRESET, MILA_PRESET } from "@/lib/pattern/blockPresets";

export type DartedWaistFinish = "facing" | "waistband" | "elastic";
/** @deprecated Prefer DartedWaistFinish — alias for the three-way waist finish. */
export type WaistFinish = DartedWaistFinish;

export type TrouserStyleSettings = {
  /** Aldrich bottomWidth — front hem B−10, back B+10. */
  legBottomWidth: number;
  /**
   * Signed inseam knee inset from crotch→hem chord (mm).
   * null = Aldrich KNEE_ADD block path.
   */
  frontInseamKneeInset: number | null;
  backInseamKneeInset: number | null;
  backHemShape: BackHemShape;
  waistDrop: number;
  waistbandDepth: number;
  waistbandMode: WaistbandMode;
  dartedWaistFinish: DartedWaistFinish;
  dartedBandDepth: number;
  zipLength: number;
  ease: Ease;
  frontCrotchExtensionScale: number | null;
  backCrotchExtensionScale: number | null;
  crotchDeparture: CrotchDeparture | null;
  crotchArrivalAngle: number | null;
  waistlineCurveFront: number | null;
  frontWaistInset: number | null;
  /** null = default 1 (full Aldrich taper). */
  waistTaper: number | null;
  backCrotchDrop: number | null;
  frontCrotchFullness: number | null;
  backCrotchFullness: number | null;
};

const clearedGeometry = {
  frontCrotchExtensionScale: null,
  backCrotchExtensionScale: null,
  crotchDeparture: null,
  crotchArrivalAngle: null,
  waistlineCurveFront: null,
  frontWaistInset: null,
  waistTaper: null,
  backCrotchDrop: null,
  frontCrotchFullness: null,
  backCrotchFullness: null,
} as const;

/** Faithful Trouser Block: darted, no band, geometry overrides cleared. */
export const BLOCK_TROUSER_STYLE: TrouserStyleSettings = {
  legBottomWidth: 220,
  frontInseamKneeInset: null,
  backInseamKneeInset: null,
  backHemShape: "curved",
  waistDrop: 0,
  waistbandDepth: 0,
  waistbandMode: "darted",
  dartedWaistFinish: "facing",
  dartedBandDepth: 25,
  zipLength: 180,
  ease: easeForFit(DEFAULT_FIT)!,
  ...clearedGeometry,
};

/** Cleo Pants — block + named garment modifications. */
export const CLEO_TROUSER_STYLE: TrouserStyleSettings = (() => {
  const m = CLEO_PRESET.measured;
  const pr = CLEO_PRESET.provisional;
  return {
    legBottomWidth: m.bottomWidth,
    frontInseamKneeInset: m.frontInseamKneeInset,
    backInseamKneeInset: m.backInseamKneeInset,
    backHemShape: m.backHemShape,
    waistDrop: m.waistDrop,
    waistbandDepth: m.waistbandDepth,
    waistbandMode: m.waistbandMode,
    dartedWaistFinish: "waistband" as const,
    dartedBandDepth: 25,
    zipLength: 180,
    ease: { ...m.ease },
    frontCrotchExtensionScale: m.frontCrotchExtensionScale,
    backCrotchExtensionScale: m.backCrotchExtensionScale,
    crotchDeparture: m.crotchDeparture,
    crotchArrivalAngle: m.crotchArrivalAngle,
    waistlineCurveFront: pr.waistlineCurveFront,
    frontWaistInset: m.frontWaistInset,
    waistTaper: m.waistTaper ?? null,
    backCrotchDrop: m.backCrotchDrop,
    frontCrotchFullness: m.frontCrotchFullness,
    backCrotchFullness: m.backCrotchFullness,
  };
})();

export function cleoTrouserStyle(): TrouserStyleSettings {
  return { ...CLEO_TROUSER_STYLE, ease: { ...CLEO_TROUSER_STYLE.ease } };
}

/** Mila Pants — sandbox: straight wide leg, elastic self-casing waist. */
export const MILA_TROUSER_STYLE: TrouserStyleSettings = (() => {
  const m = MILA_PRESET.measured;
  const pr = MILA_PRESET.provisional;
  return {
    legBottomWidth: m.bottomWidth,
    frontInseamKneeInset: m.frontInseamKneeInset,
    backInseamKneeInset: m.backInseamKneeInset,
    backHemShape: m.backHemShape,
    waistDrop: m.waistDrop,
    waistbandDepth: m.waistbandDepth,
    waistbandMode: m.waistbandMode,
    dartedWaistFinish: "elastic" as const,
    dartedBandDepth: 25,
    zipLength: 180,
    ease: { ...m.ease },
    frontCrotchExtensionScale: m.frontCrotchExtensionScale,
    backCrotchExtensionScale: m.backCrotchExtensionScale,
    crotchDeparture: m.crotchDeparture,
    crotchArrivalAngle: m.crotchArrivalAngle,
    waistlineCurveFront: pr.waistlineCurveFront,
    frontWaistInset: m.frontWaistInset,
    waistTaper: m.waistTaper ?? null,
    backCrotchDrop: m.backCrotchDrop,
    frontCrotchFullness: m.frontCrotchFullness,
    backCrotchFullness: m.backCrotchFullness,
  };
})();

export function milaTrouserStyle(): TrouserStyleSettings {
  return { ...MILA_TROUSER_STYLE, ease: { ...MILA_TROUSER_STYLE.ease } };
}
