/**
 * DIAGNOSTIC — waist-finish structure (print only; change nothing).
 * Run: npx tsx scripts/diag-waist-finish-structure.ts
 *
 * Scopes a separate elastic waistband finish: band piece? extension?
 * length source vs slash? forbid self-casing+slash path?
 */
import { applyEase, type BodyMeasurements } from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { polylineLength } from "../lib/geometry/curves";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import { applyTrouserHemTurnbackToPattern } from "../lib/geometry/trouserHemTurnback";
import {
  applyTrouserWaistCasingToPattern,
  resolveCasingDepths,
} from "../lib/geometry/trouserWaistCasing";
import {
  BLOCK_TROUSER_STYLE,
  CARGO_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrousers,
  resolveFrontSlantPocketMouth,
  resolvePocketFront,
  trouserWaistEdges,
  validateTrousers,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { draftWaistband } from "../lib/elements/waistband";

const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const f1 = (n: number) => n.toFixed(1);
const f3 = (n: number) => n.toFixed(3);

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

/**
 * Mirror TrousersView draft-boundary rules for each finish.
 * facing / waistband / elastic — elastic forces shaped@0 + inset/taper 0.
 */
function resolveStyle(
  s: TrouserStyleSettings,
  body: BodyMeasurements,
  finish: TrouserStyleSettings["dartedWaistFinish"],
  pocket: "none" | "slant" = "none",
): TrouserFrontStyle {
  const elastic = finish === "elastic";
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
    ...(s.backCbWaistRise != null ? { backCbWaistRise: s.backCbWaistRise } : {}),
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

/** Same composition as TrousersView: optional band pieces + SA + casing + hem. */
function finishPattern(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  finish: TrouserStyleSettings["dartedWaistFinish"],
  bandDepth: number,
) {
  const net = draftTrousers(body, style);
  const elastic = finish === "elastic";
  let pieces = [...net.pieces];
  let bandInfo: {
    front: { inner: number; outer: number; depth: number };
    back: { inner: number; outer: number; depth: number };
  } | null = null;

  if (!elastic && bandDepth > 0) {
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
    pieces = [...pieces, fb.piece, bb.piece];
    bandInfo = {
      front: { ...e.front, depth: bandDepth },
      back: { ...e.back, depth: bandDepth },
    };
  }

  const withSa = withSeamAllowance({ pieces }, DEFAULT_SEAM_ALLOWANCE);
  const withCasing = elastic
    ? applyTrouserWaistCasingToPattern(
        withSa,
        resolveCasingDepths(25, DEFAULT_SEAM_ALLOWANCE.seam),
        DEFAULT_SEAM_ALLOWANCE.seam,
      )
    : withSa;
  const hemed = applyTrouserHemTurnbackToPattern(withCasing);
  return { pattern: hemed, bandInfo, net };
}

const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
const SA = DEFAULT_SEAM_ALLOWANCE.seam;

console.log("=== DIAG: waist-finish structure (print only) ===\n");
console.log(`Helen-print body (eased), SA=${SA} mm\n`);

// ---------------------------------------------------------------------------
console.log("=== 1. Per-finish table ===\n");

type Row = {
  finish: string;
  mode: string;
  depth: number;
  bandPieces: string;
  bandLen: string;
  bandDepth: string;
  extension: string;
  trouserTop: string;
};

const rows: Row[] = [];

{
  // Facing (Block-like)
  const style = resolveStyle(BLOCK_TROUSER_STYLE, body, "facing", "none");
  const { pattern, bandInfo } = finishPattern(body, style, "facing", 0);
  const front = pattern.pieces.find((p) => p.name === "Trouser front")!;
  rows.push({
    finish: "facing",
    mode: "darted @ depth 0",
    depth: style.waistReduction ?? 0,
    bandPieces: bandInfo
      ? "Front+Back waistband"
      : "none (facing TODO — no pieces yet)",
    bandLen: "—",
    bandDepth: "—",
    extension: front.waistCasing
      ? `YES casing ext=${front.waistCasing.totalExtension}`
      : "none",
    trouserTop: "plain waist + SA (waistFinish:facing tag)",
  });
}

{
  // Waistband shaped (Cleo-like)
  const style = resolveStyle(CLEO_TROUSER_STYLE, body, "waistband", "none");
  const depth = style.waistReduction ?? CLEO_TROUSER_STYLE.waistbandDepth;
  const { pattern, bandInfo } = finishPattern(
    body,
    style,
    "waistband",
    depth,
  );
  const front = pattern.pieces.find((p) => p.name === "Trouser front")!;
  const bands = pattern.pieces.filter((p) => p.name.includes("waistband"));
  rows.push({
    finish: "waistband (shaped)",
    mode: `shaped @ ${depth} mm`,
    depth,
    bandPieces: bands.map((p) => `${p.name} cut×${p.cutCount} onFold=${p.onFold}`).join("; ") || "none",
    bandLen: bandInfo
      ? `F inner=${f1(bandInfo.front.inner)} outer=${f1(bandInfo.front.outer)}; B inner=${f1(bandInfo.back.inner)} outer=${f1(bandInfo.back.outer)}`
      : "—",
    bandDepth: bandInfo ? `${bandInfo.front.depth} mm (= waistReduction)` : "—",
    extension: front.waistCasing
      ? `YES ext=${front.waistCasing.totalExtension}`
      : "none",
    trouserTop: "plain waist + SA (no casing)",
  });
}

{
  // Waistband darted strip
  const style = resolveStyle(
    { ...CLEO_TROUSER_STYLE, waistbandMode: "darted", dartedBandDepth: 40 },
    body,
    "waistband",
    "none",
  );
  // Force darted mode path
  const darted = withWaistband(
    {
      bottomWidth: CLEO_TROUSER_STYLE.legBottomWidth,
      block: blockFromWaistDrop(CLEO_TROUSER_STYLE.waistDrop),
      waistDrop: CLEO_TROUSER_STYLE.waistDrop,
      backHemShape: CLEO_TROUSER_STYLE.backHemShape,
      frontWaistInset: CLEO_TROUSER_STYLE.frontWaistInset ?? undefined,
      waistTaper: CLEO_TROUSER_STYLE.waistTaper ?? undefined,
    },
    40,
    "darted",
    body,
  );
  const { pattern, bandInfo } = finishPattern(body, darted, "waistband", 40);
  const front = pattern.pieces.find((p) => p.name === "Trouser front")!;
  rows.push({
    finish: "waistband (darted)",
    mode: "darted @ 40 mm",
    depth: darted.waistReduction ?? 40,
    bandPieces: pattern.pieces
      .filter((p) => p.name.includes("waistband"))
      .map((p) => p.name)
      .join(", ") || "none",
    bandLen: bandInfo
      ? `F=${f1(bandInfo.front.inner)} (=outer, straight); B=${f1(bandInfo.back.inner)}`
      : "—",
    bandDepth: "40 mm straight strip",
    extension: front.waistCasing ? "YES" : "none",
    trouserTop: "plain waist + SA; darts shortened by depth",
  });
  void style;
}

{
  // Elastic self-casing (Mila)
  const style = resolveStyle(MILA_TROUSER_STYLE, body, "elastic", "none");
  const { pattern, bandInfo } = finishPattern(body, style, "elastic", 0);
  const front = pattern.pieces.find((p) => p.name === "Trouser front")!;
  const back = pattern.pieces.find((p) => p.name === "Trouser back")!;
  const bands = pattern.pieces.filter((p) => p.name.includes("waistband"));
  rows.push({
    finish: "elastic (self-casing)",
    mode: "shaped @ depth 0 (forced)",
    depth: style.waistReduction ?? 0,
    bandPieces: bands.length ? bands.map((p) => p.name).join(", ") : "none",
    bandLen: bandInfo ? "emitted" : "— (draftWaistDepth=0 skips band)",
    bandDepth: "—",
    extension: front.waistCasing
      ? `YES F+B: totalExt=${front.waistCasing.totalExtension} (channel=${front.waistCasing.channelDepth}); back also`
      : "MISSING",
    trouserTop: "worn waist = stitch; cut raw at totalExtension above",
  });
  void back;
}

for (const r of rows) {
  console.log(`--- ${r.finish} ---`);
  console.log(`  draft mode/depth: ${r.mode} (waistReduction=${r.depth})`);
  console.log(`  band piece(s):    ${r.bandPieces}`);
  console.log(`  band length:      ${r.bandLen}`);
  console.log(`  band depth/width: ${r.bandDepth}`);
  console.log(`  trouser extension:${r.extension}`);
  console.log(`  trouser top:      ${r.trouserTop}`);
  console.log("");
}

// ---------------------------------------------------------------------------
console.log("=== 2. Existing waistband finish — length / depth / fold ===\n");

{
  const style = resolveStyle(CLEO_TROUSER_STYLE, body, "waistband", "none");
  const eNone = trouserWaistEdges(body, style);
  const styleSlant = resolveStyle(CLEO_TROUSER_STYLE, body, "waistband", "slant");
  const eSlant = trouserWaistEdges(body, styleSlant);
  const netNone = draftTrousers(body, style);
  const netSlant = draftTrousers(body, styleSlant);
  const frontNone = netNone.pieces.find((p) => p.name === "Trouser front")!;
  const frontSlant = netSlant.pieces.find((p) => p.name === "Trouser front")!;

  console.log("Length derivation: trouserWaistEdges(body, style)");
  console.log("  → frontWaistResolved / backWaistResolved construction seams");
  console.log("  → shaped: inner=bandTop (chord−darts), outer=bandBottom (full seam arc)");
  console.log("  → darted: inner=outer=bandBottom (straight strip; darts stay in trousers)");
  console.log("");
  console.log("  pocketFront=none:");
  console.log(
    `    edges F inner=${f1(eNone.front.inner)} outer=${f1(eNone.front.outer)}`,
  );
  console.log(
    `    edges B inner=${f1(eNone.back.inner)} outer=${f1(eNone.back.outer)}`,
  );
  console.log(
    `    seamLengths.topEdge F=${f1(frontNone.seamLengths!.topEdge)} B=${f1(netNone.pieces.find((p) => p.name === "Trouser back")!.seamLengths!.topEdge)}`,
  );
  console.log("  pocketFront=slant (same style + slash):");
  console.log(
    `    edges F inner=${f1(eSlant.front.inner)} outer=${f1(eSlant.front.outer)}  ΔF outer vs none=${f3(eSlant.front.outer - eNone.front.outer)}`,
  );
  console.log(
    `    edges B inner=${f1(eSlant.back.inner)} outer=${f1(eSlant.back.outer)}  ΔB=${f3(eSlant.back.outer - eNone.back.outer)}`,
  );
  console.log(
    `    seamLengths.topEdge F=${f1(frontSlant.seamLengths!.topEdge)} (construction; pre-slash)`,
  );

  // Pocketed outline waist arc vs construction
  const mouth = resolveFrontSlantPocketMouth(body, styleSlant);
  const pocketedWaist = polylineLength(mouth.waistToOpening);
  console.log(
    `    pocketed outline waist CF→mouth = ${f1(pocketedWaist)} mm`,
  );
  console.log(
    `    pre-slash construction waist = ${f1(eSlant.front.outer)} mm`,
  );
  console.log(
    `    slash shortens outline by ${f1(eSlant.front.outer - pocketedWaist)} mm — but trouserWaistEdges is UNCHANGED (Δ=${f3(eSlant.front.outer - eNone.front.outer)})`,
  );
  console.log("");
  console.log("Depth: style.waistReduction (= UI waistbandDepth / dartedBandDepth),");
  console.log("  clamped by waistbandDepthRange / clampWaistbandDepth.");
  console.log("");
  console.log("Fold / construction (draftWaistband):");
  console.log("  - Piece: onFold=true, cutCount=2 (half drafted, cut on CF/CB fold)");
  console.log("  - Contoured rectangle/sector: top=innerLen, bottom=outerLen, depth=band depth");
  console.log("  - Instructions: interface band + facing; sew lower edge to trouser;");
  console.log("    sew band to facing along top, turn. → FACED band (not fold-in-half elastic)");
  console.log("  - Not a double-fold channel; both raw long edges are seam edges in the draft");
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. Elastic self-casing — confirm opposite of separate band ===\n");

{
  const style = resolveStyle(MILA_TROUSER_STYLE, body, "elastic", "none");
  const { pattern } = finishPattern(body, style, "elastic", 0);
  const names = pattern.pieces.map((p) => p.name);
  const front = pattern.pieces.find((p) => p.name === "Trouser front")!;
  console.log(`  pieces: ${names.join(", ")}`);
  console.log(`  band pieces present: ${names.some((n) => /waistband/i.test(n))}`);
  console.log(
    `  waistCasing on front: ${!!front.waistCasing} totalExt=${front.waistCasing?.totalExtension} (= SA + 2×channel at SA=${SA})`,
  );
  console.log("  mechanism: TrousersView elasticWaist → draftWaistDepth=0 (no band emit)");
  console.log("    → withSeamAllowance → applyTrouserWaistCasingToPattern → hem turnback");
  console.log("  New finish target: SEPARATE piece, NO casing extension (plain waist+SA).");
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Where finishes add/remove pieces (slot for a sibling) ===\n");

console.log("  TrousersView composition (net → display):");
console.log("    1. draftTrousers(body, tstyle)  → front + back [+ pocket pieces if slant]");
console.log("    2. applySideOpening");
console.log("    3. if facing: skip band (facing pieces TODO)");
console.log("       else if draftWaistDepth > 0: draftWaistband ×2 → append Front/Back waistband");
console.log("       else if elastic: draftWaistDepth forced 0 → no band");
console.log("    4. withSeamAllowance(net)");
console.log("    5. if elastic: applyTrouserWaistCasingToPattern (extension on legs)");
console.log("    6. applyTrouserHemTurnbackToPattern");
console.log("");
console.log("  Finish axis is dartedWaistFinish ∈ {facing, waistband, elastic}.");
console.log("  Band emit gated by draftWaistDepth > 0 (waistband only today).");
console.log("  Extension gated by elasticWaist boolean (post-pass).");
console.log("  Sibling finish would: emit a band (step 3) + skip casing (step 5) + plain top.");

// ---------------------------------------------------------------------------
console.log("\n=== 5. Pre-slash front top length — reachable? ===\n");

{
  const styleSlant = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const e = trouserWaistEdges(body, styleSlant);
  const mouth = resolveFrontSlantPocketMouth(body, styleSlant);
  const net = draftTrousers(body, styleSlant);
  const front = net.pieces.find((p) => p.name === "Trouser front")!;
  const pocketedWaist = polylineLength(mouth.waistToOpening);
  const fullOpening = polylineLength(mouth.openingPath);

  console.log(`  resolvePocketFront = ${resolvePocketFront(styleSlant)}`);
  console.log("  APIs that return PRE-slash front waist length:");
  console.log(`    trouserWaistEdges(...).front.outer = ${f1(e.front.outer)} mm`);
  console.log(`    front.seamLengths.topEdge         = ${f1(front.seamLengths!.topEdge)} mm`);
  console.log(
    `    resolveFrontSlantPocketMouth → built from wr.waistSeam (full) then trimmed for outline`,
  );
  console.log("  POST-slash (outline only):");
  console.log(`    mouth.waistToOpening length       = ${f1(pocketedWaist)} mm`);
  console.log(`    mouth.openingPath (slash) length  = ${f1(fullOpening)} mm`);
  console.log(
    `  Target band formula uses 2×(front pre-slash)+2×(back)+2×SA — inputs ARE reachable`,
  );
  console.log(
    `  without re-deriving: e.front.outer + e.back.outer (half-body) ×2 + 2×SA for full loop.`,
  );
  console.log(
    `  Note: existing waistband uses HALF bands on fold (F + B separate), not one loop.`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n=== 6. Forbid self-casing + slash — existing path? ===\n");

{
  const cargo = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const v = validateTrousers(body, cargo);
  console.log(
    `  Cargo today: dartedWaistFinish=elastic + pocketFront=slant — CURRENTLY ALLOWED`,
  );
  console.log(
    `  validateTrousers(Cargo elastic+slant): valid=${v.valid} issues=${v.issues.length}`,
  );
  for (const i of v.issues) console.log(`    - ${i.message}`);
  console.log("");
  console.log("  Existing 'derived constraint' pattern (elastic only, TrousersView):");
  console.log("    elasticWaist → frontWaistInset=0, waistTaper=0 at draft boundary");
  console.log("    elasticWaist → draftWaistbandMode=shaped, draftWaistDepth=0");
  console.log("    Does NOT mutate stored style; does NOT refuse pocketFront=slant");
  console.log("");
  console.log("  validateTrousers today checks: waist≤hip, rise<floor, hem>0 only.");
  console.log("  No finish×pocket matrix.");
  console.log("");
  console.log("  Clean forbid paths (not implementing):");
  console.log("    A) validateTrousers: error if elastic && slant");
  console.log("    B) draft-boundary derive: slant → force finish≠elastic / require band finish");
  console.log("    C) UI: disable elastic while slant on (and vice versa)");
}

// ---------------------------------------------------------------------------
console.log("\n=== Target model cross-check (numbers only) ===\n");

{
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const e = trouserWaistEdges(body, style);
  const elasticH = 25;
  const channelEase = 20;
  const bandLen =
    2 * e.front.outer + 2 * e.back.outer + 2 * SA;
  const bandWidthCut = 2 * (elasticH + channelEase + SA);
  console.log(`  pre-slash F top=${f1(e.front.outer)}  B top=${f1(e.back.outer)}`);
  console.log(
    `  band length = 2×(F+B)+2×SA = 2×(${f1(e.front.outer)}+${f1(e.back.outer)})+2×${SA} = ${f1(bandLen)} mm`,
  );
  console.log(
    `  band width (cut) = 2×(elastic+20+SA) = 2×(${elasticH}+${channelEase}+${SA}) = ${bandWidthCut} mm`,
  );
  console.log(
    `  existing shaped band F depth=${CLEO_TROUSER_STYLE.waistbandDepth} (faced contour) — different geometry`,
  );
}

console.log("\n=== END DIAG (no code changed) ===\n");
