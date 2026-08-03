/**
 * Acceptance: four-offset slant front pocket (Cargo) — two all-fabric pieces.
 * Run: npx tsx scripts/accept-slant-front-pocket.ts
 *
 * Gates (brief): pocket-off byte-identical; two pieces (back+front, no facing);
 * pocket front is a full piece; silhouette invariant; net===cut; casing on both
 * waist catches; four params drive shape.
 */
import { createHash } from "node:crypto";
import {
  applyEase,
  type BodyMeasurements,
  type OutlinePoint,
  type PatternPiece,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import { applyTrouserHemTurnback } from "../lib/geometry/trouserHemTurnback";
import {
  applyTrouserWaistCasingToPattern,
  applyTrouserWaistCasingTurnup,
  resolveCasingDepths,
} from "../lib/geometry/trouserWaistCasing";
import {
  edgeRunsForRoles,
  runToNetPolyline,
} from "../lib/patternHighlight";
import { polylineLength } from "../lib/geometry/curves";
import {
  BLOCK_TROUSER_STYLE,
  CARGO_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  bagSideSpanMm,
  bagWaistCatchMm,
  blockFromWaistDrop,
  DEFAULT_SLANT_BAG_DEPTH,
  DEFAULT_SLANT_OPENING_SIDE_DOWN,
  DEFAULT_SLANT_OPENING_WAIST_IN,
  DEFAULT_SLANT_WAIST_ANCHOR,
  draftTrouserBack,
  draftTrouserFront,
  draftTrousers,
  pocketFrontIsFullPiece,
  resolveBodyWaistY,
  resolveFrontSlantPocketMouth,
  silhouetteInvariantDelta,
  SLANT_POCKET_BACK_NAME,
  SLANT_POCKET_FRONT_NAME,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const DROP_SWEEP = [0, 10, 25, 40, 50] as const;
const EPS = 1e-6;

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
  slantOverrides?: Partial<{
    slantOpeningWaistIn: number;
    slantOpeningSideDown: number;
    slantWaistAnchor: number;
    slantBagDepth: number;
  }>,
): TrouserFrontStyle {
  const finish = finishOverride ?? s.dartedWaistFinish;
  const elastic = finish === "elastic";
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
    ...(elastic
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
    ...(s.pocketFront === "slant" ? { pocketFront: "slant" as const } : {}),
    ...slantOverrides,
  };
  if (elastic) {
    return withWaistband(base, 0, "shaped", body);
  }
  if (finish === "facing") {
    return withWaistband(base, 0, "darted", body);
  }
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
      if (m.kind === "notch") {
        return `notch:${m.at.x.toFixed(6)},${m.at.y.toFixed(6)}:${m.label ?? ""}`;
      }
      if (m.kind === "grainline") {
        return `grain:${m.line.from.x.toFixed(6)},${m.line.from.y.toFixed(6)}`;
      }
      if (m.kind === "dart") {
        return `dart:${m.apex.x.toFixed(6)}`;
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

function collapseNet(outline: OutlinePoint[]): OutlinePoint[] {
  const DUP = 0.01;
  const collapsed: OutlinePoint[] = [];
  for (const point of outline) {
    const last = collapsed[collapsed.length - 1];
    if (
      last &&
      Math.hypot(point.at.x - last.at.x, point.at.y - last.at.y) < DUP
    ) {
      continue;
    }
    collapsed.push(point);
  }
  if (collapsed.length > 1) {
    const first = collapsed[0]!;
    const last = collapsed[collapsed.length - 1]!;
    if (Math.hypot(first.at.x - last.at.x, first.at.y - last.at.y) < DUP) {
      collapsed.pop();
    }
  }
  return collapsed;
}

console.log("=== ACCEPT: four-offset slant front pocket (Cargo) ===\n");

// ---------------------------------------------------------------------------
console.log(
  "=== 1. pocketFront none → block / Cleo / Mila / Cargo(none) byte-identical ===\n",
);

for (const bod of bodies) {
  const body = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const mila = resolveStyle(MILA_TROUSER_STYLE, body);
  const cargoNone = resolveStyle(
    { ...CARGO_TROUSER_STYLE, pocketFront: "none" },
    body,
  );
  const hM = pairHash(body, mila);
  const hC = pairHash(body, cargoNone);
  if (hM !== hC) fail(`${bod.name}: Cargo(none) ≠ Mila`);
  else ok(`${bod.name}: Cargo(none) ≡ Mila`);
}

{
  const body = applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease);
  const omit = resolveStyle(BLOCK_TROUSER_STYLE, body);
  const explicit = resolveStyle(
    { ...BLOCK_TROUSER_STYLE, pocketFront: "none" },
    body,
  );
  if (pairHash(body, omit) !== pairHash(body, explicit)) {
    fail("Block: omit pocketFront ≠ explicit none");
  } else ok("Block: omit ≡ explicit none");
}

{
  const body = applyEase(helenBody(), CLEO_TROUSER_STYLE.ease);
  const h = pairHash(body, resolveStyle(CLEO_TROUSER_STYLE, body));
  ok(`Cleo pocket-off hash ${h.slice(0, 12)}… (smoke)`);
}

// ---------------------------------------------------------------------------
console.log(
  "\n=== 2. Silhouette invariant (front-trim + bag ≡ pocket-off waist/side) ===\n",
);

let invariantOk = true;
for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  for (const finish of ["facing", "elastic"] as const) {
    const style = resolveStyle(CARGO_TROUSER_STYLE, body, finish);
    const mouth = resolveFrontSlantPocketMouth(body, style);
    const inv = silhouetteInvariantDelta(mouth);
    const sideBag = bagSideSpanMm(mouth);
    const waistCatch = bagWaistCatchMm(mouth);
    const label = `${bod.name}/${finish}`;
    console.log(
      `  ${label}: waistΔ=${f6(inv.waistDelta)} sideΔ=${f6(inv.sideDelta)}` +
        ` | bag side span=${f3(sideBag)} waist catch=${f3(waistCatch)}`,
    );
    if (inv.waistDelta > EPS || inv.sideDelta > EPS) {
      fail(`${label}: silhouette Δ not 0`);
      invariantOk = false;
    } else {
      ok(`${label}: waist+side reconstruct (Δ=0)`);
    }
  }
}
if (!invariantOk) {
  console.log(
    "\n*** STOP: silhouette invariant failed — do not re-baseline. ***\n",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. net === cut on real trimmed front (SA + hem / casing) ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const styleOn = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic");
  const styleOff = resolveStyle(
    { ...CARGO_TROUSER_STYLE, pocketFront: "none" },
    body,
    "elastic",
  );
  const frontOn = draftTrouserFront(body, styleOn);
  const frontOff = draftTrouserFront(body, styleOff);
  const saOn = withSeamAllowance(
    { pieces: [frontOn] },
    DEFAULT_SEAM_ALLOWANCE,
  ).pieces[0]!;
  const saOff = withSeamAllowance(
    { pieces: [frontOff] },
    DEFAULT_SEAM_ALLOWANCE,
  ).pieces[0]!;

  const colOn = collapseNet(saOn.outline).length;
  const cutOn = saOn.cuttingOutline?.length ?? -1;
  const cutOff = saOff.cuttingOutline?.length ?? -1;

  if (colOn !== cutOn) {
    fail(`${bod.name}: collapsed net ${colOn} ≠ cut ${cutOn}`);
  } else {
    ok(`${bod.name}: collapsed net === cut (${colOn})`);
  }
  if (saOn.outline.length - cutOn !== saOff.outline.length - cutOff) {
    fail(
      `${bod.name}: raw−cut delta slant=${saOn.outline.length - cutOn} off=${saOff.outline.length - cutOff}`,
    );
  } else {
    ok(
      `${bod.name}: raw−cut delta matches pocket-off (${saOn.outline.length - cutOn})`,
    );
  }

  const depths = resolveCasingDepths(25);
  const cased = applyTrouserWaistCasingTurnup(saOn, depths);
  const turned = applyTrouserHemTurnback(cased, 40);
  if (!turned.netToCutIndex) {
    fail(`${bod.name}: hem/casing missing netToCutIndex`);
  } else if (turned.netToCutIndex.length !== turned.outline.length) {
    fail(`${bod.name}: netToCutIndex length mismatch`);
  } else {
    ok(
      `${bod.name}: casing+hem netToCutIndex present (${turned.netToCutIndex.length})`,
    );
  }

  const roles = ["waist", "pocket-mouth", "side-seam", "hem"] as const;
  let highlightOk = true;
  for (const role of roles) {
    const runs = edgeRunsForRoles(saOn.outline, [role]);
    if (runs.length === 0) {
      fail(`${bod.name}: no run for ${role}`);
      highlightOk = false;
      continue;
    }
    const net = runToNetPolyline(saOn, runs[0]!);
    if (net.length < 1) {
      fail(`${bod.name}: empty net run ${role}`);
      highlightOk = false;
    }
  }
  if (highlightOk) ok(`${bod.name}: highlight role runs present on trimmed net`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Opening reaches side; bag caught into waist + side ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "facing");
  const mouth = resolveFrontSlantPocketMouth(body, style);
  const bodyY = resolveBodyWaistY(body, style);
  const p = mouth.params;

  console.log(
    `  defaults: openingWaistIn=${p.openingWaistIn} openingSideDown=${p.openingSideDown}` +
      ` waistAnchor=${p.waistAnchor} bagDepth=${p.bagDepth}`,
  );
  if (
    p.openingWaistIn !== DEFAULT_SLANT_OPENING_WAIST_IN ||
    p.openingSideDown !== DEFAULT_SLANT_OPENING_SIDE_DOWN ||
    p.waistAnchor !== DEFAULT_SLANT_WAIST_ANCHOR ||
    p.bagDepth !== DEFAULT_SLANT_BAG_DEPTH
  ) {
    fail(
      `defaults not 100/160/60/100 — got ${p.openingWaistIn}/${p.openingSideDown}/${p.waistAnchor}/${p.bagDepth}`,
    );
  } else ok("defaults 100 / 160 / 60 / 100");

  // Opening bottom on the side seam (first point of sideFromOpening)
  const sideStart = mouth.sideFromOpening[0]!;
  const dOpen =
    Math.hypot(
      sideStart.x - mouth.openingBottom.x,
      sideStart.y - mouth.openingBottom.y,
    );
  if (dOpen > 0.05) fail(`opening bottom not on side seam (|Δ|=${f3(dOpen)})`);
  else ok("opening bottom on side seam (reaches side)");

  const sideCatchLen = polylineLength(mouth.sideCatch);
  const waistCatchLen = bagWaistCatchMm(mouth);
  const sideRestoredLen = polylineLength(mouth.sideRestored);
  console.log(
    `  bag side catch span (opening→bagSideEnd) = ${f3(sideCatchLen)} mm (expect ~${p.bagDepth})`,
  );
  console.log(
    `  bag side total on bag (restored+catch) = ${f3(bagSideSpanMm(mouth))} mm` +
      ` (restored=${f3(sideRestoredLen)} + catch=${f3(sideCatchLen)})`,
  );
  console.log(
    `  bag waist catch span = ${f3(waistCatchLen)} mm (expect ~${p.waistAnchor})`,
  );
  if (Math.abs(sideCatchLen - p.bagDepth) > 0.5) {
    fail(`side catch ${f3(sideCatchLen)} ≠ bagDepth ${p.bagDepth}`);
  } else ok(`bag caught into side by ~${p.bagDepth} mm past opening`);
  if (Math.abs(waistCatchLen - p.waistAnchor) > 0.5) {
    fail(`waist catch ${f3(waistCatchLen)} ≠ waistAnchor ${p.waistAnchor}`);
  } else ok(`bag caught into waist by ~${p.waistAnchor} mm past opening top`);

  console.log(
    `  openingTop y=${f3(mouth.openingTop.y)} turndownY=${f3(mouth.turndownY)} |Δ|=${f3(Math.abs(mouth.openingTop.y - mouth.turndownY))}`,
  );
  console.log(
    `  waistOpenPt y=${f3(mouth.waistOpenPt.y)} (waist catch on turndown)`,
  );
  if (Math.abs(mouth.openingTop.y - mouth.turndownY) > 0.05) {
    fail("openingTop not on turndown");
  } else ok("openingTop = turndown (Δ 0)");
  if (Math.abs(mouth.waistOpenPt.y - mouth.turndownY) > 0.05) {
    fail("waistOpenPt not on turndown");
  } else ok("waistOpenPt on turndown");
}

// ---------------------------------------------------------------------------
console.log("\n=== 5. Two all-fabric pieces (back + front); no facing ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "facing");
  const pat = draftTrousers(body, style);
  const names = pat.pieces.map((p) => p.name);
  console.log(`  piece list: ${names.join(", ")}`);
  for (const n of [
    "Trouser front",
    "Trouser back",
    SLANT_POCKET_BACK_NAME,
    SLANT_POCKET_FRONT_NAME,
  ]) {
    if (!names.includes(n)) fail(`missing piece ${n}`);
    else ok(`piece present: ${n}`);
  }
  for (const banned of [
    "Slant pocket facing",
    "Slant pocket stay",
    "Slant pocket bag",
  ]) {
    if (names.includes(banned)) fail(`unexpected piece still present: ${banned}`);
  }
  if (pat.pieces.length !== 4) {
    fail(`expected 4 pieces, got ${pat.pieces.length}`);
  } else ok(`draftTrousers → ${pat.pieces.length} pieces (2 pocket + legs)`);

  const pocketFront = pat.pieces.find((p) => p.name === SLANT_POCKET_FRONT_NAME)!;
  const pocketBack = pat.pieces.find((p) => p.name === SLANT_POCKET_BACK_NAME)!;
  const full = pocketFrontIsFullPiece(pocketFront);
  console.log(
    `  pocket-front roles: ${full.roles.join(", ")}` +
      ` | openingLen=${f3(full.openingLen)} maxExtent=${f3(full.maxExtent)}`,
  );
  if (!full.ok) fail("pocket front looks like a strip / unfinished opening");
  else ok("pocket front is a full piece (not a facing strip)");

  // Opening edge equals the opening diagonal length
  const mouth = resolveFrontSlantPocketMouth(body, style);
  const slantLen = Math.hypot(
    mouth.openingBottom.x - mouth.openingTop.x,
    mouth.openingBottom.y - mouth.openingTop.y,
  );
  if (Math.abs(full.openingLen - slantLen) > 0.5) {
    fail(
      `pocket-front opening ${f3(full.openingLen)} ≠ slant ${f3(slantLen)}`,
    );
  } else ok(`pocket-front opening edge = slant diagonal (${f3(slantLen)} mm)`);

  // Shared pouch: both have bag-inner / bag-bottom roles
  const backRoles = [
    ...new Set(pocketBack.outline.map((o) => o.role).filter(Boolean)),
  ];
  if (!backRoles.includes("waist") || !backRoles.includes("side-seam")) {
    fail(`pocket back missing catch roles: ${backRoles.join(",")}`);
  } else ok("pocket back carries waist + side (restored corner)");

  const frontLeg = pat.pieces.find((p) => p.name === "Trouser front")!;
  const mouthLabels = frontLeg.markings
    .filter((m) => m.kind === "notch")
    .map((m) => (m.kind === "notch" ? m.label : ""))
    .filter(Boolean);
  if (!mouthLabels.includes("mouth-top") || !mouthLabels.includes("mouth-side")) {
    fail(`front mouth notches: ${mouthLabels.join(",")}`);
  } else ok("front has mouth-top + mouth-side balance notches");
  if (!frontLeg.outline.some((o) => o.role === "pocket-mouth")) {
    fail("front missing pocket-mouth role");
  } else ok("front has pocket-mouth role");
}

// ---------------------------------------------------------------------------
console.log("\n=== 6. Casing coexistence — pockets excluded from fold-over ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic");
  const mouth = resolveFrontSlantPocketMouth(body, style);
  const waistCatch = bagWaistCatchMm(mouth);
  const pat0 = draftTrousers(body, style);
  const sa = withSeamAllowance(pat0, DEFAULT_SEAM_ALLOWANCE);
  const depths = resolveCasingDepths(25);
  const cased = applyTrouserWaistCasingToPattern(sa, depths);
  const pocketBack = cased.pieces.find((p) => p.name === SLANT_POCKET_BACK_NAME)!;
  const pocketFront = cased.pieces.find(
    (p) => p.name === SLANT_POCKET_FRONT_NAME,
  )!;
  const frontLeg = cased.pieces.find((p) => p.name === "Trouser front")!;
  if (!frontLeg.waistCasing) fail("trouser front missing waistCasing");
  else ok("trouser front keeps casing");
  if (pocketBack.waistCasing) fail("pocket back still has waistCasing");
  else ok(`RULE: pocket back excluded (waist catch ~${f3(waistCatch)} mm plain)`);
  if (pocketFront.waistCasing) fail("pocket front still has waistCasing");
  else ok("RULE: pocket front excluded from casing fold-over");
}

// ---------------------------------------------------------------------------
console.log("\n=== 7. Drop-following (opening stays on bodyWaistY) ===\n");

{
  const baseBody = helenBody();
  for (const drop of DROP_SWEEP) {
    const settings: TrouserStyleSettings = {
      ...CARGO_TROUSER_STYLE,
      waistDrop: drop,
    };
    const body = applyEase(baseBody, settings.ease);
    const style = resolveStyle(settings, body, "elastic");
    const bodyY = resolveBodyWaistY(body, style);
    const mouth = resolveFrontSlantPocketMouth(body, style);
    console.log(
      `  drop=${drop}: bodyWaistY=${f3(bodyY)} turndownY=${f3(mouth.turndownY)} openingTop.y=${f3(mouth.openingTop.y)} openingBottom.y=${f3(mouth.openingBottom.y)}`,
    );
    if (Math.abs(mouth.turndownY - bodyY) > 0.05) {
      fail(`drop ${drop}: turndownY ≠ bodyWaistY`);
    }
    if (Math.abs(mouth.openingTop.y - mouth.turndownY) > 0.05) {
      fail(`drop ${drop}: openingTop not on turndown`);
    } else {
      ok(`drop ${drop}: opening-top = turndown (Δ 0)`);
    }
    if (mouth.openingBottom.y <= mouth.openingTop.y + 1) {
      fail(`drop ${drop}: opening-bottom not below opening-top`);
    } else {
      ok(`drop ${drop}: opening-bottom below opening-top (arc)`);
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 8. Four params drive shape ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const base = resolveStyle(CARGO_TROUSER_STYLE, body);
  const g0 = resolveFrontSlantPocketMouth(body, base);

  const gWaistIn = resolveFrontSlantPocketMouth(
    body,
    resolveStyle(CARGO_TROUSER_STYLE, body, undefined, {
      slantOpeningWaistIn: 120,
    }),
  );
  const gSideDown = resolveFrontSlantPocketMouth(
    body,
    resolveStyle(CARGO_TROUSER_STYLE, body, undefined, {
      slantOpeningSideDown: 180,
    }),
  );
  const gAnchor = resolveFrontSlantPocketMouth(
    body,
    resolveStyle(CARGO_TROUSER_STYLE, body, undefined, {
      slantWaistAnchor: 80,
    }),
  );
  const gDepth = resolveFrontSlantPocketMouth(
    body,
    resolveStyle(CARGO_TROUSER_STYLE, body, undefined, {
      slantBagDepth: 120,
    }),
  );

  const dTop = Math.hypot(
    gWaistIn.openingTop.x - g0.openingTop.x,
    gWaistIn.openingTop.y - g0.openingTop.y,
  );
  if (dTop < 5) fail(`slantOpeningWaistIn 120 did not move openingTop (|Δ|=${f3(dTop)})`);
  else ok(`slantOpeningWaistIn moves openingTop (|Δ|=${f3(dTop)})`);

  const dBot = Math.hypot(
    gSideDown.openingBottom.x - g0.openingBottom.x,
    gSideDown.openingBottom.y - g0.openingBottom.y,
  );
  if (dBot < 5) fail(`slantOpeningSideDown 180 did not move openingBottom (|Δ|=${f3(dBot)})`);
  else ok(`slantOpeningSideDown moves openingBottom (|Δ|=${f3(dBot)})`);

  const dA = Math.hypot(
    gAnchor.waistAnchorPt.x - g0.waistAnchorPt.x,
    gAnchor.waistAnchorPt.y - g0.waistAnchorPt.y,
  );
  if (dA < 5) fail(`slantWaistAnchor 80 did not move waistAnchorPt (|Δ|=${f3(dA)})`);
  else ok(`slantWaistAnchor moves waistAnchorPt (|Δ|=${f3(dA)})`);

  const dD = Math.hypot(
    gDepth.bagSideEnd.x - g0.bagSideEnd.x,
    gDepth.bagSideEnd.y - g0.bagSideEnd.y,
  );
  if (dD < 5) fail(`slantBagDepth 120 did not move bagSideEnd (|Δ|=${f3(dD)})`);
  else ok(`slantBagDepth moves bagSideEnd (|Δ|=${f3(dD)})`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 9. Back / other Cargo geometry unchanged ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const off = resolveStyle(
    { ...CARGO_TROUSER_STYLE, pocketFront: "none" },
    body,
  );
  const on = resolveStyle(CARGO_TROUSER_STYLE, body);
  const backOff = outlineHash(draftTrouserBack(body, off));
  const backOn = outlineHash(draftTrouserBack(body, on));
  if (backOff !== backOn) fail("back changed when pocket on");
  else ok("Trouser back byte-identical with pocket on/off");
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS — report before re-baseline (Helen resets Cargo / toile) ===\n"
    : `\n=== ACCEPT FAIL (${failures}) ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
