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
import {
  CARGO_PRESET,
  CLEO_PRESET,
  MILA_PRESET,
} from "@/lib/pattern/blockPresets";

export type DartedWaistFinish =
  | "facing"
  | "waistband"
  | "elastic"
  | "elasticWaistband";
/** @deprecated Prefer DartedWaistFinish — alias for the waist finish axis. */
export type WaistFinish = DartedWaistFinish;

export type PocketFrontSetting = "none" | "slant";

/** Elastic casing channel width (mm). Only meaningful when finish is elastic. */
export type CasingElasticWidthSetting = 25 | 38 | 50;

/**
 * Self-casing + slant pocket is forbidden (band too short). Derive at draft
 * time — do not write stored state.
 */
export function effectiveDartedWaistFinish(
  finish: DartedWaistFinish,
  pocketFront: PocketFrontSetting,
): DartedWaistFinish {
  if (finish === "elastic" && pocketFront === "slant") {
    return "elasticWaistband";
  }
  return finish;
}

/** Pull-on finishes that force dartless straight waist (inset/taper 0, shaped@0). */
export function isPullOnWaistFinish(finish: DartedWaistFinish): boolean {
  return finish === "elastic" || finish === "elasticWaistband";
}

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
  /** null = default 20 (Aldrich CB rise). */
  backCbWaistRise: number | null;
  backCrotchDrop: number | null;
  frontCrotchFullness: number | null;
  backCrotchFullness: number | null;
  /**
   * Front pocket construction. Default `"none"`. Cargo sets `"slant"`.
   * Independent of `dartedWaistFinish`.
   */
  pocketFront: PocketFrontSetting;
  /**
   * Elastic width (mm). Used by self-casing (`elastic`) and the separate
   * elastic waistband (`elasticWaistband`). Ignored for other finishes.
   */
  casingElasticWidth: CasingElasticWidthSetting;
};

const clearedGeometry = {
  frontCrotchExtensionScale: null,
  backCrotchExtensionScale: null,
  crotchDeparture: null,
  crotchArrivalAngle: null,
  waistlineCurveFront: null,
  frontWaistInset: null,
  waistTaper: null,
  backCbWaistRise: null,
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
  pocketFront: "none",
  casingElasticWidth: 25,
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
    backCbWaistRise: m.backCbWaistRise ?? null,
    backCrotchDrop: m.backCrotchDrop,
    frontCrotchFullness: m.frontCrotchFullness,
    backCrotchFullness: m.backCrotchFullness,
    pocketFront: "none" as const,
    casingElasticWidth: 25 as const,
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
    backCbWaistRise: m.backCbWaistRise ?? null,
    backCrotchDrop: m.backCrotchDrop,
    frontCrotchFullness: m.frontCrotchFullness,
    backCrotchFullness: m.backCrotchFullness,
    pocketFront: "none" as const,
    casingElasticWidth: 25 as const,
  };
})();

export function milaTrouserStyle(): TrouserStyleSettings {
  return { ...MILA_TROUSER_STYLE, ease: { ...MILA_TROUSER_STYLE.ease } };
}

/** Cargo Pants — pocket sandbox; slant front pocket on by default. */
export const CARGO_TROUSER_STYLE: TrouserStyleSettings = (() => {
  const m = CARGO_PRESET.measured;
  const pr = CARGO_PRESET.provisional;
  return {
    legBottomWidth: m.bottomWidth,
    frontInseamKneeInset: m.frontInseamKneeInset,
    backInseamKneeInset: m.backInseamKneeInset,
    backHemShape: m.backHemShape,
    waistDrop: m.waistDrop,
    waistbandDepth: m.waistbandDepth,
    waistbandMode: m.waistbandMode,
    dartedWaistFinish: "elasticWaistband" as const,
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
    backCbWaistRise: m.backCbWaistRise ?? null,
    backCrotchDrop: m.backCrotchDrop,
    frontCrotchFullness: m.frontCrotchFullness,
    backCrotchFullness: m.backCrotchFullness,
    pocketFront: "slant" as const,
    casingElasticWidth: 25 as const,
  };
})();

export function cargoTrouserStyle(): TrouserStyleSettings {
  return { ...CARGO_TROUSER_STYLE, ease: { ...CARGO_TROUSER_STYLE.ease } };
}
