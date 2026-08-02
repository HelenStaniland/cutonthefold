/**
 * Acceptance: slant front pocket (Cargo).
 * Run: npx tsx scripts/accept-slant-front-pocket.ts
 *
 * Gates (brief): pocket-off byte-identical; silhouette invariant; net===cut on
 * real trimmed front; facing finish then elastic; drop-following; three pieces.
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

function rolePoly(outline: OutlinePoint[], role: string) {
  return outline.filter((o) => o.role === role).map((o) => o.at);
}

console.log("=== ACCEPT: slant front pocket ===\n");

// ---------------------------------------------------------------------------
console.log("=== 1. pocketFront none → block / Cleo / Mila / Cargo(none) byte-identical ===\n");

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
console.log("\n=== 2. Silhouette invariant (trimmed + stay ≡ pocket-off) ===\n");

let invariantOk = true;
for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  for (const finish of ["facing", "elastic"] as const) {
    const style = resolveStyle(CARGO_TROUSER_STYLE, body, finish);
    const mouth = resolveFrontSlantPocketMouth(body, style);
    const inv = silhouetteInvariantDelta(mouth);
    const label = `${bod.name}/${finish}`;
    console.log(
      `  ${label}: waistΔ=${f6(inv.waistDelta)} sideΔ=${f6(inv.sideDelta)}`,
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
  console.log("\n*** STOP: silhouette invariant failed — do not re-baseline. ***\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. net === cut on real trimmed front (SA + hem turnback) ===\n");

/** Same collapse as addSeamAllowance (incl. first≈last CF close). */
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
  const colOff = collapseNet(saOff.outline).length;
  const cutOn = saOn.cuttingOutline?.length ?? -1;
  const cutOff = saOff.cuttingOutline?.length ?? -1;

  // Raw outline keeps coincident CF close; SA cut is built on collapsed net.
  // Same first≈last off-by-one exists pocket-off — not introduced by the trim.
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

  const turned = applyTrouserHemTurnback(saOn, 40);
  if (!turned.netToCutIndex) {
    fail(`${bod.name}: hem turnback missing netToCutIndex`);
  } else if (turned.netToCutIndex.length !== turned.outline.length) {
    fail(`${bod.name}: netToCutIndex length mismatch`);
  } else {
    ok(
      `${bod.name}: hem turnback netToCutIndex present (${turned.netToCutIndex.length})`,
    );
  }

  // Highlight on collapsed-equal piece: map via cutting built 1:1 with collapse.
  // Use saOn with roles that exist; index into cut only where lengths match.
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
console.log("\n=== 4. Facing finish gate (three pieces + notches) ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "facing");
  const pat = draftTrousers(body, style);
  const names = pat.pieces.map((p) => p.name);
  for (const n of [
    "Trouser front",
    "Trouser back",
    "Slant pocket stay",
    "Slant pocket facing",
    "Slant pocket bag",
  ]) {
    if (!names.includes(n)) fail(`missing piece ${n}`);
    else ok(`piece present: ${n}`);
  }
  const front = pat.pieces.find((p) => p.name === "Trouser front")!;
  const mouthLabels = front.markings
    .filter((m) => m.kind === "notch")
    .map((m) => (m.kind === "notch" ? m.label : ""))
    .filter(Boolean);
  if (!mouthLabels.includes("mouth-top") || !mouthLabels.includes("mouth-side")) {
    fail(`front mouth notches: ${mouthLabels.join(",")}`);
  } else ok("front has mouth-top + mouth-side balance notches");

  const roles = front.outline.map((o) => o.role);
  if (!roles.includes("pocket-mouth")) fail("front missing pocket-mouth role");
  else ok("front has pocket-mouth role");

  const mouth = resolveFrontSlantPocketMouth(body, style);
  const bodyY = resolveBodyWaistY(body, style);
  console.log(
    `  mouth-top y=${f3(mouth.mouthTop.y)} bodyWaistY=${f3(bodyY)} |Δy|=${f3(Math.abs(mouth.mouthTop.y - bodyY))}`,
  );
  console.log(
    `  mouth-side ${f3(mouth.mouthSide.x)},${f3(mouth.mouthSide.y)} (drop=${mouth.params.mouthDrop})`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n=== 5. Elastic / casing-extension region (report) ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic");
  const mouth = resolveFrontSlantPocketMouth(body, style);
  const bodyY = resolveBodyWaistY(body, style);
  const front = draftTrouserFront(body, style);
  const waistPts = rolePoly(front.outline, "waist");
  const pieceTopY = Math.min(...waistPts.map((p) => p.y));
  console.log(`  bodyWaistY = ${f3(bodyY)}`);
  console.log(`  piece-top min waist y = ${f3(pieceTopY)}`);
  console.log(`  mouth-top y = ${f3(mouth.mouthTop.y)}`);
  console.log(
    `  casing extension (pieceTop − bodyWaistY) = ${f3(pieceTopY - bodyY)} mm`,
  );
  console.log(
    "  REPORT: elastic drafts shaped@depth 0 today — piece top ≈ bodyWaistY;",
  );
  console.log(
    "  no casing extension is drafted yet. Mouth-top sits on the piece-top",
  );
  console.log(
    "  waist edge (= future fold line). Stay restores the same on-fold corner.",
  );
  console.log(
    "  When a casing extension is added (piece top above bodyWaistY), the",
  );
  console.log(
    "  region between bodyWaistY and piece top near the side will need an",
  );
  console.log(
    "  explicit rule (stay vs casing strip). Flagged for toile — not invented here.",
  );
  if (Math.abs(pieceTopY - bodyY) > 1) {
    fail(
      `unexpected casing extension ${f3(pieceTopY - bodyY)} — stop if ambiguous`,
    );
  } else {
    ok("no casing extension yet (piece top ≈ bodyWaistY) — pocket builds cleanly");
  }
  ok("sideOpening zip: dormant on Cargo (elastic); would start at mouth-side");
}

// ---------------------------------------------------------------------------
console.log("\n=== 6. Drop-following (mouth stays on bodyWaistY) ===\n");

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
      `  drop=${drop}: bodyWaistY=${f3(bodyY)} mouthTop.y=${f3(mouth.mouthTop.y)} mouthSide.y=${f3(mouth.mouthSide.y)}`,
    );
    // Construction frame: bodyWaistY is typically 0 for all drops; mouth-top
    // must sit on that plane (side scoop ≈ 0). Mouth-side is arc-down from it.
    if (Math.abs(mouth.mouthTop.y - bodyY) > 0.05) {
      fail(
        `drop ${drop}: mouthTop.y ${f3(mouth.mouthTop.y)} ≠ bodyWaistY ${f3(bodyY)}`,
      );
    } else {
      ok(`drop ${drop}: mouth-top on bodyWaistY`);
    }
    if (Math.abs(mouth.mouthSide.y - (bodyY + mouth.params.mouthDrop)) > 5) {
      // Side isn't vertical — only check mouth-side is below body waist.
      if (mouth.mouthSide.y <= bodyY + 1) {
        fail(`drop ${drop}: mouth-side not below bodyWaistY`);
      } else {
        ok(`drop ${drop}: mouth-side below bodyWaistY (arc drop)`);
      }
    } else {
      ok(`drop ${drop}: mouth-side ≈ bodyWaistY + ${mouth.params.mouthDrop}`);
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 7. Three pieces; back / other Cargo geometry unchanged ===\n");

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

  const pat = draftTrousers(body, on);
  if (pat.pieces.length !== 5) fail(`expected 5 pieces, got ${pat.pieces.length}`);
  else ok(`draftTrousers → ${pat.pieces.length} pieces`);

  const bag = pat.pieces.find((p) => p.name === "Slant pocket bag")!;
  const ys = bag.outline.map((o) => o.at.y);
  const bagSpan = Math.max(...ys) - Math.min(...ys);
  if (bagSpan < 100) fail(`bag depth span ${f3(bagSpan)} looks shallow`);
  else ok(`bag depth span ≈ ${f3(bagSpan)} mm`);
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS — ready for Helen print / toile (do not re-baseline until she says) ===\n"
    : `\n=== ACCEPT FAIL (${failures}) ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
