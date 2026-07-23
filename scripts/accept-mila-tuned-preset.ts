/**
 * Acceptance: Mila tuned preset (crotchDeparture 45, inset 5, shaped 30).
 * Run: npx tsx scripts/accept-mila-tuned-preset.ts
 */
import { createHash } from "node:crypto";
import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { CLEO_PRESET, MILA_PRESET } from "../lib/pattern/blockPresets";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserFront,
  frontCrotchCurve,
  frontCrotchExtension,
  frontCrotchTouch,
  resolveCrotchArrivalAngle,
  resolveCrotchExtensionScale,
  resolveCrotchP0Y,
  resolveFrontCrotchFullness,
  resolveWaistlineCurveFront,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;

let failures = 0;
function fail(msg: string) {
  failures++;
  console.log(`  FAIL: ${msg}`);
}
function ok(msg: string) {
  console.log(`  ok: ${msg}`);
}

function outlineHash(piece: ReturnType<typeof draftTrouserFront>): string {
  const s = piece.outline
    .map((o) => `${o.role ?? ""}:${o.at.x.toFixed(9)},${o.at.y.toFixed(9)}`)
    .join("|");
  return createHash("sha256").update(s).digest("hex");
}

function settingsToStyle(
  s: TrouserStyleSettings,
  body: ReturnType<typeof applyEase>,
): TrouserFrontStyle {
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
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
    ...(s.frontWaistInset != null ? { frontWaistInset: s.frontWaistInset } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
    ...(s.frontInseamKneeInset != null
      ? { frontInseamKneeInset: s.frontInseamKneeInset }
      : {}),
    ...(s.backInseamKneeInset != null
      ? { backInseamKneeInset: s.backInseamKneeInset }
      : {}),
  };
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

console.log("=== Mila preset values ===");
console.log(`  crotchDeparture: ${JSON.stringify(MILA_PRESET.measured.crotchDeparture)}`);
console.log(`  frontWaistInset: ${MILA_PRESET.measured.frontWaistInset}`);
console.log(`  waistbandMode: ${MILA_PRESET.measured.waistbandMode}`);
console.log(`  waistbandDepth: ${MILA_PRESET.measured.waistbandDepth}`);
console.log(`  MILA_TROUSER_STYLE.dartedWaistFinish: ${MILA_TROUSER_STYLE.dartedWaistFinish}`);
console.log(`  MILA_TROUSER_STYLE.waistbandMode: ${MILA_TROUSER_STYLE.waistbandMode}`);
console.log(`  MILA_TROUSER_STYLE.waistbandDepth: ${MILA_TROUSER_STYLE.waistbandDepth}`);
console.log(`  MILA_TROUSER_STYLE.crotchDeparture: ${JSON.stringify(MILA_TROUSER_STYLE.crotchDeparture)}`);
console.log(`  MILA_TROUSER_STYLE.frontWaistInset: ${MILA_TROUSER_STYLE.frontWaistInset}`);

if (MILA_PRESET.measured.crotchDeparture !== 45) fail("crotchDeparture ≠ 45");
else ok("crotchDeparture = 45");
if (MILA_PRESET.measured.frontWaistInset !== 5) fail("frontWaistInset ≠ 5");
else ok("frontWaistInset = 5");
if (MILA_PRESET.measured.waistbandMode !== "shaped") fail("waistbandMode ≠ shaped");
else ok("waistbandMode = shaped");
if (MILA_PRESET.measured.waistbandDepth !== 30) fail("waistbandDepth ≠ 30");
else ok("waistbandDepth = 30");
if (MILA_TROUSER_STYLE.dartedWaistFinish !== "waistband") {
  fail('dartedWaistFinish ≠ "waistband"');
} else {
  ok('dartedWaistFinish = "waistband"');
}

console.log("\n=== Cleo preset unchanged ===");
if (CLEO_PRESET.measured.crotchDeparture !== "waistEdge") {
  fail(`Cleo crotchDeparture drifted: ${JSON.stringify(CLEO_PRESET.measured.crotchDeparture)}`);
} else {
  ok('Cleo crotchDeparture still "waistEdge"');
}
if (CLEO_PRESET.measured.frontWaistInset !== 0) fail("Cleo frontWaistInset drifted");
else ok("Cleo frontWaistInset still 0");
if (CLEO_PRESET.measured.waistbandDepth !== 120) fail("Cleo waistbandDepth drifted");
else ok("Cleo waistbandDepth still 120");

console.log("\n=== Mila clamp check + curve metrics (sizes 8–20) ===");
console.log(
  "size | waistCfY | D | P0.y | aboveHip | room | clamp? | drop | d1",
);
for (const size of SIZES) {
  const chart = bodyForSizeCode(size)!;
  const body = applyEase(chart, MILA_TROUSER_STYLE.ease);
  const style = settingsToStyle(MILA_TROUSER_STYLE, body);
  const f = trouserFrontPoints(body, style);
  const waistCfY = resolveWaistlineCurveFront(style);
  const D = f.p6.y;
  const p0Y = resolveCrotchP0Y(style, D, waistCfY);
  const aboveHip = D - p0Y;
  const room = D - waistCfY;
  const clamped = !(p0Y > waistCfY + 1e-9) || Math.abs(aboveHip - 45) > 1e-6;
  const scale = resolveCrotchExtensionScale(style);
  const bez = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    fork: Math.abs(f.p5.x),
    R: f.p9.y,
    waistCfY,
    p0Y,
    extension: frontCrotchExtension(body.hip, scale),
    arrivalAngleDeg: resolveCrotchArrivalAngle(style),
    touch: frontCrotchTouch(body.hip) * scale,
    k1: resolveFrontCrotchFullness(style),
  });
  const drop = bez.P3.y - bez.P0.y;
  const d1 = bez.P1.y - bez.P0.y;
  console.log(
    `  ${size.padStart(2)} | ${waistCfY.toFixed(1).padStart(8)} | ${D.toFixed(1).padStart(5)} | ${p0Y.toFixed(1).padStart(5)} | ${aboveHip.toFixed(1).padStart(8)} | ${room.toFixed(1).padStart(4)} | ${clamped ? "YES" : "no"} | ${drop.toFixed(2).padStart(7)} | ${d1.toFixed(2).padStart(6)}`,
  );
  console.log(
    `       P0=(${bez.P0.x.toFixed(3)}, ${bez.P0.y.toFixed(3)})  P1=(${bez.P1.x.toFixed(3)}, ${bez.P1.y.toFixed(3)})  P3=(${bez.P3.x.toFixed(3)}, ${bez.P3.y.toFixed(3)})`,
  );
  if (clamped) {
    fail(`size ${size}: clamp engaged (P0.y=${p0Y}, waistCfY=${waistCfY}, D=${D})`);
  } else if (Math.abs(p0Y - (D - 45)) > 1e-6) {
    fail(`size ${size}: P0.y ${p0Y} ≠ D−45=${D - 45}`);
  } else {
    ok(`size ${size}: P0.y = D−45 = ${p0Y.toFixed(1)} (strictly below waist)`);
  }
}

console.log("\n=== Aldrich / Cleo outline hashes (sanity) ===");
for (const size of SIZES) {
  const chart = bodyForSizeCode(size)!;
  const aldrichBody = applyEase(chart, BLOCK_TROUSER_STYLE.ease);
  const cleoBody = applyEase(chart, CLEO_TROUSER_STYLE.ease);
  const a = draftTrouserFront(
    aldrichBody,
    settingsToStyle(BLOCK_TROUSER_STYLE, aldrichBody),
  );
  const c = draftTrouserFront(
    cleoBody,
    settingsToStyle(CLEO_TROUSER_STYLE, cleoBody),
  );
  console.log(
    `  size ${size}: Aldrich ${outlineHash(a).slice(0, 12)}…  Cleo ${outlineHash(c).slice(0, 12)}…`,
  );
}

console.log(`\n=== ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===`);
process.exit(failures > 0 ? 1 : 0);
