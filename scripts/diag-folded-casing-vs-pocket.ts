/**
 * Diagnostic — folded casing vs pocket top; SA glitch at top corner.
 * Run: npx tsx scripts/diag-folded-casing-vs-pocket.ts
 *
 * Change no code. Print only.
 *
 * Part 1: reflect casing raw edge across the fold; where does it land vs
 * turndown / pocket top?
 * Part 2: SA polyline at the casing∩pocket-mouth corner vs a clean corner.
 */
import {
  applyEase,
  type BodyMeasurements,
  type OutlinePoint,
  type PatternPiece,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import {
  applyTrouserWaistCasingToPattern,
  resolveCasingDepths,
  type CasingElasticWidth,
  type WaistCasingRef,
} from "../lib/geometry/trouserWaistCasing";
import { CARGO_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrousers,
  resolveBodyWaistY,
  resolveFrontSlantPocketMouth,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const WIDTHS: CasingElasticWidth[] = [25, 38, 50];

const f1 = (n: number) => n.toFixed(1);
const f3 = (n: number) => n.toFixed(3);

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

function resolveCargo(
  body: BodyMeasurements,
  pocketFront: "slant" | "none",
): TrouserFrontStyle {
  const s = CARGO_TROUSER_STYLE;
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    frontWaistInset: 0,
    waistTaper: 0,
    pocketFront,
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
    ...(s.crotchDeparture != null ? { crotchDeparture: s.crotchDeparture } : {}),
    ...(s.crotchArrivalAngle != null
      ? { crotchArrivalAngle: s.crotchArrivalAngle }
      : {}),
    ...(s.waistlineCurveFront != null
      ? { waistlineCurveFront: s.waistlineCurveFront }
      : {}),
    ...(s.backCbWaistRise != null ? { backCbWaistRise: s.backCbWaistRise } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
  };
  return withWaistband(base, 0, "shaped", body);
}

function finish(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  width: CasingElasticWidth,
) {
  const net = draftTrousers(body, style);
  const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  return {
    net,
    sa,
    cased: applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(width)),
  };
}

function meanY(pts: Point[]): number {
  return pts.reduce((s, p) => s + p.y, 0) / Math.max(1, pts.length);
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function collapse(outline: OutlinePoint[]): OutlinePoint[] {
  const DUP = 0.01;
  const out: OutlinePoint[] = [];
  for (const p of outline) {
    const last = out[out.length - 1];
    if (last && dist(last.at, p.at) < DUP) continue;
    out.push(p);
  }
  if (out.length > 1 && dist(out[0]!.at, out[out.length - 1]!.at) < DUP) {
    out.pop();
  }
  return out;
}

function findWaistRun(
  outline: OutlinePoint[],
): { start: number; end: number } | null {
  const idxs: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    if (outline[i]!.role === "waist") idxs.push(i);
  }
  if (idxs.length === 0) return null;
  return { start: idxs[0]!, end: idxs[idxs.length - 1]! };
}

/** Reflect point across fold: 2·fold − raw (construction-paired samples). */
function reflectAcrossFold(raw: Point, fold: Point): Point {
  return { x: 2 * fold.x - raw.x, y: 2 * fold.y - raw.y };
}

/**
 * Reconstruct raw cut-top samples from casing refs (same construction as
 * applyTrouserWaistCasingTurnup: offset turndown along fold−turndown by total).
 */
function reconstructRawTop(ref: WaistCasingRef): Point[] {
  const n = Math.min(ref.foldLine.length, ref.turndownSeam.length);
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const fold = ref.foldLine[i]!;
    const turn = ref.turndownSeam[i]!;
    const dx = fold.x - turn.x;
    const dy = fold.y - turn.y;
    const len = Math.hypot(dx, dy) || 1;
    const scale = ref.totalExtension / len;
    out.push({ x: turn.x + dx * scale, y: turn.y + dy * scale });
  }
  return out;
}

type FoldLand = {
  rawYRel: number;
  foldYRel: number;
  foldedYRel: number;
  pocketTopYRel: number;
  /** folded − turndown in y (negative = above turndown in y-down). */
  foldedVsTurndown: number;
  /** How far into the garment past turndown (positive = overlap). */
  overlapPastTurndown: number;
  /** Perp distance fold→folded (should ≈ turnUnder). */
  foldToFoldedPerp: number;
  verdict: "above" | "at" | "below";
};

function analyseFoldLand(
  ref: WaistCasingRef,
  pocketTopY: number,
  turnY0: number,
): FoldLand {
  const raw = reconstructRawTop(ref);
  const n = Math.min(raw.length, ref.foldLine.length, ref.turndownSeam.length);
  const folded: Point[] = [];
  const relYs: number[] = [];
  const perps: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = reflectAcrossFold(raw[i]!, ref.foldLine[i]!);
    folded.push(f);
    const turn = ref.turndownSeam[i]!;
    relYs.push(f.y - turn.y);
    perps.push(dist(ref.foldLine[i]!, f));
  }
  const foldedYRel = meanY(folded) - turnY0;
  const rawYRel = meanY(raw) - turnY0;
  const foldYRel = meanY(ref.foldLine) - turnY0;
  const meanRel = relYs.reduce((s, v) => s + v, 0) / relYs.length;
  const meanPerp = perps.reduce((s, v) => s + v, 0) / perps.length;
  // Into-garment past turndown: positive meanRel (y-down) = below turndown.
  const overlap = Math.max(0, meanRel);
  let verdict: FoldLand["verdict"] = "above";
  if (Math.abs(meanRel) < 0.05) verdict = "at";
  else if (meanRel > 0) verdict = "below";
  return {
    rawYRel,
    foldYRel,
    foldedYRel,
    pocketTopYRel: pocketTopY - turnY0,
    foldedVsTurndown: meanRel,
    overlapPastTurndown: overlap,
    foldToFoldedPerp: meanPerp,
    verdict,
  };
}

function fmtPt(p: Point): string {
  return `(${f3(p.x)}, ${f3(p.y)})`;
}

function cornerWindow(
  label: string,
  collapsed: OutlinePoint[],
  cut: Point[],
  run: { start: number; end: number },
  extra = 3,
) {
  console.log(`  --- ${label} ---`);
  console.log(
    `  waist run indices [${run.start}..${run.end}] of ${collapsed.length} net / ${cut.length} cut`,
  );
  const from = Math.max(0, run.end - extra);
  const to = Math.min(collapsed.length - 1, run.end + extra);
  for (let i = from; i <= to; i++) {
    const o = collapsed[i]!;
    const c = cut[i];
    const marker =
      i === run.end
        ? " ← waist END (junction)"
        : i === run.end + 1
          ? " ← first post-waist"
          : "";
    console.log(
      `  net[${i}] role=${o.role ?? "?"} edge=${o.edge} at=${fmtPt(o.at)}` +
        (c ? `  cut=${fmtPt(c)}` : "  cut=(missing)") +
        marker,
    );
  }
  if (run.end + 1 < cut.length && run.end < cut.length) {
    const a = cut[run.end]!;
    const b = cut[run.end + 1]!;
    const c =
      run.end + 2 < cut.length ? cut[run.end + 2]! : null;
    const ab = dist(a, b);
    const turn =
      c != null
        ? (() => {
            const ux = b.x - a.x;
            const uy = b.y - a.y;
            const vx = c.x - b.x;
            const vy = c.y - b.y;
            const ul = Math.hypot(ux, uy) || 1;
            const vl = Math.hypot(vx, vy) || 1;
            const dot = (ux / ul) * (vx / vl) + (uy / ul) * (vy / vl);
            return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
          })()
        : NaN;
    console.log(
      `  cut chord waistEnd→next: |Δ|=${f3(ab)} mm` +
        (c != null ? `; turn at next→next+1: ${f1(turn)}°` : ""),
    );
  }
}

console.log("=== DIAG: folded casing vs pocket + SA top corner ===\n");
console.log("y-down: smaller y = above turndown; pocket top at turndown (0).\n");

// ---------------------------------------------------------------------------
console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║ PART 1 — folded casing landing vs pocket top                 ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

console.log(
  "Reflection: foldedRaw = 2·fold − raw (paired along casing construction).\n",
);

type Row = {
  body: string;
  piece: string;
  w: number;
  land: FoldLand;
  channel: number;
  turnUnder: number;
  total: number;
};

const rows: Row[] = [];

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveCargo(body, "slant");
  const mouth = resolveFrontSlantPocketMouth(body, style);
  const bodyY = resolveBodyWaistY(body, style);

  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const { cased } = finish(body, style, w);
    const front = cased.pieces.find((p) => p.name === "Trouser front")!;
    const back = cased.pieces.find((p) => p.name === "Trouser back")!;

    for (const piece of [front, back]) {
      const ref = piece.waistCasing!;
      const turnY0 = meanY(ref.turndownSeam);
      // Pocket top = slash / openingTop on front; back has no pocket — report
      // turndown plane as the reference "waist seam" the casing stitches to.
      const pocketTopY =
        piece.name === "Trouser front" ? mouth.openingTop.y : turnY0;
      const land = analyseFoldLand(ref, pocketTopY, turnY0);
      rows.push({
        body: bod.name,
        piece: piece.name === "Trouser front" ? "front" : "back",
        w,
        land,
        channel: d.channelDepth,
        turnUnder: d.turnUnder,
        total: d.totalExtension,
      });
    }

    // Spot-check formula vs Helen / size-12 at each width once
    if (bod.name === "Helen-print" || bod.name === "size-12") {
      const expectFolded =
        -d.channelDepth + d.turnUnder; // = -(channel − turnUnder) if turnUnder folds toward +y
      // From numbers: raw=-total, fold=-channel → folded = 2*(-ch)-(-tot) = -2ch+tot = -(ch - turnUnder)
      const expectY = -(d.channelDepth - d.turnUnder);
      console.log(
        `  ${bod.name} formula check w${w}: rawRel=${-d.totalExtension} foldRel=${-d.channelDepth} ` +
          `→ foldedRel expect ${f3(expectY)} (channel−turnUnder above turndown = ${d.channelDepth - d.turnUnder} mm); ` +
          `bodyY=${f3(bodyY)} openingTop=${f3(mouth.openingTop.y)}`,
      );
      void expectFolded;
    }
  }
}

console.log("\n--- Front (level casing) ---\n");
console.log(
  "body            w   rawY   foldY  foldedY  pocket  folded−turn  overlap  verdict",
);
for (const r of rows.filter((x) => x.piece === "front")) {
  const L = r.land;
  console.log(
    `${r.body.padEnd(14)} ${String(r.w).padStart(2)}  ${f3(L.rawYRel).padStart(7)} ${f3(L.foldYRel).padStart(7)} ${f3(L.foldedYRel).padStart(8)} ${f3(L.pocketTopYRel).padStart(7)} ${f3(L.foldedVsTurndown).padStart(12)} ${f3(L.overlapPastTurndown).padStart(8)}  ${L.verdict}`,
  );
}

console.log("\n--- Back (slanted / parallelogram casing) ---\n");
console.log(
  "body            w   rawY   foldY  foldedY  turn0   folded−turn  overlap  verdict  fold→folded⊥",
);
for (const r of rows.filter((x) => x.piece === "back")) {
  const L = r.land;
  console.log(
    `${r.body.padEnd(14)} ${String(r.w).padStart(2)}  ${f3(L.rawYRel).padStart(7)} ${f3(L.foldYRel).padStart(7)} ${f3(L.foldedYRel).padStart(8)} ${"0".padStart(7)} ${f3(L.foldedVsTurndown).padStart(12)} ${f3(L.overlapPastTurndown).padStart(8)}  ${L.verdict.padEnd(6)}  ${f3(L.foldToFoldedPerp)} (expect turnUnder ${r.turnUnder})`,
  );
}

{
  const frontAll = rows.filter((x) => x.piece === "front");
  const anyOverlap = frontAll.some((r) => r.land.overlapPastTurndown > 0.05);
  const maxAbove = Math.max(
    ...frontAll.map((r) => -r.land.foldedVsTurndown),
  );
  const minAbove = Math.min(
    ...frontAll.map((r) => -r.land.foldedVsTurndown),
  );
  console.log("\n=== PART 1 HEADLINE ===");
  if (!anyOverlap) {
    console.log(
      `Folded casing lands ABOVE the turndown / pocket top on every size×width.`,
    );
    console.log(
      `Front: folded edge is ${f1(minAbove)}–${f1(maxAbove)} mm above turndown ` +
        `(= channelDepth − turnUnder). Never reaches y≥0. Overlap = 0.000 mm.`,
    );
    console.log(
      `Helen's bulk concern is UNFOUNDED for the fold geometry — casing stays in the channel.`,
    );
  } else {
    const worst = frontAll.reduce((a, b) =>
      a.land.overlapPastTurndown > b.land.overlapPastTurndown ? a : b,
    );
    console.log(
      `Folded casing lands ON/BELOW the pocket top — overlap up to ${f3(worst.land.overlapPastTurndown)} mm ` +
        `(${worst.body} w${worst.w}).`,
    );
  }
  const backOverlap = rows
    .filter((x) => x.piece === "back")
    .some((r) => r.land.overlapPastTurndown > 0.05);
  console.log(
    `Back (slant): same construction — folded edge ${backOverlap ? "OVERLAPS" : "stays ABOVE"} turndown ` +
      `(perp fold→folded ≈ turnUnder 10 mm toward the garment).`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║ PART 2 — SA glitch at casing ∩ pocket-mouth corner           ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const styleOn = resolveCargo(body, "slant");
  const styleOff = resolveCargo(body, "none");
  const w = 25 as CasingElasticWidth;
  const d = resolveCasingDepths(w);

  const on = finish(body, styleOn, w);
  const off = finish(body, styleOff, w);

  const frontNet = on.net.pieces.find((p) => p.name === "Trouser front")!;
  const frontSa = on.sa.pieces.find((p) => p.name === "Trouser front")!;
  const frontCased = on.cased.pieces.find((p) => p.name === "Trouser front")!;
  const frontOffSa = off.sa.pieces.find((p) => p.name === "Trouser front")!;
  const frontOffCased = off.cased.pieces.find((p) => p.name === "Trouser front")!;

  const mouth = resolveFrontSlantPocketMouth(body, styleOn);
  console.log(
    `Helen Cargo w${w}: openingTop=${fmtPt(mouth.openingTop)} ` +
      `channel=${d.channelDepth} totalExt=${d.totalExtension} SA=${DEFAULT_SEAM_ALLOWANCE.seam}\n`,
  );

  const colOn = collapse(frontNet.outline);
  const runOn = findWaistRun(colOn)!;
  const colOff = collapse(
    off.net.pieces.find((p) => p.name === "Trouser front")!.outline,
  );
  const runOff = findWaistRun(colOff)!;

  console.log("A. Pocket ON — SA cut (before casing) around waist∩mouth:");
  cornerWindow(
    "SA only (pocket on)",
    colOn,
    frontSa.cuttingOutline!,
    runOn,
  );

  console.log("\nB. Pocket ON — after casing splice (cutTop replaces waist run):");
  // After casing, cuttingOutline length ≠ collapsed net — map by netToCutIndex
  // or re-walk: waist samples are cutTop[0..n], then oldCut[run.end+1..]
  const casedCut = frontCased.cuttingOutline!;
  const waistLen = runOn.end - runOn.start + 1;
  console.log(
    `  casing cut length=${casedCut.length}; waist samples replaced=${waistLen}`,
  );
  console.log(
    `  last casing raw-top (cut[${waistLen - 1}]) = ${fmtPt(casedCut[waistLen - 1]!)}`,
  );
  console.log(
    `  first retained post-waist cut[${waistLen}] = ${fmtPt(casedCut[waistLen]!)}`,
  );
  if (waistLen + 1 < casedCut.length) {
    console.log(
      `  next cut[${waistLen + 1}] = ${fmtPt(casedCut[waistLen + 1]!)}`,
    );
  }

  // Compare to SA vertex that WAS at waist end (orphaned by splice)
  const saAtWaistEnd = frontSa.cuttingOutline![runOn.end]!;
  const saAfter = frontSa.cuttingOutline![runOn.end + 1]!;
  const casedRawAtOpen = casedCut[waistLen - 1]!;
  const casedNext = casedCut[waistLen]!;
  console.log("\n  Splice geometry:");
  console.log(
    `  SA mitre at waistEnd (orphaned, not in cased cut): ${fmtPt(saAtWaistEnd)}`,
  );
  console.log(
    `  SA cut[run.end+1] (kept as first post-waist):     ${fmtPt(saAfter)}`,
  );
  console.log(
    `  Cased: raw-top at opening (new):                  ${fmtPt(casedRawAtOpen)}`,
  );
  console.log(
    `  Cased: connects raw-top → SA[run.end+1]:          ${fmtPt(casedRawAtOpen)} → ${fmtPt(casedNext)}`,
  );
  console.log(
    `  |raw-top − SA[run.end+1]| = ${f3(dist(casedRawAtOpen, casedNext))} mm`,
  );
  console.log(
    `  |SA mitre(waistEnd) − SA[run.end+1]| = ${f3(dist(saAtWaistEnd, saAfter))} mm`,
  );

  // Angle of the bad corner: raw-top → next → next+1
  {
    const a = casedCut[waistLen - 1]!;
    const b = casedCut[waistLen]!;
    const c = casedCut[waistLen + 1]!;
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const vx = c.x - b.x;
    const vy = c.y - b.y;
    const ul = Math.hypot(ux, uy) || 1;
    const vl = Math.hypot(vx, vy) || 1;
    const dot = (ux / ul) * (vx / vl) + (uy / ul) * (vy / vl);
    const ang = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    console.log(
      `  Exterior/polyline turn at splice vertex: ${f1(ang)}° ` +
        `(incoming from casing raw-top, outgoing along pre-casing SA)`,
    );
  }

  // Net roles at junction
  console.log("\n  Net roles at junction:");
  for (let i = runOn.end - 1; i <= runOn.end + 2 && i < colOn.length; i++) {
    const o = colOn[i]!;
    console.log(
      `    [${i}] role=${o.role} edge=${o.edge} ${fmtPt(o.at)}` +
        (i === runOn.end ? "  ← last waist (= opening top)" : ""),
    );
  }

  console.log("\nC. Pocket OFF — clean side∩waist corner (control):");
  cornerWindow(
    "SA only (pocket off)",
    colOff,
    frontOffSa.cuttingOutline!,
    runOff,
  );
  const offCasedCut = frontOffCased.cuttingOutline!;
  const offWaistLen = runOff.end - runOff.start + 1;
  console.log("\n  After casing (pocket off) — same splice pattern at side corner:");
  console.log(
    `  last raw-top cut[${offWaistLen - 1}] = ${fmtPt(offCasedCut[offWaistLen - 1]!)}`,
  );
  console.log(
    `  first post-waist cut[${offWaistLen}] = ${fmtPt(offCasedCut[offWaistLen]!)}`,
  );
  console.log(
    `  |raw-top − next| = ${f3(dist(offCasedCut[offWaistLen - 1]!, offCasedCut[offWaistLen]!))} mm`,
  );

  // What differs: pocket-on next edge is pocket-mouth (diagonal); pocket-off is side-seam
  const nextRoleOn = colOn[runOn.end + 1]?.role;
  const nextRoleOff = colOff[runOff.end + 1]?.role;
  console.log(
    `\n  Post-waist net role: pocket-on → "${nextRoleOn}"; pocket-off → "${nextRoleOff}"`,
  );

  // SA mitre at waistEnd: what normals meet?
  const prevRole = colOn[runOn.end - 1]?.role;
  const endRole = colOn[runOn.end]?.role;
  const nextRole = colOn[runOn.end + 1]?.role;
  console.log(
    `  Pocket-on junction net: …${prevRole} → ${endRole} → ${nextRole}`,
  );
  console.log(
    `  SA engine mitred ${endRole}←→${nextRole} at opening; casing then DROPS that mitre`,
  );
  console.log(
    `  and joins casing raw-top (offset of ${endRole} by +totalExtension up) to SA vertex of ${nextRole}.`,
  );

  console.log("\n=== PART 2 HEADLINE ===");
  console.log(
    "Cause: applyTrouserWaistCasingTurnup replaces the waist-run cut samples with",
  );
  console.log(
    "cutTop (raw casing edge), then appends oldCut[run.end+1 …] unchanged.",
  );
  console.log(
    "At the pocket opening the net is waist → pocket-mouth. SA had already mitred",
  );
  console.log(
    "that corner (waist∩diagonal). The mitre at run.end is discarded; the next SA",
  );
  console.log(
    "vertex still sits on the pocket-mouth offset. The new edge jumps from the",
  );
  console.log(
    `casing raw-top (${f1(d.totalExtension)} mm above the opening) to that pre-casing`,
  );
  console.log(
    "SA point — a bad junction (wrong mitre / long diagonal chord), not a doubled",
  );
  console.log(
    "vertex. Located in lib/geometry/trouserWaistCasing.ts splice loop",
  );
  console.log(
    "(cutTop then oldCut[run.end+1…]); SA itself (seamAllowance.ts) is fine on the",
  );
  console.log(
    "pre-casing outline. Pocket-off has the same splice class at side∩waist, but the",
  );
  console.log(
    "post-waist edge is near-vertical side-seam so the visual glitch is milder than",
  );
  console.log("the slanted pocket-mouth case.");
}

console.log("\n=== END DIAG (no code changed) ===\n");
