// lib/types/measurements.ts

export type Millimetres = number;

// The wearer's body — measured facts.
export type BodyMeasurements = {
  waist: Millimetres;
  hip: Millimetres;
  hipDepth: Millimetres;
};

// Design choices for a skirt — decisions, not body facts.
export type SkirtStyle = {
  length: Millimetres;
  fit: SkirtFit;
};
export type SkirtFit = "fitted" | "relaxed";

// The OUTPUT of drafting — geometry to be fleshed out once the book arrives.

export type Point = { x: Millimetres; y: Millimetres };
export type Line = { from: Point; to: Point };

export type EdgeType = "seam" | "fold" | "hem";

// A point on the outline that names the edge LEAVING it
// (the segment from this point to the next, wrapping at the end).
export type OutlinePoint = { at: Point; edge: EdgeType };

export type SeamAllowancePolicy = { seam: Millimetres; hem: Millimetres };
// fold is always 0 — not part of the policy.

// The standard markings, as a tagged union. The renderer draws each `kind`
// exactly once; a piece just lists the markings it carries.
export type Marking =
  | { kind: "grainline"; line: Line }
  | { kind: "foldLine"; line: Line }
  | { kind: "placeOnFold"; line: Line; inward: { x: number; y: number }; label?: string }
  | { kind: "gather"; line: Line }
  | { kind: "constructionLine"; line: Line }
  | { kind: "notch"; at: Point; label?: string; dir?: { x: number; y: number } }
  | { kind: "button"; at: Point }
  | { kind: "buttonhole"; at: Point };

export type PatternPiece = {
  name: string;
  cutCount: number;
  onFold: boolean;
  outline: OutlinePoint[]; // net / stitching line
  cuttingOutline?: Point[]; // derived; the solid cut edge (set by the transform)
  markings: Marking[];
};

export type Pattern = { pieces: PatternPiece[] };


// Metadata that will build the input form and validate it.
export type MeasurementDefinition = {
  key: keyof BodyMeasurements;
  label: string;
  hint: string;
  min: Millimetres;
  max: Millimetres;
};


export const SKIRT_BODY_MEASUREMENTS: MeasurementDefinition[] = [
  { key: "waist",    label: "Waist",     hint: "Around the narrowest part of your waist.",       min: 500, max: 1500 },
  { key: "hip",      label: "Hip",       hint: "Around the fullest part of your hips and seat.", min: 700, max: 1700 },
  { key: "hipDepth", label: "Hip depth", hint: "From waist straight down to the fullest hip.",   min: 150, max: 300  },
];