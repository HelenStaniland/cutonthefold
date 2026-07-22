/**
 * Acceptance: Aldrich keeps its curved back hem; Cleo selects a straight hem.
 * Run: npx tsx scripts/accept-back-hem-shape.ts
 */
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { applyEase, type OutlinePoint, type Point } from "../lib/types/measurements";
import {
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrousers,
  trouserConstruction,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";

function resolveStyle(
  settings: TrouserStyleSettings,
  body: ReturnType<typeof applyEase>,
): TrouserFrontStyle {
  const style: TrouserFrontStyle = {
    bottomWidth: settings.legBottomWidth,
    block: blockFromWaistDrop(settings.waistDrop),
    waistDrop: settings.waistDrop,
    backHemShape: settings.backHemShape,
    ...(settings.frontInseamKneeInset != null
      ? { frontInseamKneeInset: settings.frontInseamKneeInset }
      : {}),
    ...(settings.backInseamKneeInset != null
      ? { backInseamKneeInset: settings.backInseamKneeInset }
      : {}),
    ...(settings.frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale: settings.frontCrotchExtensionScale }
      : {}),
    ...(settings.backCrotchExtensionScale != null
      ? { backCrotchExtensionScale: settings.backCrotchExtensionScale }
      : {}),
    ...(settings.crotchStraightRun != null
      ? { crotchStraightRun: settings.crotchStraightRun }
      : {}),
    ...(settings.crotchArrivalAngle != null
      ? { crotchArrivalAngle: settings.crotchArrivalAngle }
      : {}),
    ...(settings.waistlineCurveFront != null
      ? { waistlineCurveFront: settings.waistlineCurveFront }
      : {}),
    ...(settings.frontWaistInset != null
      ? { frontWaistInset: settings.frontWaistInset }
      : {}),
    ...(settings.backCrotchDrop != null
      ? { backCrotchDrop: settings.backCrotchDrop }
      : {}),
    ...(settings.frontCrotchFullness != null
      ? { frontCrotchFullness: settings.frontCrotchFullness }
      : {}),
    ...(settings.backCrotchFullness != null
      ? { backCrotchFullness: settings.backCrotchFullness }
      : {}),
  };
  const depth =
    settings.waistbandMode === "darted"
      ? settings.dartedWaistFinish === "facing"
        ? 0
        : settings.dartedBandDepth
      : settings.waistbandDepth;
  return settings.waistbandMode === "darted" || depth > 0
    ? withWaistband(style, depth, settings.waistbandMode, body)
    : style;
}

function hemPoints(outline: OutlinePoint[]): Point[] {
  const first = outline.findIndex((p) => p.edge === "hem");
  if (first < 0) throw new Error("No hem edge");
  let last = first;
  while (last + 1 < outline.length && outline[last + 1].edge === "hem") last++;
  return outline.slice(first, last + 2).map((p) => p.at);
}

function maxPointDelta(a: Point[], b: Point[]): number {
  if (a.length !== b.length) return Infinity;
  return Math.max(
    ...a.map((p, i) => Math.hypot(p.x - b[i]!.x, p.y - b[i]!.y)),
  );
}

const base = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
const blockBody = applyEase(base, BLOCK_TROUSER_STYLE.ease);
const blockStyle = resolveStyle(BLOCK_TROUSER_STYLE, blockBody);

const implicit = draftTrouserBack(blockBody, {
  ...blockStyle,
  backHemShape: undefined,
});
const explicitCurved = draftTrouserBack(blockBody, {
  ...blockStyle,
  backHemShape: "curved",
});
const implicitHem = hemPoints(implicit.outline);
const curvedHem = hemPoints(explicitCurved.outline);
const curvedEndpointY = curvedHem[0]!.y;
const curvedBow = Math.max(...curvedHem.map((p) => p.y - curvedEndpointY));

const cleoBody = applyEase(base, CLEO_TROUSER_STYLE.ease);
const cleoStyle = resolveStyle(CLEO_TROUSER_STYLE, cleoBody);
const cleoBack = draftTrousers(cleoBody, cleoStyle).pieces.find(
  (piece) => piece.name === "Trouser back",
)!;
const straightHem = hemPoints(cleoBack.outline);
const straightYRange =
  Math.max(...straightHem.map((p) => p.y)) -
  Math.min(...straightHem.map((p) => p.y));

const curvedConstruction = trouserConstruction(blockBody, blockStyle).find(
  (piece) => piece.pieceName === "Trouser back",
)!;
const straightConstruction = trouserConstruction(cleoBody, cleoStyle).find(
  (piece) => piece.pieceName === "Trouser back",
)!;
const curvedHasControl = curvedConstruction.points.some(
  (point) => point.id === "hemCtrl",
);
const straightHasControl = straightConstruction.points.some(
  (point) => point.id === "hemCtrl",
);

console.log("Back hem shape acceptance");
console.log(
  `Aldrich implicit vs explicit curved max delta: ${maxPointDelta(implicitHem, curvedHem).toFixed(6)} mm`,
);
console.log(`Aldrich curved mid-bow: ${curvedBow.toFixed(3)} mm`);
console.log(`Cleo preset shape: ${CLEO_TROUSER_STYLE.backHemShape}`);
console.log(`Cleo straight hem y-range: ${straightYRange.toFixed(6)} mm`);
console.log(
  `Construction hemCtrl: Aldrich ${curvedHasControl ? "present" : "absent"}, Cleo ${straightHasControl ? "present" : "absent"}`,
);

if (
  maxPointDelta(implicitHem, curvedHem) !== 0 ||
  Math.abs(curvedBow - 10) > 1e-6 ||
  CLEO_TROUSER_STYLE.backHemShape !== "straight" ||
  straightYRange !== 0 ||
  !curvedHasControl ||
  straightHasControl
) {
  process.exitCode = 1;
}
