import { cutLabel } from "@/lib/types/measurements";
import type { PatternPiece, PatternSpec } from "@/lib/types/measurements";

const cm = (mm: number) => {
  const v = mm / 10;
  return Number.isInteger(v) ? `${v}` : v.toFixed(1);
};

export type PatternPanel = { title: string; lines: string[] };

function panelDetailLines(s: PatternSpec): string[] {
  const b = s.body;
  const lines = [
    `${s.blockName} · ${s.sizeLabel}`,
    `Waist ${cm(b.waist)} · Hip ${cm(b.hip)} cm`,
  ];
  if (s.blockName.toLowerCase().includes("production") && "lowWaist" in b) {
    lines.push(`Low waist ${cm(b.lowWaist)} cm`);
  }
  lines.push(
    `Hip depth ${cm(b.hipDepth)} · Body rise ${cm(b.bodyRise)} cm`,
    `Waist to floor ${cm(b.waistToFloor)} cm`,
    `Ease: waist ${cm(s.ease.waist)} · hip ${cm(s.ease.hip)} cm · Hem ${cm(s.hemWidth)} cm`,
    "cutonthefold.com",
  );
  return lines;
}

export function patternPanel(
  piece: PatternPiece,
  s: PatternSpec,
): PatternPanel {
  return {
    title: `${piece.name} — ${cutLabel(piece)}`,
    lines: panelDetailLines(s),
  };
}

export function coverSpecLines(s: PatternSpec): string[] {
  return panelDetailLines(s);
}

export function patternPdfFilename(s: PatternSpec): string {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `cutonthefold-${slug(s.blockName)}-${slug(s.sizeLabel)}.pdf`;
}
