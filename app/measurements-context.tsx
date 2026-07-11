"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { BodyMeasurements } from "@/lib/types/measurements";
import {
  DEFAULT_SIZE_CODE,
  bodyForSizeCode,
  sizeCodeForBody,
} from "@/lib/data/standardSizes";
import { usePersistedState } from "@/app/usePersistedState";

type MeasurementsSnapshot = {
  body: BodyMeasurements;
  sizeCode: string;
};

type MeasurementsContextValue = {
  body: BodyMeasurements;
  sizeCode: string;
  setBody: (body: BodyMeasurements) => void;
  setSize: (code: string) => void;
  updateBodyField: (key: keyof BodyMeasurements, value: number) => void;
};

const MeasurementsContext = createContext<MeasurementsContextValue | null>(null);

const MEASUREMENTS_STORAGE_KEY = "cotf:measurements:v1";

const DEFAULT_SNAPSHOT: MeasurementsSnapshot = {
  body: bodyForSizeCode(DEFAULT_SIZE_CODE)!,
  sizeCode: DEFAULT_SIZE_CODE,
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseMeasurements(raw: unknown): MeasurementsSnapshot | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const bodyRaw = o.body;
  if (bodyRaw == null || typeof bodyRaw !== "object") {
    return null;
  }
  const b = bodyRaw as Record<string, unknown>;
  const keys: (keyof BodyMeasurements)[] = [
    "waist",
    "lowWaist",
    "hip",
    "hipDepth",
    "bodyRise",
    "waistToFloor",
  ];
  for (const key of keys) {
    if (!isFiniteNumber(b[key])) {
      return null;
    }
  }
  const body: BodyMeasurements = {
    waist: b.waist as number,
    lowWaist: b.lowWaist as number,
    hip: b.hip as number,
    hipDepth: b.hipDepth as number,
    bodyRise: b.bodyRise as number,
    waistToFloor: b.waistToFloor as number,
  };
  const sizeCode =
    typeof o.sizeCode === "string" && o.sizeCode.length > 0
      ? o.sizeCode
      : sizeCodeForBody(body);
  return { body, sizeCode };
}

export function MeasurementsProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = usePersistedState(
    MEASUREMENTS_STORAGE_KEY,
    DEFAULT_SNAPSHOT,
    parseMeasurements,
  );
  const { body, sizeCode } = snapshot;

  const setBody = useCallback((next: BodyMeasurements) => {
    setSnapshot({ body: next, sizeCode: sizeCodeForBody(next) });
  }, [setSnapshot]);

  const setSize = useCallback(
    (code: string) => {
      if (code === "custom") {
        setSnapshot((prev) => ({ ...prev, sizeCode: "custom" }));
        return;
      }
      const preset = bodyForSizeCode(code);
      if (preset) {
        setSnapshot({ body: preset, sizeCode: code });
      }
    },
    [setSnapshot],
  );

  const updateBodyField = useCallback(
    (key: keyof BodyMeasurements, value: number) => {
      setSnapshot((prev) => {
        const next = { ...prev.body, [key]: value };
        return { body: next, sizeCode: sizeCodeForBody(next) };
      });
    },
    [setSnapshot],
  );

  const value = useMemo(
    () => ({ body, sizeCode, setBody, setSize, updateBodyField }),
    [body, sizeCode, setBody, setSize, updateBodyField],
  );

  return (
    <MeasurementsContext.Provider value={value}>
      {children}
    </MeasurementsContext.Provider>
  );
}

export function useMeasurements(): MeasurementsContextValue {
  const context = useContext(MeasurementsContext);
  if (!context) {
    throw new Error("useMeasurements must be used within MeasurementsProvider");
  }
  return context;
}
