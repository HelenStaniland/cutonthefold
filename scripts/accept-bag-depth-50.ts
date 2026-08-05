/**
 * Acceptance: shorten slant pocket bag depth 100 → 50 (Cargo).
 * Run: npx tsx scripts/accept-bag-depth-50.ts
 *
 * Opening unchanged; silhouette invariant; free corner still matches on both bags.
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
  SLANT_HAND_ROOM,
  SLANT_POCKET_BACK_NAME,
  SLANT_POCKET_FRONT_NAME,
} from "../lib/elements/slantFrontPocket";
import { polylineLength } from "../lib/geometry/curves";

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

console.log("=== ACCEPT: slant bag depth 50 mm ===\n");

// --- 1. Default depth + bag bottom position ---
console.log("=== 1. slantBagDepth = 50; bag bottom at 210 ===\n");
{
  if (DEFAULT_SLANT_BAG_DEPTH !== 50) {
    fail(`DEFAULT_SLANT_BAG_DEPTH=${DEFAULT_SLANT_BAG_DEPTH}`);
  } else ok("DEFAULT_SLANT_BAG_DEPTH = 50");

  for (const bod of bodies) {
    const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
    const style = resolveStyle(CARGO_TROUSER_STYLE, body);
    const mouth = resolveFrontSlantPocketMouth(body, style);
    const p = mouth.params;
    if (p.bagDepth !== 50) fail(`${bod.name}: bagDepth=${p.bagDepth}`);
    const catchLen = polylineLength(mouth.sideCatch);
    if (Math.abs(catchLen - 50) > 0.05) {
      fail(`${bod.name}: sideCatch ${f3(catchLen)} ≠ 50`);
    }
    const fromCorner =
      p.openingSideDown + p.bagDepth;
    if (fromCorner !== 210) {
      fail(`${bod.name}: opening+depth=${fromCorner} (expect 210)`);
    }
    if (bod.name === "Helen-print") {
      ok(
        `Helen: openingSideDown=${p.openingSideDown} + bagDepth=${p.bagDepth} ` +
          `= ${fromCorner} mm from corner; sideCatch=${f3(catchLen)}`,
      );
    }
  }
  ok("all sizes: bag bottom at 210 mm down the side");
}

// --- 2. Opening unchanged ---
console.log("\n=== 2. Opening unchanged (100 / 160); mouth byte-identical vs depth 100 ===\n");
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style50 = resolveStyle(CARGO_TROUSER_STYLE, body);
  const style100 = resolveStyle(CARGO_TROUSER_STYLE, body, {
    slantBagDepth: 100,
  });
  const m50 = resolveFrontSlantPocketMouth(body, style50);
  const m100 = resolveFrontSlantPocketMouth(body, style100);

  if (m50.params.openingWaistIn !== DEFAULT_SLANT_OPENING_WAIST_IN) {
    fail("openingWaistIn drifted");
  } else ok(`openingWaistIn=${m50.params.openingWaistIn}`);
  if (m50.params.openingSideDown !== DEFAULT_SLANT_OPENING_SIDE_DOWN) {
    fail("openingSideDown drifted");
  } else ok(`openingSideDown=${m50.params.openingSideDown}`);
  if (m50.params.waistAnchor !== DEFAULT_SLANT_WAIST_ANCHOR) {
    fail("waistAnchor drifted");
  } else ok(`waistAnchor=${m50.params.waistAnchor}`);

  const mouthKeys = ["openingTop", "openingBottom", "waistOpenPt"] as const;
  for (const k of mouthKeys) {
    const a = m50[k];
    const b = m100[k];
    if (Math.hypot(a.x - b.x, a.y - b.y) > EPS) {
      fail(`${k} moved when bagDepth changed`);
    } else ok(`${k} identical at depth 50 vs 100`);
  }

  // Front-leg opening (mouth roles) identical
  const f50 = draftTrouserFront(body, style50);
  const f100 = draftTrouserFront(body, style100);
  const mouth50 = f50.outline
    .filter((o) => o.role === "pocket-mouth")
    .map((o) => `${o.at.x.toFixed(6)},${o.at.y.toFixed(6)}`)
    .join("|");
  const mouth100 = f100.outline
    .filter((o) => o.role === "pocket-mouth")
    .map((o) => `${o.at.x.toFixed(6)},${o.at.y.toFixed(6)}`)
    .join("|");
  if (mouth50 !== mouth100) fail("front pocket-mouth outline moved");
  else ok("front pocket-mouth outline byte-identical");

  // bagSideEnd must move
  if (
    Math.hypot(
      m50.bagSideEnd.x - m100.bagSideEnd.x,
      m50.bagSideEnd.y - m100.bagSideEnd.y,
    ) < 40
  ) {
    fail("bagSideEnd barely moved");
  } else {
    ok(
      `bagSideEnd moved (|Δy|=${f3(Math.abs(m50.bagSideEnd.y - m100.bagSideEnd.y))})`,
    );
  }
}

// --- 3. Silhouette invariant ---
console.log("\n=== 3. Silhouette invariant ===\n");
for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const mouth = resolveFrontSlantPocketMouth(
    body,
    resolveStyle(CARGO_TROUSER_STYLE, body),
  );
  const inv = silhouetteInvariantDelta(mouth);
  if (inv.waistDelta > EPS || inv.sideDelta > EPS) {
    fail(
      `${bod.name}: waistΔ=${f6(inv.waistDelta)} sideΔ=${f6(inv.sideDelta)}`,
    );
  } else ok(`${bod.name}: silhouette 0.000`);
}

// --- 4. Curved corner intact; bags match ---
console.log("\n=== 4. Free corner radius 35; bags match ===\n");
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  const mouth = resolveFrontSlantPocketMouth(body, style);
  if (mouth.params.bagCornerRadius !== DEFAULT_SLANT_BAG_CORNER_RADIUS) {
    fail(`bagCornerRadius=${mouth.params.bagCornerRadius}`);
  } else ok(`bagCornerRadius=${mouth.params.bagCornerRadius}`);

  const towardCf = {
    x: mouth.waistAnchorPt.x - mouth.waistOpenPt.x,
    y: mouth.waistAnchorPt.y - mouth.waistOpenPt.y,
  };
  const L = Math.hypot(towardCf.x, towardCf.y) || 1;
  const hand = {
    x: mouth.waistAnchorPt.x + (towardCf.x / L) * SLANT_HAND_ROOM,
    y: mouth.waistAnchorPt.y + (towardCf.y / L) * SLANT_HAND_ROOM,
  };
  const sq = { x: hand.x, y: mouth.bagSideEnd.y };
  const corner = roundedBottomInnerCorner(
    mouth.bagSideEnd,
    sq,
    hand,
    mouth.params.bagCornerRadius,
  );
  if (corner.appliedRadius < 30) {
    fail(`appliedRadius=${f3(corner.appliedRadius)}`);
  } else {
    ok(
      `Helen: R=${f3(corner.appliedRadius)} pathPts=${corner.path.length} ` +
        `bagSideEnd.y=${f3(mouth.bagSideEnd.y)}`,
    );
  }

  const pieces = draftSlantFrontPocketPieces(mouth);
  const back = pieces.find((p) => p.name === SLANT_POCKET_BACK_NAME)!;
  const front = pieces.find((p) => p.name === SLANT_POCKET_FRONT_NAME)!;
  const mb = pouchCloseMetrics(back);
  const mf = pouchCloseMetrics(front);
  if (mb.verts !== mf.verts || Math.abs(mb.length - mf.length) > 0.05) {
    fail(
      `pouch close mismatch verts ${mb.verts}/${mf.verts} len ${f3(mb.length)}/${f3(mf.length)}`,
    );
  } else ok(`back ≡ front pouch close (${mb.verts} verts, len=${f3(mb.length)})`);
}

// --- 5. other garments / none / net-cut unchanged by depth ---
console.log("\n=== 5. pocketFront none / other garments; net===cut unchanged ===\n");
{
  const body = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const mila = resolveStyle(MILA_TROUSER_STYLE, body);
  const cargoNone = resolveStyle(
    { ...CARGO_TROUSER_STYLE, pocketFront: "none" },
    body,
  );
  if (pairHash(body, mila) !== pairHash(body, cargoNone)) {
    fail("Cargo(none) ≠ Mila");
  } else ok("Cargo(none) ≡ Mila");

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
  ok(`Block ${block.slice(0, 12)}…`);
  ok(`Cleo ${cleo.slice(0, 12)}…`);

  function netCut(depth: number) {
    const style = resolveStyle(CARGO_TROUSER_STYLE, body, {
      slantBagDepth: depth,
    });
    const front = draftTrouserFront(body, style);
    const sa = withSeamAllowance({ pieces: [front] }, DEFAULT_SEAM_ALLOWANCE)
      .pieces[0]!;
    return {
      col: collapseNet(sa.outline).length,
      cut: sa.cuttingOutline?.length ?? -1,
      mouth: outlineHash({
        ...front,
        outline: front.outline.filter((o) => o.role === "pocket-mouth"),
      } as PatternPiece),
    };
  }
  const d50 = netCut(50);
  const d100 = netCut(100);
  if (d50.col !== d100.col || d50.cut !== d100.cut) {
    fail(`net/cut changed with depth: 50→${d50.col}/${d50.cut} 100→${d100.col}/${d100.cut}`);
  } else {
    ok(`front net/cut unchanged by bag depth (collapsed=${d50.col} cut=${d50.cut})`);
  }
  if (d50.mouth !== d100.mouth) fail("mouth hash changed with depth");
  else ok("mouth hash identical at depth 50 vs 100");
}

console.log(
  `\n=== DONE: ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===\n`,
);
if (failures > 0) process.exit(1);
