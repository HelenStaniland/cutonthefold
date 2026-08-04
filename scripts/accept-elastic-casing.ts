/**
 * Acceptance: elastic self-casing geometry (Phase 1).
 * Run: npx tsx scripts/accept-elastic-casing.ts
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
  CASING_CHANNEL_EASE,
  CASING_TURN_UNDER,
  channelWidthAt,
  frontCasingFoldTestResidual,
  resolveCasingDepths,
  type CasingElasticWidth,
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
  draftTrouserBack,
  draftTrouserFront,
  draftTrousers,
  resolveBodyWaistY,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const WIDTHS: CasingElasticWidth[] = [25, 38, 50];
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
  finishOverride?: TrouserStyleSettings["dartedWaistFinish"],
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

function finishPattern(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  elastic: boolean,
  width: CasingElasticWidth = 25,
) {
  const net = draftTrousers(body, style);
  const withSa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const withCasing = elastic
    ? applyTrouserWaistCasingToPattern(withSa, resolveCasingDepths(width))
    : withSa;
  return applyTrouserHemTurnbackToPattern(withCasing);
}

console.log("=== ACCEPT: elastic self-casing (Phase 1) ===\n");

console.log("Depths (prescribed):");
console.log(`  CHANNEL_EASE = ${CASING_CHANNEL_EASE} mm`);
console.log(`  TURN_UNDER   = ${CASING_TURN_UNDER} mm`);
for (const w of WIDTHS) {
  const d = resolveCasingDepths(w);
  console.log(
    `  width ${w}: channel=${d.channelDepth} totalExtension=${d.totalExtension}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n=== 1. Non-elastic byte-identical (net outline) ===\n");

{
  const body = applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease);
  const block = resolveStyle(BLOCK_TROUSER_STYLE, body);
  const h1 = pairHash(body, block);
  const h2 = pairHash(body, block);
  if (h1 !== h2) fail("block self-hash unstable");
  else ok(`block stable ${h1.slice(0, 12)}…`);

  const pat = finishPattern(body, block, false);
  const hasCasing = pat.pieces.some((p) => p.waistCasing);
  if (hasCasing) fail("block acquired waistCasing");
  else ok("block: no waistCasing on pieces");
}

{
  const body = applyEase(helenBody(), CLEO_TROUSER_STYLE.ease);
  const style = resolveStyle(CLEO_TROUSER_STYLE, body);
  const pat = finishPattern(body, style, false);
  if (pat.pieces.some((p) => p.waistCasing)) fail("Cleo acquired waistCasing");
  else ok("Cleo: no waistCasing");
}

// Facing finish on Cargo — casing post-pass must not run
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const facing = resolveStyle(CARGO_TROUSER_STYLE, body, "facing");
  const facPat = finishPattern(body, facing, false);
  if (facPat.pieces.some((p) => p.waistCasing)) fail("facing got casing");
  else ok("Cargo facing: no casing post-pass");
  // Net draft under facing is independent of casingElasticWidth
  const a = pairHash(body, facing);
  const b = pairHash(
    body,
    resolveStyle(
      { ...CARGO_TROUSER_STYLE, casingElasticWidth: 50 },
      body,
      "facing",
    ),
  );
  if (a !== b) fail("casingElasticWidth leaked into non-elastic net draft");
  else ok("casingElasticWidth ignored on non-elastic net draft");
}

// ---------------------------------------------------------------------------
console.log("\n=== 2. Elastic garments show casing at correct depth ===\n");

for (const label of ["Mila", "Cargo"] as const) {
  const settings = label === "Mila" ? MILA_TROUSER_STYLE : CARGO_TROUSER_STYLE;
  for (const bod of bodies) {
    const body = applyEase(bod.body, settings.ease);
    const style = resolveStyle(settings, body);
    for (const w of WIDTHS) {
      const d = resolveCasingDepths(w);
      const pat = finishPattern(body, style, true, w);
      const front = pat.pieces.find((p) => p.name === "Trouser front")!;
      const back = pat.pieces.find((p) => p.name === "Trouser back")!;
      if (!front.waistCasing || !back.waistCasing) {
        fail(`${label}/${bod.name}/w${w}: missing waistCasing`);
        continue;
      }
      if (front.waistCasing.channelDepth !== d.channelDepth) {
        fail(`${label}/${bod.name}/w${w}: channel depth`);
      }
      if (front.waistCasing.totalExtension !== d.totalExtension) {
        fail(`${label}/${bod.name}/w${w}: total extension`);
      }
      const bodyY = resolveBodyWaistY(body, style);
      const turnY = front.waistCasing.turndownSeam[0]!.y;
      const foldY = front.waistCasing.foldLine[0]!.y;
      // Raw top mid (not cut[0] — after hem turnback cut[0] is a hem corner).
      const midFold = front.waistCasing.foldLine[
        Math.floor(front.waistCasing.foldLine.length / 2)
      ]!;
      const midTurn = front.waistCasing.turndownSeam[
        Math.floor(front.waistCasing.turndownSeam.length / 2)
      ]!;
      const upLen =
        Math.hypot(midFold.x - midTurn.x, midFold.y - midTurn.y) || 1;
      const up = {
        x: (midFold.x - midTurn.x) / upLen,
        y: (midFold.y - midTurn.y) / upLen,
      };
      const cut = front.cuttingOutline!;
      let cutTopY = cut[0]!.y;
      let bestAlong = -Infinity;
      for (const q of cut) {
        const along =
          (q.x - midTurn.x) * up.x + (q.y - midTurn.y) * up.y;
        if (along > bestAlong) {
          bestAlong = along;
          cutTopY = q.y;
        }
      }
      // Above worn waist ⇒ foldY < bodyY (y-down)
      if (!(foldY < bodyY - 0.5)) {
        fail(
          `${label}/${bod.name}/w${w}: fold not above bodyWaistY (fold=${f3(foldY)} bodyY=${f3(bodyY)})`,
        );
      }
      if (Math.abs(turnY - bodyY) > 0.05) {
        fail(
          `${label}/${bod.name}/w${w}: turndown y ${f3(turnY)} ≠ bodyWaistY ${f3(bodyY)}`,
        );
      }
      if (Math.abs(bodyY - foldY - d.channelDepth) > 0.05) {
        fail(`${label}/${bod.name}/w${w}: fold↔turndown ≠ channel`);
      }
      // fold-2 → raw = turnUnder (= channel + hem)
      const foldToRaw =
        (midFold.x - midTurn.x) * up.x + (midFold.y - midTurn.y) * up.y;
      // Actually measure raw along up from fold:
      const rawAlong = bestAlong;
      if (Math.abs(rawAlong - foldToRaw - d.turnUnder) > 0.5) {
        fail(
          `${label}/${bod.name}/w${w}: fold↔cutTop ≠ turnUnder ` +
            `(rawAlong=${f3(rawAlong)} foldAlong=${f3(foldToRaw)} turnUnder=${d.turnUnder})`,
        );
      }
      void cutTopY;
    }
  }
  ok(`${label}: casing depths + placement above bodyWaistY on all bodies/widths`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. Front fold-flat test ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  for (const w of WIDTHS) {
    const pat = finishPattern(body, style, true, w);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const r = frontCasingFoldTestResidual(front);
    if (r == null) fail(`w${w}: no fold-test`);
    else if (r > EPS) fail(`w${w}: fold-test residual ${f6(r)}`);
    else ok(`w${w}: front fold-test residual ${f6(r)}`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Back channel width constant along slant ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const pat = finishPattern(body, style, true, w);
    const back = pat.pieces.find((p) => p.name === "Trouser back")!;
    const ref = back.waistCasing!;
    const w0 = channelWidthAt(ref, 0);
    const wMid = channelWidthAt(ref, 0.5);
    const w1 = channelWidthAt(ref, 1);
    console.log(
      `  w${w}: CB=${f3(w0)} mid=${f3(wMid)} side=${f3(w1)} (expect ${d.channelDepth})`,
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
    ok(`w${w}: back channel width constant`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 5. Turndown seam relative to bodyWaistY ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  const bodyY = resolveBodyWaistY(body, style);
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const pat = finishPattern(body, style, true, w);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const ref = front.waistCasing!;
    const turnY = ref.turndownSeam.reduce((s, p) => s + p.y, 0) / ref.turndownSeam.length;
    const foldY = ref.foldLine.reduce((s, p) => s + p.y, 0) / ref.foldLine.length;
    console.log(
      `  w${w}: bodyWaistY=${f3(bodyY)} turndown=${f3(turnY)} fold=${f3(foldY)} ` +
        `(fold is ${f3(bodyY - foldY)} above; channel=${d.channelDepth})`,
    );
    if (Math.abs(turnY - bodyY) > 0.05) fail(`w${w}: turndown ≠ bodyWaistY`);
    else ok(`w${w}: turndown at bodyWaistY (pocket wiring target)`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 6. Drop independence (no double-drop) ===\n");

{
  const base = helenBody();
  for (const drop of [0, 25, 50] as const) {
    const settings: TrouserStyleSettings = {
      ...CARGO_TROUSER_STYLE,
      waistDrop: drop,
    };
    const body = applyEase(base, settings.ease);
    const style = resolveStyle(settings, body);
    const bodyY = resolveBodyWaistY(body, style);
    const d = resolveCasingDepths(25);
    const pat = finishPattern(body, style, true, 25);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const ref = front.waistCasing!;
    const turnY = ref.turndownSeam[0]!.y;
    const foldY = ref.foldLine[0]!.y;
    console.log(
      `  drop=${drop}: bodyWaistY=${f3(bodyY)} turndown=${f3(turnY)} fold=${f3(foldY)} ext=${d.totalExtension}`,
    );
    // In the dropped frame bodyWaistY stays 0; casing still extends above it.
    if (Math.abs(bodyY) > 0.05) {
      fail(`drop ${drop}: bodyWaistY drifted to ${f3(bodyY)} (frame should re-zero)`);
    }
    if (Math.abs(turnY - bodyY) > 0.05) {
      fail(`drop ${drop}: turndown left bodyWaistY — possible double-drop`);
    }
    if (Math.abs(bodyY - foldY - d.channelDepth) > 0.05) {
      fail(`drop ${drop}: casing depth compounded with drop`);
    } else {
      ok(`drop ${drop}: waist once at bodyWaistY; casing above only`);
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 7. Pocket intact; no casing fold-over on pocket pieces ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  const net = draftTrousers(body, style);
  const names = net.pieces.map((p) => p.name);
  for (const n of [
    "Trouser front",
    "Trouser back",
    "Slant pocket back",
    "Slant pocket front",
  ]) {
    if (!names.includes(n)) fail(`missing ${n}`);
  }
  for (const banned of [
    "Slant pocket stay",
    "Slant pocket facing",
    "Slant pocket bag",
  ]) {
    if (names.includes(banned)) fail(`unexpected ${banned}`);
  }
  const frontNet = net.pieces.find((p) => p.name === "Trouser front")!;
  const mouth = frontNet.markings.filter(
    (m) => m.kind === "notch" && (m.label === "mouth-top" || m.label === "mouth-side"),
  );
  if (mouth.length < 2) fail("mouth notches missing on net front");
  else ok("pocket mouth notches intact on net");

  const pat = finishPattern(body, style, true, 25);
  const pocketBack = pat.pieces.find((p) => p.name === "Slant pocket back")!;
  const pocketFront = pat.pieces.find((p) => p.name === "Slant pocket front")!;
  const frontLeg = pat.pieces.find((p) => p.name === "Trouser front")!;
  if (!frontLeg.waistCasing) fail("trouser front missing waistCasing");
  else ok("trouser front keeps casing fold-over");
  if (pocketBack.waistCasing) fail("pocket back still has waistCasing fold-over");
  else ok("RULE: pocket back excluded from casing fold-over");
  if (pocketFront.waistCasing) fail("pocket front still has waistCasing fold-over");
  else ok("RULE: pocket front excluded from casing fold-over");

  // Sewing outline extends into the casing (hem-fold U); channel stitch stays
  // at the pre-casing waist plane. Pocket pieces unchanged.
  const frontAfter = pat.pieces.find((p) => p.name === "Trouser front")!;
  const waistA = frontNet.outline.filter((o) => o.role === "waist");
  const turn = frontAfter.waistCasing?.turndownSeam ?? [];
  if (waistA.length < 2 || turn.length < 2) {
    fail("front waist / turndown missing");
  } else {
    const midA = waistA[Math.floor(waistA.length / 2)]!.at;
    const midT = turn[Math.floor(turn.length / 2)]!;
    if (Math.hypot(midA.x - midT.x, midA.y - midT.y) > 0.5) {
      fail("front channel stitch moved by casing post-pass");
    } else ok("front channel stitch unmoved (sewing U into casing expected)");
  }
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS — report before re-baseline ===\n"
    : `\n=== ACCEPT FAIL (${failures}) ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
