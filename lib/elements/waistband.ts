import type {
  Point,
  PatternPiece,
  OutlinePoint,
  Marking,
  Millimetres,
  ConstructionStep,
} from "@/lib/types/measurements";
import { pointAtArcDistanceFromStart } from "@/lib/geometry/curves";

export type WaistbandSpec = {
  innerLen: Millimetres;
  outerLen: Millimetres;
  depth: Millimetres;
  foldSide: "CF" | "CB";
  label: string;
};

const SAMPLES = 24;

/**
 * Back-band identity notch: arc distance from the fold along the upper (band-top)
 * edge toward the side-seam end. Keeps both ticks of the double clear of the fold
 * on solid paper. Front band has no identity notch.
 */
export const WAISTBAND_IDENTITY_FROM_FOLD_MM: Millimetres = 80;

function arc(radius: number, a0: number, a1: number, n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return pts;
}

export function draftWaistband(spec: WaistbandSpec): {
  piece: PatternPiece;
  steps: ConstructionStep[];
} {
  const { innerLen, outerLen, depth: d, foldSide, label } = spec;
  const flare = Math.max(0, outerLen - innerLen);

  let topEdge: Point[];
  let bottomEdge: Point[];

  if (flare < 0.5) {
    topEdge = [
      { x: 0, y: 0 },
      { x: innerLen, y: 0 },
    ];
    bottomEdge = [
      { x: 0, y: d },
      { x: outerLen, y: d },
    ];
  } else {
    const theta = flare / d;
    const rIn = innerLen / theta;
    const rOut = rIn + d;
    const a0 = Math.PI / 2;
    const a1 = Math.PI / 2 - theta;
    topEdge = arc(rIn, a0, a1, SAMPLES);
    bottomEdge = arc(rOut, a0, a1, SAMPLES);
  }

  const foldRole = foldSide === "CF" ? "centre-front" : "centre-back";

  const edgeMid = (edge: Point[]): Point =>
    edge.length <= 2
      ? {
          x: (edge[0].x + edge[edge.length - 1].x) / 2,
          y: (edge[0].y + edge[edge.length - 1].y) / 2,
        }
      : edge[Math.floor(edge.length / 2)];
  const notchAt = edgeMid(bottomEdge);
  const notchToward = edgeMid(topEdge);
  const ndx = notchToward.x - notchAt.x;
  const ndy = notchToward.y - notchAt.y;
  const nlen = Math.hypot(ndx, ndy) || 1;

  const outline: OutlinePoint[] = [];
  topEdge.forEach((p, i) =>
    outline.push({
      at: p,
      edge: "seam",
      role: i === 0 ? foldRole : "band-top",
    }),
  );
  outline.push({
    at: bottomEdge[bottomEdge.length - 1],
    edge: "seam",
    role: "side-seam",
  });
  for (let i = bottomEdge.length - 2; i >= 0; i--) {
    outline.push({
      at: bottomEdge[i],
      edge: i === 0 ? "fold" : "seam",
      role: i === 0 ? foldRole : "waist",
    });
  }

  const foldFrom = topEdge[0]!;
  const foldTo = bottomEdge[0]!;
  const markings: Marking[] = [
    {
      kind: "placeOnFold",
      line: { from: foldFrom, to: foldTo },
      inward: { x: 1, y: 0 },
      label: "Place to fold",
    },
    { kind: "grainline", line: { from: foldFrom, to: foldTo } },
    {
      kind: "notch",
      role: "balance",
      mates: {
        piece: foldSide === "CF" ? "Trouser front" : "Trouser back",
        seam: "waist",
      },
      at: notchAt,
      dir: { x: ndx / nlen, y: ndy / nlen },
      label: "mid-waist",
    },
  ];
  if (foldSide === "CB") {
    // Identity on upper (band-top) edge, offset from the fold toward the
    // side-seam end — on the drafted half only (piece is cut on fold).
    const idAt = pointAtArcDistanceFromStart(
      topEdge,
      WAISTBAND_IDENTITY_FROM_FOLD_MM,
    );
    const idToward = pointAtArcDistanceFromStart(
      bottomEdge,
      WAISTBAND_IDENTITY_FROM_FOLD_MM,
    );
    const idx = idToward.x - idAt.x;
    const idy = idToward.y - idAt.y;
    const idlen = Math.hypot(idx, idy) || 1;
    markings.push({
      kind: "notch",
      role: "identity",
      at: idAt,
      dir: { x: idx / idlen, y: idy / idlen },
      label: "identity",
    });
  }

  const steps: ConstructionStep[] = [
    {
      id: `band-${foldSide}-interface`,
      text: `Interface the ${label.toLowerCase()} and its facing. Pin the band's lower (longer) edge to the trouser waist, matching the balance notch and aligning the fold to the centre-${foldSide === "CF" ? "front" : "back"} seam; ease the curve.`,
      highlight: [{ piece: label, edges: ["waist"] }],
    },
    {
      id: `band-${foldSide}-close`,
      text: "Stitch the band to the trouser, then sew band to facing along the top edge, clip the curve and turn.",
      highlight: [{ piece: label, edges: ["band-top"] }],
    },
  ];

  return {
    piece: { name: label, cutCount: 2, onFold: true, outline, markings },
    steps,
  };
}
