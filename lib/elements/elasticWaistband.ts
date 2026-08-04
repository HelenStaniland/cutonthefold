/**
 * Separate elastic waistband — fold-in-half single loop.
 *
 * Length from the pre-slash construction waist (`trouserWaistEdges`), so a
 * slant pocket cannot shorten it. Net rectangle is drafted without SA; the
 * existing SA post-pass adds allowance on all seam edges so the cut length /
 * width match 2×front+2×back+2×SA and 2×(elastic+ease+SA).
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

export type ElasticWaistbandSpec = {
  /** Net loop length before SA (2×front + 2×back). */
  netLength: Millimetres;
  /** Net cut width before SA: 2×(elastic + channel ease). */
  netWidth: Millimetres;
  /** Target cut length after SA: netLength + 2×SA. */
  cutLength: Millimetres;
  /** Target cut width after SA: 2×(elastic + ease + SA). */
  cutWidth: Millimetres;
  elasticHeight: Millimetres;
  seamAllowance: Millimetres;
  /** Pre-slash front / back tops used to build length (diagnostics). */
  frontTop: Millimetres;
  backTop: Millimetres;
};

/**
 * Derive loop length and cut width from the construction waist (pre-slash).
 * cutLength = 2×front + 2×back + 2×SA; cutWidth = 2×(elastic + ease + SA).
 * Draft uses the net rectangle; SA post-pass supplies the allowance.
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
  const netLength = 2 * frontTop + 2 * backTop;
  const netWidth = 2 * (elasticHeight + ELASTIC_WAISTBAND_CHANNEL_EASE);
  const cutLength = netLength + 2 * seamAllowance;
  const cutWidth =
    2 * (elasticHeight + ELASTIC_WAISTBAND_CHANNEL_EASE + seamAllowance);
  return {
    netLength,
    netWidth,
    cutLength,
    cutWidth,
    elasticHeight,
    seamAllowance,
    frontTop,
    backTop,
  };
}

/**
 * Draft a single rectangular loop band (net). Join seam at the short ends (CB).
 * Fold midline runs the length; both long edges attach to the trouser waist.
 */
export function draftElasticWaistband(spec: ElasticWaistbandSpec): {
  piece: PatternPiece;
  steps: ConstructionStep[];
} {
  const L = spec.netLength;
  const W = spec.netWidth;
  const foldY = W / 2;

  // Edge role is on the edge FROM this vertex TO the next.
  const outline: OutlinePoint[] = [
    { at: { x: 0, y: 0 }, edge: "seam", role: "waist" },
    { at: { x: L, y: 0 }, edge: "seam", role: "centre-back" },
    { at: { x: L, y: W }, edge: "seam", role: "waist" },
    { at: { x: 0, y: W }, edge: "seam", role: "centre-back" },
  ];

  const foldFrom: Point = { x: 0, y: foldY };
  const foldTo: Point = { x: L, y: foldY };
  const grainFrom: Point = { x: L * 0.15, y: foldY };
  const grainTo: Point = { x: L * 0.85, y: foldY };

  const markings: Marking[] = [
    {
      kind: "foldLine",
      line: { from: foldFrom, to: foldTo },
    },
    {
      kind: "grainline",
      line: { from: grainFrom, to: grainTo },
    },
    {
      kind: "notch",
      role: "identity",
      at: { x: 0, y: foldY },
      dir: { x: 1, y: 0 },
      label: "CB join",
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser front", seam: "waist" },
      at: { x: L / 4, y: 0 },
      dir: { x: 0, y: 1 },
      label: "CF",
    },
    {
      kind: "notch",
      role: "balance",
      mates: { piece: "Trouser back", seam: "waist" },
      at: { x: (3 * L) / 4, y: 0 },
      dir: { x: 0, y: 1 },
      label: "side",
    },
  ];

  const steps: ConstructionStep[] = [
    {
      id: "elastic-waistband-join",
      text: `Join the short ends of the ${ELASTIC_WAISTBAND_PIECE_NAME.toLowerCase()} at the centre back (SA ${spec.seamAllowance} mm).`,
      highlight: [
        { piece: ELASTIC_WAISTBAND_PIECE_NAME, edges: ["centre-back"] },
      ],
    },
    {
      id: "elastic-waistband-fold",
      text: "Fold the band in half lengthways, wrong sides together, matching the two long raw edges.",
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
      onFold: false,
      outline,
      markings,
    },
    steps,
  };
}
