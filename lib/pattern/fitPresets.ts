import { Ease } from "@/lib/types/measurements";

// Wearing-ease presets, added on top of the block's built-in ease.
// Starting points only — the toile is the final judge. Hip is the main lever
// for trousers; waist stays small because the waistband holds it.
// "Close fit" is the bare block (no added ease).

export type FitPreset = { name: string; label: string; ease: Ease };

export const DEFAULT_FIT = "regular";

export const FIT_PRESETS: FitPreset[] = [
  { name: "close", label: "Close fit", ease: { waist: 0, hip: 0 } },
  { name: "regular", label: "Regular", ease: { waist: 10, hip: 50 } },
  { name: "relaxed", label: "Relaxed", ease: { waist: 15, hip: 80 } },
  { name: "oversized", label: "Oversized", ease: { waist: 20, hip: 120 } },
];

export function easeForFit(name: string): Ease | undefined {
  return FIT_PRESETS.find((f) => f.name === name)?.ease;
}

export function fitForEase(ease: Ease): string {
  return (
    FIT_PRESETS.find(
      (f) => f.ease.waist === ease.waist && f.ease.hip === ease.hip,
    )?.name ?? "custom"
  );
}
