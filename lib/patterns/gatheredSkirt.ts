import { BodyMeasurements, Pattern, Point, Marking } from "@/lib/types/measurements";
import { validationResult, ValidationResult } from "@/lib/types/validation";
import { draftStraightWaistband } from "@/lib/patterns/straightWaistband";

const WAIST_RISE = 15; // mm — waist 1.5cm higher at the side seam

export type GatheredSkirtFit = {
  fullness: number; // mm beyond the quarter-hip
};

export type GatheredSkirtStyle = {
  length: number; // mm, waist to hem
};

function skirtPanelMarkings(
  width: number,
  depth: number,
  foldLabel: string,
): Marking[] {
  return [
    {
      kind: "grainline",
      line: { from: { x: width / 2, y: 40 }, to: { x: width / 2, y: depth - 40 } },
    },
    {
      kind: "placeOnFold",
      line: { from: { x: 0, y: 0 }, to: { x: 0, y: depth } },
      inward: { x: 1, y: 0 },
      label: foldLabel,
    },
    {
      kind: "gather",
      line: { from: { x: 0, y: 0 }, to: { x: width, y: -WAIST_RISE } },
    },
    { kind: "notch", at: { x: width, y: 200 }, dir: { x: -1, y: 0 } },
    { kind: "notch", at: { x: width, y: 400 }, dir: { x: -1, y: 0 } },
  ];
}

export function draftGatheredSkirt(
  body: BodyMeasurements,
  fit: GatheredSkirtFit,
  style: GatheredSkirtStyle,
): Pattern {
  const width = body.hip / 4 + fit.fullness;
  const depth = style.length;

  const SEGMENTS = 8;
  const waistEdge: Point[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const x = (width * i) / SEGMENTS;
    const y = -WAIST_RISE * (x / width) ** 2;
    waistEdge.push({ x, y });
  }

  const outline: Point[] = [
    ...waistEdge,
    { x: width, y: depth },
    { x: 0, y: depth },
  ];

  return {
    pieces: [
      {
        name: "Back",
        cutCount: 1,
        onFold: true,
        outline,
        markings: skirtPanelMarkings(width, depth, "CB fold"),
      },
      {
        name: "Front",
        cutCount: 1,
        onFold: true,
        outline,
        markings: skirtPanelMarkings(width, depth, "CF fold"),
      },
      draftStraightWaistband(body.waist, { finishedDepth: 40, underwrap: 40 }),
    ],
  };
}

export function validateGatheredSkirt(
  body: BodyMeasurements,
  _fit: GatheredSkirtFit,
  _style: GatheredSkirtStyle,
): ValidationResult {
  const issues = [];

  if (body.waist > body.hip) {
    issues.push({
      severity: "error" as const,
      message: "Waist must not be larger than hip.",
      fields: ["waist", "hip"],
    });
  }

  return validationResult(issues);
}
