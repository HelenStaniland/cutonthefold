"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { Ease } from "@/lib/types/measurements";
import {
  CROTCH_ARRIVAL_ANGLE_MAX,
  CROTCH_ARRIVAL_ANGLE_MIN,
  CROTCH_EXTENSION_SCALE_MAX,
  CROTCH_EXTENSION_SCALE_MIN,
  WAISTLINE_CURVE_FRONT_MAX,
  WAISTLINE_CURVE_FRONT_MIN,
  FRONT_WAIST_INSET_MAX,
  FRONT_WAIST_INSET_MIN,
  BACK_CROTCH_DROP_MIN,
  BACK_CROTCH_DROP_MAX,
  CROTCH_FULLNESS_MIN,
  CROTCH_FULLNESS_MAX,
  INSEAM_KNEE_INSET_MIN,
  INSEAM_KNEE_INSET_MAX,
  WAIST_DROP_MAX,
  type BackHemShape,
  type WaistbandMode,
} from "@/lib/patterns/trouserBlock";
import {
  BLOCK_TROUSER_STYLE,
  type DartedWaistFinish,
  type TrouserStyleSettings,
} from "@/lib/pattern/garmentStyles";
import { usePersistedState } from "@/app/usePersistedState";

export type { DartedWaistFinish, TrouserStyleSettings };
export {
  BLOCK_TROUSER_STYLE,
  IZZY_TROUSER_STYLE,
  izzyTrouserStyle,
} from "@/lib/pattern/garmentStyles";

export const BLOCK_GEOMETRY_OVERRIDE_KEYS = [
  "frontCrotchExtensionScale",
  "backCrotchExtensionScale",
  "crotchStraightRun",
  "crotchArrivalAngle",
  "waistlineCurveFront",
  "frontWaistInset",
  "backCrotchDrop",
  "frontCrotchFullness",
  "backCrotchFullness",
] as const satisfies ReadonlyArray<keyof TrouserStyleSettings>;

export type BlockGeometryOverrideKey =
  (typeof BLOCK_GEOMETRY_OVERRIDE_KEYS)[number];

/** @deprecated Use BLOCK_TROUSER_STYLE. */
export const DEFAULT_TROUSER_STYLE = BLOCK_TROUSER_STYLE;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clampExt(raw: number): number {
  return Math.max(
    CROTCH_EXTENSION_SCALE_MIN,
    Math.min(CROTCH_EXTENSION_SCALE_MAX, raw),
  );
}

function clampInseamKneeInset(raw: number): number {
  return Math.max(
    INSEAM_KNEE_INSET_MIN,
    Math.min(INSEAM_KNEE_INSET_MAX, raw),
  );
}

function optClamped(
  raw: unknown,
  clamp: (n: number) => number,
): number | null {
  if (raw === null || raw === undefined) return null;
  if (!isFiniteNumber(raw)) return null;
  return clamp(raw);
}

function parseStyle(
  raw: unknown,
  defaultBackHemShape: BackHemShape,
): TrouserStyleSettings | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const easeRaw = o.ease;
  if (easeRaw == null || typeof easeRaw !== "object") {
    return null;
  }
  const easeObj = easeRaw as Record<string, unknown>;
  if (!isFiniteNumber(easeObj.waist) || !isFiniteNumber(easeObj.hip)) {
    return null;
  }
  if (
    !isFiniteNumber(o.legBottomWidth) ||
    !isFiniteNumber(o.waistbandDepth) ||
    !isFiniteNumber(o.dartedBandDepth) ||
    !isFiniteNumber(o.zipLength)
  ) {
    return null;
  }
  const mode = o.waistbandMode;
  if (mode !== "darted" && mode !== "shaped") {
    return null;
  }
  const finish = o.dartedWaistFinish;
  if (finish !== "facing" && finish !== "waistband") {
    return null;
  }
  const backHemShape =
    o.backHemShape === "curved" || o.backHemShape === "straight"
      ? o.backHemShape
      : defaultBackHemShape;
  void o.crotchExtensionScale;
  void o.crotchDepartureHeight;
  void o.frontKneeShaping;
  void o.backKneeShaping;
  void o.frontKneeWidth;
  void o.frontHemWidth;
  void o.backKneeWidth;
  void o.backHemWidth;

  const waistDropRaw = o.waistDrop;
  const waistDrop = isFiniteNumber(waistDropRaw)
    ? Math.max(0, Math.min(WAIST_DROP_MAX, waistDropRaw))
    : 0;

  return {
    legBottomWidth: o.legBottomWidth,
    frontInseamKneeInset: optClamped(o.frontInseamKneeInset, clampInseamKneeInset),
    backInseamKneeInset: optClamped(o.backInseamKneeInset, clampInseamKneeInset),
    backHemShape,
    waistDrop,
    waistbandDepth: o.waistbandDepth,
    waistbandMode: mode,
    dartedWaistFinish: finish,
    dartedBandDepth: o.dartedBandDepth,
    zipLength: o.zipLength,
    ease: { waist: easeObj.waist, hip: easeObj.hip },
    frontCrotchExtensionScale: optClamped(o.frontCrotchExtensionScale, clampExt),
    backCrotchExtensionScale: optClamped(o.backCrotchExtensionScale, clampExt),
    crotchStraightRun: optClamped(o.crotchStraightRun, (n) => n),
    crotchArrivalAngle: optClamped(o.crotchArrivalAngle, (n) =>
      Math.max(CROTCH_ARRIVAL_ANGLE_MIN, Math.min(CROTCH_ARRIVAL_ANGLE_MAX, n)),
    ),
    waistlineCurveFront: optClamped(o.waistlineCurveFront, (n) =>
      Math.max(WAISTLINE_CURVE_FRONT_MIN, Math.min(WAISTLINE_CURVE_FRONT_MAX, n)),
    ),
    frontWaistInset: optClamped(o.frontWaistInset, (n) =>
      Math.max(FRONT_WAIST_INSET_MIN, Math.min(FRONT_WAIST_INSET_MAX, n)),
    ),
    backCrotchDrop: optClamped(o.backCrotchDrop, (n) =>
      Math.max(BACK_CROTCH_DROP_MIN, Math.min(BACK_CROTCH_DROP_MAX, n)),
    ),
    frontCrotchFullness: optClamped(o.frontCrotchFullness, (n) =>
      Math.max(CROTCH_FULLNESS_MIN, Math.min(CROTCH_FULLNESS_MAX, n)),
    ),
    backCrotchFullness: optClamped(o.backCrotchFullness, (n) =>
      Math.max(CROTCH_FULLNESS_MIN, Math.min(CROTCH_FULLNESS_MAX, n)),
    ),
  };
}

type StyleContextValue = TrouserStyleSettings & {
  setLegBottomWidth: Dispatch<SetStateAction<number>>;
  setFrontInseamKneeInset: Dispatch<SetStateAction<number | null>>;
  setBackInseamKneeInset: Dispatch<SetStateAction<number | null>>;
  setBackHemShape: Dispatch<SetStateAction<BackHemShape>>;
  setWaistDrop: Dispatch<SetStateAction<number>>;
  setWaistbandDepth: Dispatch<SetStateAction<number>>;
  setWaistbandMode: Dispatch<SetStateAction<WaistbandMode>>;
  setDartedWaistFinish: Dispatch<SetStateAction<DartedWaistFinish>>;
  setDartedBandDepth: Dispatch<SetStateAction<number>>;
  setZipLength: Dispatch<SetStateAction<number>>;
  setEase: Dispatch<SetStateAction<Ease>>;
  setFrontCrotchExtensionScale: Dispatch<SetStateAction<number | null>>;
  setBackCrotchExtensionScale: Dispatch<SetStateAction<number | null>>;
  setCrotchStraightRun: Dispatch<SetStateAction<number | null>>;
  setCrotchArrivalAngle: Dispatch<SetStateAction<number | null>>;
  setWaistlineCurveFront: Dispatch<SetStateAction<number | null>>;
  setFrontWaistInset: Dispatch<SetStateAction<number | null>>;
  setBackCrotchDrop: Dispatch<SetStateAction<number | null>>;
  setFrontCrotchFullness: Dispatch<SetStateAction<number | null>>;
  setBackCrotchFullness: Dispatch<SetStateAction<number | null>>;
  /** Block only: darted, no band, clear geometry; keeps current waistDrop. */
  resetToBlock: () => void;
  /** Garment: replace entire store with this garment's preset defaults. */
  resetToPreset: () => void;
};

const StyleContext = createContext<StyleContextValue | null>(null);

function fieldSetter<K extends keyof TrouserStyleSettings>(
  setStyle: Dispatch<SetStateAction<TrouserStyleSettings>>,
  key: K,
): Dispatch<SetStateAction<TrouserStyleSettings[K]>> {
  return (action) => {
    setStyle((prev) => {
      const nextVal =
        typeof action === "function"
          ? (action as (p: TrouserStyleSettings[K]) => TrouserStyleSettings[K])(
              prev[key],
            )
          : action;
      return { ...prev, [key]: nextVal };
    });
  };
}

export type GarmentStyleProviderProps = {
  garmentId: string;
  defaults: TrouserStyleSettings;
  children: ReactNode;
};

/**
 * Garment-scoped style, persisted as `cotf:garment-style:${garmentId}`.
 * Switching garments loads that garment's own store — nothing leaks.
 */
export function GarmentStyleProvider({
  garmentId,
  defaults,
  children,
}: GarmentStyleProviderProps) {
  const storageKey = `cotf:garment-style:${garmentId}`;
  const [style, setStyle] = usePersistedState(
    storageKey,
    defaults,
    (raw) => parseStyle(raw, defaults.backHemShape),
  );

  const setLegBottomWidth = useCallback(fieldSetter(setStyle, "legBottomWidth"), [
    setStyle,
  ]);
  const setFrontInseamKneeInset = useCallback(
    fieldSetter(setStyle, "frontInseamKneeInset"),
    [setStyle],
  );
  const setBackInseamKneeInset = useCallback(
    fieldSetter(setStyle, "backInseamKneeInset"),
    [setStyle],
  );
  const setBackHemShape = useCallback(
    (action: SetStateAction<BackHemShape>) => {
      setStyle((prev) => {
        const next =
          typeof action === "function" ? action(prev.backHemShape) : action;
        return { ...prev, backHemShape: next };
      });
    },
    [setStyle],
  );
  const setWaistDrop = useCallback(fieldSetter(setStyle, "waistDrop"), [
    setStyle,
  ]);
  const setWaistbandDepth = useCallback(fieldSetter(setStyle, "waistbandDepth"), [
    setStyle,
  ]);
  const setWaistbandMode = useCallback(fieldSetter(setStyle, "waistbandMode"), [
    setStyle,
  ]);
  const setDartedWaistFinish = useCallback(
    fieldSetter(setStyle, "dartedWaistFinish"),
    [setStyle],
  );
  const setDartedBandDepth = useCallback(
    fieldSetter(setStyle, "dartedBandDepth"),
    [setStyle],
  );
  const setZipLength = useCallback(fieldSetter(setStyle, "zipLength"), [setStyle]);
  const setEase = useCallback(fieldSetter(setStyle, "ease"), [setStyle]);
  const setFrontCrotchExtensionScale = useCallback(
    fieldSetter(setStyle, "frontCrotchExtensionScale"),
    [setStyle],
  );
  const setBackCrotchExtensionScale = useCallback(
    fieldSetter(setStyle, "backCrotchExtensionScale"),
    [setStyle],
  );
  const setCrotchStraightRun = useCallback(
    fieldSetter(setStyle, "crotchStraightRun"),
    [setStyle],
  );
  const setCrotchArrivalAngle = useCallback(
    fieldSetter(setStyle, "crotchArrivalAngle"),
    [setStyle],
  );
  const setWaistlineCurveFront = useCallback(
    fieldSetter(setStyle, "waistlineCurveFront"),
    [setStyle],
  );
  const setFrontWaistInset = useCallback(
    fieldSetter(setStyle, "frontWaistInset"),
    [setStyle],
  );
  const setBackCrotchDrop = useCallback(
    fieldSetter(setStyle, "backCrotchDrop"),
    [setStyle],
  );
  const setFrontCrotchFullness = useCallback(
    fieldSetter(setStyle, "frontCrotchFullness"),
    [setStyle],
  );
  const setBackCrotchFullness = useCallback(
    fieldSetter(setStyle, "backCrotchFullness"),
    [setStyle],
  );

  const resetToBlock = useCallback(() => {
    setStyle((prev) => ({
      ...BLOCK_TROUSER_STYLE,
      waistDrop: prev.waistDrop,
    }));
  }, [setStyle]);

  const resetToPreset = useCallback(() => {
    setStyle({
      ...defaults,
      ease: { ...defaults.ease },
    });
  }, [setStyle, defaults]);

  const value = useMemo(
    () => ({
      ...style,
      setLegBottomWidth,
      setFrontInseamKneeInset,
      setBackInseamKneeInset,
      setBackHemShape,
      setWaistDrop,
      setWaistbandDepth,
      setWaistbandMode,
      setDartedWaistFinish,
      setDartedBandDepth,
      setZipLength,
      setEase,
      setFrontCrotchExtensionScale,
      setBackCrotchExtensionScale,
      setCrotchStraightRun,
      setCrotchArrivalAngle,
      setWaistlineCurveFront,
      setFrontWaistInset,
      setBackCrotchDrop,
      setFrontCrotchFullness,
      setBackCrotchFullness,
      resetToBlock,
      resetToPreset,
    }),
    [
      style,
      setLegBottomWidth,
      setFrontInseamKneeInset,
      setBackInseamKneeInset,
      setBackHemShape,
      setWaistDrop,
      setWaistbandDepth,
      setWaistbandMode,
      setDartedWaistFinish,
      setDartedBandDepth,
      setZipLength,
      setEase,
      setFrontCrotchExtensionScale,
      setBackCrotchExtensionScale,
      setCrotchStraightRun,
      setCrotchArrivalAngle,
      setWaistlineCurveFront,
      setFrontWaistInset,
      setBackCrotchDrop,
      setFrontCrotchFullness,
      setBackCrotchFullness,
      resetToBlock,
      resetToPreset,
    ],
  );

  return (
    <StyleContext.Provider value={value}>{children}</StyleContext.Provider>
  );
}

export function useStyle(): StyleContextValue {
  const context = useContext(StyleContext);
  if (!context) {
    throw new Error("useStyle must be used within GarmentStyleProvider");
  }
  return context;
}
