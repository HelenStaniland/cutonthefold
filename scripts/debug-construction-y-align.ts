/**
 * Run: npx tsx scripts/debug-construction-y-align.ts
 * Frame p1/p2 vs back p16/p17 y at renderer emission (TrousersView layout).
 */
import { applyEase } from "../lib/types/measurements";
import { DEFAULT_FIT, easeForFit } from "../lib/pattern/fitPresets";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  trouserConstruction,
  trouserFramePoints,
  TROUSER_LAYOUT_ANCHOR_Y,
  withWaistband,
  draftTrousers,
} from "../lib/patterns/trouserBlock";
import { mirrorConstructionX, mirrorPieceX } from "../lib/pattern/mirrorPiece";

const labelSpace = 44;
const gap = 60;

const size12 = bodyForSizeCode("12")!;
const draftBody = applyEase(size12, easeForFit(DEFAULT_FIT)!);
const style = withWaistband(
  { bottomWidth: 220, block: "production" },
  40,
  "shaped",
  draftBody,
);

const construction = trouserConstruction(draftBody, style);
const frame = trouserFramePoints(draftBody, style);

const frontConstr = mirrorConstructionX(
  construction.find((c) => c.pieceName === "Trouser front")!,
);
const backConstr = construction.find((c) => c.pieceName === "Trouser back")!;

function getPt(c: typeof frontConstr, id: string) {
  return c.points.find((p) => p.id === id)?.at;
}

const p1 = getPt(frontConstr, "p1")!;
const p2 = getPt(frontConstr, "p2")!;
const p16 = getPt(backConstr, "p16")!;
const p17 = getPt(backConstr, "p17")!;

const pattern = draftTrousers(draftBody, style);
const front = mirrorPieceX(
  pattern.pieces.find((p) => p.name === "Trouser front")!,
);
const back = pattern.pieces.find((p) => p.name === "Trouser back")!;

function pieceBounds(piece: typeof front) {
  const pts = (piece.cuttingOutline ?? piece.outline.map((o) => o.at));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

const row1Y = labelSpace;
let row1X = 0;
const layoutMaxY = Math.max(pieceBounds(front).maxY, pieceBounds(back).maxY);

const placements: Record<string, { dx: number; dy: number }> = {};
for (const piece of [back, front]) {
  const { minX } = pieceBounds(piece);
  placements[piece.name] = {
    dx: row1X - minX,
    dy: row1Y - TROUSER_LAYOUT_ANCHOR_Y,
  };
  row1X += pieceBounds(piece).maxX - minX + gap;
}

function renderY(pt: { y: number }, pieceName: string) {
  const { dy } = placements[pieceName];
  return pt.y + dy;
}

console.log("Size 12 + default fit, production block, shaped 40 mm\n");
console.log("Frame (riseDrop/hipDepthDrop applied):");
console.log(`  p1.y = ${frame.p1.y}  p2.y = ${frame.p2.y}`);
console.log("\nConstruction points (after front mirror X, before layout):");
console.log(`  front p1.y = ${p1.y}  p2.y = ${p2.y}`);
console.log(`  back  p16.y = ${p16.y}  p17.y = ${p17.y}`);
console.log("\nEqual?");
console.log(`  p1.y === p16.y? ${p1.y === p16.y} (Δ ${(p16.y - p1.y).toFixed(1)} mm)`);
console.log(`  p2.y === p17.y? ${p2.y === p17.y} (Δ ${(p17.y - p2.y).toFixed(1)} mm)`);

console.log("\nLayout transform (TrousersView placed):");
for (const name of ["Trouser back", "Trouser front"]) {
  const { dx, dy } = placements[name];
  console.log(`  ${name}: dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`);
}

console.log("\nRenderer emission y (pt.y + dy, before svgCoord):");
console.log(
  `  front p1: ${renderY(p1, "Trouser front").toFixed(1)}  p2: ${renderY(p2, "Trouser front").toFixed(1)}`,
);
console.log(
  `  back  p16: ${renderY(p16, "Trouser back").toFixed(1)}  p17: ${renderY(p17, "Trouser back").toFixed(1)}`,
);
console.log("\nEqual after layout?");
console.log(
  `  p1 vs p16: ${renderY(p1, "Trouser front").toFixed(1)} vs ${renderY(p16, "Trouser back").toFixed(1)} (Δ ${(renderY(p16, "Trouser back") - renderY(p1, "Trouser front")).toFixed(1)} mm)`,
);
console.log(
  `  p2 vs p17: ${renderY(p2, "Trouser front").toFixed(1)} vs ${renderY(p17, "Trouser back").toFixed(1)} (Δ ${(renderY(p17, "Trouser back") - renderY(p2, "Trouser front")).toFixed(1)} mm)`,
);

console.log("\nNote: svgCoord only rounds; no extra y flip. Front mirror affects x only.");
