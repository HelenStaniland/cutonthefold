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
