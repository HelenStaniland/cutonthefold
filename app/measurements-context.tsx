"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BodyMeasurements } from "@/lib/types/measurements";
import {
  DEFAULT_SIZE_CODE,
  bodyForSizeCode,
  sizeCodeForBody,
} from "@/lib/data/standardSizes";

type MeasurementsContextValue = {
  body: BodyMeasurements;
  sizeCode: string;
  setBody: (body: BodyMeasurements) => void;
  setSize: (code: string) => void;
  updateBodyField: (key: keyof BodyMeasurements, value: number) => void;
};

const MeasurementsContext = createContext<MeasurementsContextValue | null>(null);

export function MeasurementsProvider({ children }: { children: ReactNode }) {
  const [body, setBodyState] = useState<BodyMeasurements>(
    () => bodyForSizeCode(DEFAULT_SIZE_CODE)!,
  );
  const [sizeCode, setSizeCodeState] = useState(DEFAULT_SIZE_CODE);

  const setBody = useCallback((next: BodyMeasurements) => {
    setBodyState(next);
    setSizeCodeState(sizeCodeForBody(next));
  }, []);

  const setSize = useCallback((code: string) => {
    if (code === "custom") {
      setSizeCodeState("custom");
      return;
    }
    const preset = bodyForSizeCode(code);
    if (preset) {
      setSizeCodeState(code);
      setBodyState(preset);
    }
  }, []);

  const updateBodyField = useCallback(
    (key: keyof BodyMeasurements, value: number) => {
      setBodyState((prev) => {
        const next = { ...prev, [key]: value };
        setSizeCodeState(sizeCodeForBody(next));
        return next;
      });
    },
    [],
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
