// lib/types/measurements.ts

export type Millimetres = number;

// The wearer's body — measured facts.
export type BodyMeasurements = {
  waist: Millimetres;
  lowWaist: Millimetres;
  hip: Millimetres;
  hipDepth: Millimetres;
  bodyRise: Millimetres;
  waistToFloor: Millimetres;
};

// Wearing ease — a design choice, added ON TOP of the block's built-in ease.
// Applied to the body measurements before drafting so Aldrich's formulas
// distribute it; the block maths are untouched.
export type Ease = {
  waist: Millimetres;
  hip: Millimetres;
};

/** Parameters used to cut a pattern — printed on each piece and the cover sheet. */
export type PatternSpec = {
  blockName: string;
  sizeLabel: string;
  fitName?: string;
  body: BodyMeasurements;
  ease: Ease;
  hemWidth: Millimetres;
};

export function applyEase(body: BodyMeasurements, ease: Ease): BodyMeasurements {
  return {
    ...body,
    waist: body.waist + ease.waist,
    lowWaist: body.lowWaist + ease.waist,
    hip: body.hip + ease.hip,
  };
}

// Design choices for a skirt — decisions, not body facts.
export type SkirtStyle = {
  length: Millimetres;
  fit: SkirtFit;
};
export type SkirtFit = "fitted" | "relaxed";

// The OUTPUT of drafting — geometry to be fleshed out once the book arrives.

export type Point = { x: Millimetres; y: Millimetres };
export type Line = { from: Point; to: Point };

/** A labelled drafting point for construction overlays (not part of the cut outline). */
export type DraftingPointKind = "construction" | "curveControl";

export type DraftingPoint = {
  id: string;
  at: Point;
  kind?: DraftingPointKind;
};

export type DraftingLineKind = "construction" | "helper" | "curveControl";

export type DraftingLine = {
  from: Point;
  to: Point;
  kind: DraftingLineKind;
};

/** Construction geometry for one pattern piece — points and reference lines. */
export type PieceConstruction = {
  pieceName: string;
  points: DraftingPoint[];
  lines: DraftingLine[];
};

export type EdgeType = "seam" | "fold" | "hem";

/** How the trouser waist edge is finished (darted depth 0 = facing; band when depth > 0). */
export type WaistFinish = "facing";

// A point on the outline that names the edge LEAVING it
// (the segment from this point to the next, wrapping at the end).
export type OutlinePoint = {
  at: Point;
  edge: EdgeType;
  role?: string;
  waistFinish?: WaistFinish;
};

export type SeamAllowancePolicy = { seam: Millimetres; hem: Millimetres };
// fold is always 0 — not part of the policy.

/**
 * Declared purpose of a notch. Render tick-count is derived from role
 * (identity → 2, else 1) — never set per-notch.
 */
export type NotchRole = "balance" | "fold" | "identity" | "zip";

/** Named mate for a balance notch (piece + seam). */
export type NotchMate = { piece: string; seam: string };

export type NotchMarking = {
  kind: "notch";
  at: Point;
  role: NotchRole;
  /** Required when role is "balance" — what this notch matches. */
  mates?: NotchMate;
  label?: string;
  dir?: { x: number; y: number };
  depth?: Millimetres;
};

/** Tick count for rendering: identity is doubled; all other roles are single. */
export function notchCount(m: NotchMarking): 1 | 2 {
  return m.role === "identity" ? 2 : 1;
}

// The standard markings, as a tagged union. The renderer draws each `kind`
// exactly once; a piece just lists the markings it carries.
export type Marking =
  | { kind: "grainline"; line: Line }
  /** Internal construction fold (e.g. channel fold-to-inside). Optional label. */
  | { kind: "foldLine"; line: Line; label?: string }
  | { kind: "placeOnFold"; line: Line; inward: { x: number; y: number }; label?: string }
  | { kind: "gather"; line: Line }
  | { kind: "constructionLine"; line: Line }
  /**
   * Elastic casing channel stitch (worn waist / pocket top). The casing hem
   * fold is the sewing outline itself — no separate fold/region marks.
   */
  | { kind: "casingTurndown"; points: Point[]; label?: string }
  | NotchMarking
  | { kind: "button"; at: Point }
  | { kind: "buttonhole"; at: Point }
  | { kind: "dart"; apex: Point; legs: [Point, Point] };

/**
 * Net (stitching-line) arc lengths on a trouser leg piece.
 * Materialised from construction polylines before segmentsToOutline retags
 * junctions — see draftTrouserFront / draftTrouserBack.
 */
export type TrouserSeamLengths = {
  /** Tip → knee → hem (pchip). Includes the crotch-tip junction. */
  inseam: Millimetres;
  /** Waist side → hip → knee → hem (pchip). */
  side: Millimetres;
  /** Full rise: crotch tip → waist edge (CF or CB). */
  crotch: Millimetres;
  /**
   * Per-piece top edge arc (wr.waistSeam) — net stitching line where a band
   * joins or a casing folds. Not finished waist girth; front+back must not be summed.
   */
  topEdge: Millimetres;
  /**
   * Straight span across the net hem endpoints (side ↔ inseam), not hem arc length.
   * Same figure as the Pattern-summary Front/Back hem chips.
   */
  hemWidth: Millimetres;
};

export type PatternPiece = {
  name: string;
  cutCount: number;
  onFold: boolean;
  outline: OutlinePoint[]; // net / stitching line
  cuttingOutline?: Point[]; // derived; the solid cut edge (set by the transform)
  /**
   * Optional map net-vertex-index → cuttingOutline index.
   * Set by trouser hem turn-back / waist casing when cutting.length > net.length;
   * used so highlight runs derived from the net outline can address the cutting edge.
   */
  netToCutIndex?: number[];
  markings: Marking[];
  /**
   * Trouser leg pieces only — net seam lengths from construction polylines
   * (pre-retag). Absent on waistbands and other pieces.
   */
  seamLengths?: TrouserSeamLengths;
  /**
   * Elastic self-casing reference (double-fold depths + fold/hem/stitch
   * polylines for construction). Absent on non-elastic finishes.
   */
  waistCasing?: {
    elasticWidth: 25 | 38 | 50;
    channelDepth: Millimetres;
    hemDepth: Millimetres;
    turnUnder: Millimetres;
    totalExtension: Millimetres;
    stitchBelowFinishedTop: Millimetres;
    foldLine: Point[];
    hemLine: Point[];
    turndownSeam: Point[];
  };
};

export function cutLabel(piece: PatternPiece): string {
  return `Cut ${piece.cutCount}${piece.onFold ? " on fold" : ""}`;
}

export type Pattern = { pieces: PatternPiece[] };

export type StepHighlight = { piece: string; edges?: string[] }; // edges by role; omit = whole piece

export type ConstructionStep = {
  id: string;
  text: string; // human-readable instruction
  highlight?: StepHighlight[];
};


// Metadata that will build the input form and validate it.
export type MeasurementDefinition = {
  key: keyof BodyMeasurements;
  label: string;
  hint: string;
  min: Millimetres;
  max: Millimetres;
};


export const BODY_MEASUREMENTS: MeasurementDefinition[] = [
  { key: "waist",        label: "Waist",          hint: "Around the narrowest part of your waist.",                         min: 500,  max: 1500 },
  { key: "lowWaist",     label: "Low waist",      hint: "Around the body 5 cm below the natural waist.",                    min: 600,  max: 1600 },
  { key: "hip",          label: "Hip",            hint: "Around the fullest part of your hips and seat.",                   min: 700,  max: 1700 },
  { key: "hipDepth",     label: "Hip depth",      hint: "From waist straight down to the fullest hip.",                     min: 150,  max: 300  },
  { key: "bodyRise",     label: "Body rise",      hint: "Sitting on a flat surface, from waist to the seat.",             min: 200,  max: 400  },
  { key: "waistToFloor", label: "Waist to floor", hint: "From the waist, straight down the side to the floor.",             min: 850,  max: 1250 },
];