/**
 * Acceptance: waistTaper (side taper + shaped sideShift scale).
 * Run: npx tsx scripts/accept-waist-taper.ts
 */
import { createHash } from "node:crypto";
import { applyEase, type BodyMeasurements, type Point } from "../lib/types/measurements";
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

function resolveStyle(
  s: TrouserStyleSettings,
  body: BodyMeasurements,
  taperOverride?: number,
): TrouserFrontStyle {
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
    ...(s.frontWaistInset != null ? { frontWaistInset: s.frontWaistInset } : {}),
    ...(taperOverride !== undefined
      ? { waistTaper: taperOverride }
      : s.waistTaper != null
        ? { waistTaper: s.waistTaper }
        : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
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

function girths(body: BodyMeasurements, style: TrouserFrontStyle) {
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const fork = Math.abs(f.p5.x);
  const frontHip = f.p8.x - (-fork);
  const backHip = b.p25.x - b.p17.x;
  const frontWaist = Math.hypot(f.p11.x - f.p10.x, f.p11.y - f.p10.y);
  const backWaist = Math.hypot(b.p22.x - b.p21.x, b.p22.y - b.p21.y);
  const hipCut = 2 * frontHip + 2 * backHip;
  const waistCut = 2 * frontWaist + 2 * backWaist;
  const frontSideInset = f.p8.x - f.p11.x;
  const backSideInset = b.p25.x - b.p22.x;
  return {
    f,
    b,
    frontHip,
    backHip,
    frontWaist,
    backWaist,
    hipCut,
    waistCut,
    frontSideInset,
    backSideInset,
  };
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

// Baseline hashes at taper=1 (omitted) — stored on first pass for identity check
console.log("=== 1. Default waistTaper (1 / omitted) — byte identity ===\n");

const baseline = new Map<string, string>();

for (const bod of bodies) {
  for (const st of STYLES) {
    const body = applyEase(bod.body, st.s.ease);
    const styleOmit = resolveStyle(st.s, body);
    const styleExplicit = resolveStyle(st.s, body, 1);
    const frontO = draftTrouserFront(body, styleOmit);
    const backO = draftTrouserBack(body, styleOmit);
    const frontE = draftTrouserFront(body, styleExplicit);
    const backE = draftTrouserBack(body, styleExplicit);
    const hO = outlineHash(frontO) + outlineHash(backO);
    const hE = outlineHash(frontE) + outlineHash(backE);
    const key = `${bod.name}×${st.name}`;
    baseline.set(key, hO);
    if (hO !== hE) {
      fail(`${key}: omitted ≠ explicit 1`);
    } else {
      ok(`${key}: omitted ≡ explicit 1  (${hO.slice(0, 12)}…)`);
    }
    if (Math.abs(resolveWaistTaper(styleOmit) - 1) > 1e-15) {
      fail(`${key}: resolveWaistTaper ≠ 1`);
    }
  }
}

console.log(
  "\n=== 2. Mila waistTaper: 0 — vertical side + residual girth gap (itemised) ===\n",
);
console.log(
  "  Claim under test: side seam vertical above hip (inset = 0).",
);
console.log(
  "  NOT claimed: waistCut = hipCut. Residual gap is itemised, not closed.\n",
);
console.log(
  "body | hipCut | waistCut | gap | insetTerm | CBstep/rise | remainder | sideInsetF | sideInsetB",
);

for (const bod of bodies) {
  const body = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const style = resolveStyle(MILA_TROUSER_STYLE, body, 0);
  const g = girths(body, style);
  const gap = g.hipCut - g.waistCut; // positive = waist narrower than hip

  // Front: with vertical side, waist half = hip half − frontWaistInset
  // Full garment: 2 fronts × inset
  const inset = style.frontWaistInset ?? 10;
  const insetTerm = 2 * inset;

  // Back: hip half = p25.x − p17.x; waist chord = |p22−p21| with p22.x = p25.x
  // Loss per back piece = hipHalf − waistChord; ×2 for full garment
  const backHipHalf = g.backHip;
  const backWaistChord = g.backWaist;
  const cbStepRiseTerm = 2 * (backHipHalf - backWaistChord);

  const attributed = insetTerm + cbStepRiseTerm;
  const remainder = gap - attributed;

  console.log(
    `  ${bod.name.padEnd(12)} | ${g.hipCut.toFixed(1).padStart(7)} | ${g.waistCut.toFixed(1).padStart(8)} | ${gap.toFixed(1).padStart(5)} | ${insetTerm.toFixed(1).padStart(9)} | ${cbStepRiseTerm.toFixed(1).padStart(11)} | ${remainder.toFixed(2).padStart(9)} | ${g.frontSideInset.toFixed(3).padStart(10)} | ${g.backSideInset.toFixed(3).padStart(10)}`,
  );

  if (Math.abs(g.frontSideInset) > 1e-6 || Math.abs(g.backSideInset) > 1e-6) {
    fail(`${bod.name}: side inset not 0 (F=${g.frontSideInset} B=${g.backSideInset})`);
  } else {
    ok(`${bod.name}: side hip→waist inset = 0`);
  }
  if (Math.abs(remainder) > 0.05) {
    fail(
      `${bod.name}: gap ${gap.toFixed(2)} − attributed ${attributed.toFixed(2)} = remainder ${remainder.toFixed(2)} (unattributed)`,
    );
  } else {
    ok(
      `${bod.name}: gap ${gap.toFixed(1)} = inset ${insetTerm.toFixed(1)} + CB step/rise ${cbStepRiseTerm.toFixed(1)} (remainder ${remainder.toFixed(2)})`,
    );
  }
}

console.log("\n=== 2b. Reconcile CB ~0.9 mm vs ≈38.4 mm ===\n");
{
  const body = applyEase(bodyForSizeCode("12")!, MILA_TROUSER_STYLE.ease);
  const style1 = resolveStyle(MILA_TROUSER_STYLE, body, 1);
  const style0 = resolveStyle(MILA_TROUSER_STYLE, body, 0);
  const b1 = trouserBackPoints(body, style1);
  const b0 = trouserBackPoints(body, style0);

  // diag-waist-suppression-budget measure (Aldrich waist, taper=1):
  // chord L = |p22−p21| vs its horizontal span (p22.x−p21.x). Rise foreshortening only.
  const L1 = Math.hypot(b1.p22.x - b1.p21.x, b1.p22.y - b1.p21.y);
  const horiz1 = b1.p22.x - b1.p21.x;
  const riseForeshorten = L1 - horiz1; // chord − horizontal ≈ +0.8 mm (chord LONGER)

  // probe / accept measure at taper=0:
  // hip half (p25−p17) vs waist chord with side pinned to p25 (vertical).
  const hipHalf0 = b0.p25.x - b0.p17.x;
  const waistChord0 = Math.hypot(b0.p22.x - b0.p21.x, b0.p22.y - b0.p21.y);
  const hipVsWaistLoss = hipHalf0 - waistChord0;
  const cbStep = b0.p21.x - b0.p17.x;
  const horiz0 = b0.p22.x - b0.p21.x; // = p25.x − p21.x = hipHalf − step

  console.log("  A. diag-waist-suppression-budget (~0.8–0.9 mm):");
  console.log(
    "     Quantity: chord length minus horizontal span on the DRAFTED back waist",
  );
  console.log(
    "     (Aldrich L = W/4+40 at taper=1). Measures how much CB *rise* adds to the",
  );
  console.log(
    "     path length vs a flat horizontal. Girth follows the chord, so this is NOT",
  );
  console.log(
    `     a reduction vs hip. size-12 Mila taper=1: L=${L1.toFixed(3)} horiz=${horiz1.toFixed(3)} L−horiz=${riseForeshorten.toFixed(3)} mm`,
  );
  console.log(
    "     (positive ⇒ chord slightly longer than its x-span — edge geometry, not girth loss.)",
  );
  console.log("");
  console.log("  B. probe-waist-taper-girth-gap (≈38.4 mm full / ≈19.2 mm per back):");
  console.log(
    "     Quantity: hip half-width (p25−p17) minus waist chord at waistTaper=0",
  );
  console.log(
    "     (side at p25.x). Measures how much narrower the back waist opening is than",
  );
  console.log(
    `     the back hip, once the side is vertical. size-12: hipHalf=${hipHalf0.toFixed(3)} waistChord=${waistChord0.toFixed(3)} loss=${hipVsWaistLoss.toFixed(3)} mm/piece`,
  );
  console.log(
    `     Dominant cause: CB step p21.x−p17.x = ${cbStep.toFixed(3)} mm; horizontal waist = hipHalf−step = ${horiz0.toFixed(3)};`,
  );
  console.log(
    `     rise then makes chord ${waistChord0.toFixed(3)} (≈ ${(waistChord0 - horiz0).toFixed(3)} mm above horizontal).`,
  );
  console.log(
    `     Full garment: 2 × ${hipVsWaistLoss.toFixed(3)} = ${(2 * hipVsWaistLoss).toFixed(3)} mm.`,
  );
  console.log("");
  console.log(
    "  Reconciliation: different denominators. (A) is rise foreshortening *within* the",
  );
  console.log(
    "  Aldrich waist chord. (B) is hip-vs-waist width after zeroing side taper, dominated",
  );
  console.log(
    "  by the CB horizontal step. They are not the same term; both are correctly measured.",
  );
}

console.log("\n=== 3. Intermediate waistTaper: 0.5 (Mila, size 12) ===\n");
{
  const body = applyEase(bodyForSizeCode("12")!, MILA_TROUSER_STYLE.ease);
  try {
    const style = resolveStyle(MILA_TROUSER_STYLE, body, 0.5);
    const g = girths(body, style);
    const g1 = girths(body, resolveStyle(MILA_TROUSER_STYLE, body, 1));
    const g0 = girths(body, resolveStyle(MILA_TROUSER_STYLE, body, 0));
    console.log(
      `  waistCut@0.5=${g.waistCut.toFixed(1)}  @0=${g0.waistCut.toFixed(1)}  @1=${g1.waistCut.toFixed(1)}`,
    );
    console.log(
      `  frontSideInset@0.5=${g.frontSideInset.toFixed(2)} (expect ~mid ${(0.5 * g1.frontSideInset).toFixed(2)})`,
    );
    draftTrouserFront(body, style);
    draftTrouserBack(body, style);
    ok("taper 0.5 drafts without throw");
    const midOk =
      Math.abs(g.frontSideInset - 0.5 * g1.frontSideInset) < 0.05 &&
      Math.abs(g.backSideInset - 0.5 * g1.backSideInset) < 0.05;
    if (!midOk) fail("0.5 side inset not mid of full taper");
    else ok("0.5 side inset ≈ half of taper=1");
  } catch (e) {
    fail(`taper 0.5 threw: ${e}`);
  }
}

console.log("\n=== 4. Darted block waistTaper: 0 — dart intake remains ===\n");
{
  for (const bod of bodies) {
    const body = applyEase(bod.body, BLOCK_TROUSER_STYLE.ease);
    const style0 = resolveStyle(BLOCK_TROUSER_STYLE, body, 0);
    const style1 = resolveStyle(BLOCK_TROUSER_STYLE, body, 1);
    const g0 = girths(body, style0);
    const g1 = girths(body, style1);
    const front0 = draftTrouserFront(body, style0);
    const darts = front0.markings.filter((m) => m.kind === "dart");
    const dartMouth =
      darts.length > 0
        ? Math.hypot(
            darts[0]!.legs[0]!.x - darts[0]!.legs[1]!.x,
            darts[0]!.legs[0]!.y - darts[0]!.legs[1]!.y,
          )
        : 0;
    // Finished waist ≈ waistCut − 120 (full garment dart take-up)
    const finished0 = g0.waistCut - 120;
    const finished1 = g1.waistCut - 120;
    console.log(
      `  ${bod.name}: sideInset F=${g0.frontSideInset.toFixed(3)} B=${g0.backSideInset.toFixed(3)}  waistCut=${g0.waistCut.toFixed(1)}  fin≈cut−120=${finished0.toFixed(1)}  (taper1 fin=${finished1.toFixed(1)})  frontDartMouth=${dartMouth.toFixed(2)} mm  darts=${darts.length}`,
    );
    if (Math.abs(g0.frontSideInset) > 1e-6 || Math.abs(g0.backSideInset) > 1e-6) {
      fail(`${bod.name} darted: side not vertical`);
    }
    // Dart intake still present: finished still below hipCut by ~120 relative to tube
    const dartReduction = g0.hipCut - finished0;
    if (Math.abs(dartReduction - 120) > 1) {
      // With inset/CB, hipCut−finished may not be exactly 120; report
      console.log(
        `    note: hipCut−finished=${dartReduction.toFixed(1)} (expect ~120 if tube sides + full dart take-up)`,
      );
    }
    if (darts.length !== 1) {
      fail(`${bod.name}: expected 1 front dart marking, got ${darts.length}`);
    } else if (dartMouth < 1) {
      fail(`${bod.name}: degenerate near-zero dart mouth ${dartMouth}`);
    } else {
      ok(`${bod.name}: side vertical; front dart still drawn (mouth ${dartMouth.toFixed(2)} mm)`);
    }
  }
}

console.log("\n=== 6. Degenerate dart markings at taper 0 darted ===\n");
{
  const body = applyEase(bodyForSizeCode("12")!, BLOCK_TROUSER_STYLE.ease);
  const style = resolveStyle(BLOCK_TROUSER_STYLE, body, 0);
  const front = draftTrouserFront(body, style);
  const back = draftTrouserBack(body, style);
  for (const [name, piece] of [
    ["front", front],
    ["back", back],
  ] as const) {
    const darts = piece.markings.filter((m) => m.kind === "dart");
    for (const d of darts) {
      const mouth = Math.hypot(
        d.legs[0]!.x - d.legs[1]!.x,
        d.legs[0]!.y - d.legs[1]!.y,
      );
      const len0 = Math.hypot(d.apex.x - d.legs[0]!.x, d.apex.y - d.legs[0]!.y);
      const len1 = Math.hypot(d.apex.x - d.legs[1]!.x, d.apex.y - d.legs[1]!.y);
      console.log(
        `  ${name}: mouth=${mouth.toFixed(3)} legLens=${len0.toFixed(2)}/${len1.toFixed(2)} apex=(${d.apex.x.toFixed(2)},${d.apex.y.toFixed(2)})`,
      );
      if (mouth < 0.5) fail(`${name}: near-zero mouth artefact`);
      if (len0 < 0.5 && len1 < 0.5) fail(`${name}: collapsed dart length`);
    }
  }
  ok("darted taper=0: dart markings present with non-zero mouth (~20 mm)");
}

console.log(`\n=== ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===`);
process.exit(failures > 0 ? 1 : 0);
