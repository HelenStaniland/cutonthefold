/**
 * DIAGNOSTIC — waistDrop vs waist-edge profile (print only).
 * Run: npx tsx scripts/diag-waistdrop-edge.ts
 *
 * Change nothing in product code. Numbers only — stop and report.
 */
import {
  applyEase,
  type BodyMeasurements,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { MILA_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrouserFront,
  resolveCrotchP0Y,
  resolveFrontWaistInset,
  resolveWaistTaper,
  resolveWaistlineCurveFront,
  trouserBackPoints,
  trouserDraftMeasures,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
  WAIST_DROP_MAX,
} from "../lib/patterns/trouserBlock";

/** Known source constant — not exported. */
const BACK_CB_WAIST_RISE = 20;

const DROPS = [0, 20, 40, 60] as const;
const SIZES = ["8", "12", "16", "20"] as const;

const HELEN_VERTICALS = {
  waistToFloor: 1020,
  hipDepth: 215,
  bodyRise: 301,
} as const;

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN_VERTICALS };
}

/** Mirror TrousersView elastic draft boundary. */
function resolveElasticStyle(
  waistDrop: number,
  body: BodyMeasurements,
): TrouserFrontStyle {
  const s = MILA_TROUSER_STYLE;
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(waistDrop),
    waistDrop,
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
    // Elastic derived overrides
    frontWaistInset: 0,
    waistTaper: 0,
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
  };
  return withWaistband(base, 0, "shaped", body);
}

function rolePts(
  piece: ReturnType<typeof draftTrouserFront>,
  role: string,
): Point[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at);
}

function f3(n: number) {
  return n.toFixed(3);
}
function f1(n: number) {
  return n.toFixed(1);
}

/** Max |y − yRef| across samples (levelness vs a reference y). */
function maxDevFromLevel(pts: Point[], yRef: number): number {
  let m = 0;
  for (const p of pts) {
    m = Math.max(m, Math.abs(p.y - yRef));
  }
  return m;
}

/** Max absolute deviation from the straight chord between endpoints (true curve). */
function maxDevFromChord(pts: Point[]): number {
  if (pts.length < 2) return 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let m = 0;
  for (const p of pts) {
    let yChord: number;
    if (len2 < 1e-18) {
      yChord = a.y;
    } else {
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      yChord = a.y + t * dy;
    }
    // Perpendicular distance to chord in plane
    const dist =
      len2 < 1e-18
        ? Math.hypot(p.x - a.x, p.y - a.y)
        : Math.abs((p.y - a.y) * dx - (p.x - a.x) * dy) / Math.sqrt(len2);
    m = Math.max(m, dist);
  }
  return m;
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
    hipCut: 2 * frontHip + 2 * backHip,
    waistCut: 2 * frontWaist + 2 * backWaist,
    frontSideInset: f.p8.x - f.p11.x,
    backSideInset: b.p25.x - b.p22.x,
  };
}

/** Interpolated block constants (mirror of private blockSpecForDrop). */
function blockConsts(drop: number) {
  const clamped = Math.max(0, Math.min(WAIST_DROP_MAX, drop));
  const s = clamped / WAIST_DROP_MAX;
  return {
    riseDrop: clamped,
    frontDartLength: 100 - 40 * s,
    backDartLengths: [120 - 40 * s, 100 - 40 * s] as const,
    backWaistStep: 20 - 2.5 * s,
    backCrotchAdd: 8 - 3 * s,
  };
}

type BodyRow = { name: string; body: BodyMeasurements };

const bodies: BodyRow[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

console.log("=== DIAG: waistDrop × waist edge (Mila elastic) ===\n");
console.log(
  "Style: MILA defaults + elastic draft boundary (taper 0, inset 0, shaped@0).",
);
console.log(
  `Stored Mila waistlineCurveFront=${MILA_TROUSER_STYLE.waistlineCurveFront}, waistTaper=${MILA_TROUSER_STYLE.waistTaper}, crotchDeparture=${JSON.stringify(MILA_TROUSER_STYLE.crotchDeparture)}.`,
);
console.log(`WAIST_DROP_MAX=${WAIST_DROP_MAX} (drops above this clamp).\n`);

// ---------------------------------------------------------------------------
// Measurement C — what elastic controls (static statement from draft wiring)
// ---------------------------------------------------------------------------
console.log("=== C. Elastic finish — what it controls at the waist edge ===\n");
console.log(
  "  DOES derive: waistTaper→0, frontWaistInset→0, draft mode shaped@depth 0 (dartless).",
);
console.log(
  "  DOES NOT touch: waistDrop, waistlineCurveFront / scoop, BACK_CB_WAIST_RISE,",
);
console.log(
  "  backWaistStep, W re-derivation, R/D/F frame shift, crotchDeparture.",
);
console.log(
  "  Waist edge geometry under elastic is therefore whatever the block produces at",
);
console.log(
  "  taper=0 / inset=0 / r=0 / stored scoop — drop still moves the frame and W.\n",
);

// ---------------------------------------------------------------------------
// Measurement A
// ---------------------------------------------------------------------------
console.log("=== A. waistDrop sweep — edge profile, girths, contributors ===\n");

for (const bod of bodies) {
  const eased = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  console.log(`\n--- ${bod.name}  (eased W₀=${eased.waist} lowW=${eased.lowWaist} H=${eased.hip}) ---\n`);
  console.log(
    "drop | yCF_f | ySide_f | yCB_b | ySide_b | levDevF | levDevB | chordDevF | chordDevB | scoop | CBrise | taper | sideInsF | sideInsB | backStep | W_used | hipCut | waistCut | gap",
  );

  const gapAt0: { drop: number; gap: number }[] = [];

  for (const drop of DROPS) {
    const style = resolveElasticStyle(drop, eased);
    const m = trouserDraftMeasures(eased, style);
    const scoop = resolveWaistlineCurveFront(style);
    const taper = resolveWaistTaper(style);
    const inset = resolveFrontWaistInset(style);
    const bc = blockConsts(drop);
    const g = girths(eased, style);
    const front = draftTrouserFront(eased, style);
    const back = draftTrouserBack(eased, style);
    const wF = rolePts(front, "waist");
    const wB = rolePts(back, "waist");

    const yCfF = wF[0]?.y ?? g.f.p10.y;
    const ySideF = wF[wF.length - 1]?.y ?? g.f.p11.y;
    const yCbB = wB[0]?.y ?? g.b.p21.y;
    const ySideB = wB[wB.length - 1]?.y ?? g.b.p22.y;

    // Level ref: side y (no scoop at side); front should match CF if scoop=0
    const levDevF = maxDevFromLevel(wF, ySideF);
    const levDevB = maxDevFromLevel(wB, ySideB);
    const chordDevF = maxDevFromChord(wF);
    const chordDevB = maxDevFromChord(wB);

    const gap = g.hipCut - g.waistCut;
    gapAt0.push({ drop, gap });

    console.log(
      `${drop} | ${f1(yCfF)} | ${f1(ySideF)} | ${f1(yCbB)} | ${f1(ySideB)} | ${f3(levDevF)} | ${f3(levDevB)} | ${f3(chordDevF)} | ${f3(chordDevB)} | ${f1(scoop)} | ${f1(BACK_CB_WAIST_RISE)} | ${f3(taper)} | ${f3(g.frontSideInset)} | ${f3(g.backSideInset)} | ${f3(bc.backWaistStep)} | ${f1(m.W)} | ${f1(g.hipCut)} | ${f1(g.waistCut)} | ${f3(gap)}`,
    );

    // Explicit endpoint construction points (draft frame)
    console.log(
      `     pts: p10=(${f1(g.f.p10.x)},${f1(g.f.p10.y)}) p11=(${f1(g.f.p11.x)},${f1(g.f.p11.y)}) p21=(${f1(g.b.p21.x)},${f1(g.b.p21.y)}) p22=(${f1(g.b.p22.x)},${f1(g.b.p22.y)})  R=${f1(m.R)} D=${f1(m.D)} insetDraft=${inset}`,
    );
  }

  // Gap slope per mm drop (0→60, and stepwise)
  console.log("\n  gap Δ vs drop:");
  for (let i = 1; i < gapAt0.length; i++) {
    const a = gapAt0[i - 1];
    const b = gapAt0[i];
    const dDrop = b.drop - a.drop;
    const dGap = b.gap - a.gap;
    console.log(
      `    ${a.drop}→${b.drop}: Δgap=${f3(dGap)} mm  (${f3(dGap / dDrop)} mm gap per mm drop)`,
    );
  }
  const g0 = gapAt0[0].gap;
  const gLast = gapAt0[gapAt0.length - 1].gap;
  const span = gapAt0[gapAt0.length - 1].drop - gapAt0[0].drop;
  console.log(
    `    overall 0→${gapAt0[gapAt0.length - 1].drop}: Δgap=${f3(gLast - g0)}  mean ${f3((gLast - g0) / span)} mm/mm`,
  );
}

console.log("\n=== A — contributor notes (same at every body; elastic) ===\n");
console.log(
  "  waistlineCurveFront: stored 0 → scoopTerm = 0 on front (r=0 path).",
);
console.log(
  `  BACK_CB_WAIST_RISE: fixed ${BACK_CB_WAIST_RISE} mm — p21.y = −${BACK_CB_WAIST_RISE}, p22.y = 0.`,
);
console.log(
  "  → Back waist edge is a STRAIGHT SLANT (chord), not a bow, at every drop.",
);
console.log(
  "  waistTaper: derived 0 → side vertical; side insets stay 0.",
);
console.log(
  "  Drop-specific: riseDrop/hipDepthDrop shift R,D,F; W blends waist→lowWaist;",
);
console.log(
  "  backWaistStep interpolates 20→17.5 over 0→50; dart lengths / backCrotchAdd too.",
);
console.log(
  "  With taper=0, W does NOT set side x (tube from hip). W still enters Aldrich",
);
console.log(
  "  formulae that are blended out. backWaistStep still moves p21.x.",
);

console.log("\n=== A — structural question: re-derive vs translate? ===\n");
console.log(
  "  BOTH. Draft frame: waist stays at y=0 (front) / CB at y=−20; R,D,F shrink by",
);
console.log(
  "  drop — a translation of the hip/crotch relative to the waist origin, not a",
);
console.log(
  "  parallel offset of a curved waist polyline.",
);
console.log(
  "  AND W is re-derived: W = waist + (drop/WAIST_DROP_MAX)·(lowWaist−waist).",
);
console.log(
  "  Under elastic (taper 0) that W re-derivation does not widen the tube waist;",
);
console.log(
  "  the visible edge profile change with drop is dominated by the fixed CB rise",
);
console.log(
  "  slant (always present) plus backWaistStep / D changes — not by scoop.",
);

// ---------------------------------------------------------------------------
// Measurement B — crotchDeparture clamp
// ---------------------------------------------------------------------------
console.log("\n=== B. crotchDeparture clamp vs waistDrop ===\n");
console.log(
  "Mila crotchDeparture=45 → target P0.y = D−45, clamped to [waistCfY, D].\n",
);
console.log(
  "body | drop | waistCfY | D | room(=D−waistCfY) | target(D−45) | P0.y | clamp? | loop/degen?",
);

for (const bod of bodies) {
  const eased = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  let firstClamp: number | null = null;

  for (const drop of DROPS) {
    const style = resolveElasticStyle(drop, eased);
    const m = trouserDraftMeasures(eased, style);
    const waistCfY = resolveWaistlineCurveFront(style); // scoop depth, NOT CF y!
    // Actual CF waist y from draft / points
    const f = trouserFrontPoints(eased, style);
    const front = draftTrouserFront(eased, style);
    const wF = rolePts(front, "waist");
    const cfY = wF[0]?.y ?? f.p10.y;
    // resolveCrotchP0Y uses waistCfY = scooped waist CF y (= wr.cf.y in draft).
    // At scoop 0 and r 0, that is p10.y (= 0), not the scoop depth constant.
    const waistCfYForP0 = cfY;
    const D = m.D;
    const target = D - 45;
    const p0Y = resolveCrotchP0Y(style, D, waistCfYForP0);
    const room = D - waistCfYForP0;
    const unclampedWouldBe = D - Math.max(0, Math.min(room, 45));
    // Clamp engages when requested aboveHip (45) exceeds room, i.e. D−45 < waistCfY
    const clampEngaged = target < waistCfYForP0 - 1e-9 || 45 > room + 1e-9;
    if (clampEngaged && firstClamp === null) firstClamp = drop;

    // Degenerate / loop heuristics: front crotch samples, waist length, P0 vs CF
    let degen = "ok";
    try {
      const marks = front.markings;
      const waistLen = (() => {
        let L = 0;
        for (let i = 1; i < wF.length; i++) {
          L += Math.hypot(wF[i].x - wF[i - 1].x, wF[i].y - wF[i - 1].y);
        }
        return L;
      })();
      if (wF.length < 2) degen = "DEGEN:waist_pts";
      else if (waistLen < 1) degen = "DEGEN:waist_len";
      else if (p0Y < waistCfYForP0 - 0.05) degen = "DEGEN:P0_above_waist";
      else if (p0Y > D + 0.05) degen = "DEGEN:P0_below_hip";
      void marks;
      void unclampedWouldBe;
    } catch (e) {
      degen = `THROW:${e instanceof Error ? e.message : e}`;
    }

    console.log(
      `${bod.name} | ${drop} | ${f3(waistCfYForP0)} | ${f1(D)} | ${f1(room)} | ${f1(target)} | ${f3(p0Y)} | ${clampEngaged ? "YES" : "no"} | ${degen}`,
    );
  }
  console.log(
    `  → first clamp engagement for ${bod.name}: ${firstClamp === null ? "none in {0,20,40,60}" : `drop=${firstClamp}`}`,
  );
}

console.log("\n=== B note ===");
console.log(
  "  resolveWaistlineCurveFront returns scoop *depth* (0 here), not CF y.",
);
console.log(
  "  P0 clamp uses the drafted waist CF y (0 under elastic + scoop 0).",
);
console.log(
  "  Clamp engages when D − 45 < waistCfY, i.e. when D < 45 (room < 45).",
);

console.log("\n=== done ===");
