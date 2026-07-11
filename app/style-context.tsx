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
  DEFAULT_CROTCH_EXTENSION_SCALE,
  WAISTLINE_CURVE_FRONT,
  WAISTLINE_CURVE_FRONT_MAX,
  WAISTLINE_CURVE_FRONT_MIN,
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
  crotchExtensionScale: number;
  /** null = follow the hipline (D − p10.y) for the current body. */
  crotchStraightRun: number | null;
  crotchArrivalAngle: number;
  waistlineCurveFront: number;
};

export const DEFAULT_TROUSER_STYLE: TrouserStyleSettings = {
  legBottomWidth: 220,
  waistbandDepth: 40,
  waistbandMode: "shaped",
  dartedWaistFinish: "waistband",
  dartedBandDepth: 25,
  zipLength: 180,
  ease: easeForFit(DEFAULT_FIT)!,
  crotchExtensionScale: DEFAULT_CROTCH_EXTENSION_SCALE,
  crotchStraightRun: null,
  crotchArrivalAngle: DEFAULT_CROTCH_ARRIVAL_ANGLE,
  waistlineCurveFront: WAISTLINE_CURVE_FRONT,
};

const STYLE_STORAGE_KEY = "cotf:style:v1";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
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
  const crotchRaw = o.crotchExtensionScale;
  const crotchExtensionScale = isFiniteNumber(crotchRaw)
    ? Math.max(
        CROTCH_EXTENSION_SCALE_MIN,
        Math.min(CROTCH_EXTENSION_SCALE_MAX, crotchRaw),
      )
    : DEFAULT_CROTCH_EXTENSION_SCALE;
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
  return {
    legBottomWidth: o.legBottomWidth,
    waistbandDepth: o.waistbandDepth,
    waistbandMode: mode,
    dartedWaistFinish: finish,
    dartedBandDepth: o.dartedBandDepth,
    zipLength: o.zipLength,
    ease: { waist: easeObj.waist, hip: easeObj.hip },
    crotchExtensionScale,
    crotchStraightRun,
    crotchArrivalAngle,
    waistlineCurveFront,
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
  setCrotchExtensionScale: Dispatch<SetStateAction<number>>;
  setCrotchStraightRun: Dispatch<SetStateAction<number | null>>;
  setCrotchArrivalAngle: Dispatch<SetStateAction<number>>;
  setWaistlineCurveFront: Dispatch<SetStateAction<number>>;
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
  const setCrotchExtensionScale = useCallback(
    fieldSetter(setStyle, "crotchExtensionScale"),
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
      setCrotchExtensionScale,
      setCrotchStraightRun,
      setCrotchArrivalAngle,
      setWaistlineCurveFront,
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
      setCrotchExtensionScale,
      setCrotchStraightRun,
      setCrotchArrivalAngle,
      setWaistlineCurveFront,
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
