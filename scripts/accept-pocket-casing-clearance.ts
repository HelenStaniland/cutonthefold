/**
 * Acceptance: pocket clear of casing (no fold-over on pocket pieces;
 * slash top on turndown seam).
 * Run: npx tsx scripts/accept-pocket-casing-clearance.ts
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
import {
  applyTrouserWaistCasingToPattern,
  resolveCasingDepths,
  type CasingElasticWidth,
} from "../lib/geometry/trouserWaistCasing";
import { applyTrouserHemTurnback } from "../lib/geometry/trouserHemTurnback";
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
const WIDTHS: CasingElasticWidth[] = [25, 38, 50];
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
): TrouserFrontStyle {
  const finish = finishOverride ?? s.dartedWaistFinish;
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
    ...(s.pocketFront === "slant" ? { pocketFront: "slant" as const } : {}),
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

function roleYs(piece: PatternPiece, role: string): number[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at.y);
}

function minY(pts: Point[]): number {
  return Math.min(...pts.map((p) => p.y));
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

function finish(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  width: CasingElasticWidth,
) {
  const net = draftTrousers(body, style);
  const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const cased = applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(width));
  return cased;
}

console.log("=== ACCEPT: pocket clear of casing (slash on turndown) ===\n");
console.log("slantOpeningBelowTurndown removed — slash top == turndown seam\n");

// ---------------------------------------------------------------------------
console.log("=== 1. pocketFront none byte-identical; legs casing unchanged ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const hM = pairHash(body, resolveStyle(MILA_TROUSER_STYLE, body));
  const hC = pairHash(
    body,
    resolveStyle({ ...CARGO_TROUSER_STYLE, pocketFront: "none" }, body),
  );
  if (hM !== hC) fail(`${bod.name}: Cargo(none) ≠ Mila`);
  else ok(`${bod.name}: Cargo(none) ≡ Mila`);
}

{
  const body = applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease);
  ok(`Block ${pairHash(body, resolveStyle(BLOCK_TROUSER_STYLE, body)).slice(0, 12)}…`);
  const cleo = applyEase(helenBody(), CLEO_TROUSER_STYLE.ease);
  ok(`Cleo ${pairHash(cleo, resolveStyle(CLEO_TROUSER_STYLE, cleo)).slice(0, 12)}…`);
}

{
  // Mila front/back casing still present (unchanged path)
  const body = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const style = resolveStyle(MILA_TROUSER_STYLE, body);
  const pat = finish(body, style, 25);
  const front = pat.pieces.find((p) => p.name === "Trouser front")!;
  const back = pat.pieces.find((p) => p.name === "Trouser back")!;
  if (!front.waistCasing || !back.waistCasing) {
    fail("Mila front/back lost casing");
  } else ok("Mila trouser front/back casing unchanged (present)");
}

// ---------------------------------------------------------------------------
console.log("\n=== 2. No casing fold-over on pocket pieces ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  const net = draftTrousers(body, style);
  const saOnly = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const afterCasing = applyTrouserWaistCasingToPattern(
    saOnly,
    resolveCasingDepths(25),
  );

  for (const name of [SLANT_POCKET_BACK_NAME, SLANT_POCKET_FRONT_NAME]) {
    const netP = net.pieces.find((p) => p.name === name)!;
    const saP = saOnly.pieces.find((p) => p.name === name)!;
    const finP = afterCasing.pieces.find((p) => p.name === name)!;
    if (finP.waistCasing) {
      fail(`${bod.name}/${name}: still has waistCasing`);
      continue;
    }
    const netWaistTop = Math.min(...roleYs(netP, "waist"));
    const saCutTop = saP.cuttingOutline ? minY(saP.cuttingOutline) : NaN;
    const finCutTop = finP.cuttingOutline ? minY(finP.cuttingOutline) : NaN;
    const saExt = netWaistTop - saCutTop; // SA outward (~10)
    const casingExtra = saCutTop - finCutTop; // should be 0
    console.log(
      `  ${bod.name}/${name}: netWaistTop=${f3(netWaistTop)} ` +
        `saCutTop=${f3(saCutTop)} finCutTop=${f3(finCutTop)} ` +
        `SA=${f3(saExt)} casingExtra=${f3(casingExtra)}`,
    );
    if (finP.waistCasing) fail(`${bod.name}/${name}: waistCasing present`);
    else if (Math.abs(casingExtra) > 0.05) {
      fail(
        `${bod.name}/${name}: casing still moved cut top by ${f3(casingExtra)} mm`,
      );
    } else {
      ok(
        `${bod.name}/${name}: cut top unchanged by casing (SA only ~${f3(saExt)} mm)`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. Slash top == turndown (tracks turndown at 25/38/50) ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  const bodyY = resolveBodyWaistY(body, style);
  const mouth = resolveFrontSlantPocketMouth(body, style);

  for (const w of WIDTHS) {
    const pat = finish(body, style, w);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const turnY = meanY(front.waistCasing!.turndownSeam);
    const slashY = mouth.openingTop.y;
    const dTurn = slashY - turnY;
    const dBody = slashY - bodyY;
    console.log(
      `  ${bod.name}/w${w}: turndown=${f3(turnY)} bodyY=${f3(bodyY)} slash=${f3(slashY)} ` +
        `slash−turndown=${f3(dTurn)} slash−bodyY=${f3(dBody)}`,
    );
    if (Math.abs(dTurn) > 0.05) {
      fail(`${bod.name}/w${w}: slash−turndown ${f3(dTurn)} ≠ 0`);
    } else {
      ok(`${bod.name}/w${w}: slash = turndown (Δ 0)`);
    }
    // Turndown stays at bodyWaistY for all widths (fold/raw move, not turndown).
    if (Math.abs(turnY - bodyY) > 0.05) {
      fail(`${bod.name}/w${w}: turndown drifted from bodyWaistY`);
    }
    if (Math.abs(dBody) > 0.05) {
      fail(`${bod.name}/w${w}: slash not on bodyY/turndown plane`);
    }
  }

  // Waist catch / waistOpenPt still on turndown
  if (Math.abs(mouth.waistOpenPt.y - mouth.turndownY) > 0.05) {
    fail(`${bod.name}: waistOpenPt not on turndown`);
  } else ok(`${bod.name}: waist-catch plane (waistOpenPt) on turndown`);
  if (Math.abs(mouth.openingTop.y - mouth.turndownY) > 0.05) {
    fail(`${bod.name}: openingTop not on turndown`);
  } else ok(`${bod.name}: openingTop on turndown`);
}

function meanY(pts: Point[]): number {
  return pts.reduce((s, p) => s + p.y, 0) / pts.length;
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Silhouette invariant still 0.000 ===\n");

let invOk = true;
for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  for (const finish of ["facing", "elastic"] as const) {
    const style = resolveStyle(CARGO_TROUSER_STYLE, body, finish);
    const mouth = resolveFrontSlantPocketMouth(body, style);
    const inv = silhouetteInvariantDelta(mouth);
    console.log(
      `  ${bod.name}/${finish}: waistΔ=${f6(inv.waistDelta)} sideΔ=${f6(inv.sideDelta)}`,
    );
    if (inv.waistDelta > EPS || inv.sideDelta > EPS) {
      fail(`${bod.name}/${finish}: silhouette broken`);
      invOk = false;
    } else ok(`${bod.name}/${finish}: silhouette 0.000`);
  }
}
if (!invOk) {
  console.log("\n*** STOP: silhouette invariant failed ***\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
console.log("\n=== 5. net === cut on trimmed diagonal ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const styleOn = resolveStyle(CARGO_TROUSER_STYLE, body);
  const styleOff = resolveStyle(
    { ...CARGO_TROUSER_STYLE, pocketFront: "none" },
    body,
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
  if (colOn !== cutOn) fail(`${bod.name}: net ${colOn} ≠ cut ${cutOn}`);
  else ok(`${bod.name}: collapsed net === cut (${colOn})`);
  const cutOffLen = saOff.cuttingOutline?.length ?? -1;
  if (saOn.outline.length - cutOn !== saOff.outline.length - cutOffLen) {
    fail(`${bod.name}: raw−cut delta mismatch`);
  } else ok(`${bod.name}: raw−cut delta matches pocket-off`);

  const turned = applyTrouserHemTurnback(saOn, 40);
  if (!turned.netToCutIndex) fail(`${bod.name}: missing netToCutIndex`);
  else ok(`${bod.name}: hem netToCutIndex ok`);

  let highlightOk = true;
  for (const role of ["waist", "pocket-mouth", "side-seam", "hem"] as const) {
    const runs = edgeRunsForRoles(saOn.outline, [role]);
    if (runs.length === 0 || runToNetPolyline(saOn, runs[0]!).length < 1) {
      fail(`${bod.name}: highlight ${role}`);
      highlightOk = false;
    }
  }
  if (highlightOk) ok(`${bod.name}: highlight roles present`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 6. Pocket below casing fold; slash on turndown; no pocket casing ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const pat = finish(body, style, w);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const turnY = meanY(front.waistCasing!.turndownSeam);
    const foldY = meanY(front.waistCasing!.foldLine);
    const mouth = resolveFrontSlantPocketMouth(body, style);
    console.log(
      `  w${w}: fold=${f3(foldY)} turndown=${f3(turnY)} slash=${f3(mouth.openingTop.y)} ` +
        `channel=${d.channelDepth} waistOpen=${f3(mouth.waistOpenPt.y)}`,
    );
    if (Math.abs(mouth.openingTop.y - turnY) > 0.05) {
      fail(`w${w}: slash not on turndown`);
    } else ok(`w${w}: slash on turndown`);
    if (foldY >= turnY - 0.05) {
      fail(`w${w}: casing fold not above turndown`);
    } else ok(`w${w}: casing fold above turndown`);
    if (mouth.waistOpenPt.y > turnY + 0.05) {
      fail(`w${w}: waist catch dropped off turndown`);
    } else ok(`w${w}: waist catch remains on turndown`);

    for (const name of [SLANT_POCKET_BACK_NAME, SLANT_POCKET_FRONT_NAME]) {
      const p = pat.pieces.find((x) => x.name === name)!;
      if (p.waistCasing) fail(`w${w}/${name}: fold-over still present`);
    }
  }
  ok("no pocket waistCasing at any elastic width");
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS — pocket clear of casing; slash on turndown ===\n"
    : `\n=== ACCEPT FAIL (${failures}) ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
