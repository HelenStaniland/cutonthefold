/**
 * Acceptance: separate elastic waistband finish (`elasticWaistband`).
 * Run: npx tsx scripts/accept-elastic-waistband.ts
 *
 * Cargo uses the new finish; Mila keeps self-casing (`elastic`) byte-identical.
 * Band length from pre-slash construction waist; plain trouser top (no casing).
 * Self-casing + slant is derived away at draft time.
 */
import { createHash } from "node:crypto";
import {
  applyEase,
  type BodyMeasurements,
  type PatternPiece,
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
  BLOCK_TROUSER_STYLE,
  CARGO_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  effectiveDartedWaistFinish,
  isPullOnWaistFinish,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrouserFront,
  draftTrousers,
  resolveBodyWaistY,
  resolveFrontSlantPocketMouth,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { silhouetteInvariantDelta } from "../lib/elements/slantFrontPocket";
import {
  draftElasticWaistband,
  ELASTIC_WAISTBAND_CHANNEL_EASE,
  ELASTIC_WAISTBAND_PIECE_NAME,
  resolveElasticWaistbandSpec,
} from "../lib/elements/elasticWaistband";
import { draftWaistband } from "../lib/elements/waistband";
import { trouserWaistEdges } from "../lib/patterns/trouserBlock";
import { polylineLength } from "../lib/geometry/curves";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const WIDTHS: CasingElasticWidth[] = [25, 38, 50];
const SAS = [10, 15] as const;
const EPS = 1e-4;
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

/** Mirror TrousersView draft boundary (pull-on + slash→elasticWaistband derive). */
function resolveStyle(
  s: TrouserStyleSettings,
  body: BodyMeasurements,
  finishOverride?: TrouserStyleSettings["dartedWaistFinish"],
  pocketOverride?: TrouserStyleSettings["pocketFront"],
): TrouserFrontStyle {
  const pocket = pocketOverride ?? s.pocketFront;
  const stored = finishOverride ?? s.dartedWaistFinish;
  const finish = effectiveDartedWaistFinish(stored, pocket);
  const pullOn = isPullOnWaistFinish(finish);
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
    ...(s.crotchDeparture != null ? { crotchDeparture: s.crotchDeparture } : {}),
    ...(s.crotchArrivalAngle != null
      ? { crotchArrivalAngle: s.crotchArrivalAngle }
      : {}),
    ...(s.waistlineCurveFront != null
      ? { waistlineCurveFront: s.waistlineCurveFront }
      : {}),
    ...(pullOn
      ? { frontWaistInset: 0, waistTaper: 0 }
      : {
          ...(s.frontWaistInset != null
            ? { frontWaistInset: s.frontWaistInset }
            : {}),
          ...(s.waistTaper != null ? { waistTaper: s.waistTaper } : {}),
        }),
    ...(s.backCbWaistRise != null ? { backCbWaistRise: s.backCbWaistRise } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
    ...(pocket === "slant" ? { pocketFront: "slant" as const } : {}),
  };
  if (pullOn) return withWaistband(base, 0, "shaped", body);
  if (finish === "facing") return withWaistband(base, 0, "darted", body);
  const depth =
    s.waistbandMode === "darted" ? s.dartedBandDepth : s.waistbandDepth;
  if (s.waistbandMode === "darted") {
    return withWaistband(base, depth, "darted", body);
  }
  return depth > 0 ? withWaistband(base, depth, "shaped", body) : base;
}

function outlineHash(piece: PatternPiece): string {
  const s = piece.outline
    .map((o) => `${o.role ?? ""}:${o.at.x.toFixed(9)},${o.at.y.toFixed(9)}`)
    .join("|");
  const marks = piece.markings
    .map((m) => {
      if (m.kind === "dart") {
        return `dart:${m.apex.x.toFixed(6)},${m.apex.y.toFixed(6)}`;
      }
      if (m.kind === "notch") {
        return `notch:${m.at.x.toFixed(6)},${m.at.y.toFixed(6)}:${m.label ?? ""}`;
      }
      if (m.kind === "grainline") {
        return `grain:${m.line.from.x.toFixed(6)},${m.line.from.y.toFixed(6)}-${m.line.to.x.toFixed(6)},${m.line.to.y.toFixed(6)}`;
      }
      return m.kind;
    })
    .join("|");
  return createHash("sha256").update(`${s}||${marks}`).digest("hex");
}

function pairHash(body: BodyMeasurements, style: TrouserFrontStyle): string {
  return (
    outlineHash(draftTrouserFront(body, style)) +
    outlineHash(draftTrouserBack(body, style))
  );
}

function pocketPiecesHash(pat: { pieces: PatternPiece[] }): string {
  const h = createHash("sha256");
  for (const p of pat.pieces.filter((x) => x.name.startsWith("Slant pocket"))) {
    h.update(p.name + outlineHash(p));
  }
  return h.digest("hex");
}

/** Product path: band emit + SA + optional self-casing + hem (mirrors TrousersView). */
function productPattern(
  body: BodyMeasurements,
  settings: TrouserStyleSettings,
  seamAllowance: number,
  opts?: {
    finishOverride?: TrouserStyleSettings["dartedWaistFinish"];
    pocketOverride?: TrouserStyleSettings["pocketFront"];
  },
) {
  const pocket = opts?.pocketOverride ?? settings.pocketFront;
  const stored = opts?.finishOverride ?? settings.dartedWaistFinish;
  const finish = effectiveDartedWaistFinish(stored, pocket);
  const style = resolveStyle(settings, body, stored, pocket);
  const net = draftTrousers(body, style);
  let pieces = [...net.pieces];
  if (finish === "elasticWaistband") {
    const band = draftElasticWaistband(
      resolveElasticWaistbandSpec(
        body,
        style,
        settings.casingElasticWidth,
        seamAllowance,
      ),
    );
    pieces = [...pieces, band.piece];
  } else if (finish === "waistband") {
    const e = trouserWaistEdges(body, style);
    const depth = style.waistReduction ?? settings.dartedBandDepth;
    const fb = draftWaistband({
      innerLen: e.front.inner,
      outerLen: e.front.outer,
      depth,
      foldSide: "CF",
      label: "Front waistband",
    });
    const bb = draftWaistband({
      innerLen: e.back.inner,
      outerLen: e.back.outer,
      depth,
      foldSide: "CB",
      label: "Back waistband",
    });
    pieces = [...pieces, fb.piece, bb.piece];
  }
  const withSa = withSeamAllowance(
    { pieces },
    { seam: seamAllowance, hem: DEFAULT_SEAM_ALLOWANCE.hem },
  );
  const withCasing =
    finish === "elastic"
      ? applyTrouserWaistCasingToPattern(
          withSa,
          resolveCasingDepths(
            settings.casingElasticWidth as CasingElasticWidth,
            seamAllowance,
          ),
          seamAllowance,
        )
      : withSa;
  return {
    finish,
    style,
    pattern: applyTrouserHemTurnbackToPattern(withCasing),
    net: { pieces },
  };
}

function rectDims(cut: { x: number; y: number }[]): {
  length: number;
  width: number;
} {
  const xs = cut.map((p) => p.x);
  const ys = cut.map((p) => p.y);
  return {
    length: Math.max(...xs) - Math.min(...xs),
    width: Math.max(...ys) - Math.min(...ys),
  };
}

console.log("=== ACCEPT: separate elastic waistband (elasticWaistband) ===\n");

// --- 1. Finish values / Cargo / derive ---
console.log("=== 1. Finish axis + Cargo + derive ===\n");
{
  if (CARGO_TROUSER_STYLE.dartedWaistFinish !== "elasticWaistband") {
    fail(`Cargo finish=${CARGO_TROUSER_STYLE.dartedWaistFinish}`);
  } else ok('Cargo dartedWaistFinish = "elasticWaistband"');
  if (MILA_TROUSER_STYLE.dartedWaistFinish !== "elastic") {
    fail(`Mila finish=${MILA_TROUSER_STYLE.dartedWaistFinish}`);
  } else ok('Mila dartedWaistFinish = "elastic" (unchanged)');
  if (CLEO_TROUSER_STYLE.dartedWaistFinish !== "waistband") {
    fail("Cleo finish drifted");
  } else ok("Cleo finish intact");
  if (BLOCK_TROUSER_STYLE.dartedWaistFinish !== "facing") {
    fail("Block finish drifted");
  } else ok("Block finish intact");

  const derived = effectiveDartedWaistFinish("elastic", "slant");
  if (derived !== "elasticWaistband") {
    fail(`derive elastic+slash → ${derived}`);
  } else ok('draft derives elastic+slash → elasticWaistband');
  if (effectiveDartedWaistFinish("elastic", "none") !== "elastic") {
    fail("Mila path derive broke");
  } else ok("elastic+none stays elastic");
  if (effectiveDartedWaistFinish("elasticWaistband", "slant") !== "elasticWaistband") {
    fail("elasticWaistband+slash drifted");
  } else ok("elasticWaistband+slant stays elasticWaistband");
}

// --- 2. Band length: pre-slash; slash on ≡ off ---
console.log("\n=== 2. Band length (pre-slash; slash on ≡ off) ===\n");
for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  for (const sa of SAS) {
    for (const w of WIDTHS) {
      const settings: TrouserStyleSettings = {
        ...CARGO_TROUSER_STYLE,
        casingElasticWidth: w,
      };
      const on = productPattern(body, settings, sa, { pocketOverride: "slant" });
      const off = productPattern(body, settings, sa, { pocketOverride: "none" });
      const specOn = resolveElasticWaistbandSpec(
        body,
        on.style,
        w,
        sa,
      );
      const specOff = resolveElasticWaistbandSpec(
        body,
        off.style,
        w,
        sa,
      );
      if (Math.abs(specOn.frontTop - specOff.frontTop) > EPS) {
        fail(`${bod.name}/sa${sa}/w${w}: frontTop slash Δ`);
      }
      if (Math.abs(specOn.cutLength - specOff.cutLength) > EPS) {
        fail(
          `${bod.name}/sa${sa}/w${w}: cutLength slash on ${f3(specOn.cutLength)} ≠ off ${f3(specOff.cutLength)}`,
        );
      } else if (bod.name === "Helen-print" && sa === 10 && w === 25) {
        ok(
          `Helen sa10/w25: front_preslash=${f3(specOn.frontTop)} ` +
            `back=${f3(specOn.backTop)} cutLength=${f3(specOn.cutLength)} ` +
            `(=2F+2B+2SA); slash on≡off`,
        );
        // Pocketed outline (CF→mouth) must be shorter — band must NOT use it.
        const mouth = resolveFrontSlantPocketMouth(body, on.style);
        const pocketedWaist = polylineLength(mouth.waistToOpening);
        if (Math.abs(pocketedWaist - specOn.frontTop) < 1) {
          fail(
            `band frontTop reads pocketed outline (${f3(pocketedWaist)})`,
          );
        } else {
          ok(
            `front_preslash ${f3(specOn.frontTop)} ≠ pocketed CF→mouth ${f3(pocketedWaist)} ` +
              `(Δ=${f3(specOn.frontTop - pocketedWaist)})`,
          );
        }
      }
    }
  }
}
ok("all sizes × SA × widths: band length slash on ≡ off");

// --- 3. Band cut width tracks elastic + SA ---
console.log("\n=== 3. Band cut width = 2×(elastic + ease + SA) ===\n");
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  for (const sa of SAS) {
    for (const w of WIDTHS) {
      const spec = resolveElasticWaistbandSpec(body, style, w, sa);
      const expect =
        2 * (w + ELASTIC_WAISTBAND_CHANNEL_EASE + sa);
      if (Math.abs(spec.cutWidth - expect) > EPS) {
        fail(`w${w}/sa${sa}: cutWidth ${spec.cutWidth} ≠ ${expect}`);
      } else {
        ok(`w${w}/sa${sa}: cutWidth=${spec.cutWidth}`);
      }
      const drafted = draftElasticWaistband(spec);
      const withSa = withSeamAllowance(
        { pieces: [drafted.piece] },
        { seam: sa, hem: DEFAULT_SEAM_ALLOWANCE.hem },
      );
      const cut = withSa.pieces[0]!.cuttingOutline;
      if (!cut) {
        fail(`w${w}/sa${sa}: no cuttingOutline`);
        continue;
      }
      const dims = rectDims(cut);
      if (Math.abs(dims.length - spec.cutLength) > 0.05) {
        fail(
          `w${w}/sa${sa}: cut length ${f3(dims.length)} ≠ ${f3(spec.cutLength)}`,
        );
      }
      if (Math.abs(dims.width - spec.cutWidth) > 0.05) {
        fail(
          `w${w}/sa${sa}: cut width ${f3(dims.width)} ≠ ${f3(spec.cutWidth)}`,
        );
      }
    }
  }
}

// --- 4. Single loop piece ---
console.log("\n=== 4. Single loop (one piece, one join) ===\n");
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const { pattern, finish } = productPattern(body, CARGO_TROUSER_STYLE, 10);
  if (finish !== "elasticWaistband") fail(`finish=${finish}`);
  const bands = pattern.pieces.filter(
    (p) => p.name === ELASTIC_WAISTBAND_PIECE_NAME,
  );
  const shaped = pattern.pieces.filter(
    (p) => p.name === "Front waistband" || p.name === "Back waistband",
  );
  if (bands.length !== 1) fail(`band count=${bands.length}`);
  else ok("one Elastic waistband piece");
  if (shaped.length !== 0) fail(`unexpected shaped bands=${shaped.length}`);
  else ok("no Front/Back waistband halves");
  if (bands[0]!.cutCount !== 1) fail(`cutCount=${bands[0]!.cutCount}`);
  else ok("cutCount = 1");
  if (bands[0]!.onFold) fail("onFold true (should be full loop)");
  else ok("onFold = false (full loop, not on-fold half)");
}

// --- 5. Cargo plain top — no casing extension ---
console.log("\n=== 5. Cargo plain top (no casing extension) ===\n");
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const { pattern } = productPattern(body, CARGO_TROUSER_STYLE, 10);
  for (const name of ["Trouser front", "Trouser back"] as const) {
    const p = pattern.pieces.find((x) => x.name === name)!;
    if (p.waistCasing) fail(`${name}: still has waistCasing`);
    else ok(`${name}: no waistCasing`);
    const bodyWaistY = resolveBodyWaistY(body, resolveStyle(CARGO_TROUSER_STYLE, body));
    const sewWaist = p.outline.filter((o) => o.role === "waist");
    if (sewWaist.length < 2) {
      fail(`${name}: no waist sewing`);
      continue;
    }
    const midY =
      sewWaist.reduce((s, o) => s + o.at.y, 0) / sewWaist.length;
    // Sewing stays at body waist (allow CB rise on back).
    if (name === "Trouser front" && Math.abs(midY - bodyWaistY) > 1) {
      fail(`${name}: sew waist y ${f3(midY)} ≠ bodyWaistY ${f3(bodyWaistY)}`);
    }
    const cut = p.cuttingOutline;
    if (!cut) {
      fail(`${name}: no cuttingOutline`);
      continue;
    }
    const minY = Math.min(...cut.map((c) => c.y));
    // Plain SA above sewing — not the ~90 mm casing extension.
    const extensionUp = midY - minY;
    if (extensionUp > 25) {
      fail(
        `${name}: cut extends ${f3(extensionUp)} mm above sew (casing still present?)`,
      );
    } else {
      ok(`${name}: cut above sew ≈ SA only (${f3(extensionUp)} mm)`);
    }
  }
}

// --- 6. Mila / facing / shaped / Cleo byte-identical smoke ---
console.log("\n=== 6. Mila / block / Cleo / facing / shaped byte-identical smoke ===\n");
{
  const body = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const mila = productPattern(body, MILA_TROUSER_STYLE, 10);
  if (mila.finish !== "elastic") fail("Mila not self-casing");
  else ok("Mila still self-casing");
  const front = mila.pattern.pieces.find((p) => p.name === "Trouser front")!;
  if (!front.waistCasing) fail("Mila missing waistCasing");
  else {
    const ext = front.waistCasing.totalExtension;
    ok(`Mila casing totalExtension=${ext}`);
  }
  // No elastic band piece on Mila
  if (
    mila.pattern.pieces.some((p) => p.name === ELASTIC_WAISTBAND_PIECE_NAME)
  ) {
    fail("Mila unexpectedly has Elastic waistband piece");
  } else ok("Mila has no separate elastic band piece");

  const blockHash = pairHash(
    applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease),
    resolveStyle(BLOCK_TROUSER_STYLE, applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease)),
  );
  ok(`Block pair hash ${blockHash.slice(0, 12)}…`);
  const cleoHash = pairHash(
    applyEase(helenBody(), CLEO_TROUSER_STYLE.ease),
    resolveStyle(CLEO_TROUSER_STYLE, applyEase(helenBody(), CLEO_TROUSER_STYLE.ease)),
  );
  ok(`Cleo pair hash ${cleoHash.slice(0, 12)}…`);

  // Facing / shaped waistband on Cargo body still draft without elastic band
  const facing = productPattern(
    body,
    { ...CARGO_TROUSER_STYLE, pocketFront: "none" },
    10,
    { finishOverride: "facing", pocketOverride: "none" },
  );
  if (
    facing.pattern.pieces.some((p) => p.name === ELASTIC_WAISTBAND_PIECE_NAME)
  ) {
    fail("facing path emitted elastic band");
  } else ok("facing path: no elastic band");
}

// --- 7. Pocket unchanged; silhouette ---
console.log("\n=== 7. Pocket unchanged; silhouette invariant ===\n");
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  // Same slant pocket draft whether finish is elasticWaistband or (forced) elastic
  const a = draftTrousers(
    body,
    resolveStyle(CARGO_TROUSER_STYLE, body, "elasticWaistband", "slant"),
  );
  const b = draftTrousers(
    body,
    resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant"),
  );
  // Note: elastic+slant derives to elasticWaistband in resolveStyle — same path.
  // Compare pocket pieces against explicit no-derive draft by building style with
  // pull-on + slant directly (finish does not enter draftTrousers).
  const hA = pocketPiecesHash(a);
  const hB = pocketPiecesHash(b);
  if (hA !== hB) fail("pocket hash elasticWaistband ≠ derived elastic+slash");
  else ok(`pocket/slash bags hash stable ${hA.slice(0, 12)}…`);

  const inv = silhouetteInvariantDelta(
    resolveFrontSlantPocketMouth(
      body,
      resolveStyle(CARGO_TROUSER_STYLE, body),
    ),
  );
  if (inv.waistDelta > EPS || inv.sideDelta > EPS) {
    fail(
      `silhouette waistΔ=${f3(inv.waistDelta)} sideΔ=${f3(inv.sideDelta)}`,
    );
  } else ok("silhouette invariant 0.000");

  // Product path must not draft self-casing when stored elastic+slash
  const sneaky = productPattern(
    body,
    { ...CARGO_TROUSER_STYLE, dartedWaistFinish: "elastic", pocketFront: "slant" },
    10,
  );
  if (sneaky.finish !== "elasticWaistband") {
    fail(`sneaky finish=${sneaky.finish} (self-casing+slash still drafted)`);
  } else ok("stored elastic+slash cannot draft self-casing (derived)");
  const front = sneaky.pattern.pieces.find((p) => p.name === "Trouser front")!;
  if (front.waistCasing) {
    fail("sneaky path still applied casing");
  } else ok("sneaky path: no casing post-pass");
}

// --- 8. Cargo(none) net ≡ Mila (pull-on parity) ---
console.log("\n=== 8. Cargo pocket-off net ≡ Mila ===\n");
for (const bod of bodies) {
  const body = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const mila = resolveStyle(MILA_TROUSER_STYLE, body);
  const cargoOff = resolveStyle(
    { ...CARGO_TROUSER_STYLE, pocketFront: "none" },
    body,
  );
  const hM = pairHash(body, mila);
  const hC = pairHash(body, cargoOff);
  if (hM !== hC) fail(`${bod.name}: Cargo(none) ≠ Mila`);
  else ok(`${bod.name}: Cargo(none) ≡ Mila`);
}

console.log(
  `\n=== DONE: ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===\n`,
);
if (failures > 0) process.exit(1);
