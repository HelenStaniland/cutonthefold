import {
  DraftingLine,
  DraftingPoint,
  PatternPiece,
  PieceConstruction,
  Point,
} from "@/lib/types/measurements";

// Flip a piece left-to-right for display. Cut geometry is unchanged: every
// piece is already cut as a mirrored pair ("Cut 2"), so this only sets which
// way the piece faces on screen.
export function mirrorPieceX(piece: PatternPiece): PatternPiece {
  const fx = (p: Point): Point => ({ x: -p.x, y: p.y });
  const fv = (v: { x: number; y: number }) => ({ x: -v.x, y: v.y });
  return {
    ...piece,
    outline: piece.outline.map((o) => ({ ...o, at: fx(o.at) })),
    cuttingOutline: piece.cuttingOutline?.map(fx),
    netToCutIndex: piece.netToCutIndex,
    waistCasing: piece.waistCasing
      ? {
          ...piece.waistCasing,
          foldLine: piece.waistCasing.foldLine.map(fx),
          hemLine: piece.waistCasing.hemLine.map(fx),
          turndownSeam: piece.waistCasing.turndownSeam.map(fx),
        }
      : undefined,
    markings: piece.markings.map((m) => {
      switch (m.kind) {
        case "grainline":
        case "foldLine":
        case "gather":
        case "constructionLine":
          return { ...m, line: { from: fx(m.line.from), to: fx(m.line.to) } };
        case "placeOnFold":
          return {
            ...m,
            line: { from: fx(m.line.from), to: fx(m.line.to) },
            inward: fv(m.inward),
          };
        case "casingTurndown":
          return { ...m, points: m.points.map(fx) };
        case "notch":
          return { ...m, at: fx(m.at), dir: m.dir ? fv(m.dir) : undefined };
        case "button":
        case "buttonhole":
          return { ...m, at: fx(m.at) };
        case "dart":
          return {
            ...m,
            apex: fx(m.apex),
            legs: [fx(m.legs[0]), fx(m.legs[1])] as [Point, Point],
          };
        default:
          return m;
      }
    }),
  };
}

/**
 * Rigid rotation so the piece's grainline is vertical (+y), matching trouser
 * layout. Outline, grainline, and notches rotate together — grain relative to
 * the piece is unchanged (cut instruction identical). Display/layout only.
 */
export function orientPieceGrainVertical(piece: PatternPiece): PatternPiece {
  const grain = piece.markings.find((m) => m.kind === "grainline");
  if (!grain || grain.kind !== "grainline") return piece;

  const { from, to } = grain.line;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return piece;

  // Trouser grain runs +y (waist → hem). Match that direction.
  const current = Math.atan2(dy, dx);
  const target = Math.PI / 2;
  let theta = target - current;
  while (theta > Math.PI) theta -= 2 * Math.PI;
  while (theta <= -Math.PI) theta += 2 * Math.PI;
  if (Math.abs(theta) < 1e-12) return piece;

  const pivot = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const rot = (p: Point): Point => {
    const qx = p.x - pivot.x;
    const qy = p.y - pivot.y;
    return {
      x: pivot.x + qx * c - qy * s,
      y: pivot.y + qx * s + qy * c,
    };
  };
  const rotV = (v: { x: number; y: number }) => ({
    x: v.x * c - v.y * s,
    y: v.x * s + v.y * c,
  });

  return {
    ...piece,
    outline: piece.outline.map((o) => ({ ...o, at: rot(o.at) })),
    cuttingOutline: piece.cuttingOutline?.map(rot),
    netToCutIndex: piece.netToCutIndex,
    waistCasing: piece.waistCasing
      ? {
          ...piece.waistCasing,
          foldLine: piece.waistCasing.foldLine.map(rot),
          hemLine: piece.waistCasing.hemLine.map(rot),
          turndownSeam: piece.waistCasing.turndownSeam.map(rot),
        }
      : undefined,
    markings: piece.markings.map((m) => {
      switch (m.kind) {
        case "grainline":
        case "foldLine":
        case "gather":
        case "constructionLine":
          return {
            ...m,
            line: { from: rot(m.line.from), to: rot(m.line.to) },
          };
        case "placeOnFold":
          return {
            ...m,
            line: { from: rot(m.line.from), to: rot(m.line.to) },
            inward: rotV(m.inward),
          };
        case "casingTurndown":
          return { ...m, points: m.points.map(rot) };
        case "notch":
          return {
            ...m,
            at: rot(m.at),
            dir: m.dir ? rotV(m.dir) : undefined,
          };
        case "button":
        case "buttonhole":
          return { ...m, at: rot(m.at) };
        case "dart":
          return {
            ...m,
            apex: rot(m.apex),
            legs: [rot(m.legs[0]), rot(m.legs[1])] as [Point, Point],
          };
        default:
          return m;
      }
    }),
  };
}

export function mirrorConstructionX(construction: PieceConstruction): PieceConstruction {
  const fx = (p: Point): Point => ({ x: -p.x, y: p.y });
  return {
    ...construction,
    points: construction.points.map(
      (pt): DraftingPoint => ({ ...pt, at: fx(pt.at) }),
    ),
    lines: construction.lines.map(
      (line): DraftingLine => ({
        ...line,
        from: fx(line.from),
        to: fx(line.to),
      }),
    ),
  };
}
