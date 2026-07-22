/**
 * Acceptance: trouser-local hem turn-back post-pass.
 * Run: npx tsx scripts/accept-hem-turnback.ts
 */
import {
  applyEase,
  type Marking,
  type OutlinePoint,
  type PatternPiece,
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
const f6 = (n: number) => n.toFixed(6);
const pt = (p: Point) => `(${f3(p.x)}, ${f3(p.y)})`;

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

function markingsEqual(a: Marking[], b: Marking[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function reflectY(p: Point, hemY: number): Point {
  return { x: p.x, y: 2 * hemY - p.y };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Independent copy of the post-pass seam-offset sampler (for fold-test). */
function offsetSeamAtY(
  outline: OutlinePoint[],
  cornerIdx: number,
  direction: -1 | 1,
  targetY: number,
  clockwise: boolean,
  seamAllowance: number,
): Point {
  const n = outline.length;
  let a = outline[cornerIdx]!.at;
  for (let step = 1; step < n; step++) {
    const bIdx = (cornerIdx + step * direction + n) % n;
    const b = outline[bIdx]!.at;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (
      targetY >= minY - 1e-9 &&
      targetY <= maxY + 1e-9 &&
      Math.abs(b.y - a.y) > 1e-9
    ) {
      const from = direction === -1 ? b : a;
      const to = direction === -1 ? a : b;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      const normal = clockwise ? { x: uy, y: -ux } : { x: -uy, y: ux };
      const o0 = {
        x: from.x + normal.x * seamAllowance,
        y: from.y + normal.y * seamAllowance,
      };
      const o1 = {
        x: to.x + normal.x * seamAllowance,
        y: to.y + normal.y * seamAllowance,
      };
      if (Math.abs(o1.y - o0.y) < 1e-12) return { x: o0.x, y: targetY };
      const t = (targetY - o0.y) / (o1.y - o0.y);
      return { x: o0.x + (o1.x - o0.x) * t, y: targetY };
    }
    a = b;
  }
  throw new Error("offsetSeamAtY miss");
}

function signedArea(outline: OutlinePoint[]): number {
  let area = 0;
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i]!.at;
    const b = outline[(i + 1) % n]!.at;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
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

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.log(`  FAIL: ${msg}`);
  } else {
    console.log(`  ok: ${msg}`);
  }
}

function reportLeg(label: string, before: PatternPiece, after: PatternPiece) {
  const collapsed = collapse(after.outline);
  const { sideIdx, inseamIdx } = findHemCorners(collapsed);
  const hemY = collapsed[sideIdx]!.at.y;
  const clockwise = signedArea(collapsed) > 0;
  const seam = DEFAULT_SEAM_ALLOWANCE.seam;
  const depth = DEFAULT_SEAM_ALLOWANCE.hem;
  const cut = after.cuttingOutline!;
  const map = after.netToCutIndex!;

  // Locate Fp/Rc via the map on a raw index that collapses to sideIdx / inseamIdx.
  let rawSide = -1;
  let rawInseam = -1;
  for (let i = 0; i < after.outline.length; i++) {
    // Find raw indices whose collapsed identity matches corners by position.
    if (
      rawSide < 0 &&
      Math.hypot(
        after.outline[i]!.at.x - collapsed[sideIdx]!.at.x,
        after.outline[i]!.at.y - collapsed[sideIdx]!.at.y,
      ) < DUP_TOL
    ) {
      rawSide = i;
    }
    if (
      Math.hypot(
        after.outline[i]!.at.x - collapsed[inseamIdx]!.at.x,
        after.outline[i]!.at.y - collapsed[inseamIdx]!.at.y,
      ) < DUP_TOL
    ) {
      rawInseam = i;
    }
  }

  const sideFpIdx = map[rawSide]!;
  const sideFp = cut[sideFpIdx]!;
  const sideRc = cut[sideFpIdx + 1]!;
  const inseamFpIdx = map[rawInseam]!;
  const inseamFp = cut[inseamFpIdx]!;
  const inseamRc = cut[inseamFpIdx - 1]!;

  const sideRef = offsetSeamAtY(
    collapsed,
    sideIdx,
    -1,
    hemY - depth,
    clockwise,
    seam,
  );
  const inseamRef = offsetSeamAtY(
    collapsed,
    inseamIdx,
    1,
    hemY - depth,
    clockwise,
    seam,
  );
  const sideResidual = dist(reflectY(sideRc, hemY), sideRef);
  const inseamResidual = dist(reflectY(inseamRc, hemY), inseamRef);

  check(
    after.cuttingOutline!.length ===
      collapsed.length - (inseamIdx - sideIdx - 1) + 2,
    `${label}: cutting ${after.cuttingOutline!.length} (collapsed ${collapsed.length}, hem interiors ${Math.max(0, inseamIdx - sideIdx - 1)})`,
  );
  check(
    markingsEqual(before.markings, after.markings),
    `${label}: markings/notches byte-identical`,
  );

  // Above-hem: first sideFpIdx points equal oldCut[0..sideIdx)
  let aboveSame = true;
  for (let i = 0; i < sideIdx; i++) {
    const a = before.cuttingOutline![i]!;
    const b = cut[i]!;
    if (a.x !== b.x || a.y !== b.y) aboveSame = false;
  }
  // After inseam Fp, remaining should match oldCut[inseamIdx+1..]
  const afterStart = inseamFpIdx + 1;
  for (let i = inseamIdx + 1; i < collapsed.length; i++) {
    const a = before.cuttingOutline![i]!;
    const b = cut[afterStart + (i - (inseamIdx + 1))]!;
    if (a.x !== b.x || a.y !== b.y) aboveSame = false;
  }
  check(aboveSame, `${label}: cutting edge above hemline byte-identical`);

  check(
    sideResidual < 0.01,
    `${label} side fold-test residual ${f6(sideResidual)} mm`,
  );
  check(
    inseamResidual < 0.01,
    `${label} inseam fold-test residual ${f6(inseamResidual)} mm`,
  );
  console.log(
    `    side: before ${pt(before.cuttingOutline![sideIdx]!)} → Fp ${pt(sideFp)} Rc ${pt(sideRc)}`,
  );
  console.log(
    `    inseam: before ${pt(before.cuttingOutline![inseamIdx]!)} → Fp ${pt(inseamFp)} Rc ${pt(inseamRc)}`,
  );

  return { sideFp, sideRc, inseamFp, inseamRc, collapsed, sideIdx, inseamIdx };
}

console.log("=== Hem turn-back acceptance ===");
console.log(
  `policy seam=${DEFAULT_SEAM_ALLOWANCE.seam} hem=${DEFAULT_SEAM_ALLOWANCE.hem}`,
);

{
  console.log("\n--- Skirt cutting outline (must be untouched by post-pass) ---");
  const base = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
  const skirtNet = draftGatheredSkirt(base, { length: 600 }, { fullness: 100 });
  const skirtSA = withSeamAllowance(skirtNet, DEFAULT_SEAM_ALLOWANCE);
  const skirtTB = applyTrouserHemTurnbackToPattern(skirtSA);
  let same = true;
  for (let i = 0; i < skirtSA.pieces.length; i++) {
    const a = skirtSA.pieces[i]!;
    const b = skirtTB.pieces[i]!;
    if (JSON.stringify(a.cuttingOutline) !== JSON.stringify(b.cuttingOutline)) {
      same = false;
    }
    if (b.netToCutIndex) same = false;
  }
  check(same, "skirt cutting outlines byte-identical (post-pass is a no-op)");
}

for (const label of ["Aldrich block", "Cleo preset"] as const) {
  const settings =
    label === "Aldrich block" ? BLOCK_TROUSER_STYLE : CLEO_TROUSER_STYLE;
  console.log(`\n--- ${label} ---`);
  const { net, withSA, withTB } = draftCase(settings);

  for (const name of ["Trouser front", "Trouser back"] as const) {
    const before = withSA.pieces.find((p) => p.name === name)!;
    const after = withTB.pieces.find((p) => p.name === name)!;
    const netPiece = net.pieces.find((p) => p.name === name)!;
    check(
      JSON.stringify(netPiece.outline) === JSON.stringify(after.outline),
      `${name}: net outline byte-identical (${after.outline.length} raw pts)`,
    );

    const collapsed = collapse(after.outline);
    const { sideIdx, inseamIdx } = findHemCorners(collapsed);
    const curvedHem = inseamIdx - sideIdx > 1;

    if (curvedHem) {
      // Curved back: post-pass is a no-op — keep addSeamAllowance offset.
      check(
        JSON.stringify(before.cuttingOutline) ===
          JSON.stringify(after.cuttingOutline),
        `${name}: curved hem — cutting byte-identical to SA (no turn-back)`,
      );
      check(
        !after.netToCutIndex,
        `${name}: curved hem — no netToCutIndex`,
      );
      console.log(
        `    curved hem samples=${inseamIdx - sideIdx + 1}; cut ${after.cuttingOutline!.length}`,
      );
    } else {
      check(!!after.netToCutIndex, `${name}: netToCutIndex present`);
      reportLeg(name, before, after);
    }
  }
}

{
  console.log("\n--- Taper case (Cleo insets +20) ---");
  const taperSettings: TrouserStyleSettings = {
    ...CLEO_TROUSER_STYLE,
    frontInseamKneeInset: 20,
    backInseamKneeInset: 20,
  };
  const { withSA, withTB } = draftCase(taperSettings);

  for (const name of ["Trouser front", "Trouser back"] as const) {
    const before = withSA.pieces.find((p) => p.name === name)!;
    const after = withTB.pieces.find((p) => p.name === name)!;
    const r = reportLeg(name, before, after);
    const foldW = Math.abs(r.sideFp.x - r.inseamFp.x);
    const rawW = Math.abs(r.sideRc.x - r.inseamRc.x);
    check(
      rawW > foldW + 0.01,
      `${name}: raw wider than fold (${f3(rawW)} > ${f3(foldW)})`,
    );
    // Direction-agnostic check: each edge's lean is mirrored. With +20 knee
    // inset the inseam is the strong taper; the side may be near-vertical with
    // a sub-mm lean either way over the 30 mm span — don't require both sides
    // to shout "outward" when one is essentially vertical.
    const inseamOutward = r.inseamRc.x < r.inseamFp.x;
    check(
      inseamOutward,
      `${name}: inseam allowance slopes outward (Δx=${f3(r.inseamRc.x - r.inseamFp.x)})`,
    );
    console.log(
      `    side lean Δx=${f3(r.sideRc.x - r.sideFp.x)} (near-vertical if |Δx|≪1)`,
    );
  }
}

{
  console.log("\n--- Highlight map (hem span includes turn-back verts) ---");
  const { withTB } = draftCase(CLEO_TROUSER_STYLE);
  const front = withTB.pieces.find((p) => p.name === "Trouser front")!;
  const collapsed = collapse(front.outline);
  const { sideIdx, inseamIdx } = findHemCorners(collapsed);
  // Find raw indices
  let rawSide = 0;
  let rawInseam = 0;
  for (let i = 0; i < front.outline.length; i++) {
    if (
      Math.hypot(
        front.outline[i]!.at.x - collapsed[sideIdx]!.at.x,
        front.outline[i]!.at.y - collapsed[sideIdx]!.at.y,
      ) < DUP_TOL
    ) {
      rawSide = i;
    }
    if (
      Math.hypot(
        front.outline[i]!.at.x - collapsed[inseamIdx]!.at.x,
        front.outline[i]!.at.y - collapsed[inseamIdx]!.at.y,
      ) < DUP_TOL
    ) {
      rawInseam = i;
    }
  }
  const a = front.netToCutIndex![rawSide]!;
  const b = front.netToCutIndex![rawInseam]!;
  check(b === a + 3, `front hem cut span Fp..Fp′ is 4 verts (got ${b - a + 1})`);
}

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASS" : `${failures} FAILURE(S)`}`,
);
if (failures > 0) process.exitCode = 1;
