/**
 * PHASE 0 — elastic self-casing geometry (verify only; change nothing).
 * Run: npx tsx scripts/phase0-elastic-casing.ts
 *
 * Six gates from the brief. Stop after this report — no Phase 1 build.
 */
import { applyEase, type BodyMeasurements } from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { polylineLength } from "../lib/geometry/curves";
import {
  CARGO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  BACK_CB_WAIST_RISE,
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrouserFront,
  draftTrousers,
  resolveBackCbWaistRise,
  resolveBodyWaistY,
  resolveFrontSlantPocketMouth,
  resolvePocketFront,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const f3 = (n: number) => n.toFixed(3);
const f6 = (n: number) => n.toFixed(6);

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

/** Elastic draft boundary — same as TrousersView for elastic finish. */
function resolveElastic(
  s: TrouserStyleSettings,
  body: BodyMeasurements,
  overrides: Partial<TrouserFrontStyle> = {},
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
    frontWaistInset: 0,
    waistTaper: 0,
    ...(s.backCbWaistRise != null ? { backCbWaistRise: s.backCbWaistRise } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
    ...(s.pocketFront === "slant" ? { pocketFront: "slant" as const } : {}),
    ...overrides,
  };
  return withWaistband(base, 0, "shaped", body);
}

function waistPts(piece: ReturnType<typeof draftTrouserFront>) {
  return piece.outline.filter((o) => o.role === "waist").map((o) => o.at);
}

function yRange(pts: { x: number; y: number }[]) {
  const ys = pts.map((p) => p.y);
  return { min: Math.min(...ys), max: Math.max(...ys), span: Math.max(...ys) - Math.min(...ys) };
}

function xAtEnds(pts: { x: number; y: number }[]) {
  return { first: pts[0]!, last: pts[pts.length - 1]! };
}

/** Rise of CB above side along back waist chord (mm, y-down so CB rise ⇒ smaller y). */
function backWaistSlant(style: TrouserFrontStyle, body: BodyMeasurements) {
  const back = draftTrouserBack(body, style);
  const w = waistPts(back);
  const cb = w[0]!;
  const side = w[w.length - 1]!;
  const dy = side.y - cb.y; // positive ⇒ CB higher (smaller y)
  const dx = side.x - cb.x;
  const chord = Math.hypot(dx, dy);
  const angleFromHorizDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Constant-width channel along slant: parallelogram offset distance = channel depth.
  // Lateral shift of fold vs turndown along +x for depth d: d * sin(θ) where θ from horizontal.
  const theta = Math.atan2(dy, dx);
  return {
    cb,
    side,
    dy,
    dx,
    chord,
    angleFromHorizDeg,
    thetaRad: theta,
    /** Horizontal run of a normal offset of depth d (mm per mm of channel depth). */
    horizPerDepth: Math.sin(theta),
    /** Vertical component of normal offset (mm per mm depth) — should be ~1 for level. */
    vertPerDepth: Math.cos(theta),
    cbRiseResolved: resolveBackCbWaistRise(style),
  };
}

console.log("=== PHASE 0: elastic self-casing (verify only — change nothing) ===\n");
console.log(
  "NOTE: pocket brief is present in the working tree but NOT committed",
);
console.log(
  "(git: modified trouserBlock / garmentStyles / TrousersView + untracked slantFrontPocket).",
);
console.log(
  "Brief said: start only after pocket committed. Reporting against current tree.\n",
);

// =============================================================================
console.log("=== 1. Current elastic top-edge geometry (Cargo, post-pocket) ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveElastic(CARGO_TROUSER_STYLE, body);
  const bodyY = resolveBodyWaistY(body, style);
  const front = draftTrouserFront(body, style);
  const back = draftTrouserBack(body, style);
  const fw = waistPts(front);
  const bw = waistPts(back);
  const fY = yRange(fw);
  const bY = yRange(bw);
  const fEnds = xAtEnds(fw);
  const bEnds = xAtEnds(bw);
  const cfRun = front.outline.filter((o) => o.role === "centre-front");
  const cfXs = cfRun.map((o) => o.at.x);
  const cfXSpan =
    cfXs.length > 0 ? Math.max(...cfXs) - Math.min(...cfXs) : NaN;

  console.log(`--- ${bod.name} ---`);
  console.log(`  bodyWaistY = ${f3(bodyY)}`);
  console.log(
    `  FRONT top (waist role): n=${fw.length} y∈[${f3(fY.min)}, ${f3(fY.max)}] span=${f3(fY.span)} mm`,
  );
  console.log(
    `    CF end (${f2(fEnds.first.x)},${f2(fEnds.first.y)}) → side/mouth (${f2(fEnds.last.x)},${f2(fEnds.last.y)})`,
  );
  console.log(
    `    CF role x-span (verticality proxy) = ${f3(cfXSpan)} mm (0 = vertical CF above hip)`,
  );
  console.log(
    `  BACK top (waist role): n=${bw.length} y∈[${f3(bY.min)}, ${f3(bY.max)}] span=${f3(bY.span)} mm`,
  );
  console.log(
    `    CB (${f2(bEnds.first.x)},${f2(bEnds.first.y)}) → side (${f2(bEnds.last.x)},${f2(bEnds.last.y)})`,
  );
  console.log(
    `    CB rise style = ${resolveBackCbWaistRise(style)} (default Aldrich ${BACK_CB_WAIST_RISE}; Cargo omits → ${BACK_CB_WAIST_RISE})`,
  );
  console.log(
    `    Δy side−CB = ${f3(bEnds.last.y - bEnds.first.y)} mm (positive ⇒ CB higher in y-down)`,
  );
  console.log(
    `  pocketFront = ${resolvePocketFront(style)}; front pieces in draftTrousers = ${draftTrousers(body, style).pieces.length}`,
  );
  console.log(
    `  FLAG: no upward extension, no fold marking, no turndown seam — piece top IS the net waist edge.`,
  );
}

// =============================================================================
console.log("\n=== 2. Fold placement vs bodyWaistY (propose, do not commit) ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveElastic(CARGO_TROUSER_STYLE, body);
  const bodyY = resolveBodyWaistY(body, style);
  const front = draftTrouserFront(body, style);
  const fw = waistPts(front);
  const pieceTopY = yRange(fw).min;

  console.log("Current placeholder (code today):");
  console.log(`  bodyWaistY          = ${f3(bodyY)}`);
  console.log(`  piece-top (waist y) = ${f3(pieceTopY)}`);
  console.log(
    `  extension above bodyWaistY = ${f3(pieceTopY - bodyY)} mm  ← zero; flag-only elastic`,
  );
  console.log(
    `  TrousersView comment: "Elastic drafts on the shaped dart-omission path at depth 0 (no casing yet)."`,
  );
  console.log(
    `  UI copy: "Pull-on elastic casing (shape next)."`,
  );
  console.log("");
  console.log("Helen's 5 cm toile — relationship to interpret (not in code):");
  console.log(
    "  A ~50 mm finished casing on the body usually means: elastic sits in a",
  );
  console.log(
    "  channel whose *finished top* (fold) is the garment's visible waist edge,",
  );
  console.log(
    "  and the turndown seam (raw-edge catch) sits ~channel-depth below that fold.",
  );
  console.log(
    "  bodyWaistY is the *construction* waist plane (front/side). Three placements:",
  );
  console.log("");
  console.log("  A. Fold AT bodyWaistY");
  console.log(
    "     Channel hangs below the construction waist; turndown deeper still.",
  );
  console.log(
    "     Piece top = bodyWaistY (today's geometry). Extension is *below* into the",
  );
  console.log(
    "     garment — unusual for a cut extension (cut usually goes up then folds down).",
  );
  console.log("");
  console.log("  B. Fold ABOVE bodyWaistY  ← typical self-casing cut");
  console.log(
    "     Upward cut extension; fold = finished top; turndown seam ≈ bodyWaistY",
  );
  console.log(
    "     (or slightly below). Channel straddles: fold above, turndown at/near plane.",
  );
  console.log(
    "     Matches the pocket brief's later plan: mouth-top → turndown seam",
  );
  console.log(
    "     (= bodyWaistY + finish depth once wired).",
  );
  console.log("");
  console.log("  C. Channel straddles bodyWaistY asymmetrically");
  console.log(
    "     Fold above and turndown below the plane — bodyWaistY mid-channel.",
  );
  console.log("");
  console.log("PROPOSE (not commit): B — fold above bodyWaistY; turndown seam at");
  console.log(
    "  (or just below) bodyWaistY so the pocket mouth can later sit on the turndown.",
  );
  console.log(
    "  A 5 cm toile then reads as ~50 mm from fold to turndown (channel + ease),",
  );
  console.log(
    "  not as 50 mm of mysterious gap above an already-finished top.",
  );
  console.log(
    "  Exact mm per elasticWidth are Phase 1 — Helen confirms placement first.",
  );
}

// =============================================================================
console.log("\n=== 3. Slanted back feasibility (numbers, not verdict) ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveElastic(CARGO_TROUSER_STYLE, body);
  const s = backWaistSlant(style, body);
  console.log("Cargo Helen-print, default CB rise (20 mm — preset omits override):");
  console.log(`  CB  = (${f2(s.cb.x)}, ${f2(s.cb.y)})`);
  console.log(`  side= (${f2(s.side.x)}, ${f2(s.side.y)})`);
  console.log(`  chord length     = ${f2(s.chord)} mm`);
  console.log(`  Δy (side − CB)   = ${f3(s.dy)} mm`);
  console.log(`  Δx (side − CB)   = ${f3(s.dx)} mm`);
  console.log(`  angle from +x    = ${f2(s.angleFromHorizDeg)}°`);
  console.log(`  resolveBackCbWaistRise = ${s.cbRiseResolved} mm`);
  console.log("");
  console.log("Constant-width channel along this slant (parallelogram model):");
  console.log(
    "  Offset the waist edge by depth d along its outward normal → fold and",
  );
  console.log(
    "  turndown are parallel curves; channel width measured perpendicular to",
  );
  console.log("  the waist edge is constantly d.");
  console.log(
    `  For depth d=1 mm: Δhorizontal ≈ ${f3(s.horizPerDepth)} mm, Δvertical ≈ ${f3(s.vertPerDepth)} mm`,
  );
  console.log(
    "  (y-down frame; signs depend on outward normal choice — magnitudes matter.)",
  );
  console.log("");
  // Sweep CB rise like Helen's toile (~76)
  console.log("CB-rise sweep (Cargo elastic, Helen-print) — slant severity:");
  console.log("  rise | Δy side−CB | angle° | chord");
  for (const rise of [0, 20, 40, 60, 76, 100]) {
    const st = resolveElastic(CARGO_TROUSER_STYLE, body, {
      backCbWaistRise: rise,
    });
    const ss = backWaistSlant(st, body);
    console.log(
      `  ${String(rise).padStart(4)} | ${f3(ss.dy).padStart(10)} | ${f2(ss.angleFromHorizDeg).padStart(6)} | ${f1(ss.chord)}`,
    );
  }
  console.log("");
  console.log(
    "Feasibility note (no verdict): a parallelogram channel *can* follow any",
  );
  console.log(
    "straight(ish) slant; elastic still threads if width ⊥ edge is constant.",
  );
  console.log(
    "Fold-flat of a *level* strip does NOT apply on the back — back is a",
  );
  console.log(
    "constant-width ribbon along the slant, not a horizontal reflection.",
  );
  console.log(
    "Levelling the back would remove Δy ≈ CB rise and undo the raised-back look.",
  );
}

// =============================================================================
console.log("\n=== 4. Pocket coexistence (stay vs future casing extension) ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveElastic(CARGO_TROUSER_STYLE, body);
  const mouth = resolveFrontSlantPocketMouth(body, style);
  const bodyY = resolveBodyWaistY(body, style);
  const pat = draftTrousers(body, style);
  const names = pat.pieces.map((p) => p.name);
  const front = pat.pieces.find((p) => p.name === "Trouser front")!;
  const bag = pat.pieces.find((p) => p.name === "Slant pocket back");

  console.log("What the pocket brief committed (working tree):");
  console.log(`  pocketFront = ${resolvePocketFront(style)}`);
  console.log(`  pieces: ${names.join(", ")}`);
  console.log(
    `  opening-top  (${f2(mouth.openingTop.x)}, ${f2(mouth.openingTop.y)})  — on bodyWaistY (${f3(bodyY)})`,
  );
  console.log(
    `  opening-bottom (${f2(mouth.openingBottom.x)}, ${f2(mouth.openingBottom.y)})  — ${mouth.params.openingSideDown} mm arc down side`,
  );
  console.log(
    `  side corner (pocket back restores) (${f2(mouth.sideCorner.x)}, ${f2(mouth.sideCorner.y)})`,
  );
  console.log(
    `  pocket-back waist restored length = ${f2(polylineLength(mouth.waistRestored))} mm`,
  );
  console.log(
    `  waist catch length = ${f2(polylineLength(mouth.waistCatch))} mm`,
  );
  console.log(
    `  pocket-back side restored length  = ${f2(polylineLength(mouth.sideRestored))} mm`,
  );
  console.log(
    `  pocket back present: ${bag ? "yes" : "NO"}`,
  );
  console.log("");
  console.log("Overlap analysis (today, extension = 0):");
  console.log(
    "  Front is trimmed: no waist∩side corner. Stay carries that corner at",
  );
  console.log(
    "  bodyWaistY. Piece top = bodyWaistY. Stay's outer waist edge IS the",
  );
  console.log(
    "  missing top-edge stub — same plane as the front's remaining waist.",
  );
  console.log("");
  console.log("When casing adds an UPWARD extension above bodyWaistY:");
  console.log(
    "  • Front top edge moves UP (new piece top = fold). Net waist at",
  );
  console.log(
    "    bodyWaistY becomes the turndown seam (reference line) — mouth-top",
  );
  console.log(
    "    later re-anchors there (separate brief). Do NOT rewire here.",
  );
  console.log(
    "  • Stay today only restores the corner AT bodyWaistY. The casing",
  );
  console.log(
    "    strip above bodyWaistY near the side has no stay coverage yet.",
  );
  console.log(
    "  • Question for Phase 1: does the stay need a matching upward stub",
  );
  console.log(
    "    (casing extension on the stay), or does the front's casing wrap",
  );
  console.log(
    "    the side and the stay stops at bodyWaistY / turndown?",
  );
  console.log("");
  console.log("PROPOSE coexistence (not build):");
  console.log(
    "  Casing post-pass runs on Trouser front + Trouser back only (like hem).",
  );
  console.log(
    "  Stay / facing / bag are independent pieces — not in the waist turn-up",
  );
  console.log(
    "  until a later brief decides stay-top = fold vs turndown.",
  );
  console.log(
    "  Near the side: front casing extension ends at the trimmed mouth-top",
  );
  console.log(
    "  on the turndown plane; stay still holds the side corner below/at that",
  );
  console.log(
    "  plane. No geometric overlap today; future overlap is only if stay is",
  );
  console.log(
    "  also extended upward — that choice is Phase 1 / pocket-follow-up.",
  );

  // Role inventory near top
  const roles = new Map<string, number>();
  for (const o of front.outline) {
    roles.set(o.role ?? "?", (roles.get(o.role ?? "?") ?? 0) + 1);
  }
  console.log("");
  console.log(
    `  Front role counts: ${[...roles.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`,
  );
}

// =============================================================================
console.log("\n=== 5. Post-pass reuse (hem turn-back pattern) ===\n");

console.log("lib/geometry/trouserHemTurnback.ts — reusable pattern:");
console.log("  • Runs AFTER withSeamAllowance (needs cuttingOutline).");
console.log("  • Collapses net (same DUP_TOL as SA), requires cut.length === collapsed.");
console.log("  • Rebuilds ONLY the hem region: inserts extra cut verts (Fp, Rc, Rc′, Fp′).");
console.log("  • Emits netToCutIndex: raw-net → cut (map survives length growth at hem).");
console.log("  • Trouser-local — TROUSER_LEG_NAMES only; not in seamAllowance.ts.");
console.log("");
console.log("Casing turn-up can follow the same contract:");
console.log("  • Trouser-local post-pass (e.g. applyTrouserWaistCasingTurnup).");
console.log("  • Reflect / parallelogram-offset the top edge across the fold line.");
console.log("  • Extend netToCutIndex further (hem map already present; waist adds verts).");
console.log("  • Must NOT go in the shared allowance engine (brief Do NOT).");
console.log("  • Front: level-edge fold-flat reflection (like straight hem).");
console.log("  • Back: constant-width along slant (parallelogram), not level reflection.");
console.log("");
console.log("CONFIRMED: topology is the same class as hem turn-back — reusable.");

// =============================================================================
console.log("\n=== 6. Fold-flat conditions (front under elastic) ===\n");

for (const label of ["Cargo", "Mila"] as const) {
  const settings = label === "Cargo" ? CARGO_TROUSER_STYLE : MILA_TROUSER_STYLE;
  const body = applyEase(helenBody(), settings.ease);
  const style = resolveElastic(settings, body);
  const front = draftTrouserFront(body, style);
  const fw = waistPts(front);
  const fY = yRange(fw);
  const cf = front.outline.filter((o) => o.role === "centre-front");
  const cfX = cf.map((o) => o.at.x);
  const cfSpan = cfX.length ? Math.max(...cfX) - Math.min(...cfX) : NaN;
  // Scoop / taper / inset as drafted
  console.log(`--- ${label} Helen-print ---`);
  console.log(
    `  waistlineCurveFront style = ${settings.waistlineCurveFront} (Cargo/Mila preset 0)`,
  );
  console.log(`  frontWaistInset forced = 0 (elastic boundary)`);
  console.log(`  waistTaper forced = 0 (elastic boundary)`);
  console.log(`  front waist y-span = ${f6(fY.span)} mm  (0 ⇒ level)`);
  console.log(`  CF x-span (centre-front role) = ${f6(cfSpan)} mm  (0 ⇒ vertical)`);
  if (fY.span > 0.05) {
    console.log(`  FLAG: front waist not level (span ${f3(fY.span)})`);
  } else {
    console.log(`  ok: front waist level — fold-flat feasible`);
  }
  if (cfSpan > 0.05) {
    console.log(`  FLAG: CF not vertical (span ${f3(cfSpan)})`);
  } else {
    console.log(`  ok: CF vertical above hip — fold-flat feasible`);
  }
}

// Multi-size front level check
console.log("\nFront waist y-span across sizes (Cargo elastic):");
for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveElastic(CARGO_TROUSER_STYLE, body);
  const span = yRange(waistPts(draftTrouserFront(body, style))).span;
  console.log(`  ${bod.name}: y-span = ${f6(span)} mm`);
}

console.log("\n=== PHASE 0 COMPLETE — stop. No Phase 1 until Helen says go. ===\n");
console.log("Commit gate: pocket brief still uncommitted — commit before Phase 1.");
