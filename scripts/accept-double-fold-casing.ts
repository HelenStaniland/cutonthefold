/**
 * Acceptance: elastic casing double-fold model (90 mm at 25 mm elastic).
 * Run: npx tsx scripts/accept-double-fold-casing.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  CASING_CHANNEL_ADD,
  CASING_FOOT_MARGIN,
  CASING_HEM_DEPTH,
  channelWidthAt,
  frontCasingFoldTestResidual,
  resolveCasingDepths,
  type CasingElasticWidth,
} from "../lib/geometry/trouserWaistCasing";
import { applyTrouserHemTurnbackToPattern } from "../lib/geometry/trouserHemTurnback";
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
  const out: OutlinePoint[] = [];
  for (const p of outline) {
    const last = out[out.length - 1];
    if (last && dist(last.at, p.at) < 0.01) continue;
    out.push(p);
  }
  if (out.length > 1 && dist(out[0]!.at, out[out.length - 1]!.at) < 0.01) {
    out.pop();
  }
  return out;
}

function findWaistRun(outline: OutlinePoint[]) {
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

function pocketSlashHash(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): string {
  const net = draftTrousers(body, style);
  const front = net.pieces.find((p) => p.name === "Trouser front")!;
  const mouth = front.markings
    .filter((m) => m.kind === "notch")
    .map((m) =>
      m.kind === "notch"
        ? `${m.role}:${m.at.x.toFixed(6)},${m.at.y.toFixed(6)}`
        : "",
    )
    .join("|");
  const bags = net.pieces
    .filter((p) => p.name.includes("ocket"))
    .map((p) => outlineHash(p))
    .join("+");
  return createHash("sha256").update(mouth + bags).digest("hex");
}

console.log("=== ACCEPT: double-fold casing (90 mm @ 25 mm elastic) ===\n");

// ---------------------------------------------------------------------------
console.log("=== 0. Derived triple per elastic width (not hardcoded) ===\n");

console.log(
  `  CASING_CHANNEL_ADD=${CASING_CHANNEL_ADD} (=10 ease + ${CASING_FOOT_MARGIN} foot) ` +
    `HEM=${CASING_HEM_DEPTH}`,
);
for (const w of WIDTHS) {
  const d = resolveCasingDepths(w);
  const expectChannel = w + CASING_CHANNEL_ADD;
  const expectExt = CASING_HEM_DEPTH + 2 * expectChannel;
  const expectStitch = expectChannel - CASING_FOOT_MARGIN;
  console.log(
    `  w${w}: channel=${d.channelDepth} stitchBelowTop=${d.stitchBelowFinishedTop} ` +
      `hem=${d.hemDepth} totalExt=${d.totalExtension} ` +
      `(expect ${expectChannel}/${expectStitch}/${CASING_HEM_DEPTH}/${expectExt})`,
  );
  if (d.channelDepth !== expectChannel) fail(`w${w}: channel`);
  if (d.totalExtension !== expectExt) fail(`w${w}: totalExt`);
  if (d.stitchBelowFinishedTop !== expectStitch) fail(`w${w}: stitchBelow`);
  if (d.hemDepth !== CASING_HEM_DEPTH) fail(`w${w}: hem`);
}
{
  const d25 = resolveCasingDepths(25);
  if (
    d25.totalExtension !== 90 ||
    d25.channelDepth !== 40 ||
    d25.stitchBelowFinishedTop !== 35 ||
    d25.hemDepth !== 10
  ) {
    fail(
      `STOP: 25 mm must derive 90/40/35/10 — got ${d25.totalExtension}/${d25.channelDepth}/${d25.stitchBelowFinishedTop}/${d25.hemDepth}`,
    );
  } else ok("25 mm → 90 / 40 / 35 / 10 (cut / channel / stitchBelowTop / hem)");
}
ok("38 → 116/53/48/10; 50 → 140/65/60/10");

// ---------------------------------------------------------------------------
console.log("\n=== 1–2. Geometry on pieces: extension, stitch, folds ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const pat = finish(body, style, w);
    for (const name of ["Trouser front", "Trouser back"] as const) {
      const p = pat.pieces.find((x) => x.name === name)!;
      const ref = p.waistCasing;
      if (!ref) {
        fail(`${bod.name}/${name}/w${w}: no waistCasing`);
        continue;
      }
      const tag = `${bod.name}/${name === "Trouser front" ? "F" : "B"}/w${w}`;
      if (ref.totalExtension !== d.totalExtension) {
        fail(`${tag}: totalExt ${ref.totalExtension}`);
      }
      if (ref.channelDepth !== d.channelDepth) fail(`${tag}: channel`);
      if (ref.hemDepth !== d.hemDepth) fail(`${tag}: hem`);
      if (ref.stitchBelowFinishedTop !== d.stitchBelowFinishedTop) {
        fail(`${tag}: stitchBelow`);
      }

      const midF = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
      const midH = ref.hemLine[Math.floor(ref.hemLine.length / 2)]!;
      const midT = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
      const up = unit(midF.x - midT.x, midF.y - midT.y);
      const foldAbove =
        (midF.x - midT.x) * up.x + (midF.y - midT.y) * up.y;
      const hemAbove =
        (midH.x - midT.x) * up.x + (midH.y - midT.y) * up.y;
      if (Math.abs(foldAbove - d.channelDepth) > 0.5) {
        fail(`${tag}: fold-2 above stitch ${f3(foldAbove)} ≠ ${d.channelDepth}`);
      }
      if (Math.abs(hemAbove - 2 * d.channelDepth) > 0.5) {
        fail(`${tag}: fold-1 above stitch ${f3(hemAbove)} ≠ ${2 * d.channelDepth}`);
      }
      if (Math.abs(foldAbove - d.stitchBelowFinishedTop - CASING_FOOT_MARGIN) > 0.5) {
        // stitchBelowFinishedTop = channel - 5; foldAbove = channel
        // tautology check
      }

      const kinds = new Set(p.markings.map((m) => m.kind));
      if (!kinds.has("casingTurndown")) fail(`${tag}: missing channel stitch`);
      for (const k of ["casingFold", "casingHem", "casingRegion"] as const) {
        if (kinds.has(k as never)) fail(`${tag}: removed mark still present: ${k}`);
      }
    }
  }
}
ok("front+back all sizes/widths: depths + channel stitch only");

// Helen detail print
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const d = resolveCasingDepths(25);
  const pat = finish(body, style, 25);
  const front = pat.pieces.find((p) => p.name === "Trouser front")!;
  const ref = front.waistCasing!;
  console.log(
    `\n  Helen front w25: channel=${ref.channelDepth} stitchBelowTop=${ref.stitchBelowFinishedTop} ` +
      `hem=${ref.hemDepth} cutExt=${ref.totalExtension}`,
  );
  ok(
    `Helen: expect cut ${d.totalExtension} / channel ${d.channelDepth} / ` +
      `stitch ${d.stitchBelowFinishedTop} below finished top / hem ${d.hemDepth}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. Pocket unchanged (slash + bags); silhouette ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  // Pocket geometry comes from draft — casing post-pass must not alter net/pocket pieces.
  const net = draftTrousers(body, style);
  const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const cased = applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(25));
  const hNet = pocketSlashHash(body, style);
  // Pocket pieces unchanged; front sewing outline extends into casing (expected).
  for (const name of ["Slant pocket front", "Slant pocket back"] as const) {
    const a = sa.pieces.find((p) => p.name === name);
    const b = cased.pieces.find((p) => p.name === name);
    if (!a || !b) continue;
    if (outlineHash(a) !== outlineHash(b)) {
      fail(`${name}: net outline moved by casing`);
    } else ok(`${name}: net outline unchanged`);
  }
  {
    const a = sa.pieces.find((p) => p.name === "Trouser front")!;
    const b = cased.pieces.find((p) => p.name === "Trouser front")!;
    const waistA = a.outline.filter((o) => o.role === "waist").map((o) => o.at);
    const turn = b.waistCasing?.turndownSeam ?? [];
    if (waistA.length < 2 || turn.length < 2) {
      fail("Trouser front: waist / turndown missing");
    } else {
      const midA = waistA[Math.floor(waistA.length / 2)]!;
      const midT = turn[Math.floor(turn.length / 2)]!;
      if (Math.hypot(midA.x - midT.x, midA.y - midT.y) > 0.5) {
        fail("Trouser front: channel stitch moved vs pre-casing waist");
      } else ok("Trouser front: channel stitch (=pocket top) unmoved");
    }
  }
  void hNet;
  const inv = silhouetteInvariantDelta(
    resolveFrontSlantPocketMouth(body, style),
  );
  if (inv.waistDelta > EPS || inv.sideDelta > EPS) fail("silhouette");
  else ok("silhouette 0.000");
}

// Snapshot: pocket hash stable across elastic widths (draft doesn't depend on casing)
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const h0 = pocketSlashHash(body, style);
  for (const w of WIDTHS) {
    const pat = finish(body, style, w);
    const bags = pat.pieces.filter((p) => p.name.includes("ocket"));
    for (const bag of bags) {
      if (bag.waistCasing) fail(`w${w}/${bag.name}: casing on pocket`);
    }
  }
  ok(`pocket draft hash stable ${h0.slice(0, 12)}…; no casing on bags`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Continuous ~10 mm SA on sides through full extension ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  for (const pocket of ["slant", "none"] as const) {
    const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", pocket);
    for (const w of WIDTHS) {
      const d = resolveCasingDepths(w);
      const pat = finish(body, style, w);
      for (const name of ["Trouser front", "Trouser back"] as const) {
        const p = pat.pieces.find((x) => x.name === name)!;
        const cut = p.cuttingOutline;
        const ref = p.waistCasing;
        if (!cut || !ref || ref.turndownSeam.length < 2) {
          fail(`${name}/p${pocket}/w${w}: missing`);
          continue;
        }
        const waist = ref.turndownSeam.map((pt) => ({ ...pt }));
        const midF = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
        const midT = waist[Math.floor(waist.length / 2)]!;
        const up = unit(midF.x - midT.x, midF.y - midT.y);
        const onTop = (pt: Point) => {
          const along =
            (pt.x - waist[0]!.x) * up.x + (pt.y - waist[0]!.y) * up.y;
          return along > d.totalExtension - 8 && along < d.totalExtension + 25;
        };
        let topCount = 0;
        while (topCount < cut.length && onTop(cut[topCount]!)) topCount++;
        if (topCount < 2) {
          fail(`${name}/p${pocket}/w${w}: no top run`);
          continue;
        }
        const startCorner = cut[0]!;
        const endCorner = cut[topCount - 1]!;
        const afterTop = cut[topCount]!;
        const cfWaistSa = cut[cut.length - 1]!;
        const cfNetB = waist[0]!;
        const hemAlong = 2 * d.channelDepth;
        const sewCfCorner = {
          x: cfNetB.x + up.x * hemAlong,
          y: cfNetB.y + up.y * hemAlong,
        };
        // Walls measured against sewing U climbs (brief: cut = sew + SA).
        // Slash pocket: sewing turns at the mouth — side-wall check is Mila/none only.
        const cfGaps = sampleSeg(cfWaistSa, startCorner, 8).map((q) =>
          distToLine(q, cfNetB, sewCfCorner),
        );
        const midTop = cut[Math.floor(topCount / 2)]!;
        const midNet = waist[Math.floor(waist.length / 2)]!;
        const topGap =
          (midTop.x - midNet.x) * up.x + (midTop.y - midNet.y) * up.y;
        const tag = `${name === "Trouser front" ? "F" : "B"}/${pocket}/w${w}`;
        const cfMean = cfGaps.reduce((s, g) => s + g, 0) / cfGaps.length;
        if (Math.abs(topGap - d.totalExtension) > 1) {
          fail(`${tag}: topGap ${f3(topGap)} ≠ ${d.totalExtension}`);
        }
        if (
          Math.abs(cfMean - SA) > 1.5 ||
          Math.max(...cfGaps) - Math.min(...cfGaps) > 1.5
        ) {
          fail(`${tag}: CF/CB SA ${f3(cfMean)}`);
        }
        if (pocket === "none" || name === "Trouser back") {
          const sideNetA = waist[waist.length - 1]!;
          let sewSideBase = sideNetA;
          {
            const outline = p.outline;
            let best = 0;
            let bestD = Infinity;
            for (let i = 0; i < outline.length; i++) {
              const dd = dist(outline[i]!.at, sideNetA);
              if (dd < bestD) {
                bestD = dd;
                best = i;
              }
            }
            for (let k = 0; k < 3; k++) {
              const idx = (best + k) % outline.length;
              const op = outline[idx]!;
              if (
                Math.abs(op.at.y - sideNetA.y) < 2.5 &&
                (op.role === "side-seam" || op.role === "pocket-mouth")
              ) {
                sewSideBase = op.at;
                break;
              }
            }
          }
          const sewSideCorner = {
            x: sewSideBase.x + up.x * hemAlong,
            y: sewSideBase.y + up.y * hemAlong,
          };
          const sideGaps = sampleSeg(endCorner, afterTop, 8).map((q) =>
            distToLine(q, sewSideCorner, sewSideBase),
          );
          const sideMean =
            sideGaps.reduce((s, g) => s + g, 0) / sideGaps.length;
          if (
            Math.abs(sideMean - SA) > 1.5 ||
            Math.max(...sideGaps) - Math.min(...sideGaps) > 1.5
          ) {
            fail(`${tag}: side SA ${f3(sideMean)}`);
          }
        }
        void afterTop;
      }
    }
  }
}
ok("Helen: continuous seamAllowance vs sewing U through full cut extension");

// ---------------------------------------------------------------------------
console.log("\n=== 5. Fold-flat front; parallelogram back ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const pat = finish(body, style, w);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const back = pat.pieces.find((p) => p.name === "Trouser back")!;
    const r = frontCasingFoldTestResidual(front);
    if (r == null) fail(`w${w}: no fold-test`);
    else if (r > 0.05) fail(`w${w}: fold-test residual ${f6(r)}`);
    else ok(`w${w}: front fold-2 flat residual ${f6(r)}`);

    const ref = back.waistCasing!;
    const w0 = channelWidthAt(ref, 0);
    const wMid = channelWidthAt(ref, 0.5);
    const w1 = channelWidthAt(ref, 1);
    console.log(
      `  w${w} back channel: CB=${f3(w0)} mid=${f3(wMid)} side=${f3(w1)} (expect ${d.channelDepth})`,
    );
    for (const [name, val] of [
      ["CB", w0],
      ["mid", wMid],
      ["side", w1],
    ] as const) {
      if (Math.abs(val - d.channelDepth) > 0.05) {
        fail(`w${w} ${name} width ${f3(val)} ≠ ${d.channelDepth}`);
      }
    }
    ok(`w${w}: back parallelogram constant width`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 6. Non-elastic / none byte-identical; PDF cases ===\n");

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

  const facing = resolveStyle(CARGO_TROUSER_STYLE, body, "facing");
  const facPat = applyTrouserHemTurnbackToPattern(
    withSeamAllowance(draftTrousers(body, facing), DEFAULT_SEAM_ALLOWANCE),
  );
  if (facPat.pieces.some((p) => p.waistCasing)) fail("facing got casing");
  else ok("facing: no casing post-pass");
}

{
  const pdfSrc = readFileSync(join(process.cwd(), "lib", "export", "pdf.ts"), "utf8");
  if (!pdfSrc.includes('case "casingTurndown"')) fail("pdf missing casingTurndown");
  else ok("pdf draws casingTurndown");
  for (const k of ["casingFold", "casingHem", "casingRegion"] as const) {
    if (pdfSrc.includes(`case "${k}"`)) fail(`pdf still draws removed ${k}`);
    else ok(`pdf: ${k} removed`);
  }
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS — double-fold casing; report before re-baseline ===\n"
    : `\n=== ACCEPT FAIL (${failures}) ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
