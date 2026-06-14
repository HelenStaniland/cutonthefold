import { BodyMeasurements } from "@/lib/types/measurements";

// Source: Aldrich, "Metric Pattern Cutting for Women's Wear", standard women's sizing
// chart. VERIFY these against the current edition before relying on them.

export type StandardSize = { code: string; body: BodyMeasurements };

export const DEFAULT_SIZE_CODE = "12";

export const STANDARD_SIZES: StandardSize[] = [
  { code: "6", body: { waist: 600, hip: 840, hipDepth: 197 } },
  { code: "8", body: { waist: 640, hip: 880, hipDepth: 200 } },
  { code: "10", body: { waist: 680, hip: 920, hipDepth: 203 } },
  { code: "12", body: { waist: 720, hip: 960, hipDepth: 206 } },
  { code: "14", body: { waist: 760, hip: 1000, hipDepth: 209 } },
  { code: "16", body: { waist: 800, hip: 1040, hipDepth: 212 } },
  { code: "18", body: { waist: 840, hip: 1080, hipDepth: 215 } },
  { code: "20", body: { waist: 880, hip: 1120, hipDepth: 218 } },
  { code: "22", body: { waist: 940, hip: 1170, hipDepth: 221 } },
  { code: "24", body: { waist: 1000, hip: 1220, hipDepth: 224 } },
  { code: "26", body: { waist: 1060, hip: 1270, hipDepth: 227 } },
];

export function bodyForSizeCode(code: string): BodyMeasurements | undefined {
  return STANDARD_SIZES.find((size) => size.code === code)?.body;
}
