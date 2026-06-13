import { BodyMeasurements, ConstructionStep, OutlinePoint, Pattern, Point, Marking } from "@/lib/types/measurements";
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

  const outline: OutlinePoint[] = [
    ...waistEdge.map((at) => ({ at, edge: "seam" as const })),
    { at: { x: width, y: depth }, edge: "hem" },
    { at: { x: 0, y: depth }, edge: "fold" },
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

export function gatheredSkirtInstructions(): ConstructionStep[] {
  return [
    {
      id: "finish-edges",
      text: "Neaten the side-seam and hem edges of both panels by your preferred method (overlock or zigzag).",
      pieces: ["Front", "Back"],
    },
    {
      id: "side-seams",
      text: "Right sides together, match the side-seam notches and stitch the panels down each side. Sew one side fully; on the other, stitch only from the hem up to the opening, leaving the top open for the closure. Press seams open.",
      pieces: ["Front", "Back"],
    },
    {
      id: "gather-waist",
      text: "Run two rows of long gathering stitches along the waist edge and draw them up until the gathered waist matches the waistband (excluding its underwrap), distributing fullness evenly.",
      pieces: ["Front", "Back"],
    },
    {
      id: "attach-waistband",
      text: "Right sides together, pin the band to the gathered waist edge matching notches, underwrap extending past the opening. Stitch, press the seam toward the band, fold the band on its fold line, close the short ends, turn, and finish the inner edge down over the seam.",
      pieces: ["Waistband", "Front", "Back"],
    },
    {
      id: "fastening",
      text: "Work the buttonhole and sew the button at the marked positions on the underwrap.",
      pieces: ["Waistband"],
    },
    {
      id: "hem",
      text: "Turn up the hem allowance, press, and stitch by your preferred method.",
      pieces: ["Front", "Back"],
    },
  ];
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
