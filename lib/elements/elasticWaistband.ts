/**
 * Separate elastic waistband — fold-in-half channel, cut on the fold along
 * the circumference (same placeOnFold mechanism as shaped/darted waistbands).
 *
 * Length from the pre-slash construction waist (`trouserWaistEdges`), so a
 * slant pocket cannot shorten it. Drafted as a **half**-loop rectangle with
 * one short end on the fabric fold; opens to the full loop. Net draft has no
 * SA; the SA post-pass adds allowance on seam edges only (fold edge = 0),
 * matching the existing waistbands.
 */
import type {
  ConstructionStep,
  Marking,
  Millimetres,
  OutlinePoint,
  PatternPiece,
  Point,
} from "@/lib/types/measurements";
import { DEFAULT_SEAM_ALLOWANCE } from "@/lib/geometry/seamAllowance";
import {
  trouserWaistEdges,
  type TrouserFrontStyle,
} from "@/lib/patterns/trouserBlock";
import type { BodyMeasurements } from "@/lib/types/measurements";
import type { CasingElasticWidth } from "@/lib/geometry/trouserWaistCasing";

/**
 * Extra channel ease beyond the elastic height (mm), toile-friendly.
 * May drop to 10 later.
 */
export const ELASTIC_WAISTBAND_CHANNEL_EASE: Millimetres = 20;

export const ELASTIC_WAISTBAND_PIECE_NAME = "Elastic waistband";

/** Channel fold (widthwise) — distinct from cut-on-fold placeOnFold. */
export const ELASTIC_WAISTBAND_CHANNEL_FOLD_LABEL = "fold to inside";

export type ElasticWaistbandSpec = {
  /**
   * Full-loop sewing circumference (2×front + 2×back) — unchanged by
   * cut-on-fold layout.
   */
  fullLoopNet: Millimetres;
  /** Net half-piece length before SA (front + back). */
  netHalfLength: Millimetres;
  /** Net cut width before SA: 2×(elastic + channel ease). */
  netWidth: Millimetres;
  /**
   * Target cut length of the half-piece after SA: netHalf + SA
   * (one seamed end; fold end has no SA — same convention as shaped bands).
   */
  cutHalfLength: Millimetres;
  /**
   * Opened-out full cut length after SA: 2×cutHalfLength = fullLoopNet + 2×SA.
   * Same finished cut as the old full-loop draft.
   */
  openedCutLength: Millimetres;
  /** Target cut width after SA: 2×(elastic + ease + SA). */
  cutWidth: Millimetres;
  elasticHeight: Millimetres;
  seamAllowance: Millimetres;
  /** Pre-slash front / back tops used to build length (diagnostics). */
  frontTop: Millimetres;
  backTop: Millimetres;
};

/**
 * Derive half-piece and full-loop lengths from the construction waist (pre-slash).
 * fullLoopNet = 2×front + 2×back; netHalf = front + back;
 * cutHalf = netHalf + SA; cutWidth = 2×(elastic + ease + SA).
 */
export function resolveElasticWaistbandSpec(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  elasticHeight: CasingElasticWidth | Millimetres,
  seamAllowance: Millimetres = DEFAULT_SEAM_ALLOWANCE.seam,
): ElasticWaistbandSpec {
  const edges = trouserWaistEdges(body, style);
  const frontTop = edges.front.outer;
  const backTop = edges.back.outer;
  const fullLoopNet = 2 * frontTop + 2 * backTop;
  const netHalfLength = frontTop + backTop;
  const netWidth = 2 * (elasticHeight + ELASTIC_WAISTBAND_CHANNEL_EASE);
  const cutHalfLength = netHalfLength + seamAllowance;
  const openedCutLength = 2 * cutHalfLength;
  const cutWidth =
    2 * (elasticHeight + ELASTIC_WAISTBAND_CHANNEL_EASE + seamAllowance);
  return {
    fullLoopNet,
    netHalfLength,
    netWidth,
    cutHalfLength,
    openedCutLength,
    cutWidth,
    elasticHeight,
    seamAllowance,
    frontTop,
    backTop,
  };
}

/**
 * Draft a half-loop rectangle on the fold (net). Fold at CF (x = 0);
 * join seam at CB (x = half). Channel fold midline runs the half-length;
 * both long edges attach to the trouser waist when folded widthwise.
 *
 * Reuses the shaped/darted waistband cut-on-fold pattern: `edge: "fold"`,
 * `placeOnFold` + "Place to fold", `onFold: true`.
 */
export function draftElasticWaistband(spec: ElasticWaistbandSpec): {
  piece: PatternPiece;
  steps: ConstructionStep[];
} {
  const L = spec.netHalfLength;
  const W = spec.netWidth;
  const channelY = W / 2;

  // Edge role is on the edge FROM this vertex TO the next.
  // Same fold-edge convention as draftWaistband: short end at x=0 is fold.
  const outline: OutlinePoint[] = [
    { at: { x: 0, y: 0 }, edge: "seam", role: "waist" },
    { at: { x: L, y: 0 }, edge: "seam", role: "centre-back" },
    { at: { x: L, y: W }, edge: "seam", role: "waist" },
    { at: { x: 0, y: W }, edge: "fold", role: "centre-front" },
  ];

  const foldFrom: Point = { x: 0, y: 0 };
  const foldTo: Point = { x: 0, y: W };
  const channelFrom: Point = { x: 0, y: channelY };
  const channelTo: Point = { x: L, y: channelY };
  // Grain along the circumference (same as previous full-loop draft).
  const grainFrom: Point = { x: L * 0.15, y: channelY };
  const grainTo: Point = { x: L * 0.85, y: channelY };

  // Side notch at front→back junction along the half (arc distance = frontTop).
  const sideX = Math.min(Math.max(spec.frontTop, 0), L);

  const markings: Marking[] = [
    {
      kind: "placeOnFold",
      line: { from: foldFrom, to: foldTo },
      inward: { x: 1, y: 0 },
      label: "Place to fold",
    },
    {
      kind: "foldLine",
      line: { from: channelFrom, to: channelTo },
      label: ELASTIC_WAISTBAND_CHANNEL_FOLD_LABEL,
    },
    {
      kind: "grainline",
      line: { from: grainFrom, to: grainTo },
    },
    {
      kind: "notch",
      role: "identity",
      at: { x: L, y: channelY },
      dir: { x: -1, y: 0 },
      label: "CB join",
    },
    {
      kind: "notch",
      role: "fold",
      at: { x: 0, y: channelY },
      dir: { x: 1, y: 0 },
      label: "CF",
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser front", seam: "waist" },
      at: { x: sideX / 2, y: 0 },
      dir: { x: 0, y: 1 },
      label: "front",
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser back", seam: "waist" },
      at: { x: sideX + (L - sideX) / 2, y: 0 },
      dir: { x: 0, y: 1 },
      label: "back",
    },
  ];

  const steps: ConstructionStep[] = [
    {
      id: "elastic-waistband-cut-fold",
      text: `Cut the ${ELASTIC_WAISTBAND_PIECE_NAME.toLowerCase()} on the fold (CF). Opened out it is the full loop.`,
      highlight: [
        { piece: ELASTIC_WAISTBAND_PIECE_NAME, edges: ["centre-front"] },
      ],
    },
    {
      id: "elastic-waistband-join",
      text: `Join the short ends at the centre back (SA ${spec.seamAllowance} mm).`,
      highlight: [
        { piece: ELASTIC_WAISTBAND_PIECE_NAME, edges: ["centre-back"] },
      ],
    },
    {
      id: "elastic-waistband-fold",
      text: `Fold the band in half lengthways (${ELASTIC_WAISTBAND_CHANNEL_FOLD_LABEL}), wrong sides together, matching the two long raw edges.`,
      highlight: [{ piece: ELASTIC_WAISTBAND_PIECE_NAME }],
    },
    {
      id: "elastic-waistband-attach",
      text: "Pin both raw edges of the folded band to the trouser waist, matching CF and side notches; stitch once, catching both layers.",
      highlight: [
        { piece: ELASTIC_WAISTBAND_PIECE_NAME, edges: ["waist"] },
        { piece: "Trouser front", edges: ["waist"] },
        { piece: "Trouser back", edges: ["waist"] },
      ],
    },
  ];

  return {
    piece: {
      name: ELASTIC_WAISTBAND_PIECE_NAME,
      cutCount: 1,
      onFold: true,
      outline,
      markings,
    },
    steps,
  };
}
