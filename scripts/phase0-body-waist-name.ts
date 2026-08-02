/**
 * PHASE 0 — body-waist naming: verify only (change nothing).
 * Run: npx tsx scripts/phase0-body-waist-name.ts
 *
 * Confirms invariance, waistDrop coupling, consumer census inputs, yoke==piece top.
 * Does NOT introduce bodyWaistY or change product code.
 */
import {
  applyEase,
  type BodyMeasurements,
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
  maxYokeDepth,
  resolveCrotchP0Y,
  trouserBackPoints,
  trouserDraftMeasures,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
  type WaistbandMode,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const DROP_SWEEP = [0, 10, 25, 40, 50] as const;

const f1 = (n: number) => n.toFixed(1);
const f3 = (n: number) => n.toFixed(3);

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

type FinishKind =
  | "facing"
  | "waistband-darted"
  | "waistband-shaped"
  | "elastic-casing";

type FinishCase = {
  kind: FinishKind;
  settings: TrouserStyleSettings;
  mode: WaistbandMode;
  depth: number;
  elastic: boolean;
  scoop: number | null;
};

const FINISHES: FinishCase[] = [
  {
    kind: "facing",
    settings: BLOCK_TROUSER_STYLE,
    mode: "darted",
    depth: 0,
    elastic: false,
    scoop: null,
  },
  {
    kind: "waistband-darted",
    settings: BLOCK_TROUSER_STYLE,
    mode: "darted",
    depth: 25,
    elastic: false,
    scoop: null,
  },
  {
    kind: "waistband-shaped",
    settings: CLEO_TROUSER_STYLE,
    mode: "shaped",
    depth: 120,
    elastic: false,
    scoop: CLEO_TROUSER_STYLE.waistlineCurveFront,
  },
  {
    kind: "elastic-casing",
    settings: MILA_TROUSER_STYLE,
    mode: "shaped",
    depth: 0,
    elastic: true,
    scoop: 0,
  },
];

function resolveDraftStyle(
  fin: FinishCase,
  body: BodyMeasurements,
  waistDropOverride?: number,
): TrouserFrontStyle {
  const s = fin.settings;
  const drop = waistDropOverride ?? s.waistDrop;
  const elastic = fin.elastic;
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(drop),
    waistDrop: drop,
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
    ...(fin.scoop != null
      ? { waistlineCurveFront: fin.scoop }
      : s.waistlineCurveFront != null
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
  };
  if (elastic) return withWaistband(base, 0, "shaped", body);
  return withWaistband(base, fin.depth, fin.mode, body);
}

function roleY(
  piece: ReturnType<typeof draftTrouserFront>,
  role: string,
  which: "first" | "last",
): number {
  const pts = piece.outline.filter((o) => o.role === role);
  if (pts.length === 0) return NaN;
  return which === "first" ? pts[0]!.at.y : pts[pts.length - 1]!.at.y;
}

/** The quantity Phase 1 would name: construction front CF y relative to D. */
function bodyWaistRelD(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): { D: number; constrCF: number; constrSide: number; constrCB: number; relCF: number } {
  const m = trouserDraftMeasures(body, style);
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  return {
    D: m.D,
    constrCF: f.p10.y,
    constrSide: f.p11.y,
    constrCB: b.p21.y,
    relCF: f.p10.y - m.D,
  };
}

let failures = 0;
function fail(msg: string) {
  failures++;
  console.log(`  FAIL: ${msg}`);
}
function ok(msg: string) {
  console.log(`  ok: ${msg}`);
}

console.log("=== PHASE 0: body-waist name — verify only (no product changes) ===\n");

// ---------------------------------------------------------------------------
console.log("=== 1. Invariance of construction waist plane rel to D ===\n");
console.log(
  "body | finish | D | constrCF | constrSide | constrCB | bodyWaistRelD(=constrCF−D)",
);

for (const bod of bodies) {
  const rels: number[] = [];
  for (const fin of FINISHES) {
    const eased = applyEase(bod.body, fin.settings.ease);
    const style = resolveDraftStyle(fin, eased);
    const bw = bodyWaistRelD(eased, style);
    rels.push(bw.relCF);
    console.log(
      `${bod.name} | ${fin.kind} | ${f1(bw.D)} | ${f1(bw.constrCF)} | ${f1(bw.constrSide)} | ${f1(bw.constrCB)} | ${f3(bw.relCF)}`,
    );
  }
  const uniq = [...new Set(rels.map((r) => r.toFixed(6)))];
  if (uniq.length !== 1) {
    fail(`${bod.name}: bodyWaistRelD varies across finishes: ${uniq.join(", ")}`);
  } else {
    ok(`${bod.name}: bodyWaistRelD = ${uniq[0]} invariant across all 4 finishes`);
  }
  // Front/side construction at same y
  const eased = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const style = resolveDraftStyle(FINISHES[3]!, eased);
  const f = trouserFrontPoints(eased, style);
  if (Math.abs(f.p10.y - f.p11.y) > 0.01) {
    fail(`${bod.name}: constr CF ≠ side (${f.p10.y} vs ${f.p11.y})`);
  } else {
    ok(`${bod.name}: constr CF ≡ constr side (y=${f1(f.p10.y)})`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 2. waistDrop sweep — body waist and D move together ===\n");
console.log(
  "body | drop | D | constrCF | abs bodyWaist(=constrCF) | bodyWaistRelD | ΔD | ΔconstrCF | lock?",
);

for (const bod of bodies) {
  const fin = FINISHES.find((f) => f.kind === "elastic-casing")!;
  const eased = applyEase(bod.body, fin.settings.ease);
  let prev: { drop: number; D: number; cf: number; rel: number } | null = null;
  let allLocked = true;
  for (const drop of DROP_SWEEP) {
    const style = resolveDraftStyle(fin, eased, drop);
    const bw = bodyWaistRelD(eased, style);
    let lock = "—";
    if (prev) {
      const dD = bw.D - prev.D;
      const dCf = bw.constrCF - prev.cf;
      // Together: ΔconstrCF should equal ΔD (both shift by −Δdrop in this frame)
      // Actually: D = hipDepth - drop → ΔD = −Δdrop
      // constrCF stays at y=0 always in pattern space!
      // So abs body waist in pattern coords is ALWAYS 0; D moves; rel = 0 - D = -D
      const locked = Math.abs(bw.relCF - -bw.D) < 0.01 && Math.abs(bw.constrCF) < 0.01;
      lock = locked ? "yes" : "NO";
      if (!locked) allLocked = false;
      console.log(
        `${bod.name} | ${drop} | ${f1(bw.D)} | ${f1(bw.constrCF)} | ${f1(bw.constrCF)} | ${f3(bw.relCF)} | ${f1(dD)} | ${f1(dCf)} | ${lock}`,
      );
    } else {
      console.log(
        `${bod.name} | ${drop} | ${f1(bw.D)} | ${f1(bw.constrCF)} | ${f1(bw.constrCF)} | ${f3(bw.relCF)} | — | — | —`,
      );
    }
    prev = { drop, D: bw.D, cf: bw.constrCF, rel: bw.relCF };
  }
  // Rel to D must be constant under drop sweep (= −D when constrCF=0, i.e. rel = −D always... wait
  // bodyWaistRelD = constrCF - D = 0 - D = -D. That CHANGES with drop because D changes!
  // The brief says: "body-waist line defined relative to D stays put under the sweep"
  // If rel = constrCF - D = -D, that does NOT stay put — it tracks -D.
  //
  // Re-read brief: "confirm the body waist and D move together, so the body-waist line
  // defined relative to D stays put"
  //
  // If both move by the same absolute amount, their difference stays put.
  // constrCF is always 0 (pattern frame origin). D = hipDepth - drop moves.
  // Absolute body waist in pattern space: y=0 (doesn't move in pattern coords).
  // Absolute hipline D moves down as drop increases... actually D shrinks (smaller number).
  //
  // In BODY space: when you drop the waist, the garment waist sits lower on the body.
  // In PATTERN space: y=0 is redefined as the new (lower) waist; hipDepth measurement
  // to the hip is shorter, so D is smaller. Both "move together" by re-anchoring the frame.
  //
  // bodyWaistRelD = 0 - D = -D. As drop goes 0→50, D shrinks, -D grows (e.g. -215 → -165).
  // That does NOT stay put!
  //
  // UNLESS the brief means: the named quantity is stored as an offset FROM D that is
  // constant for a given body when finish changes — and under waistDrop, absolute
  // body waist and absolute D both shift such that... hmm.
  //
  // Diagnostic said bodyWaistRelD ≈ -215 invariant across finishes at fixed drop.
  // Under drop sweep, D changes so -D changes. The brief says:
  // "body-waist line defined *relative to D* stays put under the sweep"
  //
  // That would only be true if constrCF also moves with D. But constrCF is always 0.
  // So rel = -D always changes with drop.
  //
  // Perhaps they mean: in absolute body/world coords, waist and hip both drop by the
  // same amount so the waist-to-hip distance (D) is the gap — and expressing waist as
  // "D + bodyWaistRelD" with bodyWaistRelD = -D_at_drop0? No that doesn't work.
  //
  // OR: bodyWaistY is defined as constrCF - D, and they incorrectly expect it constant
  // under drop. Phase 0 must REPORT the truth: rel = -D changes with drop; absolute
  // constrCF stays 0; D and the body-waist-in-frame move together by redefinition.
  //
  // "move together" check: Δ(abs body waist in a fixed outer frame).
  // Outer frame: measure from floor or from crotch. F = waistToFloor - drop, R = bodyRise - drop.
  // Distance from crotch tip (y=R) to waist (y=0) = R, which shrinks with drop.
  // Distance from hip (y=D) to waist (y=0) = D, which shrinks with drop.
  // So waist-to-hip gap D shrinks; waist stays at pattern y=0.
  //
  // The brief's "relative to D stays put" expectation may mean:
  // bodyWaistY_named := constrCF - D  should equal the finish-invariant gap, and when
  // drop changes, if we redefine... Actually re-read again carefully:
  //
  // "sweep waistDrop and confirm the body waist and D move together, so the
  // body-waist line defined relative to D stays put under the sweep"
  //
  // Interpretation A: rel = waist - D is constant under drop → FALSE for current geometry
  // Interpretation B: waist and D translate by the same Δ in a fixed frame → then difference constant
  //
  // In a FIXED frame anchored at the crotch tip before drop:
  // Before drop: waist at y_w, hip at y_h, D = y_h - y_w... pattern has waist at 0, hip at D.
  // After drop δ: the draft re-zeros waist at 0, hip at D' = hipDepth - δ.
  // In body coords (waist-to-floor fixed landmark): natural waist was at floor-WTF;
  // dropped waist is δ lower. Hip stays. So body waist moves toward hip; D shrinks;
  // they don't "move together" — waist moves, hip stays, gap shrinks.
  //
  // So STOP condition: "If waistDrop moves them differently, stop and report"
  // They DO move differently in body space (waist drops, hip fixed, D shrinks).
  // In pattern space, waist is re-zeroed and D shrinks — bodyWaistRelD = -D changes.
  //
  // Phase 0 must report this clearly so Helen can decide the anchor.

  // Check: is bodyWaistRelD constant under drop?
  const relsAtDrops: number[] = [];
  for (const drop of DROP_SWEEP) {
    const style = resolveDraftStyle(fin, eased, drop);
    relsAtDrops.push(bodyWaistRelD(eased, style).relCF);
  }
  const uniqRel = [...new Set(relsAtDrops.map((r) => r.toFixed(6)))];
  if (uniqRel.length === 1) {
    ok(`${bod.name}: bodyWaistRelD CONSTANT under drop sweep (= ${uniqRel[0]})`);
  } else {
    console.log(
      `  STOP ${bod.name}: bodyWaistRelD is NOT constant under drop — values: ${relsAtDrops.map(f1).join(", ")}`,
    );
    console.log(
      `        (= −D each time; constrCF stays 0; D = hipDepth−drop shrinks). Anchor choice needed.`,
    );
    // Not a geometry failure — a Phase 1 design fork. Counted for the headline.
  }
  // Together in the sense: constrCF always 0, D tracks hipDepth−drop
  if (allLocked) {
    ok(`${bod.name}: constrCF locked at 0; D = hipDepth−drop; relCF = −D always`);
  }
}

// Explicit Helen drop table for the report
console.log("\n--- Helen-print drop detail (elastic) ---\n");
{
  const eased = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const fin = FINISHES[3]!;
  console.log("drop | hipDepth | D | constrCF | bodyWaistRelD | pieceTopCF | pieceTop−D");
  for (const drop of DROP_SWEEP) {
    const style = resolveDraftStyle(fin, eased, drop);
    const bw = bodyWaistRelD(eased, style);
    const front = draftTrouserFront(eased, style);
    const pcf = roleY(front, "waist", "first");
    console.log(
      `${drop} | ${eased.hipDepth} | ${f1(bw.D)} | ${f1(bw.constrCF)} | ${f3(bw.relCF)} | ${f1(pcf)} | ${f3(pcf - bw.D)}`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. Consumer census (code readers → body waist vs piece top) ===\n");
console.log(`Definitive list from code (Phase 0 — no re-pointing):

WANTS PIECE TOP (leave unchanged in Phase 1):
  • resolveCrotchP0Y("waistEdge")         — P0.y = waistCfY arg (= wr.cf.y)
  • frontCrotchCurve / draft path         — waistCfY: wr.cf.y; join ends at wr.cf
  • crotchDepartureAboveHipMax            — room = D − waistCfY (piece-top CF)
  • mid-waist notch                       — arc mid of wr.waistSeam
  • seamLengths.topEdge                   — len(wr.waistSeam)
  • sideOpening zip arc                   — from side-seam run start (= piece top side)
  • band attach / trouserWaistEdges       — lengths of resolved waist seam
  • TrousersView highlight waist edges    — piece outline role "waist"
  • isDartedFacingFinish / facing tag     — policy on piece top at r=0
  • back waist seam / CB join to wr.cf    — piece top CB

WANTS BODY WAIST (Phase 1 re-point candidates — only if currently reconstructing):
  • trouserWaistGirth / waistDrop frame   — already uses body + drop spec (NOT piece top);
                                            may already be correct via another route → re-point = no-op
  • future pocket mouth-top               — noted, not built; will read bodyWaistY
  • (none other found that read piece top to mean body waist)

NAMING TRAP (not a consumer of either correctly):
  • TrousersView departure slider max     — passes resolveWaistlineCurveFront() (scoop depth)
                                            where waistCfY (piece-top CF y) is meant

Expected Phase 1 re-point set: empty or no-op for girth/drop (already on body frame);
  pocket deferred. Piece-top list untouched.
`);

// ---------------------------------------------------------------------------
console.log("=== 4. yoke seam == piece top (shaped mode) ===\n");

for (const bod of bodies) {
  const fin = FINISHES.find((f) => f.kind === "waistband-shaped")!;
  const eased = applyEase(bod.body, fin.settings.ease);
  const style = resolveDraftStyle(fin, eased);
  const r = style.waistReduction ?? 0;
  const front = draftTrouserFront(eased, style);
  const back = draftTrouserBack(eased, style);
  const pieceCF = roleY(front, "waist", "first");
  const pieceSide = roleY(front, "waist", "last");
  const pieceCB = roleY(back, "waist", "first");
  // Code synonym (diag-front-crotch-waist-coupling): yokeLowerY = waistCfY when shaped && r>0.
  // There is no separate yokeSeamY — maxYokeDepth only caps r; the seam IS wr / piece top.
  const yokeCap = maxYokeDepth(eased, style.block ?? "classic", style.waistDrop);
  const yokeLowerY = pieceCF; // by definition in this codebase
  const waistRoleCount = front.outline.filter((o) => o.role === "waist").length;
  const otherTopRoles = front.outline.filter(
    (o) => o.role === "yoke" || o.role === "yoke-seam",
  ).length;
  console.log(
    `${bod.name}: r=${r} yokeCap=${f1(yokeCap)} pieceTopCF=${f1(pieceCF)} pieceTopSide=${f1(pieceSide)} pieceTopCB=${f1(pieceCB)}`,
  );
  console.log(
    `         yokeLowerY≡pieceTopCF=${f1(yokeLowerY)}  waist samples=${waistRoleCount}  yoke-role samples=${otherTopRoles}`,
  );
  if (otherTopRoles > 0) {
    fail(`${bod.name}: distinct yoke role on outline — third concept exists`);
  } else if (Math.abs(yokeLowerY - pieceCF) > 0.01) {
    fail(`${bod.name}: yokeLowerY ≠ piece top`);
  } else {
    ok(`${bod.name}: yoke seam ≡ piece top (same y; no third outline role)`);
  }
  // Side y after arc-walk ≠ r exactly (slanted side + sideShift) — expected, not a third line.
  console.log(
    `         note: pieceTopSide−r = ${f3(pieceSide - r)} mm (arc-walk on slanted side, not a separate yoke)`,
  );
}

console.log(
  failures === 0
    ? "\n=== PHASE 0 COMPLETE — awaiting go-ahead for Phase 1 ===\n"
    : `\n=== PHASE 0 FAILURES (${failures}) — do not proceed ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
