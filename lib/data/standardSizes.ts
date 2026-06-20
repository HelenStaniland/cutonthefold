import { BodyMeasurements } from "@/lib/types/measurements";

// Source: Aldrich, "Metric Pattern Cutting for Women's Wear", 6th edition,
// p.11 — "Standard body measurements, women's sizing" (4cm/6cm increments,
// women of medium height 160–172cm). This chart is compliant with BS EN
// 13402-3 and uses the *new* size coding, which runs one code larger than
// the 4th/5th-edition chart (old size 14 == new size 12).
//
// Values are the chart's cm figures × 10 (the app works in millimetres).
//
// NOTE: the 6th-edition chart on p.11 runs 6–24 only (no size 26). If you
// need 26, take it from the book rather than extrapolating.

export type StandardSize = { code: string; body: BodyMeasurements };

export const DEFAULT_SIZE_CODE = "12";

export const STANDARD_SIZES: StandardSize[] = [
  { code: "6",  body: { waist: 640,  lowWaist: 740,  hip: 880,  hipDepth: 200, bodyRise: 266, waistToFloor: 1020 } },
  { code: "8",  body: { waist: 680,  lowWaist: 780,  hip: 920,  hipDepth: 203, bodyRise: 273, waistToFloor: 1030 } },
  { code: "10", body: { waist: 720,  lowWaist: 820,  hip: 960,  hipDepth: 206, bodyRise: 280, waistToFloor: 1040 } },
  { code: "12", body: { waist: 760,  lowWaist: 860,  hip: 1000, hipDepth: 209, bodyRise: 287, waistToFloor: 1050 } },
  { code: "14", body: { waist: 800,  lowWaist: 900,  hip: 1040, hipDepth: 212, bodyRise: 294, waistToFloor: 1060 } },
  { code: "16", body: { waist: 840,  lowWaist: 940,  hip: 1080, hipDepth: 215, bodyRise: 301, waistToFloor: 1070 } },
  { code: "18", body: { waist: 880,  lowWaist: 980,  hip: 1120, hipDepth: 218, bodyRise: 308, waistToFloor: 1080 } },
  { code: "20", body: { waist: 940,  lowWaist: 1040, hip: 1180, hipDepth: 221, bodyRise: 318, waistToFloor: 1090 } },
  { code: "22", body: { waist: 1000, lowWaist: 1100, hip: 1240, hipDepth: 224, bodyRise: 328, waistToFloor: 1100 } },
  { code: "24", body: { waist: 1060, lowWaist: 1160, hip: 1320, hipDepth: 227, bodyRise: 338, waistToFloor: 1110 } },
];

export function bodyForSizeCode(code: string): BodyMeasurements | undefined {
  return STANDARD_SIZES.find((size) => size.code === code)?.body;
}

export function bodiesMatch(a: BodyMeasurements, b: BodyMeasurements): boolean {
  return (
    a.waist === b.waist &&
    a.lowWaist === b.lowWaist &&
    a.hip === b.hip &&
    a.hipDepth === b.hipDepth &&
    a.bodyRise === b.bodyRise &&
    a.waistToFloor === b.waistToFloor
  );
}

export function sizeCodeForBody(body: BodyMeasurements): string {
  const match = STANDARD_SIZES.find((size) => bodiesMatch(size.body, body));
  return match?.code ?? "custom";
}
