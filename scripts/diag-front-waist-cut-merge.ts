/**
 * Diagnostic — front waist cut line merging with stitch (net) line.
 * Run: npx tsx scripts/diag-front-waist-cut-merge.ts
 *
 * Change no code. Print only.
 *
 * Suspect: SA splice rejoin inserts oldCut[run.end] / oldCut[0] — if any sit
 * on the net (offset ≈ 0), the cut collapses onto the stitch line.
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
  type CasingDepths,
  type CasingElasticWidth,
} from "../lib/geometry/trouserWaistCasing";
import { CARGO_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrousers,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const WIDTHS: CasingElasticWidth[] = [25, 38, 50];
const SA = DEFAULT_SEAM_ALLOWANCE.seam;

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
  pocket: "slant" | "none",
): TrouserFrontStyle {
  const s = CARGO_TROUSER_STYLE;
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    frontWaistInset: 0,
    waistTaper: 0,
    pocketFront: pocket,
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

function unit(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** Outward normal of waist polyline (same sense as casing turn-up). */
function waistOutward(waist: Point[], clockwise: boolean): Point {
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < waist.length - 1; i++) {
    const a = waist[i]!;
    const b = waist[i + 1]!;
    const t = unit(b.x - a.x, b.y - a.y);
    const n = clockwise ? { x: t.y, y: -t.x } : { x: -t.y, y: t.x };
    nx += n.x;
    ny += n.y;
  }
  const u = unit(nx, ny);
  const mid = waist[Math.floor(waist.length / 2)]!;
  const probe = { x: mid.x + u.x * 10, y: mid.y + u.y * 10 };
  // y-down: into garment = larger y → flip
  if (probe.y > mid.y + 0.5) return { x: -u.x, y: -u.y };
  return u;
}

/**
 * Signed perpendicular distance from point to infinite line through edge
 * (along `outward`). Positive = on the outward side of the net waist.
 */
function perpGapToWaist(
  p: Point,
  waist: Point[],
  outward: Point,
): { gap: number; nearest: Point; t: number } {
  // Project onto waist polyline; gap = dot(p - nearest, outward)
  let bestD = Infinity;
  let nearest = waist[0]!;
  let bestT = 0;
  let acc = 0;
  const total = waist.reduce((s, _, i) => {
    if (i === 0) return 0;
    return s + dist(waist[i - 1]!, waist[i]!);
  }, 0);
  for (let i = 0; i < waist.length - 1; i++) {
    const a = waist[i]!;
    const b = waist[i + 1]!;
    const seg = dist(a, b);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy || 1;
    let u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    u = Math.max(0, Math.min(1, u));
    const q = { x: a.x + u * dx, y: a.y + u * dy };
    const d = dist(p, q);
    if (d < bestD) {
      bestD = d;
      nearest = q;
      bestT = total > 0 ? (acc + u * seg) / total : 0;
    }
    acc += seg;
  }
  const gap =
    (p.x - nearest.x) * outward.x + (p.y - nearest.y) * outward.y;
  return { gap, nearest, t: bestT };
}

function fmt(p: Point): string {
  return `(${f3(p.x)}, ${f3(p.y)})`;
}

/**
 * Reconstruct the PRE-splice-fix cut (old buggy splice) for before/after.
 * Inline copy of the previous logic — does not touch production code.
 */
function reconstructPreSpliceCut(
  saPiece: PatternPiece,
  depths: CasingDepths,
): Point[] | null {
  const col = collapse(saPiece.outline);
  const oldCut = saPiece.cuttingOutline;
  if (!oldCut || oldCut.length !== col.length) return null;
  const run = findWaistRun(col);
  if (!run) return null;
  const waist: Point[] = [];
  for (let i = run.start; i <= run.end; i++) waist.push({ ...col[i]!.at });
  const clockwise = signedArea(col) > 0;
  const up = waistOutward(waist, clockwise);
  const cutTop = waist.map((p) => ({
    x: p.x + up.x * depths.totalExtension,
    y: p.y + up.y * depths.totalExtension,
  }));
  const newCut: Point[] = [];
  for (const p of cutTop) newCut.push(p);
  for (let i = run.end + 1; i < col.length; i++) newCut.push(oldCut[i]!);
  for (let i = 0; i < run.start; i++) newCut.push(oldCut[i]!);
  return newCut;
}

function waistNetPts(piece: PatternPiece): Point[] {
  const col = collapse(piece.outline);
  const run = findWaistRun(col)!;
  const pts: Point[] = [];
  for (let i = run.start; i <= run.end; i++) pts.push({ ...col[i]!.at });
  return pts;
}

function analysePiece(
  label: string,
  saPiece: PatternPiece,
  casedPiece: PatternPiece,
  depths: CasingDepths,
  sampleEvery = 4,
) {
  const col = collapse(casedPiece.outline);
  const run = findWaistRun(col)!;
  const waist = waistNetPts(casedPiece);
  const clockwise = signedArea(col) > 0;
  const up = waistOutward(waist, clockwise);
  const cut = casedPiece.cuttingOutline!;
  const saCut = saPiece.cuttingOutline!;
  const waistLen = run.end - run.start + 1;

  console.log(`\n── ${label} ──`);
  console.log(
    `  waist run [${run.start}..${run.end}] n=${waist.length}; ` +
      `cut len=${cut.length} (sa was ${saCut.length}); up≈(${f3(up.x)}, ${f3(up.y)}); ` +
      `expect SA=${SA} casingExt=${depths.totalExtension}`,
  );

  // --- 1. Gap along waist: sample net waist, measure to nearest cut point
  //     along outward (or distance from net sample to mapped cut if 1:1 zone)
  console.log(
    "\n  [1] Perp gap net→cut along waist (positive = cut outward of net):",
  );
  console.log(
    "  i_net   t     net.at              nearestCut           gap",
  );
  const gaps: { i: number; t: number; gap: number; net: Point; cut: Point }[] =
    [];
  for (let i = run.start; i <= run.end; i += sampleEvery) {
    const net = col[i]!.at;
    // Prefer cut sample that maps from this net vertex (raw-top for waist run)
    const cutIdx = casedPiece.netToCutIndex
      ? casedPiece.netToCutIndex[
          // raw outline index: find first raw with this collapsed point
          casedPiece.outline.findIndex(
            (o) => dist(o.at, net) < 0.05 && o.role === "waist",
          )
        ]
      : undefined;
    let cutPt: Point;
    if (
      cutIdx != null &&
      cutIdx >= 0 &&
      cutIdx < cut.length &&
      Number.isFinite(cutIdx)
    ) {
      cutPt = cut[cutIdx]!;
    } else {
      // fallback: cutTop index in newCut layout (run.start===0)
      const local = i - run.start;
      cutPt = cut[local] ?? cut[0]!;
    }
    const { gap, t } = perpGapToWaist(cutPt, waist, up);
    gaps.push({ i, t, gap, net, cut: cutPt });
    const flag =
      gap < SA - 1.5 ? "  ← LOW" : gap < 1 ? "  ← MERGE(~0)" : "";
    console.log(
      `  ${String(i).padStart(5)}  ${f3(t).padStart(5)}  ${fmt(net).padEnd(20)} ${fmt(cutPt).padEnd(20)} ${f3(gap).padStart(7)}${flag}`,
    );
  }
  // Also sample last waist vertex always
  if ((run.end - run.start) % sampleEvery !== 0) {
    const i = run.end;
    const net = col[i]!.at;
    const cutPt = cut[waistLen - 1]!;
    const { gap, t } = perpGapToWaist(cutPt, waist, up);
    gaps.push({ i, t, gap, net, cut: cutPt });
    const flag =
      gap < SA - 1.5 ? "  ← LOW" : gap < 1 ? "  ← MERGE(~0)" : "";
    console.log(
      `  ${String(i).padStart(5)}  ${f3(t).padStart(5)}  ${fmt(net).padEnd(20)} ${fmt(cutPt).padEnd(20)} ${f3(gap).padStart(7)}${flag}`,
    );
  }

  const minGap = Math.min(...gaps.map((g) => g.gap));
  const maxGap = Math.max(...gaps.map((g) => g.gap));
  console.log(
    `  waist-mapped cut gaps: min=${f3(minGap)} max=${f3(maxGap)} ` +
      `(raw-top should be ~${depths.totalExtension}, not SA)`,
  );

  // --- Also: gap from EVERY cut vertex near the waist top to the net waist
  console.log(
    "\n  [1b] All cut vertices with |gap| < totalExt+5 near waist (catch collapse):",
  );
  const nearWaist: {
    idx: number;
    p: Point;
    gap: number;
    tag: string;
  }[] = [];
  for (let i = 0; i < cut.length; i++) {
    const p = cut[i]!;
    const { gap } = perpGapToWaist(p, waist, up);
    if (gap < depths.totalExtension + 5 && gap > -5) {
      let tag = "other";
      if (i < waistLen) tag = "cutTop/raw";
      else if (i === waistLen) tag = "REJOIN endMitre?";
      else if (i === cut.length - 1) tag = "REJOIN startMitre?";
      nearWaist.push({ idx: i, p, gap, tag });
    }
  }
  // Print those with gap < SA+1 (interesting) or tagged rejoin
  for (const v of nearWaist) {
    if (v.gap < SA + 2 || v.tag.startsWith("REJOIN") || v.gap < 1) {
      const flag =
        Math.abs(v.gap) < 1
          ? "  ← COLLAPSE onto net"
          : v.gap < SA - 1
            ? "  ← below SA"
            : "";
      console.log(
        `  cut[${v.idx}] ${v.tag.padEnd(18)} ${fmt(v.p)} gap=${f3(v.gap)}${flag}`,
      );
    }
  }

  // --- 2. Explicit rejoin / boundary vertices
  console.log("\n  [2] Splice rejoin + boundary vertices:");
  const endMitreSa = saCut[run.end]!;
  const startMitreSa = saCut[run.start]!;
  const rawTopEnd = cut[waistLen - 1]!;
  const maybeEndMitre = cut[waistLen];
  const maybeStartMitre = cut[cut.length - 1];

  const reportV = (name: string, p: Point | undefined) => {
    if (!p) {
      console.log(`  ${name}: (absent)`);
      return;
    }
    const { gap } = perpGapToWaist(p, waist, up);
    const onNet = Math.abs(gap) < 1;
    console.log(
      `  ${name.padEnd(22)} ${fmt(p)}  perpGap=${f3(gap)}` +
        (onNet ? "  ← ON NET (offset≈0)" : gap < SA - 1 ? "  ← < SA" : ""),
    );
  };
  reportV("net waist CF", waist[0]);
  reportV("net waist end", waist[waist.length - 1]);
  reportV("saCut[run.start] (CF)", startMitreSa);
  reportV("saCut[run.end]", endMitreSa);
  reportV("cased cutTop[0]", cut[0]);
  reportV("cased cutTop[end]", rawTopEnd);
  reportV("cased cut[waistLen]", maybeEndMitre);
  reportV("cased cut[last]", maybeStartMitre);

  // Confirm rejoin identity
  if (maybeEndMitre && dist(maybeEndMitre, endMitreSa) < 0.5) {
    console.log(
      `  cut[waistLen] ≡ saCut[run.end] (re-inserted end mitre) gap=${f3(perpGapToWaist(maybeEndMitre, waist, up).gap)}`,
    );
  }
  if (maybeStartMitre && dist(maybeStartMitre, startMitreSa) < 0.5) {
    console.log(
      `  cut[last] ≡ saCut[run.start] (re-inserted CF mitre) gap=${f3(perpGapToWaist(maybeStartMitre, waist, up).gap)}`,
    );
  }

  // --- 3. Casing raw-top offset
  console.log("\n  [3] Casing raw-top offset (mid + ends):");
  for (const [name, idx] of [
    ["cutTop[0]", 0],
    ["cutTop[mid]", Math.floor(waistLen / 2)],
    ["cutTop[end]", waistLen - 1],
  ] as const) {
    const p = cut[idx]!;
    const { gap } = perpGapToWaist(p, waist, up);
    console.log(
      `  ${name}: ${fmt(p)} gap=${f3(gap)} (expect ~${depths.totalExtension})`,
    );
  }

  // --- 5. Before/after splice (reconstructed old splice)
  const pre = reconstructPreSpliceCut(saPiece, depths);
  if (pre) {
    console.log("\n  [5] Pre-splice-fix reconstruction (old buggy splice):");
    const preEnd = pre[waistLen - 1]!;
    const preNext = pre[waistLen]!;
    const gEnd = perpGapToWaist(preEnd, waist, up).gap;
    const gNext = perpGapToWaist(preNext, waist, up).gap;
    console.log(
      `  old: cutTop[end]=${fmt(preEnd)} gap=${f3(gEnd)}; ` +
        `oldCut[end+1]=${fmt(preNext)} gap=${f3(gNext)}; chord=${f3(dist(preEnd, preNext))}`,
    );
    const postMitre = maybeEndMitre!;
    const postNext = cut[waistLen + 1]!;
    console.log(
      `  new: cutTop[end]=${fmt(rawTopEnd)} gap=${f3(perpGapToWaist(rawTopEnd, waist, up).gap)}; ` +
        `endMitre=${fmt(postMitre)} gap=${f3(perpGapToWaist(postMitre, waist, up).gap)}; ` +
        `next=${fmt(postNext)} gap=${f3(perpGapToWaist(postNext, waist, up).gap)}`,
    );
    // Min gap among cut verts that lie "along the top" (gap between SA-2 and ext+2)
    const topBand = (pts: Point[]) =>
      pts
        .map((p) => perpGapToWaist(p, waist, up).gap)
        .filter((g) => g > -1 && g < depths.totalExtension + 2);
    const preBand = topBand(pre);
    const postBand = topBand(cut);
    console.log(
      `  pre-splice cut gaps in waist band: min=${f3(Math.min(...preBand))} max=${f3(Math.max(...preBand))}`,
    );
    console.log(
      `  post-splice cut gaps in waist band: min=${f3(Math.min(...postBand))} max=${f3(Math.max(...postBand))}`,
    );
    const preHadMerge = preBand.some((g) => g < 1);
    const postHasMerge = postBand.some((g) => g < 1);
    const preHadBelowSa = preBand.some((g) => g < SA - 1 && g > 1);
    const postHasBelowSa = postBand.some((g) => g < SA - 1 && g > 1);
    console.log(
      `  merge(gap<1): pre=${preHadMerge} post=${postHasMerge}; ` +
        `below-SA(1..9): pre=${preHadBelowSa} post=${postHasBelowSa}`,
    );
  } else {
    console.log("\n  [5] Pre-splice reconstruction: not recoverable from SA piece");
  }

  return { gaps, up, waist, cut, run, waistLen };
}

console.log("=== DIAG: front waist cut↔net merge ===\n");
console.log(
  `SA=${SA} mm. After casing, waist cutTop gap should be totalExtension; ` +
    `rejoin mitres should sit at ~SA. Gap≈0 = collapse onto stitch line.\n`,
);

// Focus detail: Helen w25 pocket on + off; then summary table
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  for (const pocket of ["slant", "none"] as const) {
    const style = resolveCargo(body, pocket);
    for (const w of WIDTHS) {
      const depths = resolveCasingDepths(w);
      const net = draftTrousers(body, style);
      const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
      const cased = applyTrouserWaistCasingToPattern(sa, depths);
      const saFront = sa.pieces.find((p) => p.name === "Trouser front")!;
      const cFront = cased.pieces.find((p) => p.name === "Trouser front")!;
      analysePiece(
        `Helen front pocket=${pocket} w${w}`,
        saFront,
        cFront,
        depths,
        pocket === "slant" && w === 25 ? 5 : 20,
      );

      // Back briefly at Helen w25
      if (w === 25 && pocket === "slant") {
        const saBack = sa.pieces.find((p) => p.name === "Trouser back")!;
        const cBack = cased.pieces.find((p) => p.name === "Trouser back")!;
        analysePiece(
          `Helen BACK pocket=slant w25 (front-only check)`,
          saBack,
          cBack,
          depths,
          15,
        );
      }
    }
  }
}

// Summary table across sizes
console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║ SUMMARY — min cut gap in waist band (Helen + sizes @25)      ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");
console.log(
  "body            pocket   minGap  maxGap  rejoinEndGap  rejoinCfGap  rawTopGap",
);

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  for (const pocket of ["slant", "none"] as const) {
    const style = resolveCargo(body, pocket);
    const depths = resolveCasingDepths(25);
    const net = draftTrousers(body, style);
    const saPat = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
    const cased = applyTrouserWaistCasingToPattern(saPat, depths);
    const saP = saPat.pieces.find((p) => p.name === "Trouser front")!;
    const cP = cased.pieces.find((p) => p.name === "Trouser front")!;
    const col = collapse(cP.outline);
    const run = findWaistRun(col)!;
    const waist = waistNetPts(cP);
    const up = waistOutward(waist, signedArea(col) > 0);
    const cut = cP.cuttingOutline!;
    const waistLen = run.end - run.start + 1;
    const bandGaps = cut
      .map((p) => perpGapToWaist(p, waist, up).gap)
      .filter((g) => g > -1 && g < depths.totalExtension + 2);
    const rejoinEnd = cut[waistLen];
    const rejoinCf = cut[cut.length - 1];
    const raw = cut[Math.floor(waistLen / 2)]!;
    console.log(
      `${bod.name.padEnd(14)} ${pocket.padEnd(6)}  ${f3(Math.min(...bandGaps)).padStart(6)}  ${f3(Math.max(...bandGaps)).padStart(6)}  ${f3(rejoinEnd ? perpGapToWaist(rejoinEnd, waist, up).gap : NaN).padStart(12)}  ${f3(rejoinCf ? perpGapToWaist(rejoinCf, waist, up).gap : NaN).padStart(11)}  ${f3(perpGapToWaist(raw, waist, up).gap).padStart(9)}`,
    );
    void saP;
  }
}

console.log("\n=== HEADLINE ===\n");
console.log(
  "See tables above. Collapse = perpGap ≈ 0 on a cut vertex that should be",
);
console.log(
  "outward of the net waist. Rejoin mitres at ~SA are expected (not a merge);",
);
console.log(
  "raw-top at ~totalExtension is correct. A true merge is gap→0 on the top edge.",
);
console.log("\n=== END DIAG (no code changed) ===\n");
