/**
 * Acceptance: Mila sandbox data layers (preset + TrouserStyleSettings).
 * Run: npx tsx scripts/accept-mila-sandbox.ts
 *
 * Asserts Mila is Cleo geometry with block (darted/facing) waist only.
 */
import { createHash } from "crypto";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { CLEO_PRESET, MILA_PRESET } from "../lib/pattern/blockPresets";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  cleoTrouserStyle,
  milaTrouserStyle,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrousers,
  trouserBackPoints,
  trouserFrontPoints,
  validateTrousers,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.log(`  FAIL: ${msg}`);
  } else {
    console.log(`  ok: ${msg}`);
  }
}

function resolveStyle(
  s: TrouserStyleSettings,
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
    ...(s.crotchArrivalAngle != null
      ? { crotchArrivalAngle: s.crotchArrivalAngle }
      : {}),
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

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function rolePoints(
  piece: { outline: { role?: string; at: Point }[] },
  role: string,
): Point[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at);
}

/** Side-seam points at/below hip y (role is `side-seam`). */
function sideBelowHip(
  piece: { outline: { role?: string; at: Point }[] },
  hipY: number,
): Point[] {
  return rolePoints(piece, "side-seam").filter((p) => p.y >= hipY - 1e-6);
}

/**
 * Crotch role samples at/below the hipline. Shaped vs darted changes how the
 * CF/crotch polyline is split above the hip, so point *counts* can differ even
 * when the underlying curve matches — compare by y-resampled Δ.
 */
function maxCrotchDeltaBelowHip(
  a: Point[],
  b: Point[],
  hipY: number,
): number {
  const aa = a.filter((p) => p.y >= hipY - 1e-6);
  const bb = b.filter((p) => p.y >= hipY - 1e-6);
  if (aa.length < 2 || bb.length < 2) return Infinity;
  // Both run tip (max y) → hip (min y). Resample the longer onto the shorter's y.
  const [ref, other] = aa.length <= bb.length ? [aa, bb] : [bb, aa];
  let max = 0;
  for (const p of ref) {
    // linear interpolate other at p.y (other sorted by decreasing y typically)
    const x = xAtY(other, p.y);
    if (x == null) return Infinity;
    max = Math.max(max, Math.abs(x - p.x));
  }
  return max;
}

function xAtY(poly: Point[], y: number): number | null {
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]!;
    const b = poly[i + 1]!;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo - 1e-6 || y > hi + 1e-6) continue;
    if (Math.abs(b.y - a.y) < 1e-12) return (a.x + b.x) / 2;
    const t = (y - a.y) / (b.y - a.y);
    return a.x + t * (b.x - a.x);
  }
  return null;
}

function maxPointDelta(a: Point[], b: Point[]): number {
  if (a.length !== b.length) return Infinity;
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    max = Math.max(
      max,
      Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y),
    );
  }
  return max;
}

function outlineHash(pieces: { name: string; outline: unknown }[]): string {
  const payload = pieces
    .map((p) => `${p.name}:${JSON.stringify(p.outline)}`)
    .join("|");
  return createHash("sha256").update(payload).digest("hex");
}

console.log("=== accept: Mila sandbox data layers ===\n");

// --- 4. measured diff ---
{
  console.log("--- MILA_PRESET.measured vs CLEO_PRESET.measured ---");
  const mil = MILA_PRESET.measured as Record<string, unknown>;
  const cle = CLEO_PRESET.measured as Record<string, unknown>;
  const keys = new Set([...Object.keys(mil), ...Object.keys(cle)]);
  const diffs: string[] = [];
  for (const k of [...keys].sort()) {
    if (!deepEqual(mil[k], cle[k])) diffs.push(k);
  }
  check(
    diffs.length === 2 &&
      diffs.includes("waistbandMode") &&
      diffs.includes("waistbandDepth"),
    `measured diff keys = [${diffs.join(", ")}] (want waistbandMode, waistbandDepth)`,
  );
  check(mil.waistbandMode === "darted", `Mila waistbandMode = ${String(mil.waistbandMode)}`);
  check(mil.waistbandDepth === 0, `Mila waistbandDepth = ${String(mil.waistbandDepth)}`);
  check(cle.waistbandMode === "shaped", `Cleo waistbandMode = ${String(cle.waistbandMode)}`);
  check(cle.waistbandDepth === 120, `Cleo waistbandDepth = ${String(cle.waistbandDepth)}`);
  check(
    deepEqual(MILA_PRESET.provisional, CLEO_PRESET.provisional),
    "provisional identical to Cleo",
  );
  console.log("\nMila measured:");
  console.log(JSON.stringify(MILA_PRESET.measured, null, 2));
  console.log("\nMila provisional:");
  console.log(JSON.stringify(MILA_PRESET.provisional, null, 2));
}

// --- 5. style-fn diff ---
{
  console.log("\n--- milaTrouserStyle() vs cleoTrouserStyle() ---");
  const mil = milaTrouserStyle() as unknown as Record<string, unknown>;
  const cle = cleoTrouserStyle() as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(mil), ...Object.keys(cle)]);
  const diffs: string[] = [];
  for (const k of [...keys].sort()) {
    if (!deepEqual(mil[k], cle[k])) diffs.push(k);
  }
  check(
    diffs.length === 3 &&
      diffs.includes("waistbandMode") &&
      diffs.includes("waistbandDepth") &&
      diffs.includes("dartedWaistFinish"),
    `style diff keys = [${diffs.join(", ")}] (want waistbandMode, waistbandDepth, dartedWaistFinish)`,
  );
  check(mil.waistbandMode === "darted", `mila waistbandMode = ${String(mil.waistbandMode)}`);
  check(mil.waistbandDepth === 0, `mila waistbandDepth = ${String(mil.waistbandDepth)}`);
  check(
    mil.dartedWaistFinish === "facing",
    `mila dartedWaistFinish = ${String(mil.dartedWaistFinish)}`,
  );
  check(cle.waistbandMode === "shaped", `cleo waistbandMode = ${String(cle.waistbandMode)}`);
  check(cle.waistbandDepth === 120, `cleo waistbandDepth = ${String(cle.waistbandDepth)}`);
  check(
    cle.dartedWaistFinish === "waistband",
    `cleo dartedWaistFinish = ${String(cle.dartedWaistFinish)}`,
  );
  console.log("\nStyle field diffs:");
  for (const k of diffs) {
    console.log(`  ${k}: mila=${JSON.stringify(mil[k])} cleo=${JSON.stringify(cle[k])}`);
  }
  check(
    deepEqual(MILA_TROUSER_STYLE, milaTrouserStyle()),
    "MILA_TROUSER_STYLE matches milaTrouserStyle() (ease cloned)",
  );
}

// --- 6. draft comparison ---
{
  console.log("\n--- draft comparison (size chart + Cleo/Mila ease, hip 1100) ---");
  const chart = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
  const body = applyEase({ ...chart, hip: 1100 }, MILA_PRESET.measured.ease);
  const cleoStyle = resolveStyle(cleoTrouserStyle(), body);
  const milaStyle = resolveStyle(milaTrouserStyle(), body);

  const cleoVal = validateTrousers(body, cleoStyle);
  const milaVal = validateTrousers(body, milaStyle);
  check(cleoVal.valid, `Cleo validateTrousers.valid (${cleoVal.issues.map((i) => i.message).join("; ")})`);
  check(milaVal.valid, `Mila validateTrousers.valid (${milaVal.issues.map((i) => i.message).join("; ")})`);

  const cleo = draftTrousers(body, cleoStyle);
  const mila = draftTrousers(body, milaStyle);

  const cleoFront = cleo.pieces.find((p) => p.name === "Trouser front")!;
  const milaFront = mila.pieces.find((p) => p.name === "Trouser front")!;
  const cleoBack = cleo.pieces.find((p) => p.name === "Trouser back")!;
  const milaBack = mila.pieces.find((p) => p.name === "Trouser back")!;
  check(!!cleoFront && !!milaFront, "front pieces present");
  check(!!cleoBack && !!milaBack, "back pieces present");

  const roles = ["inseam", "hem"] as const;
  for (const role of roles) {
    for (const [label, a, b] of [
      ["front", cleoFront, milaFront],
      ["back", cleoBack, milaBack],
    ] as const) {
      const da = maxPointDelta(rolePoints(a, role), rolePoints(b, role));
      check(
        da < 1e-9,
        `${label} ${role} maxΔ=${da === Infinity ? "len-mismatch" : da.toFixed(6)} mm (want 0)`,
      );
    }
  }

  // Construction points are the geometry source of truth (independent of waist cut).
  const cleoFp = trouserFrontPoints(body, cleoStyle);
  const milaFp = trouserFrontPoints(body, milaStyle);
  const cleoBp = trouserBackPoints(body, cleoStyle);
  const milaBp = trouserBackPoints(body, milaStyle);
  let frontPtMax = 0;
  for (const k of Object.keys(cleoFp) as (keyof typeof cleoFp)[]) {
    frontPtMax = Math.max(
      frontPtMax,
      Math.hypot(cleoFp[k].x - milaFp[k].x, cleoFp[k].y - milaFp[k].y),
    );
  }
  let backPtMax = 0;
  for (const k of Object.keys(cleoBp) as (keyof typeof cleoBp)[]) {
    backPtMax = Math.max(
      backPtMax,
      Math.hypot(cleoBp[k].x - milaBp[k].x, cleoBp[k].y - milaBp[k].y),
    );
  }
  check(frontPtMax < 1e-9, `front construction points maxΔ=${frontPtMax.toFixed(6)} mm`);
  check(backPtMax < 1e-9, `back construction points maxΔ=${backPtMax.toFixed(6)} mm`);

  // Side seam below hip + crotch below hip (fair vs shaped waist truncation).
  const hipY = body.hipDepth; // waistDrop 0
  for (const [label, a, b] of [
    ["front", cleoFront, milaFront],
    ["back", cleoBack, milaBack],
  ] as const) {
    const da = maxPointDelta(sideBelowHip(a, hipY), sideBelowHip(b, hipY));
    check(
      da < 1e-9,
      `${label} side-seam-below-hip maxΔ=${da === Infinity ? "len-mismatch" : da.toFixed(6)} mm (want 0)`,
    );
  }
  {
    const da = maxCrotchDeltaBelowHip(
      rolePoints(cleoFront, "crotch"),
      rolePoints(milaFront, "crotch"),
      hipY,
    );
    // Known coupling: frontCrotchCurve uses waistCfY from the reduced waist, so
    // shaped r=120 vs darted r=0 moves crotch *outline* even when construction
    // points are identical. Report; do not treat as a silent pass.
    if (da < 1e-6) {
      check(true, `front crotch-below-hip maxΔx=${da.toFixed(6)} mm`);
    } else {
      failures++;
      console.log(
        `  FAIL: front crotch-below-hip maxΔx=${da === Infinity ? "fail" : da.toFixed(6)} mm`,
      );
      console.log(
        `        (construction points are identical — outline shift is from waistReduction`,
      );
      console.log(
        `         cleo r=${cleoStyle.waistReduction} vs mila r=${milaStyle.waistReduction}`,
      );
      console.log(
        `         feeding frontCrotchCurve waistCfY; not a preset-field mismatch.)`,
      );
    }
  }
  {
    const da = maxPointDelta(
      rolePoints(cleoBack, "crotch"),
      rolePoints(milaBack, "crotch"),
    );
    check(
      da < 1e-9,
      `back crotch maxΔ=${da === Infinity ? "len-mismatch" : da.toFixed(6)} mm (want 0)`,
    );
  }

  const waistDeltaFront = maxPointDelta(
    rolePoints(cleoFront, "waist"),
    rolePoints(milaFront, "waist"),
  );
  const waistDeltaBack = maxPointDelta(
    rolePoints(cleoBack, "waist"),
    rolePoints(milaBack, "waist"),
  );
  check(
    waistDeltaFront > 1e-6 ||
      rolePoints(cleoFront, "waist").length !==
        rolePoints(milaFront, "waist").length,
    `front waist differs from Cleo (Δ=${waistDeltaFront === Infinity ? "len-mismatch" : waistDeltaFront.toFixed(3)} mm) — expected`,
  );
  check(
    waistDeltaBack > 1e-6 ||
      rolePoints(cleoBack, "waist").length !==
        rolePoints(milaBack, "waist").length,
    `back waist differs from Cleo (Δ=${waistDeltaBack === Infinity ? "len-mismatch" : waistDeltaBack.toFixed(3)} mm) — expected`,
  );

  // Coherence: no validation issues; piece counts for darted facing = front+back only
  // (Cleo shaped also drafts waistbands separately in UI — draftTrousers itself is F+B).
  check(
    mila.pieces.length >= 2,
    `Mila piece count = ${mila.pieces.length}`,
  );
  console.log(
    `  Cleo pieces: ${cleo.pieces.map((p) => p.name).join(", ")}`,
  );
  console.log(
    `  Mila pieces: ${mila.pieces.map((p) => p.name).join(", ")}`,
  );
  console.log(`  Cleo outline hash: ${outlineHash(cleo.pieces)}`);
  console.log(`  Mila outline hash: ${outlineHash(mila.pieces)}`);
  check(
    outlineHash(cleo.pieces) !== outlineHash(mila.pieces),
    "full outlines differ (waist finish) as expected",
  );
}

// Sanity: Cleo / block symbols still export (unchanged identity smoke)
{
  check(CLEO_PRESET.name === "cleo", "CLEO_PRESET.name");
  check(CLEO_TROUSER_STYLE.waistbandMode === "shaped", "CLEO_TROUSER_STYLE shaped");
  check(BLOCK_TROUSER_STYLE.dartedWaistFinish === "facing", "BLOCK_TROUSER_STYLE facing");
  check(MILA_PRESET.name === "mila", "MILA_PRESET.name");
  check(MILA_PRESET.label === "Mila Pants", "MILA_PRESET.label");
}

console.log(`\n=== ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===`);
process.exit(failures === 0 ? 0 : 1);
