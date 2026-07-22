/**
 * Acceptance: curved back hem keeps the ordinary SA offset; straight gets turn-back.
 * Run: npx tsx scripts/accept-curved-hem-turnback.ts
 */
import {
  applyEase,
  type OutlinePoint,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import { applyTrouserHemTurnbackToPattern } from "../lib/geometry/trouserHemTurnback";
import {
  blockFromWaistDrop,
  draftTrousers,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import { draftGatheredSkirt } from "../lib/patterns/gatheredSkirt";

const DUP_TOL = 0.01;
const f3 = (n: number) => n.toFixed(3);
const pt = (p: Point) => `(${f3(p.x)}, ${f3(p.y)})`;

const CLEO_EXPECTED = {
  front: {
    cut: 196,
    sideRc: { x: 184.273, y: 1080 },
    inseamRc: { x: -182.762, y: 1080 },
  },
  back: {
    cut: 197,
    sideRc: { x: 195.001, y: 1080 },
    inseamRc: { x: -191.576, y: 1080 },
  },
};

function collapse(outline: OutlinePoint[]): OutlinePoint[] {
  const out: OutlinePoint[] = [];
  for (const p of outline) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.at.x - last.at.x, p.at.y - last.at.y) < DUP_TOL) {
      continue;
    }
    out.push(p);
  }
  if (out.length > 1) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(first.at.x - last.at.x, first.at.y - last.at.y) < DUP_TOL) {
      out.pop();
    }
  }
  return out;
}

function resolveStyle(
  s: TrouserStyleSettings,
  body: ReturnType<typeof applyEase>,
): TrouserFrontStyle {
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    ...(s.frontInseamKneeInset != null
      ? { frontInseamKneeInset: s.frontInseamKneeInset }
      : {}),
    ...(s.backInseamKneeInset != null
      ? { backInseamKneeInset: s.backInseamKneeInset }
      : {}),
    ...(s.frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale: s.frontCrotchExtensionScale }
      : {}),
    ...(s.backCrotchExtensionScale != null
      ? { backCrotchExtensionScale: s.backCrotchExtensionScale }
      : {}),
    ...(s.crotchStraightRun != null ? { crotchStraightRun: s.crotchStraightRun } : {}),
    ...(s.crotchArrivalAngle != null ? { crotchArrivalAngle: s.crotchArrivalAngle } : {}),
    ...(s.waistlineCurveFront != null
      ? { waistlineCurveFront: s.waistlineCurveFront }
      : {}),
    ...(s.frontWaistInset != null ? { frontWaistInset: s.frontWaistInset } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
  };
  const depth =
    s.waistbandMode === "darted"
      ? s.dartedWaistFinish === "facing"
        ? 0
        : s.dartedBandDepth
      : s.waistbandDepth;
  if (s.waistbandMode === "darted") {
    return withWaistband(base, depth, "darted", body);
  }
  return depth > 0 ? withWaistband(base, depth, "shaped", body) : base;
}

function findHemCorners(outline: OutlinePoint[]): {
  sideIdx: number;
  inseamIdx: number;
} {
  const hemIndices = outline
    .map((p, i) => (p.edge === "hem" ? i : -1))
    .filter((i) => i >= 0);
  return {
    sideIdx: hemIndices[0]!,
    inseamIdx: (hemIndices[hemIndices.length - 1]! + 1) % outline.length,
  };
}

function draftCase(settings: TrouserStyleSettings) {
  const base = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
  const body = applyEase(base, settings.ease);
  const style = resolveStyle(settings, body);
  const net = draftTrousers(body, style);
  const withSA = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const withTB = applyTrouserHemTurnbackToPattern(withSA);
  return { net, withSA, withTB };
}

function straightCorners(piece: {
  outline: OutlinePoint[];
  cuttingOutline?: Point[];
  netToCutIndex?: number[];
}) {
  const collapsed = collapse(piece.outline);
  const { sideIdx, inseamIdx } = findHemCorners(collapsed);
  const map = piece.netToCutIndex!;
  let rawSide = 0;
  let rawInseam = 0;
  for (let i = 0; i < piece.outline.length; i++) {
    if (
      Math.hypot(
        piece.outline[i]!.at.x - collapsed[sideIdx]!.at.x,
        piece.outline[i]!.at.y - collapsed[sideIdx]!.at.y,
      ) < DUP_TOL
    ) {
      rawSide = i;
    }
    if (
      Math.hypot(
        piece.outline[i]!.at.x - collapsed[inseamIdx]!.at.x,
        piece.outline[i]!.at.y - collapsed[inseamIdx]!.at.y,
      ) < DUP_TOL
    ) {
      rawInseam = i;
    }
  }
  const cut = piece.cuttingOutline!;
  const sideFpIdx = map[rawSide]!;
  const inseamFpIdx = map[rawInseam]!;
  return {
    sideRc: cut[sideFpIdx + 1]!,
    inseamRc: cut[inseamFpIdx - 1]!,
  };
}

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.log(`  FAIL: ${msg}`);
  } else {
    console.log(`  ok: ${msg}`);
  }
}

console.log("=== Curved = SA offset; straight = turn-back ===");
console.log(
  `policy seam=${DEFAULT_SEAM_ALLOWANCE.seam} hem=${DEFAULT_SEAM_ALLOWANCE.hem}`,
);

{
  console.log("\n--- Skirt (untouched) ---");
  const base = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
  const skirtNet = draftGatheredSkirt(base, { length: 600 }, { fullness: 100 });
  const skirtSA = withSeamAllowance(skirtNet, DEFAULT_SEAM_ALLOWANCE);
  const skirtTB = applyTrouserHemTurnbackToPattern(skirtSA);
  let same = true;
  for (let i = 0; i < skirtSA.pieces.length; i++) {
    if (
      JSON.stringify(skirtSA.pieces[i]!.cuttingOutline) !==
      JSON.stringify(skirtTB.pieces[i]!.cuttingOutline)
    ) {
      same = false;
    }
    if (skirtTB.pieces[i]!.netToCutIndex) same = false;
  }
  check(same, "skirt cutting byte-identical");
}

{
  console.log("\n--- Straight-hem regression (Cleo) ---");
  const { net, withTB } = draftCase(CLEO_TROUSER_STYLE);
  for (const name of ["Trouser front", "Trouser back"] as const) {
    const after = withTB.pieces.find((p) => p.name === name)!;
    const netPiece = net.pieces.find((p) => p.name === name)!;
    check(
      JSON.stringify(netPiece.outline) === JSON.stringify(after.outline),
      `${name}: net byte-identical`,
    );
    const key = name === "Trouser front" ? "front" : "back";
    const exp = CLEO_EXPECTED[key];
    const c = straightCorners(after);
    check(
      after.cuttingOutline!.length === exp.cut,
      `${name}: cutting count ${after.cuttingOutline!.length} (expect ${exp.cut})`,
    );
    check(!!after.netToCutIndex, `${name}: turn-back map present`);
    check(
      Math.hypot(c.sideRc.x - exp.sideRc.x, c.sideRc.y - exp.sideRc.y) < 0.01,
      `${name}: side Rc ${pt(c.sideRc)} ≈ ${pt(exp.sideRc)}`,
    );
    check(
      Math.hypot(c.inseamRc.x - exp.inseamRc.x, c.inseamRc.y - exp.inseamRc.y) <
        0.01,
      `${name}: inseam Rc ${pt(c.inseamRc)} ≈ ${pt(exp.inseamRc)}`,
    );
  }
}

{
  console.log("\n--- Aldrich block (curved back = SA offset) ---");
  const { net, withSA, withTB } = draftCase(BLOCK_TROUSER_STYLE);

  const frontBefore = withSA.pieces.find((p) => p.name === "Trouser front")!;
  const frontAfter = withTB.pieces.find((p) => p.name === "Trouser front")!;
  const backBefore = withSA.pieces.find((p) => p.name === "Trouser back")!;
  const backAfter = withTB.pieces.find((p) => p.name === "Trouser back")!;

  check(
    JSON.stringify(net.pieces[0]!.outline) ===
      JSON.stringify(frontAfter.outline),
    "front net byte-identical",
  );
  check(
    JSON.stringify(net.pieces[1]!.outline) === JSON.stringify(backAfter.outline),
    "back net byte-identical",
  );

  // Front is always straight → turn-back.
  check(!!frontAfter.netToCutIndex, "front: turn-back applied");
  check(
    JSON.stringify(frontBefore.cuttingOutline) !==
      JSON.stringify(frontAfter.cuttingOutline),
    "front: cutting differs from SA (turn-back)",
  );

  // Curved back → leave SA alone.
  const backCollapsed = collapse(backAfter.outline);
  const { sideIdx, inseamIdx } = findHemCorners(backCollapsed);
  check(inseamIdx - sideIdx > 1, "back hem is curved (samples > 2)");
  check(
    JSON.stringify(backBefore.cuttingOutline) ===
      JSON.stringify(backAfter.cuttingOutline),
    "back: cutting byte-identical to SA (no turn-back)",
  );
  check(!backAfter.netToCutIndex, "back: no netToCutIndex");
  console.log(
    `    back hem samples=${inseamIdx - sideIdx + 1}; cut ${backAfter.cuttingOutline!.length}`,
  );
}

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASS" : `${failures} FAILURE(S)`}`,
);
if (failures > 0) process.exitCode = 1;
