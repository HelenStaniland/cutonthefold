/**
 * Acceptance: casing side edges carry normal SA (~10 mm), top unchanged.
 * Run: npx tsx scripts/accept-casing-side-sa.ts
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
const SA = DEFAULT_SEAM_ALLOWANCE.seam;
const EPS = 1e-4;
/** Perp gap along a wall may vary slightly at mitres; keep near SA. */
const GAP_TOL = 1.5;
const STEP_TOL = 1.0;

const f1 = (n: number) => n.toFixed(1);
const f3 = (n: number) => n.toFixed(3);

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

function unit(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function signedArea(outline: OutlinePoint[]): number {
  let a = 0;
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i]!.at;
    const q = outline[(i + 1) % outline.length]!.at;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function waistUp(waist: Point[], clockwise: boolean): Point {
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < waist.length - 1; i++) {
    const t = unit(
      waist[i + 1]!.x - waist[i]!.x,
      waist[i + 1]!.y - waist[i]!.y,
    );
    const n = clockwise ? { x: t.y, y: -t.x } : { x: -t.y, y: t.x };
    nx += n.x;
    ny += n.y;
  }
  const u = unit(nx, ny);
  const mid = waist[Math.floor(waist.length / 2)]!;
  if (mid.y + u.y * 10 > mid.y + 0.5) return { x: -u.x, y: -u.y };
  return u;
}

function distToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

function sampleSeg(a: Point, b: Point, n: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function outlineHash(piece: PatternPiece): string {
  return createHash("sha256")
    .update(
      piece.outline
        .map((o) => `${o.role}:${o.at.x.toFixed(9)},${o.at.y.toFixed(9)}`)
        .join("|"),
    )
    .digest("hex");
}

function pairHash(body: BodyMeasurements, style: TrouserFrontStyle): string {
  return (
    outlineHash(draftTrouserFront(body, style)) +
    outlineHash(draftTrouserBack(body, style))
  );
}

function finish(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  w: CasingElasticWidth,
) {
  const net = draftTrousers(body, style);
  const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  return applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(w));
}

function stats(gaps: number[]): { min: number; max: number; mean: number } {
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  return { min, max, mean };
}

/**
 * Perp gaps along CF/CB wall (waist-SA → top mitre) and side end-cap
 * (top mitre → waist-SA), plus top mid gap and top-plane step at corners.
 */
function wallReport(piece: PatternPiece): {
  topGap: number;
  stepStart: number;
  stepEnd: number;
  cfGaps: number[];
  sideGaps: number[];
} | null {
  const col = collapse(piece.outline);
  const run = findWaistRun(col);
  const cut = piece.cuttingOutline;
  const ref = piece.waistCasing;
  if (!run || !cut || !ref) return null;
  const waist: Point[] = [];
  for (let i = run.start; i <= run.end; i++) waist.push(col[i]!.at);
  const clockwise = signedArea(col) > 0;
  const up = waistUp(waist, clockwise);
  const topCount = waist.length;
  const startCorner = cut[0]!;
  // cutTop = startCorner + waist samples + side mitre → endCorner at topCount.
  const endCornerActual = cut[topCount]!;
  const afterTop = cut[topCount + 1]!;
  const cfWaistSa = cut[cut.length - 1]!;

  const n = col.length;
  const cfNetA = col[((run.start - 1) % n + n) % n]!.at;
  const cfNetB = waist[0]!;

  // Side-seam (or pocket-mouth) junction on the waist plane, when present.
  let sideNetA = waist[waist.length - 1]!;
  let sideNetB = col[(run.end + 1) % n]!.at;
  {
    const next = col[(run.end + 1) % n]!;
    if (
      Math.abs(next.at.y - sideNetA.y) < 2.5 &&
      (next.role === "side-seam" || next.role === "pocket-mouth")
    ) {
      sideNetA = next.at;
      sideNetB = col[(run.end + 2) % n]!.at;
    }
  }

  const cfGaps = sampleSeg(cfWaistSa, startCorner, 8).map((q) =>
    distToLine(q, cfNetA, cfNetB),
  );
  const sideGaps = sampleSeg(endCornerActual, afterTop, 8).map((q) =>
    distToLine(q, sideNetA, sideNetB),
  );

  const midTop = cut[Math.floor(topCount / 2)]!;
  const midNet = waist[Math.floor(waist.length / 2)]!;
  const topGap =
    (midTop.x - midNet.x) * up.x + (midTop.y - midNet.y) * up.y;

  const startTopAlong =
    (startCorner.x - cfNetB.x) * up.x + (startCorner.y - cfNetB.y) * up.y;
  const endTopAlong =
    (endCornerActual.x - sideNetA.x) * up.x +
    (endCornerActual.y - sideNetA.y) * up.y;
  return {
    topGap,
    stepStart: Math.abs(startTopAlong - ref.totalExtension),
    stepEnd: Math.abs(endTopAlong - ref.totalExtension),
    cfGaps,
    sideGaps,
  };
}

console.log("=== ACCEPT: casing sides carry normal SA ===\n");

console.log(
  "=== 1–2. Perp gaps ~10 mm on CF/CB + side; top = totalExtension; no step ===\n",
);

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  for (const pocket of ["slant", "none"] as const) {
    const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", pocket);
    for (const w of WIDTHS) {
      const d = resolveCasingDepths(w);
      const pat = finish(body, style, w);
      for (const name of ["Trouser front", "Trouser back"] as const) {
        const p = pat.pieces.find((x) => x.name === name)!;
        const g = wallReport(p);
        if (!g) {
          fail(`${bod.name}/${name}/p${pocket}/w${w}: no report`);
          continue;
        }
        const tag = `${bod.name}/${name === "Trouser front" ? "F" : "B"}/${pocket}/w${w}`;
        const cf = stats(g.cfGaps);
        const side = stats(g.sideGaps);
        console.log(
          `  ${tag}: top=${f3(g.topGap)} (exp ${d.totalExtension}) ` +
            `CF/CB ${f3(cf.min)}–${f3(cf.max)} side ${f3(side.min)}–${f3(side.max)} ` +
            `step ${f3(g.stepStart)}/${f3(g.stepEnd)}`,
        );
        let bad = false;
        if (Math.abs(g.topGap - d.totalExtension) > 1) {
          fail(`${tag}: top gap ${f3(g.topGap)} ≠ ${d.totalExtension}`);
          bad = true;
        }
        if (Math.abs(cf.mean - SA) > GAP_TOL || cf.max - cf.min > GAP_TOL) {
          fail(
            `${tag}: CF/CB gaps not ~${SA} (mean ${f3(cf.mean)}, span ${f3(cf.max - cf.min)})`,
          );
          bad = true;
        }
        if (
          Math.abs(side.mean - SA) > GAP_TOL ||
          side.max - side.min > GAP_TOL
        ) {
          fail(
            `${tag}: side gaps not ~${SA} (mean ${f3(side.mean)}, span ${f3(side.max - side.min)})`,
          );
          bad = true;
        }
        if (g.stepStart > STEP_TOL || g.stepEnd > STEP_TOL) {
          fail(
            `${tag}: top-plane step (start ${f3(g.stepStart)} end ${f3(g.stepEnd)})`,
          );
          bad = true;
        }
        if (!bad) {
          ok(`${tag}: top ${f1(d.totalExtension)} / walls ~${SA} / clean mitre`);
        }
      }
    }
  }
}

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "none");
  const pat = finish(body, style, 25);
  const front = pat.pieces.find((p) => p.name === "Trouser front")!;
  const g = wallReport(front)!;
  console.log(
    `\n  Helen front pocket-off w25: CF/CB ${f3(stats(g.cfGaps).mean)} ` +
      `side ${f3(stats(g.sideGaps).mean)} top ${f3(g.topGap)}`,
  );
}

console.log("\n=== 3. Fold / turndown / channel unchanged ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const pat = finish(body, style, w);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const ref = front.waistCasing!;
    if (
      ref.channelDepth !== d.channelDepth ||
      ref.totalExtension !== d.totalExtension
    ) {
      fail(`w${w}: depths changed`);
    } else ok(`w${w}: channel=${d.channelDepth} total=${d.totalExtension}`);
  }
}

console.log("\n=== 4. Net byte-identical; silhouette; maps ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const net = draftTrousers(body, style);
  const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const cased = applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(25));
  for (const name of ["Trouser front", "Trouser back"] as const) {
    const a = sa.pieces.find((p) => p.name === name)!;
    const b = cased.pieces.find((p) => p.name === name)!;
    if (outlineHash(a) !== outlineHash(b)) fail(`${bod.name}/${name}: net moved`);
    else ok(`${bod.name}/${name}: net unchanged`);
  }
  const front = cased.pieces.find((p) => p.name === "Trouser front")!;
  const col = collapse(front.outline);
  if (!front.cuttingOutline || front.cuttingOutline.length < col.length) {
    fail(`${bod.name}: cut too short`);
  } else ok(`${bod.name}: cut ${front.cuttingOutline.length} ≥ net ${col.length}`);
  if (
    !front.netToCutIndex ||
    front.netToCutIndex.length !== front.outline.length
  ) {
    fail(`${bod.name}: netToCutIndex`);
  } else ok(`${bod.name}: netToCutIndex ok`);
  const hem = applyTrouserHemTurnbackToPattern(cased);
  if (!hem.pieces.find((p) => p.name === "Trouser front")!.netToCutIndex) {
    fail(`${bod.name}: hem lost map`);
  }
  const inv = silhouetteInvariantDelta(
    resolveFrontSlantPocketMouth(body, style),
  );
  if (inv.waistDelta > EPS || inv.sideDelta > EPS) {
    fail(`${bod.name}: silhouette`);
  } else ok(`${bod.name}: silhouette 0.000`);
  let hi = true;
  for (const role of ["waist", "pocket-mouth", "side-seam", "hem"] as const) {
    const runs = edgeRunsForRoles(front.outline, [role]);
    if (runs.length === 0 || runToNetPolyline(front, runs[0]!).length < 1) {
      hi = false;
    }
  }
  if (hi) ok(`${bod.name}: highlights`);
  else fail(`${bod.name}: highlights`);
}

console.log("\n=== 5. Non-elastic / none byte-identical ===\n");

{
  const body = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const hM = pairHash(body, resolveStyle(MILA_TROUSER_STYLE, body));
  const hN = pairHash(
    body,
    resolveStyle({ ...CARGO_TROUSER_STYLE, pocketFront: "none" }, body),
  );
  if (hM !== hN) fail("Cargo(none) ≠ Mila");
  else ok("Cargo(none) ≡ Mila");
  const cleo = applyEase(helenBody(), CLEO_TROUSER_STYLE.ease);
  ok(`Cleo ${pairHash(cleo, resolveStyle(CLEO_TROUSER_STYLE, cleo)).slice(0, 12)}…`);
  const block = applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease);
  ok(`Block ${pairHash(block, resolveStyle(BLOCK_TROUSER_STYLE, block)).slice(0, 12)}…`);
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS — casing side SA; report before re-baseline ===\n"
    : `\n=== ACCEPT FAIL (${failures}) ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
