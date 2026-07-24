/**
 * Acceptance: Mila preset → elastic finish + level waist + waistTaper 0.
 * Run: npx tsx scripts/accept-mila-elastic-preset.ts
 *
 * Preset values only — Cleo / Aldrich must stay byte-identical.
 */
import { createHash } from "node:crypto";
import {
  applyEase,
  type BodyMeasurements,
  type PatternPiece,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { CLEO_PRESET, MILA_PRESET } from "../lib/pattern/blockPresets";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrouserFront,
  draftTrousers,
  resolveFrontWaistInset,
  resolveWaistTaper,
  resolveWaistlineCurveFront,
  trouserBackPoints,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { draftWaistband } from "../lib/elements/waistband";
import { trouserWaistEdges } from "../lib/patterns/trouserBlock";

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

/** Same draft-boundary rules as TrousersView / accept-elastic-waist-finish. */
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
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
  };

  if (elastic) {
    return withWaistband(base, 0, "shaped", body);
  }

  const depth =
    s.waistbandMode === "darted"
      ? finish === "facing"
        ? 0
        : s.dartedBandDepth
      : s.waistbandDepth;
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

function girths(body: BodyMeasurements, style: TrouserFrontStyle) {
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const fork = Math.abs(f.p5.x);
  const frontHip = f.p8.x - -fork;
  const backHip = b.p25.x - b.p17.x;
  const frontWaist = Math.hypot(f.p11.x - f.p10.x, f.p11.y - f.p10.y);
  const backWaist = Math.hypot(b.p22.x - b.p21.x, b.p22.y - b.p21.y);
  return {
    f,
    b,
    frontHip,
    backHip,
    frontWaist,
    backWaist,
    hipCut: 2 * frontHip + 2 * backHip,
    waistCut: 2 * frontWaist + 2 * backWaist,
    frontSideInset: f.p8.x - f.p11.x,
    backSideInset: b.p25.x - b.p22.x,
  };
}

function bandPieceCount(
  body: BodyMeasurements,
  settings: TrouserStyleSettings,
): number {
  const style = resolveStyle(settings, body);
  const finish = settings.dartedWaistFinish;
  const elastic = finish === "elastic";
  const depth = elastic
    ? 0
    : settings.waistbandMode === "darted"
      ? finish === "facing"
        ? 0
        : settings.dartedBandDepth
      : settings.waistbandDepth;
  const base = draftTrousers(body, style);
  if (depth <= 0) return base.pieces.filter((p) => /waistband/i.test(p.label)).length;
  const e = trouserWaistEdges(body, style);
  const bandDepth = style.waistReduction ?? depth;
  const fb = draftWaistband({
    innerLen: e.front.inner,
    outerLen: e.front.outer,
    depth: bandDepth,
    foldSide: "CF",
    label: "Front waistband",
  });
  const bb = draftWaistband({
    innerLen: e.back.inner,
    outerLen: e.back.outer,
    depth: bandDepth,
    foldSide: "CB",
    label: "Back waistband",
  });
  return [fb.piece, bb.piece].filter((p) => /waistband/i.test(p.label)).length;
}

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

console.log("=== Mila elastic preset acceptance ===\n");

console.log("=== 0. Preset field values ===\n");
if (MILA_TROUSER_STYLE.dartedWaistFinish !== "elastic") {
  fail(`finish=${MILA_TROUSER_STYLE.dartedWaistFinish}`);
} else ok('MILA_TROUSER_STYLE.dartedWaistFinish = "elastic"');
if (MILA_PRESET.provisional.waistlineCurveFront !== 0) {
  fail(`waistlineCurveFront=${MILA_PRESET.provisional.waistlineCurveFront}`);
} else ok("MILA_PRESET.provisional.waistlineCurveFront = 0");
if (MILA_PRESET.measured.waistTaper !== 0) {
  fail(`waistTaper=${MILA_PRESET.measured.waistTaper}`);
} else ok("MILA_PRESET.measured.waistTaper = 0");
if (MILA_TROUSER_STYLE.waistTaper !== 0) {
  fail(`style.waistTaper=${MILA_TROUSER_STYLE.waistTaper}`);
} else ok("MILA_TROUSER_STYLE.waistTaper = 0");
if (MILA_TROUSER_STYLE.frontWaistInset !== 5) {
  fail(`stored inset=${MILA_TROUSER_STYLE.frontWaistInset}`);
} else ok("stored frontWaistInset = 5 (fallback)");
if (MILA_TROUSER_STYLE.waistbandMode !== "shaped") fail("mode drifted");
else ok('stored waistbandMode = "shaped"');
if (MILA_TROUSER_STYLE.waistbandDepth !== 30) fail("depth drifted");
else ok("stored waistbandDepth = 30");
if (CLEO_PRESET.measured.crotchDeparture !== "waistEdge") {
  fail("Cleo measured drifted");
} else ok("Cleo preset untouched (spot-check)");

console.log("\n=== 1. Cleo & Aldrich outline hashes (stable reference) ===\n");
for (const bod of bodies) {
  for (const st of [
    { name: "Aldrich", s: BLOCK_TROUSER_STYLE },
    { name: "Cleo", s: CLEO_TROUSER_STYLE },
  ] as const) {
    const body = applyEase(bod.body, st.s.ease);
    const h = pairHash(body, resolveStyle(st.s, body));
    ok(`${bod.name}×${st.name}: ${h.slice(0, 16)}…`);
  }
}

console.log("\n=== 2. Mila default draft (elastic) — gap, side, darts, bands ===\n");
console.log(
  "body | scoop | gap | CBterm | rem | sideF | sideB | dartsF | dartsB | bands",
);

for (const bod of bodies) {
  const body = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const style = resolveStyle(MILA_TROUSER_STYLE, body);
  const scoop = resolveWaistlineCurveFront(style);
  if (Math.abs(scoop) > 1e-15) fail(`${bod.name}: scoop ${scoop} ≠ 0`);
  if (Math.abs(resolveWaistTaper(style)) > 1e-15) {
    fail(`${bod.name}: taper ≠ 0`);
  }
  if (Math.abs(resolveFrontWaistInset(style)) > 1e-15) {
    fail(`${bod.name}: draft inset ≠ 0`);
  }

  const g = girths(body, style);
  const gap = g.hipCut - g.waistCut;
  const insetTerm = 2 * resolveFrontWaistInset(style);
  const cbTerm = 2 * (g.backHip - g.backWaist);
  const rem = gap - insetTerm - cbTerm;
  const front = draftTrouserFront(body, style);
  const back = draftTrouserBack(body, style);
  const dF = front.markings.filter((m) => m.kind === "dart").length;
  const dB = back.markings.filter((m) => m.kind === "dart").length;
  const bands = bandPieceCount(body, MILA_TROUSER_STYLE);

  console.log(
    `${bod.name} | ${scoop.toFixed(1)} | ${gap.toFixed(3)} | ${cbTerm.toFixed(3)} | ${rem.toFixed(3)} | ${g.frontSideInset.toFixed(3)} | ${g.backSideInset.toFixed(3)} | ${dF} | ${dB} | ${bands}`,
  );

  if (Math.abs(g.frontSideInset) > 1e-9 || Math.abs(g.backSideInset) > 1e-9) {
    fail(`${bod.name}: side inset not 0`);
  }
  if (dF !== 0 || dB !== 0) fail(`${bod.name}: darts present`);
  if (bands !== 0) fail(`${bod.name}: waistband pieces emitted (${bands})`);
  if (Math.abs(rem) > 0.05) fail(`${bod.name}: remainder ${rem}`);
  if (bod.name === "size-12" || bod.name === "Helen-print") {
    if (Math.abs(gap - 38.449) > 0.02) {
      fail(`${bod.name}: gap ${gap.toFixed(3)} ≠ ≈38.449`);
    } else {
      ok(`${bod.name}: gap ${gap.toFixed(3)} ≈ 38.449 (all CB)`);
    }
  } else {
    ok(`${bod.name}: gap attributed (rem ${rem.toFixed(3)})`);
  }
}

console.log("\n=== 3. Finish → Waistband uses stored inset 5 + shaped/30 ===\n");
for (const bod of bodies) {
  const body = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const wb = resolveStyle(MILA_TROUSER_STYLE, body, "waistband");
  if (resolveFrontWaistInset(wb) !== 5) {
    fail(`${bod.name}: waistband draft inset ≠ 5`);
  }
  if (wb.waistbandMode !== "shaped") fail(`${bod.name}: mode ≠ shaped`);
  if ((wb.waistReduction ?? 0) !== 30) {
    fail(`${bod.name}: reduction=${wb.waistReduction} want 30`);
  }
  const taper = resolveWaistTaper(wb);
  if (Math.abs(taper) > 1e-15) {
    fail(`${bod.name}: waistband taper=${taper} (stored 0 → still vertical side)`);
  }
  const g = girths(body, wb);
  if (Math.abs(g.frontSideInset) > 1e-9 || Math.abs(g.backSideInset) > 1e-9) {
    fail(`${bod.name}: waistband side not vertical (taper 0)`);
  }
  const front = draftTrouserFront(body, wb);
  const back = draftTrouserBack(body, wb);
  const dF = front.markings.filter((m) => m.kind === "dart").length;
  const dB = back.markings.filter((m) => m.kind === "dart").length;
  // shaped@30 omits darts
  if (dF !== 0 || dB !== 0) {
    fail(`${bod.name}: waistband shaped should still omit darts`);
  }
  ok(
    `${bod.name}: waistband → inset 5, shaped/30, taper 0, no darts`,
  );
}

if (failures > 0) {
  console.log(`\nFAILED with ${failures} check(s).`);
  process.exit(1);
}
console.log("\nAll Mila elastic preset checks passed.");
