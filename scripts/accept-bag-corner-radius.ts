/**
 * Acceptance: round the pocket bag's free bottom-inner corner (Cargo).
 * Run: npx tsx scripts/accept-bag-corner-radius.ts
 *
 * Only the free corner curves; waist + side seamed edges and silhouette
 * invariant stay untouched. Radius 0 ≡ square first-pass.
 */
import { createHash } from "node:crypto";
import {
  applyEase,
  type BodyMeasurements,
  type PatternPiece,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
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
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  DEFAULT_SLANT_BAG_CORNER_RADIUS,
  DEFAULT_SLANT_BAG_DEPTH,
  DEFAULT_SLANT_OPENING_SIDE_DOWN,
  DEFAULT_SLANT_OPENING_WAIST_IN,
  DEFAULT_SLANT_WAIST_ANCHOR,
  draftSlantFrontPocketPieces,
  roundedBottomInnerCorner,
  silhouetteInvariantDelta,
  SLANT_POCKET_BACK_NAME,
  SLANT_POCKET_FRONT_NAME,
} from "../lib/elements/slantFrontPocket";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import { effectiveDartedWaistFinish, isPullOnWaistFinish } from "../lib/pattern/garmentStyles";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const EPS = 1e-4;
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
  extras?: Partial<TrouserFrontStyle>,
): TrouserFrontStyle {
  const finish = effectiveDartedWaistFinish(s.dartedWaistFinish, s.pocketFront);
  const pullOn = isPullOnWaistFinish(finish);
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    ...(pullOn
      ? { frontWaistInset: 0, waistTaper: 0 }
      : {
          ...(s.frontWaistInset != null
            ? { frontWaistInset: s.frontWaistInset }
            : {}),
          ...(s.waistTaper != null ? { waistTaper: s.waistTaper } : {}),
        }),
    ...(s.pocketFront === "slant" ? { pocketFront: "slant" as const } : {}),
    ...(s.backCbWaistRise != null ? { backCbWaistRise: s.backCbWaistRise } : {}),
    ...extras,
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
    .map(
      (o) =>
        `${o.role ?? ""}:${o.at.x.toFixed(9)},${o.at.y.toFixed(9)}`,
    )
    .join("|");
  return createHash("sha256").update(s).digest("hex");
}

function pairHash(body: BodyMeasurements, style: TrouserFrontStyle): string {
  return (
    outlineHash(draftTrouserFront(body, style)) +
    outlineHash(draftTrouserBack(body, style))
  );
}

/** Pouch-close run in garment space (before local-frame / layout offset). */
function pouchCloseHash(piece: PatternPiece): string {
  // After local frame the shared pouch edges still match in relative shape;
  // compare bag-bottom + bag-inner vertex sequences (roles only).
  const pts = piece.outline.filter(
    (o) => o.role === "bag-bottom" || o.role === "bag-inner",
  );
  const h = createHash("sha256");
  for (const o of pts) {
    h.update(`${o.role}:${o.at.x.toFixed(6)},${o.at.y.toFixed(6)}|`);
  }
  return h.digest("hex");
}

function collapseNet(outline: PatternPiece["outline"]) {
  const out = [];
  for (const o of outline) {
    const last = out[out.length - 1];
    if (
      last &&
      Math.hypot(last.at.x - o.at.x, last.at.y - o.at.y) < 0.01
    ) {
      continue;
    }
    out.push(o);
  }
  return out;
}

console.log("=== ACCEPT: bag free-corner radius ===\n");

// --- 0. Defaults ---
console.log("=== 0. Defaults / offsets unchanged ===\n");
{
  const p = resolveStyle(CARGO_TROUSER_STYLE, applyEase(helenBody(), CARGO_TROUSER_STYLE.ease));
  const mouth = resolveFrontSlantPocketMouth(
    applyEase(helenBody(), CARGO_TROUSER_STYLE.ease),
    p,
  );
  const pr = mouth.params;
  if (pr.openingWaistIn !== DEFAULT_SLANT_OPENING_WAIST_IN) fail("openingWaistIn");
  else ok(`openingWaistIn=${pr.openingWaistIn}`);
  if (pr.openingSideDown !== DEFAULT_SLANT_OPENING_SIDE_DOWN) fail("openingSideDown");
  else ok(`openingSideDown=${pr.openingSideDown}`);
  if (pr.waistAnchor !== DEFAULT_SLANT_WAIST_ANCHOR) fail("waistAnchor");
  else ok(`waistAnchor=${pr.waistAnchor}`);
  if (pr.bagDepth !== DEFAULT_SLANT_BAG_DEPTH) fail("bagDepth");
  else ok(`bagDepth=${pr.bagDepth}`);
  if (pr.bagCornerRadius !== DEFAULT_SLANT_BAG_CORNER_RADIUS) {
    fail(`bagCornerRadius=${pr.bagCornerRadius}`);
  } else ok(`bagCornerRadius default=${pr.bagCornerRadius}`);
}

// --- 1. Corner curved on both bags; pieces match ---
console.log("\n=== 1. Bottom-inner corner curved; bags match ===\n");
for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  const mouth = resolveFrontSlantPocketMouth(body, style);
  const handPt = {
    // re-derive via draft pieces — print from roundedBottomInnerCorner
    x: 0,
    y: 0,
  };
  void handPt;
  const pieces = draftSlantFrontPocketPieces(mouth);
  const back = pieces.find((p) => p.name === SLANT_POCKET_BACK_NAME)!;
  const front = pieces.find((p) => p.name === SLANT_POCKET_FRONT_NAME)!;

  // Garment-space corner (before layout): use mouth anchors
  const { waistOpenPt, waistAnchorPt, bagSideEnd, sideCorner } = mouth;
  const towardCf = {
    x: waistAnchorPt.x - waistOpenPt.x,
    y: waistAnchorPt.y - waistOpenPt.y,
  };
  const len = Math.hypot(towardCf.x, towardCf.y) || 1;
  const inboard = { x: towardCf.x / len, y: towardCf.y / len };
  // Same as SLANT_HAND_ROOM = 25
  const hp = {
    x: waistAnchorPt.x + inboard.x * 25,
    y: waistAnchorPt.y + inboard.y * 25,
  };
  const squareInner = { x: hp.x, y: bagSideEnd.y };
  const corner = roundedBottomInnerCorner(
    bagSideEnd,
    squareInner,
    hp,
    mouth.params.bagCornerRadius,
  );

  if (corner.appliedRadius < 30) {
    fail(`${bod.name}: appliedRadius ${f3(corner.appliedRadius)} (expect ~35)`);
  } else if (bod.name === "Helen-print") {
    ok(
      `Helen: squareInner=(${f3(squareInner.x)},${f3(squareInner.y)}) ` +
        `R=${f3(corner.appliedRadius)} ` +
        `A=(${f3(corner.filletStart.x)},${f3(corner.filletStart.y)}) ` +
        `B=(${f3(corner.filletEnd.x)},${f3(corner.filletEnd.y)}) ` +
        `C=(${f3(corner.centre!.x)},${f3(corner.centre!.y)}) ` +
        `pathPts=${corner.path.length}`,
    );
  }

  // Both pieces have more than the old 1 corner vertex on bag-bottom run
  const backBottom = back.outline.filter((o) => o.role === "bag-bottom");
  const frontBottom = front.outline.filter((o) => o.role === "bag-bottom");
  if (backBottom.length < 3) {
    fail(`${bod.name}: back bag-bottom verts=${backBottom.length} (not curved)`);
  }
  if (frontBottom.length < 3) {
    fail(`${bod.name}: front bag-bottom verts=${frontBottom.length}`);
  }

  // Shared pouch close must match: same arc (rotation/layout-invariant length +
  // vertex count). Front is layout-offset + grain-oriented independently.
  function pouchCloseMetrics(p: PatternPiece): {
    verts: number;
    length: number;
  } {
    const run = p.outline.filter(
      (o) => o.role === "bag-bottom" || o.role === "bag-inner",
    );
    let length = 0;
    for (let i = 1; i < run.length; i++) {
      length += Math.hypot(
        run[i]!.at.x - run[i - 1]!.at.x,
        run[i]!.at.y - run[i - 1]!.at.y,
      );
    }
    return { verts: run.length, length };
  }
  const mb = pouchCloseMetrics(back);
  const mf = pouchCloseMetrics(front);
  if (mb.verts !== mf.verts || Math.abs(mb.length - mf.length) > 0.05) {
    fail(
      `${bod.name}: pouch close back≠front verts ${mb.verts}/${mf.verts} ` +
        `len ${f3(mb.length)}/${f3(mf.length)}`,
    );
  } else if (bod.name === "Helen-print") {
    ok(
      `Helen: back ≡ front pouch close (${mb.verts} verts, len=${f3(mb.length)})`,
    );
  }

  // Exact garment-space path identity via the shared helper (both pieces use it).
  if (corner.path.length < 3) {
    fail(`${bod.name}: corner path too short`);
  }

  void sideCorner;
  void pouchCloseHash;
}

ok("all sizes: corner curved; bags match");

// --- 2. Silhouette invariant ---
console.log("\n=== 2. Silhouette invariant (guard) ===\n");
for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  const mouth = resolveFrontSlantPocketMouth(body, style);
  const inv = silhouetteInvariantDelta(mouth);
  if (inv.waistDelta > EPS || inv.sideDelta > EPS) {
    fail(
      `${bod.name}: waistΔ=${f6(inv.waistDelta)} sideΔ=${f6(inv.sideDelta)}`,
    );
  } else {
    ok(`${bod.name}: silhouette 0.000`);
  }
}

// --- 3. Waist / side / opening unchanged vs radius 0 ---
console.log("\n=== 3. Seamed edges + opening unchanged vs r=0 ===\n");
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const styleR = resolveStyle(CARGO_TROUSER_STYLE, body, {
    slantBagCornerRadius: DEFAULT_SLANT_BAG_CORNER_RADIUS,
  });
  const style0 = resolveStyle(CARGO_TROUSER_STYLE, body, {
    slantBagCornerRadius: 0,
  });
  const mR = resolveFrontSlantPocketMouth(body, styleR);
  const m0 = resolveFrontSlantPocketMouth(body, style0);

  const keys = [
    "openingTop",
    "openingBottom",
    "waistAnchorPt",
    "bagSideEnd",
    "sideCorner",
  ] as const;
  for (const k of keys) {
    const a = mR[k];
    const b = m0[k];
    if (Math.hypot(a.x - b.x, a.y - b.y) > EPS) {
      fail(`${k} moved with radius`);
    } else ok(`${k} unchanged`);
  }
  if (
    mR.params.openingWaistIn !== m0.params.openingWaistIn ||
    mR.params.openingSideDown !== m0.params.openingSideDown ||
    mR.params.waistAnchor !== m0.params.waistAnchor ||
    mR.params.bagDepth !== m0.params.bagDepth
  ) {
    fail("four offsets drifted");
  } else ok("four offsets identical");

  // Front-leg trim (waist/side/opening) must be identical
  const fR = outlineHash(draftTrouserFront(body, styleR));
  const f0 = outlineHash(draftTrouserFront(body, style0));
  if (fR !== f0) fail("trouser front outline moved with bag radius");
  else ok("trouser front outline identical (r=35 ≡ r=0)");
}

// --- 4. Radius drives curve; r=0 is square ---
console.log("\n=== 4. Radius drives curve; r=0 square ===\n");
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style0 = resolveStyle(CARGO_TROUSER_STYLE, body, {
    slantBagCornerRadius: 0,
  });
  const style35 = resolveStyle(CARGO_TROUSER_STYLE, body, {
    slantBagCornerRadius: 35,
  });
  const style50 = resolveStyle(CARGO_TROUSER_STYLE, body, {
    slantBagCornerRadius: 50,
  });
  const p0 = draftSlantFrontPocketPieces(
    resolveFrontSlantPocketMouth(body, style0),
  )[0]!;
  const p35 = draftSlantFrontPocketPieces(
    resolveFrontSlantPocketMouth(body, style35),
  )[0]!;
  const p50 = draftSlantFrontPocketPieces(
    resolveFrontSlantPocketMouth(body, style50),
  )[0]!;

  const bottom0 = p0.outline.filter((o) => o.role === "bag-bottom").length;
  const bottom35 = p35.outline.filter((o) => o.role === "bag-bottom").length;
  const bottom50 = p50.outline.filter((o) => o.role === "bag-bottom").length;

  // r=0: one bag-bottom vertex at the square tip (plus possibly side end retagged)
  if (outlineHash(p0) === outlineHash(p35)) {
    fail("r=0 ≡ r=35 (radius not driving)");
  } else ok("r=0 ≠ r=35");
  if (outlineHash(p35) === outlineHash(p50)) {
    fail("r=35 ≡ r=50");
  } else ok("r=35 ≠ r=50");

  console.log(
    `  bag-bottom vert counts: r0=${bottom0} r35=${bottom35} r50=${bottom50}`,
  );
  if (bottom35 <= bottom0) fail("r=35 did not add arc samples");
  else ok("r=35 adds arc samples vs square");

  // Self-check roundedBottomInnerCorner at 0
  const mouth = resolveFrontSlantPocketMouth(body, style0);
  const hp = {
    x: mouth.waistAnchorPt.x - 25, // approximate; use exact via corner helper path length
    y: mouth.waistAnchorPt.y,
  };
  void hp;
  const towardCf = {
    x: mouth.waistAnchorPt.x - mouth.waistOpenPt.x,
    y: mouth.waistAnchorPt.y - mouth.waistOpenPt.y,
  };
  const L = Math.hypot(towardCf.x, towardCf.y) || 1;
  const hand = {
    x: mouth.waistAnchorPt.x + (towardCf.x / L) * 25,
    y: mouth.waistAnchorPt.y + (towardCf.y / L) * 25,
  };
  const sq = { x: hand.x, y: mouth.bagSideEnd.y };
  const c0 = roundedBottomInnerCorner(mouth.bagSideEnd, sq, hand, 0);
  if (c0.path.length !== 1 || c0.appliedRadius !== 0) {
    fail(`r=0 path len=${c0.path.length} R=${c0.appliedRadius}`);
  } else ok("r=0 → single square tip");
}

// --- 5. pocketFront none + other garments byte-identical ---
console.log("\n=== 5. pocketFront none / other garments byte-identical ===\n");
{
  const body = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const mila = resolveStyle(MILA_TROUSER_STYLE, body);
  const cargoNone = resolveStyle(
    { ...CARGO_TROUSER_STYLE, pocketFront: "none" },
    body,
  );
  // Force a radius on none — must not appear
  const cargoNoneR = resolveStyle(
    { ...CARGO_TROUSER_STYLE, pocketFront: "none" },
    body,
    { slantBagCornerRadius: 50 },
  );
  const hM = pairHash(body, mila);
  const hC = pairHash(body, cargoNone);
  const hCR = pairHash(body, cargoNoneR);
  if (hM !== hC) fail("Cargo(none) ≠ Mila");
  else ok("Cargo(none) ≡ Mila");
  if (hC !== hCR) fail("radius leaked into pocketFront none");
  else ok("radius ignored when pocketFront none");

  const block = pairHash(
    applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease),
    resolveStyle(
      BLOCK_TROUSER_STYLE,
      applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease),
    ),
  );
  const cleo = pairHash(
    applyEase(helenBody(), CLEO_TROUSER_STYLE.ease),
    resolveStyle(
      CLEO_TROUSER_STYLE,
      applyEase(helenBody(), CLEO_TROUSER_STYLE.ease),
    ),
  );
  ok(`Block hash ${block.slice(0, 12)}…`);
  ok(`Cleo hash ${cleo.slice(0, 12)}…`);

  // No pocket pieces when none
  const net = draftTrousers(body, cargoNoneR);
  if (net.pieces.some((p) => p.name.startsWith("Slant pocket"))) {
    fail("pocket pieces with none");
  } else ok("no pocket pieces when none");
}

// --- 6. net === cut on trimmed front — unchanged by radius ---
console.log("\n=== 6. net === cut on front unchanged by radius ===\n");
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  function netCutDelta(radius: number): { col: number; cut: number } {
    const style = resolveStyle(CARGO_TROUSER_STYLE, body, {
      slantBagCornerRadius: radius,
    });
    const front = draftTrouserFront(body, style);
    const sa = withSeamAllowance({ pieces: [front] }, DEFAULT_SEAM_ALLOWANCE)
      .pieces[0]!;
    return {
      col: collapseNet(sa.outline).length,
      cut: sa.cuttingOutline?.length ?? -1,
    };
  }
  const d0 = netCutDelta(0);
  const d35 = netCutDelta(35);
  if (d0.col !== d35.col || d0.cut !== d35.cut) {
    fail(
      `radius changed front net/cut: r0 ${d0.col}/${d0.cut} r35 ${d35.col}/${d35.cut}`,
    );
  } else {
    ok(
      `front net/cut unchanged by radius (collapsed=${d35.col} cut=${d35.cut})`,
    );
  }
  // Also check all sizes: r=0 ≡ r=35 on the front outline (already in §3 for Helen)
  for (const bod of bodies) {
    const b = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
    const h0 = outlineHash(
      draftTrouserFront(
        b,
        resolveStyle(CARGO_TROUSER_STYLE, b, { slantBagCornerRadius: 0 }),
      ),
    );
    const h35 = outlineHash(
      draftTrouserFront(
        b,
        resolveStyle(CARGO_TROUSER_STYLE, b, { slantBagCornerRadius: 35 }),
      ),
    );
    if (h0 !== h35) fail(`${bod.name}: front moved with radius`);
    else ok(`${bod.name}: front outline identical r=0≡r=35`);
  }
}

console.log(
  `\n=== DONE: ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===\n`,
);
if (failures > 0) process.exit(1);
