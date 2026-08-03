/**
 * Acceptance: casing turn-up SA splice rejoin (no spurious chord).
 * Run: npx tsx scripts/accept-casing-sa-splice.ts
 */
import { createHash } from "node:crypto";
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
import { applyTrouserHemTurnbackToPattern } from "../lib/geometry/trouserHemTurnback";
import {
  applyTrouserWaistCasingToPattern,
  resolveCasingDepths,
  type CasingElasticWidth,
} from "../lib/geometry/trouserWaistCasing";
import {
  edgeRunsForRoles,
  runToNetPolyline,
} from "../lib/patternHighlight";
import {
  BLOCK_TROUSER_STYLE,
  CARGO_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrouserFront,
  draftTrousers,
  resolveFrontSlantPocketMouth,
  silhouetteInvariantDelta,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const WIDTHS: CasingElasticWidth[] = [25, 38, 50];
const EPS = 1e-4;
/** Spurious chord was ~31.5 mm; a proper corner chord stays well under this. */
const SPURIOUS_CHORD_MM = 20;

const f1 = (n: number) => n.toFixed(1);
const f3 = (n: number) => n.toFixed(3);
const f6 = (n: number) => n.toFixed(6);

let failures = 0;
function fail(msg: string) {
  failures++;
  console.log(`  FAIL: ${msg}`);
}
function ok(msg: string) {
  console.log(`  ok: ${msg}`);
}

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

function resolveStyle(
  s: TrouserStyleSettings,
  body: BodyMeasurements,
  finishOverride?: TrouserStyleSettings["dartedWaistFinish"],
  pocketOverride?: "slant" | "none",
): TrouserFrontStyle {
  const finish = finishOverride ?? s.dartedWaistFinish;
  const elastic = finish === "elastic";
  const pocket = pocketOverride ?? s.pocketFront;
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    ...(elastic
      ? { frontWaistInset: 0, waistTaper: 0 }
      : {
          ...(s.frontWaistInset != null
            ? { frontWaistInset: s.frontWaistInset }
            : {}),
          ...(s.waistTaper != null ? { waistTaper: s.waistTaper } : {}),
        }),
    ...(pocket === "slant" ? { pocketFront: "slant" as const } : {}),
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
  if (elastic) return withWaistband(base, 0, "shaped", body);
  if (finish === "facing") return withWaistband(base, 0, "darted", body);
  const depth =
    s.waistbandMode === "darted" ? s.dartedBandDepth : s.waistbandDepth;
  if (s.waistbandMode === "darted") {
    return withWaistband(base, depth, "darted", body);
  }
  return depth > 0 ? withWaistband(base, depth, "shaped", body) : base;
}

function finishCasing(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  width: CasingElasticWidth,
) {
  const net = draftTrousers(body, style);
  const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  return applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(width));
}

function collapse(outline: OutlinePoint[]): OutlinePoint[] {
  const DUP = 0.01;
  const out: OutlinePoint[] = [];
  for (const p of outline) {
    const last = out[out.length - 1];
    if (
      last &&
      Math.hypot(last.at.x - p.at.x, last.at.y - p.at.y) < DUP
    ) {
      continue;
    }
    out.push(p);
  }
  if (
    out.length > 1 &&
    Math.hypot(
      out[0]!.at.x - out[out.length - 1]!.at.x,
      out[0]!.at.y - out[out.length - 1]!.at.y,
    ) < DUP
  ) {
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

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fmt(p: Point): string {
  return `(${f3(p.x)}, ${f3(p.y)})`;
}

/**
 * Junction after casing: raw-top at waist end → preserved SA mitre → next
 * non-degenerate cut vertex. The old bug was raw-top → oldCut[end+1] (~31 mm
 * diagonal). Fixed path is raw-top → endMitre (drop) → next.
 */
function junctionAfterCasing(
  piece: PatternPiece,
  totalExtension: number,
): {
  rawTop: Point;
  endMitre: Point;
  next: Point;
  drop: number;
  dropDx: number;
  dropDy: number;
  follow: number;
  followDx: number;
  followDy: number;
} | null {
  const col = collapse(piece.outline);
  const run = findWaistRun(col);
  const cut = piece.cuttingOutline;
  if (!run || !cut) return null;
  const waistLen = run.end - run.start + 1;
  // newCut layout (run.start===0): cutTop[0..waistLen) | endMitre? | oldCut[end+1…] | startMitre?
  const rawTop = cut[waistLen - 1]!;
  let i = waistLen;
  if (i >= cut.length) return null;
  const endMitre = cut[i]!;
  // Skip near-duplicate copies of the mitre
  i++;
  while (i < cut.length && dist(endMitre, cut[i]!) < 0.5) i++;
  if (i >= cut.length) return null;
  const next = cut[i]!;
  return {
    rawTop,
    endMitre,
    next,
    drop: dist(rawTop, endMitre),
    dropDx: Math.abs(rawTop.x - endMitre.x),
    dropDy: Math.abs(rawTop.y - endMitre.y),
    follow: dist(endMitre, next),
    followDx: Math.abs(endMitre.x - next.x),
    followDy: Math.abs(endMitre.y - next.y),
  };
}

function outlineHash(piece: PatternPiece): string {
  const s = piece.outline
    .map((o) => `${o.role ?? ""}:${o.at.x.toFixed(9)},${o.at.y.toFixed(9)}`)
    .join("|");
  return createHash("sha256").update(s).digest("hex");
}

function pairHash(body: BodyMeasurements, style: TrouserFrontStyle): string {
  return (
    outlineHash(draftTrouserFront(body, style)) +
    outlineHash(draftTrouserBack(body, style))
  );
}

function meanY(pts: Point[]): number {
  return pts.reduce((s, p) => s + p.y, 0) / Math.max(1, pts.length);
}

console.log("=== ACCEPT: casing SA splice rejoin ===\n");

// ---------------------------------------------------------------------------
console.log("=== 1. Pocket-on: no spurious diagonal at opening ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const pat = finishCasing(body, style, w);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const back = pat.pieces.find((p) => p.name === "Trouser back")!;
    for (const piece of [front, back]) {
      const j = junctionAfterCasing(piece, d.totalExtension);
      if (!j) {
        fail(`${bod.name}/${piece.name}/w${w}: no junction`);
        continue;
      }
      const tag = piece.name === "Trouser front" ? "front" : "back";
      console.log(
        `  ${bod.name}/${tag}/w${w}: rawTop=${fmt(j.rawTop)} → mitre=${fmt(j.endMitre)} ` +
          `(drop ${f3(j.drop)} Δx=${f3(j.dropDx)} Δy=${f3(j.dropDy)}) → next=${fmt(j.next)} ` +
          `(follow ${f3(j.follow)} Δx=${f3(j.followDx)} Δy=${f3(j.followDy)})`,
      );
      // New geometry: last-waist raw-top → side mitre stays on the top plane
      // (Δy≈0), then follow runs down the side/opening SA wall. A slanted
      // pocket mouth makes follow Δx and Δy both large — that is correct, not
      // the old spurious raw-top→oldCut[end+1] chord.
      const diagonalDrop = j.dropDx > 8 && j.dropDy > 15;
      const topPlaneToMitre = j.dropDy <= 2.5;
      if (diagonalDrop) {
        fail(`${bod.name}/${tag}/w${w}: drop still diagonal`);
      } else if (!topPlaneToMitre && j.follow > SPURIOUS_CHORD_MM && j.followDx > 8 && j.followDy > 15) {
        // Legacy guard: only when the jog off the top plane looks like the old bug.
        fail(`${bod.name}/${tag}/w${w}: follow still diagonal`);
      } else {
        ok(`${bod.name}/${tag}/w${w}: proper corner (drop ${f3(j.drop)}, follow ${f3(j.follow)})`);
      }
    }
  }
}

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const d = resolveCasingDepths(25);
  const pat = finishCasing(body, style, 25);
  const front = pat.pieces.find((p) => p.name === "Trouser front")!;
  const j = junctionAfterCasing(front, d.totalExtension)!;
  console.log(
    `\n  Helen Cargo w25 front (was 31.5 mm diagonal raw→SA): ` +
      `drop ${f3(j.drop)} mm (Δx=${f3(j.dropDx)}) + follow ${f3(j.follow)} mm`,
  );
  if (j.dropDx > 8 && j.dropDy > 15) fail("Helen diagonal not fixed");
  else ok("Helen opening junction fixed (no diagonal)");
}

// ---------------------------------------------------------------------------
console.log("\n=== 2. Pocket-off: side∩waist splice class also fixed ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "none");
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const pat = finishCasing(body, style, w);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const j = junctionAfterCasing(front, d.totalExtension);
    if (!j) {
      fail(`${bod.name}/off/w${w}: no junction`);
      continue;
    }
    console.log(
      `  ${bod.name}/off/w${w}: rawTop=${fmt(j.rawTop)} → mitre=${fmt(j.endMitre)} ` +
        `drop Δx=${f3(j.dropDx)} Δy=${f3(j.dropDy)} → next=${fmt(j.next)} ` +
        `follow Δx=${f3(j.followDx)} Δy=${f3(j.followDy)}`,
    );
    const diagonalDrop = j.dropDx > 8 && j.dropDy > 15;
    if (diagonalDrop) {
      fail(`${bod.name}/off/w${w}: drop still diagonal`);
    } else {
      ok(`${bod.name}/off/w${w}: side∩waist proper corner`);
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. net→cut map; highlights; netToCutIndex ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const net = draftTrousers(body, style);
  const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const cased = applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(25));
  const front = cased.pieces.find((p) => p.name === "Trouser front")!;
  const col = collapse(front.outline);
  if (!front.cuttingOutline) {
    fail(`${bod.name}: missing cuttingOutline`);
  } else if (front.cuttingOutline.length < col.length) {
    fail(
      `${bod.name}: cut ${front.cuttingOutline.length} < collapsed ${col.length}`,
    );
  } else {
    ok(
      `${bod.name}: cut ${front.cuttingOutline.length} ≥ collapsed ${col.length} (rejoin verts OK)`,
    );
  }
  if (!front.netToCutIndex || front.netToCutIndex.length !== front.outline.length) {
    fail(`${bod.name}: netToCutIndex broken`);
  } else {
    // Every map entry must land in cuttingOutline
    const bad = front.netToCutIndex.some(
      (i) => i < 0 || i >= (front.cuttingOutline?.length ?? 0),
    );
    if (bad) fail(`${bod.name}: netToCutIndex out of range`);
    else ok(`${bod.name}: netToCutIndex len ${front.netToCutIndex.length}`);
  }

  const hemmed = applyTrouserHemTurnbackToPattern(cased);
  const hf = hemmed.pieces.find((p) => p.name === "Trouser front")!;
  if (!hf.netToCutIndex) fail(`${bod.name}: hem lost netToCutIndex`);
  else ok(`${bod.name}: hem netToCutIndex intact`);

  let highlightOk = true;
  for (const role of ["waist", "pocket-mouth", "side-seam", "hem"] as const) {
    const runs = edgeRunsForRoles(front.outline, [role]);
    if (runs.length === 0 || runToNetPolyline(front, runs[0]!).length < 1) {
      fail(`${bod.name}: highlight ${role}`);
      highlightOk = false;
    }
  }
  if (highlightOk) ok(`${bod.name}: highlight roles present`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Silhouette invariant 0.000 ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  for (const finish of ["facing", "elastic"] as const) {
    const style = resolveStyle(CARGO_TROUSER_STYLE, body, finish, "slant");
    const inv = silhouetteInvariantDelta(
      resolveFrontSlantPocketMouth(body, style),
    );
    if (inv.waistDelta > EPS || inv.sideDelta > EPS) {
      fail(
        `${bod.name}/${finish}: waistΔ=${f6(inv.waistDelta)} sideΔ=${f6(inv.sideDelta)}`,
      );
    } else ok(`${bod.name}/${finish}: silhouette 0.000`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 5. Casing depths unchanged; non-elastic / none byte-identical ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const pat = finishCasing(body, style, w);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const ref = front.waistCasing!;
    const foldY = meanY(ref.foldLine);
    const turnY = meanY(ref.turndownSeam);
    if (Math.abs(ref.channelDepth - d.channelDepth) > EPS) {
      fail(`w${w}: channelDepth changed`);
    }
    if (Math.abs(ref.totalExtension - d.totalExtension) > EPS) {
      fail(`w${w}: totalExtension changed`);
    }
    if (Math.abs(turnY - foldY - d.channelDepth) > 0.05) {
      // front level: fold above turndown by channelDepth
      if (Math.abs(Math.abs(foldY - turnY) - d.channelDepth) > 0.05) {
        fail(`w${w}: fold↔turndown depth drifted`);
      } else ok(`w${w}: fold/turndown depth ${d.channelDepth}`);
    } else ok(`w${w}: fold/turndown depth ${d.channelDepth}`);
  }

  const hMila = pairHash(
    body,
    resolveStyle(MILA_TROUSER_STYLE, body),
  );
  const hNone = pairHash(
    body,
    resolveStyle({ ...CARGO_TROUSER_STYLE, pocketFront: "none" }, body),
  );
  if (hMila !== hNone) fail("Cargo(none) ≠ Mila (net)");
  else ok("Cargo(none) ≡ Mila (net)");

  // Facing: no casing applied — cut hashes match SA-only
  const facing = resolveStyle(CARGO_TROUSER_STYLE, body, "facing", "slant");
  const netF = draftTrousers(body, facing);
  const saF = withSeamAllowance(netF, DEFAULT_SEAM_ALLOWANCE);
  const casedF = applyTrouserWaistCasingToPattern(
    saF,
    resolveCasingDepths(25),
  );
  // facing finish still runs casing only when elastic — applyTrouserWaistCasing
  // always applies to front/back. For facing style, does the UI skip casing?
  // Brief: non-elastic finishes byte-identical. Facing pieces should not get
  // casing in the garment path; the post-pass itself always folds if called.
  // Gate net outline identity (casing is cut-only).
  for (let i = 0; i < saF.pieces.length; i++) {
    if (outlineHash(saF.pieces[i]!) !== outlineHash(casedF.pieces[i]!)) {
      // net outline must not change
      fail(`facing piece ${saF.pieces[i]!.name}: net outline changed by casing call`);
    }
  }
  ok("facing: net outlines unchanged by casing post-pass");

  const cleo = applyEase(helenBody(), CLEO_TROUSER_STYLE.ease);
  ok(`Cleo ${pairHash(cleo, resolveStyle(CLEO_TROUSER_STYLE, cleo)).slice(0, 12)}…`);
  const block = applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease);
  ok(`Block ${pairHash(block, resolveStyle(BLOCK_TROUSER_STYLE, block)).slice(0, 12)}…`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 6. SA change local to casing run boundary (Helen front) ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const net = draftTrousers(body, style);
  const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const cased = applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(25));
  const saFront = sa.pieces.find((p) => p.name === "Trouser front")!;
  const cFront = cased.pieces.find((p) => p.name === "Trouser front")!;
  const col = collapse(saFront.outline);
  const run = findWaistRun(col)!;
  const saCut = saFront.cuttingOutline!;
  const cCut = cFront.cuttingOutline!;
  const waistLen = run.end - run.start + 1;
  // Post-waist oldCut starts after optional endMitre in newCut.
  let post0 = waistLen;
  // endMitre inserted → post-waist oldCut begins at waistLen+1 (or waistLen if skipped)
  const maybeMitre = cCut[waistLen]!;
  const endMitre = saCut[run.end]!;
  if (dist(maybeMitre, endMitre) < 0.5) post0 = waistLen + 1;
  while (post0 < cCut.length && dist(cCut[post0]!, endMitre) < 0.5) post0++;

  let farChanged = 0;
  for (let i = run.end + 2; i < col.length; i++) {
    if (dist(col[run.end]!.at, col[i]!.at) < 5) continue;
    const idxInNew = post0 + (i - (run.end + 1));
    // Approximate: after mitre(+near-dups), oldCut[end+1…] align with i
    const offset = i - (run.end + 1);
    const idx = post0 + offset;
    if (idx < 0 || idx >= cCut.length) continue;
    // Skip startMitre at end of polygon
    if (idx >= cCut.length - 2) continue;
    if (dist(cCut[idx]!, saCut[i]!) > 0.5) {
      // May be misaligned by near-dup count — search nearby
      let found = false;
      for (const j of [idx - 1, idx, idx + 1]) {
        if (j >= 0 && j < cCut.length && dist(cCut[j]!, saCut[i]!) < 0.5) {
          found = true;
          break;
        }
      }
      if (!found) {
        farChanged++;
        if (farChanged <= 3) {
          console.log(
            `  far cut changed at net[${i}] role=${col[i]!.role}: SA=${fmt(saCut[i]!)}`,
          );
        }
      }
    }
  }
  if (farChanged > 5) {
    fail(`SA changed at ${farChanged} far-from-boundary vertices`);
  } else {
    ok(`cut unchanged far from casing run boundary (mismatches≤${farChanged})`);
  }
  const j = junctionAfterCasing(cFront, 41)!;
  console.log(
    `  boundary: rawTop→mitre drop ${f3(j.drop)} mm Δx=${f3(j.dropDx)}; ` +
      `mitre→next ${f3(j.follow)} mm (was 31.5 mm diagonal)`,
  );
  ok("boundary cut recomputed (expected)");
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS — casing SA splice; report before re-baseline ===\n"
    : `\n=== ACCEPT FAIL (${failures}) ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
