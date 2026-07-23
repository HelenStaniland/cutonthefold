/**
 * Acceptance: Cleo frontCrotchFullness preset = 0.50.
 * Run: npx tsx scripts/accept-cleo-front-crotch-k1.ts
 */
import { createHash } from "crypto";
import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { CLEO_PRESET } from "../lib/pattern/blockPresets";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrousers,
  frontCrotchCurve,
  frontCrotchExtension,
  frontCrotchTouch,
  resolveCrotchArrivalAngle,
  resolveCrotchStraightRun,
  resolveFrontCrotchExtensionScale,
  resolveFrontCrotchFullness,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
  draftTrouserFront,
} from "../lib/patterns/trouserBlock";

const f3 = (n: number) => n.toFixed(3);

function outlineHash(pieces: { name: string; outline: unknown }[]): string {
  const payload = pieces
    .map((p) => `${p.name}:${JSON.stringify(p.outline)}`)
    .join("|");
  return createHash("sha256").update(payload).digest("hex");
}

function resolveStyle(
  s: typeof BLOCK_TROUSER_STYLE,
  body: ReturnType<typeof applyEase>,
): TrouserFrontStyle {
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale: s.frontCrotchExtensionScale }
      : {}),
    ...(s.backCrotchExtensionScale != null
      ? { backCrotchExtensionScale: s.backCrotchExtensionScale }
      : {}),
    ...(s.crotchDeparture != null ? { crotchDeparture: s.crotchDeparture } : {}),
    ...(s.crotchArrivalAngle != null ? { crotchArrivalAngle: s.crotchArrivalAngle } : {}),
    ...(s.waistlineCurveFront != null
      ? { waistlineCurveFront: s.waistlineCurveFront }
      : {}),
    ...(s.frontWaistInset != null ? { frontWaistInset: s.frontWaistInset } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
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

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.log(`  FAIL: ${msg}`);
  } else {
    console.log(`  ok: ${msg}`);
  }
}

console.log("=== accept: Cleo frontCrotchFullness 0.50 ===\n");

const k1Preset = CLEO_PRESET.measured.frontCrotchFullness;
const k1Resolved = resolveFrontCrotchFullness(CLEO_PRESET.measured);
const k1Style = resolveFrontCrotchFullness(CLEO_TROUSER_STYLE);

check(k1Preset === 0.5, `CLEO_PRESET.measured.frontCrotchFullness = ${k1Preset}`);
check(
  k1Resolved === 0.5,
  `resolveFrontCrotchFullness(CLEO_PRESET.measured) = ${k1Resolved}`,
);
check(
  k1Style === 0.5,
  `resolveFrontCrotchFullness(CLEO_TROUSER_STYLE) = ${k1Style}`,
);

// Sanity d1 for reset Cleo (size-12 + Cleo ease + full Cleo style)
{
  const body = applyEase(
    bodyForSizeCode(DEFAULT_SIZE_CODE)!,
    CLEO_TROUSER_STYLE.ease,
  );
  const style = resolveStyle(CLEO_TROUSER_STYLE, body);
  // Cleo waistDrop=0 → riseDrop/hipDepthDrop 0
  const H = body.hip;
  const R = body.bodyRise;
  const D = body.hipDepth;
  const f = trouserFrontPoints(body, style);
  const frontPiece = draftTrouserFront(body, style);
  const wrCf = frontPiece.outline.find((o) => o.role === "waist")!.at;
  const crotchScale = resolveFrontCrotchExtensionScale(style);
  const touch = frontCrotchTouch(H) * crotchScale;
  const fork = Math.abs(f.p5.x);
  const straightRun = resolveCrotchStraightRun(style, R, D, wrCf.y);
  const extension = frontCrotchExtension(H, crotchScale);
  const arrivalAngle = resolveCrotchArrivalAngle(style);
  const curve = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    fork,
    R,
    waistCfY: wrCf.y,
    straightRun,
    extension,
    arrivalAngleDeg: arrivalAngle,
    touch,
    k1: resolveFrontCrotchFullness(style),
  });
  const drop = curve.P3.y - curve.P0.y;
  const d1 = curve.k1 * drop;
  console.log(
    `\n  Sanity (reset Cleo): k1=${f3(curve.k1)} drop=${f3(drop)} d1=${f3(d1)} (= 0.50·drop → ${f3(0.5 * drop)})`,
  );
  check(
    Math.abs(curve.k1 - 0.5) < 1e-12 && Math.abs(d1 - 0.5 * drop) < 1e-9,
    `d1 = 0.50 · drop (${f3(d1)})`,
  );
}

// Neighbouring Cleo params unchanged
{
  const m = CLEO_PRESET.measured;
  check(m.backCrotchFullness === 0.3, `backCrotchFullness still ${m.backCrotchFullness}`);
  check(m.crotchArrivalAngle === 32, `crotchArrivalAngle still ${m.crotchArrivalAngle}`);
  check(
    m.frontCrotchExtensionScale === 0.55,
    `frontCrotchExtensionScale still ${m.frontCrotchExtensionScale}`,
  );
  check(
    m.backCrotchExtensionScale === 0.88,
    `backCrotchExtensionScale still ${m.backCrotchExtensionScale}`,
  );
  check(m.waistbandDepth === 120, `waistbandDepth still ${m.waistbandDepth}`);
  check(m.ease.waist === 80 && m.ease.hip === 50, `ease still ${m.ease.waist}/${m.ease.hip}`);
}

// Aldrich block: does not read CLEO_PRESET; outline stable across two drafts
{
  const body = applyEase(
    bodyForSizeCode(DEFAULT_SIZE_CODE)!,
    BLOCK_TROUSER_STYLE.ease,
  );
  const style = resolveStyle(BLOCK_TROUSER_STYLE, body);
  check(
    style.frontCrotchFullness === undefined,
    `Aldrich style has no frontCrotchFullness override (uses default)`,
  );
  const a = draftTrousers(body, style);
  const b = draftTrousers(body, style);
  const ha = outlineHash(a.pieces);
  const hb = outlineHash(b.pieces);
  check(ha === hb, `Aldrich outline stable hash=${ha.slice(0, 16)}…`);
  // Prove Cleo k1 is not on Aldrich path: resolve default
  check(
    resolveFrontCrotchFullness({}) === 0.6175,
    `Aldrich/default resolveFrontCrotchFullness = ${resolveFrontCrotchFullness({})}`,
  );
}

console.log(
  failures === 0
    ? "\nALL CHECKS PASS"
    : `\n${failures} FAILURE(S)`,
);
if (failures > 0) process.exitCode = 1;
console.log("=== end ===");
