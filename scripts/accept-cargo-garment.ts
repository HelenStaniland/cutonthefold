/**
 * Acceptance: Cargo garment — independent literal copy of Mila at birth.
 * Run: npx tsx scripts/accept-cargo-garment.ts
 */
import { createHash } from "node:crypto";
import { applyEase, type BodyMeasurements } from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  BLOCK_PRESETS,
  CARGO_PRESET,
  CLEO_PRESET,
  MILA_PRESET,
} from "../lib/pattern/blockPresets";
import {
  BLOCK_TROUSER_STYLE,
  CARGO_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  cargoTrouserStyle,
  milaTrouserStyle,
  effectiveDartedWaistFinish,
  isPullOnWaistFinish,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrouserFront,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN_VERTICALS = {
  waistToFloor: 1020,
  hipDepth: 215,
  bodyRise: 301,
} as const;

let failures = 0;
function fail(msg: string) {
  failures++;
  console.log(`  FAIL: ${msg}`);
}
function ok(msg: string) {
  console.log(`  ok: ${msg}`);
}

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN_VERTICALS };
}

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

function resolveStyle(
  s: TrouserStyleSettings,
  body: BodyMeasurements,
): TrouserFrontStyle {
  const finish = effectiveDartedWaistFinish(s.dartedWaistFinish, s.pocketFront);
  const elastic = isPullOnWaistFinish(finish);
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
  const depth =
    s.waistbandMode === "darted"
      ? s.dartedWaistFinish === "facing"
        ? 0
        : s.dartedBandDepth
      : s.waistbandDepth;
  if (s.waistbandMode === "darted") {
    return withWaistband(base, depth, "darted", body);
  }
  return depth > 0 ? withWaistband(base, depth, "shaped", body) : base;
}

function outlineHash(piece: ReturnType<typeof draftTrouserFront>): string {
  const s = piece.outline
    .map((o) => `${o.role ?? ""}:${o.at.x.toFixed(9)},${o.at.y.toFixed(9)}`)
    .join("|");
  const marks = piece.markings
    .map((m) => {
      if (m.kind === "dart") {
        return `dart:${m.apex.x.toFixed(6)},${m.apex.y.toFixed(6)}:${m.legs.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join(";")}`;
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

function deepEqual(a: unknown, b: unknown, path = ""): string[] {
  const diffs: string[] = [];
  if (a === b) return diffs;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    diffs.push(`${path || "(root)"}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
    return diffs;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) {
    const p = path ? `${path}.${k}` : k;
    if (!(k in ao)) {
      diffs.push(`${p}: missing on left`);
      continue;
    }
    if (!(k in bo)) {
      diffs.push(`${p}: missing on right`);
      continue;
    }
    diffs.push(...deepEqual(ao[k], bo[k], p));
  }
  return diffs;
}

console.log("=== ACCEPT: Cargo garment (independent Mila copy) ===\n");

// --- 1. Additive registration ---
console.log("=== 1. Registration ===\n");
if (CARGO_PRESET.name !== "cargo") fail(`name=${CARGO_PRESET.name}`);
else ok('CARGO_PRESET.name = "cargo"');
if (CARGO_PRESET.label !== "Cargo Pants") fail(`label=${CARGO_PRESET.label}`);
else ok('CARGO_PRESET.label = "Cargo Pants"');
if (!BLOCK_PRESETS.includes(CARGO_PRESET)) fail("CARGO_PRESET not in BLOCK_PRESETS");
else ok("CARGO_PRESET in BLOCK_PRESETS");
if (BLOCK_PRESETS.length !== 3) fail(`BLOCK_PRESETS length=${BLOCK_PRESETS.length}`);
else ok("BLOCK_PRESETS = [Cleo, Mila, Cargo]");

// --- 2. Preset field equality (independent copy) ---
console.log("\n=== 2. CARGO_PRESET == MILA_PRESET on measured + provisional ===\n");
{
  const mDiffs = deepEqual(CARGO_PRESET.measured, MILA_PRESET.measured, "measured");
  const pDiffs = deepEqual(
    CARGO_PRESET.provisional,
    MILA_PRESET.provisional,
    "provisional",
  );
  if (mDiffs.length || pDiffs.length) {
    for (const d of [...mDiffs, ...pDiffs]) fail(d);
  } else {
    ok("measured: every field equal");
    ok("provisional: every field equal");
  }
  // Independence: not the same object reference
  if (CARGO_PRESET.measured === MILA_PRESET.measured) {
    fail("measured is shared reference (spread/coupling)");
  } else ok("measured: independent object (not same reference)");
  if (CARGO_PRESET.provisional === MILA_PRESET.provisional) {
    fail("provisional is shared reference");
  } else ok("provisional: independent object");
  if (CARGO_PRESET.measured.ease === MILA_PRESET.measured.ease) {
    fail("ease is shared reference");
  } else ok("ease: independent object");
}

// --- 3. Style: Cargo matches Mila except pocketFront + waist finish ---
console.log("\n=== 3. cargoTrouserStyle() vs milaTrouserStyle() ===\n");
{
  const c = cargoTrouserStyle();
  const m = milaTrouserStyle();
  if (c.pocketFront !== "slant") fail(`Cargo pocketFront=${c.pocketFront}`);
  else ok('Cargo pocketFront = "slant"');
  if (m.pocketFront !== "none") fail(`Mila pocketFront=${m.pocketFront}`);
  else ok('Mila pocketFront = "none"');
  if (c.dartedWaistFinish !== "elasticWaistband") {
    fail(`Cargo finish=${c.dartedWaistFinish}`);
  } else ok('Cargo dartedWaistFinish = "elasticWaistband"');
  if (m.dartedWaistFinish !== "elastic") fail(`Mila finish=${m.dartedWaistFinish}`);
  else ok('Mila dartedWaistFinish = "elastic"');
  const {
    pocketFront: _cPf,
    dartedWaistFinish: _cFin,
    ...cRest
  } = c;
  const {
    pocketFront: _mPf,
    dartedWaistFinish: _mFin,
    ...mRest
  } = m;
  const diffs = deepEqual(cRest, mRest);
  if (diffs.length) {
    for (const d of diffs) fail(d);
  } else ok("every style field equal except pocketFront + dartedWaistFinish");
  if (CARGO_TROUSER_STYLE === MILA_TROUSER_STYLE) {
    fail("CARGO_TROUSER_STYLE is same reference as MILA");
  } else ok("CARGO_TROUSER_STYLE independent of MILA_TROUSER_STYLE");
}

// --- 4. Mila / Cleo / block untouched (identity smoke) ---
console.log("\n=== 4. Mila / Cleo / block identity smoke ===\n");
{
  if (MILA_PRESET.name !== "mila") fail("MILA_PRESET.name drifted");
  else ok("MILA_PRESET.name intact");
  if (CLEO_PRESET.name !== "cleo") fail("CLEO_PRESET.name drifted");
  else ok("CLEO_PRESET.name intact");
  if (MILA_TROUSER_STYLE.dartedWaistFinish !== "elastic") fail("Mila finish drifted");
  else ok("MILA_TROUSER_STYLE finish intact");
  if (CLEO_TROUSER_STYLE.dartedWaistFinish !== "waistband") fail("Cleo finish drifted");
  else ok("CLEO_TROUSER_STYLE finish intact");
  if (BLOCK_TROUSER_STYLE.dartedWaistFinish !== "facing") fail("Block finish drifted");
  else ok("BLOCK_TROUSER_STYLE finish intact");
  if (MILA_TROUSER_STYLE.pocketFront !== "none") fail("Mila pocketFront drifted");
  else ok('Mila pocketFront = "none"');
  if (CLEO_TROUSER_STYLE.pocketFront !== "none") fail("Cleo pocketFront drifted");
  else ok('Cleo pocketFront = "none"');
  if (BLOCK_TROUSER_STYLE.pocketFront !== "none") fail("Block pocketFront drifted");
  else ok('Block pocketFront = "none"');
}

// --- 5. Draft: Cargo with pocketFront none ≡ Mila; slant diverges ---
console.log("\n=== 5. Cargo pocket-off ≡ Mila; pocket-on diverges ===\n");
for (const bod of bodies) {
  const body = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const mila = resolveStyle(MILA_TROUSER_STYLE, body);
  const cargoOff = resolveStyle(
    { ...CARGO_TROUSER_STYLE, pocketFront: "none" },
    body,
  );
  const cargoOn = resolveStyle(CARGO_TROUSER_STYLE, body);
  const hM = pairHash(body, mila);
  const hOff = pairHash(body, cargoOff);
  const hOn = pairHash(body, cargoOn);
  if (hM !== hOff) {
    fail(`${bod.name}: Cargo(none) ≠ Mila`);
  } else {
    ok(`${bod.name}: Cargo(none) ≡ Mila (${hM.slice(0, 12)}…)`);
  }
  if (hOn === hM) {
    fail(`${bod.name}: Cargo(slant) unexpectedly ≡ Mila`);
  } else {
    ok(`${bod.name}: Cargo(slant) diverges (${hOn.slice(0, 12)}…)`);
  }
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS ===\n"
    : `\n=== ACCEPT FAIL (${failures}) ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
