/**
 * DIAGNOSTIC — waist suppression budget & distribution (print only).
 * Run: npx tsx scripts/diag-waist-suppression-budget.ts
 *
 * Change nothing in product code. Numbers only — stop and report.
 */
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
  resolveFrontWaistInset,
  resolveWaistlineCurveFront,
  trouserBackPoints,
  trouserDraftMeasures,
  trouserFrontPoints,
  validateTrousers,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { polylineLength } from "../lib/geometry/curves";

/** Known source constant `DART_TAKEUP` in trouserBlock.ts (not exported). */
const DART_TAKEUP = 20;
/** Known source constant `BACK_CB_WAIST_RISE` (mm). */
const BACK_CB_WAIST_RISE = 20;

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const pct = (part: number, total: number) =>
  total === 0 ? "—" : `${((100 * part) / total).toFixed(1)}%`;

/** Helen's print body: size-12 girths + custom verticals (same as other diags). */
const HELEN_VERTICALS = {
  waistToFloor: 1020,
  hipDepth: 215,
  bodyRise: 301,
} as const;

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN_VERTICALS };
}

function resolveStyle(
  s: TrouserStyleSettings,
  body: BodyMeasurements,
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

function rolePts(
  piece: ReturnType<typeof draftTrouserFront>,
  role: string,
): Point[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at);
}

function dartIntakes(piece: ReturnType<typeof draftTrouserFront>): number[] {
  return piece.markings
    .filter((m) => m.kind === "dart")
    .map((m) => {
      const [a, b] = m.legs;
      return Math.hypot(a.x - b.x, a.y - b.y);
    });
}

type PieceBudget = {
  hipHalf: number;
  waistCutHalf: number;
  dartIntakes: number[];
  dartSum: number;
  sideShaping: number;
  cfInsetNote: number;
  cbHorizontalFromRise: number;
  finishedHalf: number;
  sideShiftAbsorbed: number;
};

function measureCase(
  label: string,
  bodyRaw: BodyMeasurements,
  settings: TrouserStyleSettings,
) {
  const body = applyEase(bodyRaw, settings.ease);
  const style = resolveStyle(settings, body);
  const m = trouserDraftMeasures(body, style);
  const W = m.W;
  const H = m.H;
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const inset = resolveFrontWaistInset(style);
  const scoop = resolveWaistlineCurveFront(style);
  const mode = style.waistbandMode ?? "shaped";
  const r = style.waistReduction ?? 0;

  const front = draftTrouserFront(body, style);
  const back = draftTrouserBack(body, style);
  const fDarts = dartIntakes(front);
  const bDarts = dartIntakes(back);

  // --- Construction half-widths (Aldrich formulas; one piece = half front / half back) ---
  // Hip: CF-line at fork/p17 → side at hipline.
  const frontHipHalf = f.p8.x - (-Math.abs(f.p5.x)); // = H/4+5
  const backHipHalf = b.p25.x - b.p17.x; // = H/4+15
  // Waist cut span (before dart take-up).
  const frontWaistCut = Math.hypot(f.p11.x - f.p10.x, f.p11.y - f.p10.y); // ≈ W/4+20
  const backWaistCut = Math.hypot(b.p22.x - b.p21.x, b.p22.y - b.p21.y); // = W/4+40 (chord L)
  // Horizontal back waist (chord projected; CB rise removes horizontal share).
  const backWaistHoriz = b.p22.x - b.p21.x;
  const cbHorizLoss = backWaistCut - backWaistHoriz; // L − √(L²−rise²)

  // Side shaping = hip half − waist cut half (positive = waist narrower than hip on piece).
  // Front CF inset shifts the whole waist outboard of the fork line — does not change
  // frontWaistCut, but changes where the side sits relative to the hip CF reference.
  const frontSideShaping = frontHipHalf - frontWaistCut;
  const backSideShaping = backHipHalf - backWaistCut;

  // Nominal dart take-up (construction). Shaped mode: darts omitted, take-up → sideShift.
  const frontDartNom = mode === "darted" ? DART_TAKEUP : 0;
  const backDartNom = mode === "darted" ? 2 * DART_TAKEUP : 0;
  // sideShift formula (shaped): Σ DART_TAKEUP · clamp(1 − r/L, 0, 1) per dart length.
  // We observe it as cut-span vs finished outline length delta when no darts.
  const fWaistOutline = rolePts(front, "waist");
  const bWaistOutline = rolePts(back, "waist");
  const fWaistLen = polylineLength(fWaistOutline);
  const bWaistLen = polylineLength(bWaistOutline);

  // Finished half ≈ cut − dart intakes (darted) or cut − sideShift (shaped, baked into side).
  const fDartMeas = fDarts.reduce((s, d) => s + d, 0);
  const bDartMeas = bDarts.reduce((s, d) => s + d, 0);

  // Full-garment girths (2 fronts + 2 backs).
  const hipGirthCut = 2 * frontHipHalf + 2 * backHipHalf; // = H+40
  const waistCutGirth = 2 * frontWaistCut + 2 * backWaistCut; // ≈ W+120
  const dartGirthNom =
    mode === "darted" ? 2 * DART_TAKEUP + 2 * (2 * DART_TAKEUP) : 0; // 120 or 0
  const finishedWaistNom = waistCutGirth - dartGirthNom; // ≈ W when darted
  const totalReduction = hipGirthCut - finishedWaistNom;

  // Itemised full-garment (×2 pieces each):
  const sideFull = 2 * frontSideShaping + 2 * backSideShaping;
  const dartFull = dartGirthNom;
  // CF inset: does not change W; report as 0 for girth budget, note separately.
  // CB rise horizontal loss is already inside backWaistCut (chord) vs horizontal —
  // it does NOT remove girth (girth follows the chord). Report as edge-profile only.

  const itemised = sideFull + dartFull;
  const residual = totalReduction - itemised;

  // Shaped: dart take-up moved to side via sideShift — re-attribute.
  // Observed: outline waist length vs construction chord.
  const shapedFrontAbsorb = mode === "shaped" ? frontWaistCut - fWaistLen : 0;
  const shapedBackAbsorb = mode === "shaped" ? backWaistCut - bWaistLen : 0;
  const shapedAbsorbFull = 2 * shapedFrontAbsorb + 2 * shapedBackAbsorb;

  const frontBud: PieceBudget = {
    hipHalf: frontHipHalf,
    waistCutHalf: frontWaistCut,
    dartIntakes: fDarts,
    dartSum: mode === "darted" ? fDartMeas || frontDartNom : 0,
    sideShaping: frontSideShaping,
    cfInsetNote: inset,
    cbHorizontalFromRise: 0,
    finishedHalf:
      mode === "darted"
        ? frontWaistCut - (fDartMeas || frontDartNom)
        : fWaistLen,
    sideShiftAbsorbed: shapedFrontAbsorb,
  };
  const backBud: PieceBudget = {
    hipHalf: backHipHalf,
    waistCutHalf: backWaistCut,
    dartIntakes: bDarts,
    dartSum: mode === "darted" ? bDartMeas || backDartNom : 0,
    sideShaping: backSideShaping,
    cfInsetNote: 0,
    cbHorizontalFromRise: cbHorizLoss,
    finishedHalf:
      mode === "darted"
        ? backWaistCut - (bDartMeas || backDartNom)
        : bWaistLen,
    sideShiftAbsorbed: shapedBackAbsorb,
  };

  // Waist edge profile (y)
  const fCf = fWaistOutline[0]!;
  const fSide = fWaistOutline[fWaistOutline.length - 1]!;
  const bCf = bWaistOutline[0]!;
  const bSide = bWaistOutline[bWaistOutline.length - 1]!;

  return {
    label,
    bodyRaw,
    body,
    settings,
    style,
    mode,
    r,
    W,
    H,
    scoop,
    inset,
    hipGirthCut,
    waistCutGirth,
    finishedWaistNom,
    totalReduction,
    sideFull,
    dartFull,
    residual,
    shapedAbsorbFull,
    frontBud,
    backBud,
    fCf,
    fSide,
    bCf,
    bSide,
    // construction refs
    p10: f.p10,
    p11: f.p11,
    p8: f.p8,
    p21: b.p21,
    p22: b.p22,
    p25: b.p25,
    p17: b.p17,
    validation: validateTrousers(body, style),
    // outline finished girth proxy (2F+2B outline waist lengths; darts still open on darted)
    outlineWaistSum: 2 * fWaistLen + 2 * bWaistLen,
  };
}

type Case = ReturnType<typeof measureCase>;

function printBudget(c: Case) {
  console.log(`\n### ${c.label}`);
  console.log(
    `  body raw W=${c.bodyRaw.waist} H=${c.bodyRaw.hip}  |  eased W=${c.body.waist} H=${c.body.hip}  |  draft W=${f1(c.W)} H=${f1(c.H)}`,
  );
  console.log(
    `  ease waist=${c.settings.ease.waist} hip=${c.settings.ease.hip}  mode=${c.mode} r(waistReduction)=${c.r}  scoop=${c.scoop}  frontWaistInset=${c.inset}`,
  );
  console.log(
    `  A1 girths: hipCut(H+40)=${f1(c.hipGirthCut)}  waistCut(≈W+120)=${f1(c.waistCutGirth)}  finishedNom=${f1(c.finishedWaistNom)}  totalReduction=${f1(c.totalReduction)}`,
  );
  console.log(
    `  A2 itemised FULL garment: sideShaping=${f1(c.sideFull)} (${pct(c.sideFull, c.totalReduction)})  dartTakeup=${f1(c.dartFull)} (${pct(c.dartFull, c.totalReduction)})  residual=${f1(c.residual)}`,
  );
  if (c.mode === "shaped") {
    console.log(
      `  shaped sideShift absorb (cut−outline)×2F+2B ≈ ${f1(c.shapedAbsorbFull)} mm (dart take-up relocated to side; darts omitted)`,
    );
  }

  for (const [name, bud] of [
    ["FRONT", c.frontBud],
    ["BACK", c.backBud],
  ] as const) {
    const pieceRed = bud.hipHalf - bud.finishedHalf;
    console.log(
      `  ${name} (one piece): hipHalf=${f1(bud.hipHalf)}  waistCut=${f1(bud.waistCutHalf)}  finishedHalf=${f1(bud.finishedHalf)}  pieceReduction=${f1(pieceRed)}`,
    );
    console.log(
      `         sideShaping=${f1(bud.sideShaping)} (${pct(bud.sideShaping, pieceRed)})  darts=${bud.dartIntakes.map(f1).join(",") || "none"} sum=${f1(bud.dartSum)} (${pct(bud.dartSum, pieceRed)})  sideShiftAbs=${f1(bud.sideShiftAbsorbed)}`,
    );
    if (name === "FRONT") {
      console.log(
        `         CF inset=${bud.cfInsetNote} mm (moves CF off fork; does NOT change W or waistCut span)`,
      );
    } else {
      console.log(
        `         CB rise→horizontal foreshortening of chord = ${f1(bud.cbHorizontalFromRise)} mm (edge profile, NOT girth loss — girth follows chord L)`,
      );
    }
  }

  console.log(
    `  A3 sum check: side+dart=${f1(c.sideFull + c.dartFull)} vs totalReduction=${f1(c.totalReduction)}  residual=${f1(c.residual)}`,
  );
}

function printProfile(c: Case) {
  console.log(`\n### ${c.label} — waist edge profile (y)`);
  console.log(
    `  FRONT  CF y=${f2(c.fCf.y)}  side y=${f2(c.fSide.y)}  Δ(side−CF)=${f2(c.fSide.y - c.fCf.y)}`,
  );
  console.log(
    `  BACK   CB y=${f2(c.bCf.y)}  side y=${f2(c.bSide.y)}  Δ(side−CB)=${f2(c.bSide.y - c.bCf.y)}`,
  );
  console.log(
    `  scoop (waistlineCurveFront)=${c.scoop} → CF dips below construction waist; waistCfY≈${f2(c.fCf.y)}`,
  );
  console.log(
    `  construction: p10.y=${c.p10.y} p11.y=${c.p11.y} p21.y=${c.p21.y} (BACK_CB_WAIST_RISE=${BACK_CB_WAIST_RISE}) p22.y=${c.p22.y}`,
  );
  console.log(
    `  CB rise is a SEPARATE mechanism from girth reduction: fixed ${BACK_CB_WAIST_RISE} mm lift at CB (plus optional §2a back scoop sign), not a share of (H−W).`,
  );
}

// ─── bodies & styles ─────────────────────────────────────────────────────────

const SIZES = ["8", "12", "16", "20"] as const;
const STYLES: { name: string; s: TrouserStyleSettings }[] = [
  { name: "Aldrich", s: BLOCK_TROUSER_STYLE },
  { name: "Cleo", s: CLEO_TROUSER_STYLE },
  { name: "Mila", s: MILA_TROUSER_STYLE },
];

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((code) => ({
    name: `size-${code}`,
    body: bodyForSizeCode(code)!,
  })),
  { name: "Helen-print", body: helenBody() },
];

console.log("=== DIAG: waist suppression budget & distribution ===\n");
console.log(
  "Construction model (Aldrich): hipCut = H+40; waistCut = W+120; dartTakeup = 120 (darted); finished = W.",
);
console.log(
  "Side shaping = hipCut − waistCut = (H+40) − (W+120) = H−W−80; totalReduction = hipCut − finished = H+40−W.",
);
console.log(
  "Shaped mode: darts omitted; resolveDarts moves take-up into sideShift on the waist side.",
);

console.log("\n════════════════════════════════════════════════════════");
console.log("MEASUREMENT A — reduction budget");
console.log("════════════════════════════════════════════════════════");

const cases: Case[] = [];
for (const bod of bodies) {
  for (const st of STYLES) {
    const c = measureCase(`${bod.name} × ${st.name}`, bod.body, st.s);
    cases.push(c);
    printBudget(c);
  }
}

console.log("\n── Summary table A (full garment, mm) ──");
console.log(
  "body×style | H | W | hipCut | finW | red | side | darts | resid | side% | dart%",
);
for (const c of cases) {
  console.log(
    [
      c.label.padEnd(22),
      f1(c.H).padStart(6),
      f1(c.W).padStart(6),
      f1(c.hipGirthCut).padStart(7),
      f1(c.finishedWaistNom).padStart(6),
      f1(c.totalReduction).padStart(5),
      f1(c.sideFull).padStart(6),
      f1(c.dartFull).padStart(6),
      f1(c.residual).padStart(6),
      pct(c.sideFull, c.totalReduction).padStart(6),
      pct(c.dartFull, c.totalReduction).padStart(6),
    ].join(" "),
  );
}

console.log("\n════════════════════════════════════════════════════════");
console.log("MEASUREMENT B — waist edge profile");
console.log("════════════════════════════════════════════════════════");
for (const c of cases) {
  printProfile(c);
}

console.log("\n════════════════════════════════════════════════════════");
console.log("MEASUREMENT C — validation rule");
console.log("════════════════════════════════════════════════════════");
console.log(`
  File:    lib/patterns/trouserBlock.ts  →  validateTrousers()
  Exact comparison:
      if (body.waist > body.hip) { … message: "Waist must not be larger than hip." }
  Compares: BODY measurements (the BodyMeasurements passed in).
            Call sites typically pass applyEase(body, ease) first, so the check sees
            eased waist vs eased hip — NOT the raw chart, NOT the draft cut girths (H+40 / W).
  waist == hip: ALLOWED (strict > only). Message says "must not be larger" — consistent.
  (gatheredSkirt.ts has the same body.waist > body.hip check.)
`);

// Probe == and >
{
  const base = bodyForSizeCode("12")!;
  const style = resolveStyle(BLOCK_TROUSER_STYLE, applyEase(base, BLOCK_TROUSER_STYLE.ease));
  const eq = validateTrousers({ ...base, waist: base.hip }, style);
  const gt = validateTrousers({ ...base, waist: base.hip + 1 }, style);
  console.log(
    `  Probe waist==hip: valid=${eq.valid} issues=${JSON.stringify(eq.issues)}`,
  );
  console.log(
    `  Probe waist=hip+1: valid=${gt.valid} issues=${JSON.stringify(gt.issues)}`,
  );
}

console.log(`
  Downstream if waist ≥ hip were permitted:
  - No draft assert on waist < hip.
  - Side shaping H/4−W/4−15−inset can go NEGATIVE (flare) — geometry still builds.
  - Back L = W/4+40; needs L ≥ BACK_CB_WAIST_RISE (20) for √(L²−y²) — always true for real W.
  - Dart intake is FIXED DART_TAKEUP=20, not derived from (H−W); stays 20 even if W≥H.
  - Shaped sideShift uses dart lengths vs band depth r, independent of (H−W).
  - validateTrousers is the gate; previewTrousers skips draft when !valid.
`);

console.log("\n════════════════════════════════════════════════════════");
console.log("MEASUREMENT D — degenerate / zero-suppression survey");
console.log("════════════════════════════════════════════════════════");

// Probe 1: waist == hip on body (allowed) — still has dart take-up + side may flare
{
  const base = bodyForSizeCode("12")!;
  const raw: BodyMeasurements = { ...base, waist: base.hip, lowWaist: base.hip };
  const body = applyEase(raw, { waist: 0, hip: 0 });
  const style = resolveStyle(
    { ...BLOCK_TROUSER_STYLE, ease: { waist: 0, hip: 0 } },
    body,
  );
  const c = measureCase("probe waist==hip ease0 Aldrich", raw, {
    ...BLOCK_TROUSER_STYLE,
    ease: { waist: 0, hip: 0 },
  });
  console.log("\n  D1. Existing style probe: body waist==hip, ease 0, Aldrich");
  console.log(
    `      W=${c.W} H=${c.H} hipCut=${f1(c.hipGirthCut)} finW=${f1(c.finishedWaistNom)} red=${f1(c.totalReduction)}`,
  );
  console.log(
    `      side=${f1(c.sideFull)} darts=${f1(c.dartFull)}  (darts STILL 120 mm — fixed, not scaled)`,
  );
  console.log(
    `      finished waist vs hipCut: fin ${f1(c.finishedWaistNom)} vs hip ${f1(c.hipGirthCut)} — NOT equal; tube not reached`,
  );
  console.log(
    `      front sideShaping=${f1(c.frontBud.sideShaping)} (negative ⇒ waist cut WIDER than hip half)`,
  );
  void style;
  void body;
}

// Probe 2: ease waist up until finished ≈ hipCut (tube target) — no code change
{
  const base = bodyForSizeCode("12")!;
  // finished ≈ W; want W ≈ H+40 with H = base.hip + hipEase
  // W = base.waist + waistEase ⇒ waistEase ≈ (base.hip + hipEase + 40) - base.waist
  const hipEase = 50;
  const H = base.hip + hipEase;
  const targetW = H + 40; // finished = hipCut
  const waistEase = targetW - base.waist;
  const settings: TrouserStyleSettings = {
    ...BLOCK_TROUSER_STYLE,
    ease: { waist: waistEase, hip: hipEase },
  };
  const c = measureCase("probe ease→finW=hipCut Aldrich", base, settings);
  console.log("\n  D2. Probe via ease only: set waist ease so W = H+40 (finished = hipCut)");
  console.log(
    `      waistEase=${waistEase} hipEase=${hipEase} → W=${c.W} H=${c.H}`,
  );
  console.log(
    `      hipCut=${f1(c.hipGirthCut)} finW=${f1(c.finishedWaistNom)} red=${f1(c.totalReduction)}`,
  );
  console.log(
    `      side=${f1(c.sideFull)} darts=${f1(c.dartFull)} resid=${f1(c.residual)}`,
  );
  console.log(
    `      Tube by girth? |fin−hipCut|=${f1(Math.abs(c.finishedWaistNom - c.hipGirthCut))}`,
  );
  console.log(
    `      BUT darts still remove ${c.dartFull} mm from cut waist; side shaping = ${f1(c.sideFull)} (negative = flare).`,
  );
  console.log(
    `      So waist EDGE LENGTH (cut) = W+120 > hip; after sewing darts, finished = hipCut.`,
  );
  console.log(
    `      Pull-on clearance uses FINISHED opening — that can equal hip while cut waist is still darted.`,
  );
}

// Dart zero-width
console.log(`
  D3. Zero-width darts
  - Dart mouth half-width DART_LEG_HALF = 10 mm (x) → intake ~20 mm always when dart is drawn.
  - Dart LENGTH shortened when darted band depth r > 0: Math.max(0, L − r).
  - When r ≥ dartLength, length = 0 → apex at mouth; marking still emitted if keep[i].
  - Shaped mode: keep[] = false → NO dart markings (take-up → sideShift).
  - No divide-by-zero found on zero-length darts; no explicit "skip if width 0" guard.
`);

console.log(`
  D4. Vertical side seam / dependents
  - Side seam is pchipByY([p11,p8,p13,p12]) / back analogue — works if p11.x == p8.x (vertical).
  - Knee from inseam inset uses chord p8→p12; vertical upper side is fine.
  - sideShift and notch placement do not require non-vertical side.
  - No code change needed to probe vertical side (set W so frontSideShaping≈0).
`);

console.log(`
  D5. Can zero total reduction be reached with existing knobs?
  - There is NO style scale on (H−W) or on dart take-up.
  - Ease / waistDrop change W relative to H, which scales SIDE shaping only.
  - Dart take-up stays FIXED at 120 mm (darted) or relocates to sideShift (shaped) —
    never scales to zero via a garment parameter.
  - Therefore a single 0–1 "suppression" factor does NOT exist today; probing s=0
    would require new code (or absurd ease that makes side shaping = −120 to cancel
    darts in the net — a flare, not a tube cut).
`);

console.log("\n════════════════════════════════════════════════════════");
console.log("HEADLINE");
console.log("════════════════════════════════════════════════════════");
console.log(`
  Waist reduction is NOT a single coherent budget with a preserved distribution.

  Components are INDEPENDENT mechanisms:
    1. Dart take-up — FIXED constants (20 mm × 1 front + 2×20 mm back per piece → 120 mm
       full garment). In shaped mode, the same constants are relocated to sideShift as
       a function of band depth r / dart length — not of (H−W).
    2. Side-seam taper — residual of Aldrich quarter formulas: hip halves (H/4+5, H/4+15)
       vs waist halves (W/4+20, W/4+40). Scales with (H−W), not with dart take-up.
    3. frontWaistInset — CF placement; does not change W or the waistCut span.
    4. CB rise / §2a scoop — EDGE LEVELLING (y), not girth reduction.

  A single 0–1 scale on "total reduction" would NOT preserve today's distribution unless
  the draft were rewritten to allocate one budget. As written, ease/waistDrop only move
  the side term; darts stay put. Reaching finished waist girth == hip girth is possible
  via ease (finished W = H+40) WHILE darts remain — that is a darted tube opening, not
  a dart-free straight cut. A dart-free hip-width waist needs shaped-mode sideShift→full
  take-up AND W chosen so side+shift yields hip half-widths — still multiple knobs.

  Flag: fixed dart take-up prevents "scale to zero" of all shaping with one factor.
  Flag: validateTrousers blocks body.waist > body.hip (eased), which would block some
  ease recipes that push W above H even when that is intentional for pull-on.
`);

console.log("=== end diagnostic ===");
