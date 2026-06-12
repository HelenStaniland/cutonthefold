import { PatternPiece, Point, Marking } from "@/lib/types/measurements";

export type StraightWaistbandOptions = {
  finishedDepth: number; // mm — Aldrich: 3–5cm
  underwrap: number;     // mm — Aldrich: approx 4cm
};

export function draftStraightWaistband(
  waist: number,
  options: StraightWaistbandOptions,
): PatternPiece {
  const { underwrap } = options;
  const length = waist + underwrap;
  const width = options.finishedDepth * 2;
  const q = waist / 4;

  const outline: Point[] = [
    { x: 0, y: 0 },
    { x: length, y: 0 },
    { x: length, y: width },
    { x: 0, y: width },
  ];

  const markings: Marking[] = [
    { kind: "foldLine", line: { from: { x: 0, y: width / 2 }, to: { x: length, y: width / 2 } } },
    // solid line demarcating the underwrap section
    { kind: "constructionLine", line: { from: { x: underwrap, y: 0 }, to: { x: underwrap, y: width } } },
    { kind: "notch", at: { x: underwrap,         y: 0 }, label: "side" },
    { kind: "notch", at: { x: underwrap + q,     y: 0 }, label: "CB" },
    { kind: "notch", at: { x: underwrap + 2 * q, y: 0 }, label: "side" },
    { kind: "notch", at: { x: underwrap + 3 * q, y: 0 }, label: "CF" },
    { kind: "notch", at: { x: underwrap + waist, y: 0 }, label: "side" },
    // button & buttonhole on the lower (visible) half so they survive the fold
    { kind: "button",     at: { x: underwrap / 2,          y: (3 * width) / 4 } },
    { kind: "buttonhole", at: { x: length - underwrap / 2, y: (3 * width) / 4 } },
  ];

  return { name: "Waistband", cutCount: 1, onFold: false, outline, markings };
}