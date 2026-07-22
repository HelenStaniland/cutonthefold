/**
 * Acceptance: notch roles + final notch set (Parts A & B).
 * Run: npx tsx scripts/accept-notch-roles.ts
 */
import {
  applyEase,
  notchCount,
  type NotchMarking,
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
  INSEAM_HIGH_TIP_OFFSET_BACK,
  arcToPoint,
  inseamHighNotches,
  sideKneeNotches,
} from "../lib/geometry/notchPlacement";
import { pchipByY } from "../lib/geometry/curves";
import {
  blockFromWaistDrop,
  draftTrousers,
  trouserBackPoints,
  trouserFrontPoints,
  trouserWaistEdges,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import { draftWaistband, WAISTBAND_IDENTITY_FROM_FOLD_MM } from "../lib/elements/waistband";
import { applySideOpening } from "../lib/elements/sideOpening";
import { draftGatheredSkirt } from "../lib/patterns/gatheredSkirt";
import { polylineLength } from "../lib/geometry/curves";
import { notchSegments } from "../lib/pattern/markingGeometry";

const f3 = (n: number) => n.toFixed(3);
const pt = (p: Point) => `(${f3(p.x)}, ${f3(p.y)})`;

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.log(`  FAIL: ${msg}`);
  } else {
    console.log(`  ok: ${msg}`);
  }
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

function notches(piece: PatternPiece): NotchMarking[] {
  return piece.markings.filter((m): m is NotchMarking => m.kind === "notch");
}

function byLabel(piece: PatternPiece, label: string): NotchMarking | undefined {
  return notches(piece).find((n) => n.label === label);
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function draftFull(settings: TrouserStyleSettings) {
  const body = applyEase(bodyForSizeCode(DEFAULT_SIZE_CODE)!, settings.ease);
  const style = resolveStyle(settings, body);
  const net = draftTrousers(body, style);
  const opened = applySideOpening(net.pieces, { side: "left", length: 180 });
  const bandDepth = style.waistReduction ?? 0;
  let pieces = opened.pieces;
  if (bandDepth > 0) {
    const e = trouserWaistEdges(body, style);
    const fb = draftWaistband({
      innerLen: e.front.inner,
      outerLen: e.front.outer,
      depth: bandDepth,
      foldSide: "CF",
      label: "Front waistband",
    });
    const bb = draftWaistband({
      innerLen: e.back.inner,
      outerLen: e.back.outer,
      depth: bandDepth,
      foldSide: "CB",
      label: "Back waistband",
    });
    pieces = [...opened.pieces, fb.piece, bb.piece];
  }
  const withSA = withSeamAllowance({ pieces: net.pieces }, DEFAULT_SEAM_ALLOWANCE);
  const withHem = applyTrouserHemTurnbackToPattern(withSA);
  return {
    body,
    style,
    net,
    pieces,
    withHem,
    frontPts: trouserFrontPoints(body, style),
    backPts: trouserBackPoints(body, style),
  };
}

const LEG_LABELS = [
  "knee",
  "side-knee",
  "side-hip",
  "inseam-high",
  "hipline",
  "zip",
  "mid-waist",
] as const;

console.log("=== Acceptance: notch roles + final set ===");

for (const [label, settings] of [
  ["Cleo", CLEO_TROUSER_STYLE],
  ["Aldrich", BLOCK_TROUSER_STYLE],
] as const) {
  console.log(`\n========== ${label} ==========`);
  const d = draftFull(settings);
  const front = d.pieces.find((p) => p.name === "Trouser front")!;
  const back = d.pieces.find((p) => p.name === "Trouser back")!;
  const netF = d.net.pieces.find((p) => p.name === "Trouser front")!;
  const netB = d.net.pieces.find((p) => p.name === "Trouser back")!;
  const cutF = d.withHem.pieces.find((p) => p.name === "Trouser front")!;
  const cutB = d.withHem.pieces.find((p) => p.name === "Trouser back")!;

  // 1. Outline lengths (geometry unchanged — markings only)
  check(
    JSON.stringify(netF.outline) === JSON.stringify(front.outline) ||
      netF.outline.length === front.outline.length,
    `${label} front: net outline length ${netF.outline.length}`,
  );
  console.log(
    `  net outline F/B: ${netF.outline.length} / ${netB.outline.length}; cut F/B: ${cutF.cuttingOutline!.length} / ${cutB.cuttingOutline!.length}`,
  );

  // 2–3 roles
  for (const piece of [front, back]) {
    const ns = notches(piece);
    const labels = ns.map((n) => n.label).sort().join(",");
    const expected = [...LEG_LABELS].sort().join(",");
    check(labels === expected, `${piece.name}: exact label set [${labels}]`);
    for (const n of ns) {
      check(
        !Object.prototype.hasOwnProperty.call(n, "count"),
        `${piece.name} ${n.label}: no count field`,
      );
      const ticks = notchCount(n);
      if (n.role === "identity") {
        check(ticks === 2, `${piece.name} ${n.label}: identity ticks=2`);
      } else {
        check(ticks === 1, `${piece.name} ${n.label}: role=${n.role} ticks=1`);
      }
    }
  }

  // 4. Side knee
  const fSideKnee = byLabel(front, "side-knee")!;
  const bSideKnee = byLabel(back, "side-knee")!;
  check(
    Math.abs(fSideKnee.at.y - d.frontPts.p15.y) < 0.01,
    `front side-knee y=${f3(fSideKnee.at.y)} (= kneeY)`,
  );
  check(
    Math.abs(bSideKnee.at.y - d.backPts.p29.y) < 0.01,
    `back side-knee y=${f3(bSideKnee.at.y)} (= kneeY)`,
  );
  const fSide = pchipByY([
    d.frontPts.p8,
    d.frontPts.p13,
    d.frontPts.p12,
  ]);
  const bSide = pchipByY([
    d.backPts.p25,
    d.backPts.p27,
    d.backPts.p26,
  ]);
  // order from waist: hip is first
  const fArc = arcToPoint(fSide, fSideKnee.at);
  const bArc = arcToPoint(bSide, bSideKnee.at);
  console.log(
    `  4. side-knee F ${pt(fSideKnee.at)} arcFromWaist=${f3(fArc)}; B ${pt(bSideKnee.at)} arcFromWaist=${f3(bArc)}; Δ=${f3(bArc - fArc)}`,
  );

  // 5. Inseam high
  const high = inseamHighNotches(
    {
      tip: d.frontPts.p9,
      knee: d.frontPts.p15,
      hem: d.frontPts.p14,
    },
    {
      tip: d.backPts.p24,
      knee: d.backPts.p29,
      hem: d.backPts.p28,
    },
    INSEAM_HIGH_TIP_OFFSET_BACK,
  );
  const fHigh = byLabel(front, "inseam-high")!;
  const bHigh = byLabel(back, "inseam-high")!;
  check(dist(fHigh.at, high.front) < 0.01, `front inseam-high matches Lhigh placement`);
  check(dist(bHigh.at, high.back) < 0.01, `back inseam-high matches Lhigh placement`);
  console.log(
    `  5. inseam-high Lhigh=${f3(high.Lhigh)}; F ${pt(fHigh.at)} fromTip=${f3(high.frontDistFromTip)} fromKnee=${f3(high.frontDistFromKnee)}`,
  );
  console.log(
    `     B ${pt(bHigh.at)} fromTip=${f3(high.backDistFromTip)} fromKnee=${f3(high.backDistFromKnee)}`,
  );

  // 7. Fold hipline
  const fHip = byLabel(front, "hipline")!;
  const bHip = byLabel(back, "hipline")!;
  check(fHip.role === "fold" && notchCount(fHip) === 1, "front hipline fold single");
  check(bHip.role === "fold" && notchCount(bHip) === 1, "back hipline fold single");

  // Expected side-knee from helper
  const sides = sideKneeNotches(
    {
      sideHip: d.frontPts.p8,
      sideKnee: d.frontPts.p13,
      sideHem: d.frontPts.p12,
      kneeY: d.frontPts.p15.y,
    },
    {
      sideHip: d.backPts.p25,
      sideKnee: d.backPts.p27,
      sideHem: d.backPts.p26,
      kneeY: d.backPts.p29.y,
    },
  );
  check(dist(fSideKnee.at, sides.front) < 0.01, "front side-knee = diag §2");
  check(dist(bSideKnee.at, sides.back) < 0.01, "back side-knee = diag §2");

  // Mid-waist balance ↔ band centre (arc mid of waist edge CF/CB→side)
  const fMid = byLabel(front, "mid-waist")!;
  const bMid = byLabel(back, "mid-waist")!;
  function waistEdgeCfToSide(piece: PatternPiece): Point[] {
    const pts = piece.outline
      .filter((o) => o.role === "waist")
      .map((o) => o.at);
    const side = piece.outline.find((o) => o.role === "side-seam");
    if (side && pts.length > 0) {
      const last = pts[pts.length - 1]!;
      if (Math.hypot(side.at.x - last.x, side.at.y - last.y) > 1e-6) {
        pts.push(side.at);
      }
    }
    return pts;
  }
  const fWaist = waistEdgeCfToSide(front);
  const bWaist = waistEdgeCfToSide(back);
  const fArcMid = arcToPoint(fWaist, fMid.at);
  const bArcMid = arcToPoint(bWaist, bMid.at);
  check(
    fMid.role === "balance" &&
      fMid.mates?.piece === "Front waistband" &&
      Math.abs(fArcMid - polylineLength(fWaist) / 2) < 0.5,
    `front mid-waist at ${pt(fMid.at)} arcFromCF=${f3(fArcMid)} (half=${f3(polylineLength(fWaist) / 2)})`,
  );
  check(
    bMid.role === "balance" &&
      bMid.mates?.piece === "Back waistband" &&
      Math.abs(bArcMid - polylineLength(bWaist) / 2) < 0.5,
    `back mid-waist at ${pt(bMid.at)} arcFromCF=${f3(bArcMid)} (half=${f3(polylineLength(bWaist) / 2)})`,
  );
}

// 6. Waistband (Cleo)
{
  console.log("\n--- 6. Waistband (Cleo) ---");
  const d = draftFull(CLEO_TROUSER_STYLE);
  const fb = d.pieces.find((p) => p.name === "Front waistband")!;
  const bb = d.pieces.find((p) => p.name === "Back waistband")!;
  const front = d.pieces.find((p) => p.name === "Trouser front")!;
  const back = d.pieces.find((p) => p.name === "Trouser back")!;
  const fNs = notches(fb);
  const bNs = notches(bb);
  check(
    fNs.length === 1 && fNs[0]!.role === "balance" && notchCount(fNs[0]!) === 1,
    `Front WB: mid-waist balance only at ${pt(fNs[0]!.at)}`,
  );
  const mid = bNs.find((n) => n.role === "balance");
  const id = bNs.find((n) => n.role === "identity");
  check(!!mid && notchCount(mid) === 1, `Back WB mid-waist balance at ${mid ? pt(mid.at) : "—"}`);
  check(!!id && notchCount(id) === 2, `Back WB identity double at ${id ? pt(id.at) : "—"}`);
  const topFromFold: Point[] = [];
  for (const o of bb.outline) {
    if (o.role === "side-seam") break;
    topFromFold.push(o.at);
  }
  const idArc = id ? arcToPoint(topFromFold, id.at) : NaN;
  check(
    !!id && Math.abs(idArc - WAISTBAND_IDENTITY_FROM_FOLD_MM) < 1,
    `Back WB identity offset ${WAISTBAND_IDENTITY_FROM_FOLD_MM} mm from fold (arc=${f3(idArc)}, at ${id ? pt(id.at) : "—"})`,
  );

  // Mate check: band centre ↔ trouser waist mid
  const fLegMid = byLabel(front, "mid-waist")!;
  const bLegMid = byLabel(back, "mid-waist")!;
  check(
    fNs[0]!.mates?.piece === "Trouser front" &&
      fNs[0]!.mates?.seam === "waist" &&
      fLegMid.mates?.piece === "Front waistband",
    "Front balance mate: trouser mid-waist ↔ Front waistband waist",
  );
  check(
    mid?.mates?.piece === "Trouser back" &&
      mid?.mates?.seam === "waist" &&
      bLegMid.mates?.piece === "Back waistband",
    "Back balance mate: trouser mid-waist ↔ Back waistband waist",
  );

  // PDF path: same notchSegments as pdf.ts — both identity ticks clear of fold line
  const withSA = withSeamAllowance(
    { pieces: [bb] },
    DEFAULT_SEAM_ALLOWANCE,
  );
  const bbCut = withSA.pieces[0]!;
  const idCut = notches(bbCut).find((n) => n.role === "identity")!;
  const segs = notchSegments(bbCut, idCut);
  const foldLine = bbCut.markings.find((m) => m.kind === "placeOnFold");
  let minFoldClear = Infinity;
  if (foldLine && foldLine.kind === "placeOnFold") {
    const A = foldLine.line.from;
    const B = foldLine.line.to;
    for (const s of segs) {
      for (const p of [s.from, s.to]) {
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const len2 = dx * dx + dy * dy || 1;
        let t = ((p.x - A.x) * dx + (p.y - A.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        minFoldClear = Math.min(
          minFoldClear,
          Math.hypot(p.x - (A.x + t * dx), p.y - (A.y + t * dy)),
        );
      }
    }
  }
  check(
    segs.length === 2 && minFoldClear > 5,
    `PDF identity: ${segs.length} ticks, min dist to fold line=${f3(minFoldClear)} mm (clear)`,
  );
  console.log(
    `  Front mid-waist ${pt(fNs[0]!.at)}; Back mid-waist ${mid ? pt(mid.at) : "—"}; identity ${id ? pt(id.at) : "—"} (offset=${WAISTBAND_IDENTITY_FROM_FOLD_MM} mm)`,
  );
  console.log(
    `  Trouser mid-waist F ${pt(fLegMid.at)}; B ${pt(bLegMid.at)}`,
  );
  console.log(
    `  Fold representation: piece is drafted half (onFold=true); foldSide=CB on back band; identity on band-top at ${WAISTBAND_IDENTITY_FROM_FOLD_MM} mm from fold → single mark on half (not mirrored in geometry).`,
  );
}

// Skirt still drafts
{
  const skirt = draftGatheredSkirt(
    bodyForSizeCode(DEFAULT_SIZE_CODE)!,
    { fullness: 100 },
    { length: 600 },
  );
  check(skirt.pieces.length >= 1, "skirt drafts");
}

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASS" : `${failures} FAILURE(S)`}`,
);
console.log(
  "Render: re-run npx tsx scripts/diag-notch-render.ts for labelled SVGs.",
);
console.log(
  "Backlog: verify:aldrich does not assert notch roles — worth adding a notch-set check.",
);
if (failures > 0) process.exitCode = 1;
