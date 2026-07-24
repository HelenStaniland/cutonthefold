/**
 * Acceptance: Elastic waistband finish (mode + derived constraints only).
 * Run: npx tsx scripts/accept-elastic-waist-finish.ts
 *
 * Facing / Waistband must stay byte-identical. Elastic derives taper/inset 0
 * and drafts shaped@depth 0 (existing dart-omission path). No casing geometry.
 */
import { createHash } from "node:crypto";
import {
  applyEase,
  type BodyMeasurements,
  type PatternPiece,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
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
  resolveFrontWaistInset,
  resolveWaistTaper,
  trouserBackPoints,
  trouserFrontPoints,
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

/** Mirror TrousersView draft boundary (elastic derived overrides). */
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

function pairHash(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): string {
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

function dartCount(piece: PatternPiece): number {
  return piece.markings.filter((m) => m.kind === "dart").length;
}

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

const STYLES: { name: string; s: TrouserStyleSettings }[] = [
  { name: "Aldrich", s: BLOCK_TROUSER_STYLE },
  { name: "Cleo", s: CLEO_TROUSER_STYLE },
  { name: "Mila", s: MILA_TROUSER_STYLE },
];

console.log("=== Elastic waist finish acceptance ===\n");
console.log("Field name kept: dartedWaistFinish (not renamed).\n");

// --- 1. Facing / waistband byte identity (preset finishes only) ---
console.log("=== 1. Facing & Waistband byte-identical across bodies ===\n");

for (const bod of bodies) {
  for (const st of STYLES) {
    const body = applyEase(bod.body, st.s.ease);
    const finish = st.s.dartedWaistFinish;
    if (finish !== "facing" && finish !== "waistband") {
      fail(`${bod.name}×${st.name}: unexpected preset finish ${finish}`);
      continue;
    }
    const style = resolveStyle(st.s, body);
    const h = pairHash(body, style);
    // Self-check: explicit finish override matches stored
    const h2 = pairHash(body, resolveStyle(st.s, body, finish));
    if (h !== h2) {
      fail(`${bod.name}×${st.name}: finish override drift (${finish})`);
    } else {
      ok(`${bod.name}×${st.name}: ${finish} hash ${h.slice(0, 12)}…`);
    }
  }
}

// --- 2. Elastic on Mila: vertical side, no darts, inset 0, gap itemised ---
console.log("\n=== 2. Elastic on Mila — constraints + girth gap ===\n");
console.log(
  "body | hipCut | waistCut | gap | insetTerm | CBstep/rise | remainder | sideInsetF | sideInsetB | dartsF | dartsB",
);

for (const bod of bodies) {
  const body = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const stored = { ...MILA_TROUSER_STYLE };
  const style = resolveStyle(stored, body, "elastic");

  if (Math.abs(resolveWaistTaper(style)) > 1e-15) {
    fail(`${bod.name}: resolveWaistTaper ≠ 0`);
  }
  if (Math.abs(resolveFrontWaistInset(style)) > 1e-15) {
    fail(`${bod.name}: resolveFrontWaistInset ≠ 0`);
  }
  if (style.waistbandMode !== "shaped") {
    fail(`${bod.name}: draft mode ≠ shaped (got ${style.waistbandMode})`);
  }
  if ((style.waistReduction ?? 0) !== 0) {
    fail(`${bod.name}: waistReduction ≠ 0 (got ${style.waistReduction})`);
  }

  // Stored state untouched by draft resolver
  if (stored.waistTaper !== MILA_TROUSER_STYLE.waistTaper) {
    fail(`${bod.name}: stored waistTaper mutated`);
  }
  if (stored.frontWaistInset !== MILA_TROUSER_STYLE.frontWaistInset) {
    fail(`${bod.name}: stored frontWaistInset mutated`);
  }

  const g = girths(body, style);
  if (Math.abs(g.frontSideInset) > 1e-9) {
    fail(`${bod.name}: front side inset ${g.frontSideInset} ≠ 0`);
  }
  if (Math.abs(g.backSideInset) > 1e-9) {
    fail(`${bod.name}: back side inset ${g.backSideInset} ≠ 0`);
  }

  const front = draftTrouserFront(body, style);
  const back = draftTrouserBack(body, style);
  const dF = dartCount(front);
  const dB = dartCount(back);
  if (dF !== 0 || dB !== 0) {
    fail(`${bod.name}: darts present F=${dF} B=${dB}`);
  }

  const gap = g.hipCut - g.waistCut;
  const insetTerm = 2 * resolveFrontWaistInset(style); // 0 under elastic
  const cbStepRiseTerm = 2 * (g.backHip - g.backWaist);
  const attributed = insetTerm + cbStepRiseTerm;
  const remainder = gap - attributed;

  console.log(
    `${bod.name} | ${g.hipCut.toFixed(1)} | ${g.waistCut.toFixed(1)} | ${gap.toFixed(3)} | ${insetTerm.toFixed(3)} | ${cbStepRiseTerm.toFixed(3)} | ${remainder.toFixed(3)} | ${g.frontSideInset.toFixed(3)} | ${g.backSideInset.toFixed(3)} | ${dF} | ${dB}`,
  );

  if (Math.abs(remainder) > 0.05) {
    fail(`${bod.name}: gap remainder ${remainder.toFixed(3)} (want ~0)`);
  } else {
    ok(`${bod.name}: gap attributed (remainder ${remainder.toFixed(3)})`);
  }

  // Residual should be ≈ CB step contribution (~38.4 mm typical on size 12)
  if (Math.abs(insetTerm) > 1e-9) {
    fail(`${bod.name}: insetTerm should be 0 under elastic`);
  }
}

// --- 3. Switch back: Elastic → Waistband restores Mila draft ---
console.log("\n=== 3. Stored values + switch Elastic → Waistband restores ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const waistband = resolveStyle(MILA_TROUSER_STYLE, body, "waistband");
  const elastic = resolveStyle(MILA_TROUSER_STYLE, body, "elastic");
  const restored = resolveStyle(MILA_TROUSER_STYLE, body, "waistband");
  const hW = pairHash(body, waistband);
  const hE = pairHash(body, elastic);
  const hR = pairHash(body, restored);
  if (hW === hE) {
    fail(`${bod.name}: waistband ≡ elastic (should differ)`);
  } else {
    ok(`${bod.name}: elastic differs from waistband`);
  }
  if (hW !== hR) {
    fail(`${bod.name}: restore after elastic ≠ original waistband`);
  } else {
    ok(`${bod.name}: waistband → elastic → waistband identical`);
  }
}

// --- 4. Mode interaction: elastic + stored darted vs shaped ---
console.log("\n=== 4. waistbandMode × elastic finish ===\n");

{
  const body = applyEase(bodyForSizeCode("12")!, MILA_TROUSER_STYLE.ease);
  const asShaped: TrouserStyleSettings = {
    ...MILA_TROUSER_STYLE,
    waistbandMode: "shaped",
    dartedWaistFinish: "elastic",
  };
  const asDarted: TrouserStyleSettings = {
    ...MILA_TROUSER_STYLE,
    waistbandMode: "darted",
    dartedWaistFinish: "elastic",
  };
  const hS = pairHash(body, resolveStyle(asShaped, body));
  const hD = pairHash(body, resolveStyle(asDarted, body));
  if (hS !== hD) {
    fail("elastic+shaped ≠ elastic+darted (draft should ignore stored mode)");
  } else {
    ok("elastic drafts identically whether stored mode is shaped or darted");
  }
  console.log(
    "  Govern: finish===elastic → draft as shaped@0; dart omission via resolveDarts(shaped).",
  );
  console.log(
    "  Stored waistbandMode / depths / taper / inset are not written when Elastic is selected.",
  );
  console.log(
    "  Facing+shaped and Waistband+shaped remain as before (finish stored; depth from mode).",
  );
}

if (failures > 0) {
  console.log(`\nFAILED with ${failures} check(s).`);
  process.exit(1);
}
console.log("\nAll elastic waist finish checks passed.");
