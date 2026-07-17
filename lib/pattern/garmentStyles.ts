/**
 * Per-garment / per-block default style payloads.
 * Soft dependency only — no React. Safe to import from Server Components.
 */
import type { Ease } from "@/lib/types/measurements";
import type {
  BackHemShape,
  WaistbandMode,
} from "@/lib/patterns/trouserBlock";
import { DEFAULT_FIT, easeForFit } from "@/lib/pattern/fitPresets";
import { IZZY_PRESET } from "@/lib/pattern/blockPresets";

export type DartedWaistFinish = "facing" | "waistband";

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
  crotchStraightRun: number | null;
  crotchArrivalAngle: number | null;
  waistlineCurveFront: number | null;
  frontWaistInset: number | null;
  backCrotchDrop: number | null;
  frontCrotchFullness: number | null;
  backCrotchFullness: number | null;
};

const clearedGeometry = {
  frontCrotchExtensionScale: null,
  backCrotchExtensionScale: null,
  crotchStraightRun: null,
  crotchArrivalAngle: null,
  waistlineCurveFront: null,
  frontWaistInset: null,
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

/** Izzy Pants — block + named garment modifications. */
export const IZZY_TROUSER_STYLE: TrouserStyleSettings = (() => {
  const m = IZZY_PRESET.measured;
  const pr = IZZY_PRESET.provisional;
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
    crotchStraightRun: m.crotchStraightRun,
    crotchArrivalAngle: m.crotchArrivalAngle,
    waistlineCurveFront: pr.waistlineCurveFront,
    frontWaistInset: m.frontWaistInset,
    backCrotchDrop: m.backCrotchDrop,
    frontCrotchFullness: m.frontCrotchFullness,
    backCrotchFullness: m.backCrotchFullness,
  };
})();

export function izzyTrouserStyle(): TrouserStyleSettings {
  return { ...IZZY_TROUSER_STYLE, ease: { ...IZZY_TROUSER_STYLE.ease } };
}
