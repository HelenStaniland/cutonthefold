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
  DEFAULT_CROTCH_ARRIVAL_ANGLE,
  DEFAULT_FRONT_CROTCH_EXTENSION_SCALE,
  DEFAULT_BACK_CROTCH_EXTENSION_SCALE,
  WAISTLINE_CURVE_FRONT,
  WAISTLINE_CURVE_FRONT_MAX,
  WAISTLINE_CURVE_FRONT_MIN,
  DEFAULT_FRONT_WAIST_INSET,
  FRONT_WAIST_INSET_MAX,
  FRONT_WAIST_INSET_MIN,
  DEFAULT_BACK_CROTCH_DROP,
  BACK_CROTCH_DROP_MIN,
  BACK_CROTCH_DROP_MAX,
  DEFAULT_FRONT_CROTCH_FULLNESS,
  DEFAULT_BACK_CROTCH_FULLNESS,
  CROTCH_FULLNESS_MIN,
  CROTCH_FULLNESS_MAX,
  type WaistbandMode,
} from "@/lib/patterns/trouserBlock";
import { DEFAULT_FIT, easeForFit } from "@/lib/pattern/fitPresets";
import { usePersistedState } from "@/app/usePersistedState";

export type DartedWaistFinish = "facing" | "waistband";

/** Block-agnostic trouser style — seed of the future Design object. */
export type TrouserStyleSettings = {
  legBottomWidth: number;
  waistbandDepth: number;
  waistbandMode: WaistbandMode;
  dartedWaistFinish: DartedWaistFinish;
  dartedBandDepth: number;
  zipLength: number;
  ease: Ease;
  frontCrotchExtensionScale: number;
  backCrotchExtensionScale: number;
  /** null = follow the hipline (D − p10.y) for the current body. */
  crotchStraightRun: number | null;
  crotchArrivalAngle: number;
  waistlineCurveFront: number;
  frontWaistInset: number;
  backCrotchDrop: number;
  frontCrotchFullness: number;
  backCrotchFullness: number;
};

export const DEFAULT_TROUSER_STYLE: TrouserStyleSettings = {
  legBottomWidth: 220,
  waistbandDepth: 40,
  waistbandMode: "shaped",
  dartedWaistFinish: "waistband",
  dartedBandDepth: 25,
  zipLength: 180,
  ease: easeForFit(DEFAULT_FIT)!,
  frontCrotchExtensionScale: DEFAULT_FRONT_CROTCH_EXTENSION_SCALE,
  backCrotchExtensionScale: DEFAULT_BACK_CROTCH_EXTENSION_SCALE,
  crotchStraightRun: null,
  crotchArrivalAngle: DEFAULT_CROTCH_ARRIVAL_ANGLE,
  waistlineCurveFront: WAISTLINE_CURVE_FRONT,
  frontWaistInset: DEFAULT_FRONT_WAIST_INSET,
  backCrotchDrop: DEFAULT_BACK_CROTCH_DROP,
  frontCrotchFullness: DEFAULT_FRONT_CROTCH_FULLNESS,
  backCrotchFullness: DEFAULT_BACK_CROTCH_FULLNESS,
};

const STYLE_STORAGE_KEY = "cotf:style:v1";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clampExt(raw: number): number {
  return Math.max(
    CROTCH_EXTENSION_SCALE_MIN,
    Math.min(CROTCH_EXTENSION_SCALE_MAX, raw),
  );
}

function parseStyle(raw: unknown): TrouserStyleSettings | null {
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
  // Stale crotchExtensionScale is ignored — not coerced into either new param.
  void o.crotchExtensionScale;
  const frontExtRaw = o.frontCrotchExtensionScale;
  const frontCrotchExtensionScale = isFiniteNumber(frontExtRaw)
    ? clampExt(frontExtRaw)
    : DEFAULT_FRONT_CROTCH_EXTENSION_SCALE;
  const backExtRaw = o.backCrotchExtensionScale;
  const backCrotchExtensionScale = isFiniteNumber(backExtRaw)
    ? clampExt(backExtRaw)
    : DEFAULT_BACK_CROTCH_EXTENSION_SCALE;
  // Ignore stale crotchDepartureHeight — do not coerce into the new key.
  const runRaw = o.crotchStraightRun;
  const crotchStraightRun =
    runRaw === null || runRaw === undefined
      ? null
      : isFiniteNumber(runRaw)
        ? runRaw
        : null;
  const arrRaw = o.crotchArrivalAngle;
  const crotchArrivalAngle = isFiniteNumber(arrRaw)
    ? Math.max(
        CROTCH_ARRIVAL_ANGLE_MIN,
        Math.min(CROTCH_ARRIVAL_ANGLE_MAX, arrRaw),
      )
    : DEFAULT_CROTCH_ARRIVAL_ANGLE;
  const scoopRaw = o.waistlineCurveFront;
  const waistlineCurveFront = isFiniteNumber(scoopRaw)
    ? Math.max(
        WAISTLINE_CURVE_FRONT_MIN,
        Math.min(WAISTLINE_CURVE_FRONT_MAX, scoopRaw),
      )
    : WAISTLINE_CURVE_FRONT;
  const insetRaw = o.frontWaistInset;
  const frontWaistInset = isFiniteNumber(insetRaw)
    ? Math.max(FRONT_WAIST_INSET_MIN, Math.min(FRONT_WAIST_INSET_MAX, insetRaw))
    : DEFAULT_FRONT_WAIST_INSET;
  const dropRaw = o.backCrotchDrop;
  const backCrotchDrop = isFiniteNumber(dropRaw)
    ? Math.max(BACK_CROTCH_DROP_MIN, Math.min(BACK_CROTCH_DROP_MAX, dropRaw))
    : DEFAULT_BACK_CROTCH_DROP;
  const frontFullRaw = o.frontCrotchFullness;
  const frontCrotchFullness = isFiniteNumber(frontFullRaw)
    ? Math.max(
        CROTCH_FULLNESS_MIN,
        Math.min(CROTCH_FULLNESS_MAX, frontFullRaw),
      )
    : DEFAULT_FRONT_CROTCH_FULLNESS;
  const backFullRaw = o.backCrotchFullness;
  const backCrotchFullness = isFiniteNumber(backFullRaw)
    ? Math.max(CROTCH_FULLNESS_MIN, Math.min(CROTCH_FULLNESS_MAX, backFullRaw))
    : DEFAULT_BACK_CROTCH_FULLNESS;
  return {
    legBottomWidth: o.legBottomWidth,
    waistbandDepth: o.waistbandDepth,
    waistbandMode: mode,
    dartedWaistFinish: finish,
    dartedBandDepth: o.dartedBandDepth,
    zipLength: o.zipLength,
    ease: { waist: easeObj.waist, hip: easeObj.hip },
    frontCrotchExtensionScale,
    backCrotchExtensionScale,
    crotchStraightRun,
    crotchArrivalAngle,
    waistlineCurveFront,
    frontWaistInset,
    backCrotchDrop,
    frontCrotchFullness,
    backCrotchFullness,
  };
}

type StyleContextValue = TrouserStyleSettings & {
  setLegBottomWidth: Dispatch<SetStateAction<number>>;
  setWaistbandDepth: Dispatch<SetStateAction<number>>;
  setWaistbandMode: Dispatch<SetStateAction<WaistbandMode>>;
  setDartedWaistFinish: Dispatch<SetStateAction<DartedWaistFinish>>;
  setDartedBandDepth: Dispatch<SetStateAction<number>>;
  setZipLength: Dispatch<SetStateAction<number>>;
  setEase: Dispatch<SetStateAction<Ease>>;
  setFrontCrotchExtensionScale: Dispatch<SetStateAction<number>>;
  setBackCrotchExtensionScale: Dispatch<SetStateAction<number>>;
  setCrotchStraightRun: Dispatch<SetStateAction<number | null>>;
  setCrotchArrivalAngle: Dispatch<SetStateAction<number>>;
  setWaistlineCurveFront: Dispatch<SetStateAction<number>>;
  setFrontWaistInset: Dispatch<SetStateAction<number>>;
  setBackCrotchDrop: Dispatch<SetStateAction<number>>;
  setFrontCrotchFullness: Dispatch<SetStateAction<number>>;
  setBackCrotchFullness: Dispatch<SetStateAction<number>>;
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

export function StyleProvider({ children }: { children: ReactNode }) {
  const [style, setStyle] = usePersistedState(
    STYLE_STORAGE_KEY,
    DEFAULT_TROUSER_STYLE,
    parseStyle,
  );

  const setLegBottomWidth = useCallback(fieldSetter(setStyle, "legBottomWidth"), [
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

  const value = useMemo(
    () => ({
      ...style,
      setLegBottomWidth,
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
    }),
    [
      style,
      setLegBottomWidth,
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
    ],
  );

  return (
    <StyleContext.Provider value={value}>{children}</StyleContext.Provider>
  );
}

export function useStyle(): StyleContextValue {
  const context = useContext(StyleContext);
  if (!context) {
    throw new Error("useStyle must be used within StyleProvider");
  }
  return context;
}
