/**
 * DIAGNOSTIC — cut-topology blast radius for a slant front pocket (print only).
 * Run: npx tsx scripts/probe-slant-pocket-topology.ts
 *
 * Fabricates a synthetic trimmed front-leg outline to observe withSeamAllowance /
 * highlight — no product code changes.
 */
import {
  applyEase,
  type OutlinePoint,
  type PatternPiece,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { polylineLength } from "../lib/geometry/curves";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import { applyTrouserHemTurnback } from "../lib/geometry/trouserHemTurnback";
import {
  edgeRunsForRoles,
  runToCuttingPolyline,
  runToNetPolyline,
  runToPolyline,
} from "../lib/patternHighlight";
import { MILA_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserFront,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const f3 = (n: number) => n.toFixed(3);
const TURNDOWN = 50;
const MOUTH_IN_FROM_SIDE = 75;
const MOUTH_DOWN_SIDE = 160;
const MITER_LIMIT = 2.5;
const SEAM_A = DEFAULT_SEAM_ALLOWANCE.seam;

const HELEN = {
  waistToFloor: 1020,
  hipDepth: 215,
  bodyRise: 301,
} as const;

function helenBody() {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

/** Mila elastic draft boundary. */
function milaStyle(
  body: ReturnType<typeof applyEase>,
  overrides: Partial<TrouserFrontStyle> = {},
): TrouserFrontStyle {
  const s = MILA_TROUSER_STYLE;
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
    ...overrides,
  };
  return withWaistband(base, 0, "shaped", body);
}

function pt(p: Point) {
  return `(${f1(p.x)},${f1(p.y)})`;
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function unit(dx: number, dy: number): Point {
  const L = Math.hypot(dx, dy) || 1;
  return { x: dx / L, y: dy / L };
}

/** Interior turning angle (degrees) at B for path A→B→C (SVG y-down). */
function interiorAngleDeg(a: Point, b: Point, c: Point): number {
  const u = unit(a.x - b.x, a.y - b.y);
  const v = unit(c.x - b.x, c.y - b.y);
  const dot = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
  return (Math.acos(dot) * 180) / Math.PI;
}

/** Point at arc-length `s` along polyline from start. */
function pointAtArc(poly: Point[], s: number): { at: Point; i: number; t: number } {
  let rem = s;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]!;
    const b = poly[i + 1]!;
    const L = dist(a, b);
    if (L >= rem) {
      const t = rem / L;
      return {
        at: { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) },
        i,
        t,
      };
    }
    rem -= L;
  }
  const last = poly[poly.length - 1]!;
  return { at: { ...last }, i: poly.length - 2, t: 1 };
}

function roleRuns(outline: OutlinePoint[]) {
  const runs: { role: string; start: number; end: number; n: number }[] = [];
  let i = 0;
  while (i < outline.length) {
    const role = outline[i]!.role ?? "(none)";
    const start = i;
    while (i < outline.length && (outline[i]!.role ?? "(none)") === role) i++;
    runs.push({ role, start, end: i - 1, n: i - start });
  }
  return runs;
}

// ---------------------------------------------------------------------------
console.log("=== DIAG: slant-pocket cut-topology blast radius ===\n");
console.log("Print only — no product code changes.\n");

// ===========================================================================
console.log("=== A. Inventory: net↔cut index assumptions ===\n");

console.log(`1. lib/geometry/seamAllowance.ts — addSeamAllowance / relocateNotches
   - Builds cuttingOutline with EXACTLY one point per collapsed net vertex
     (never inserts bevel extras). So after SA alone: cut.length === net.length.
   - relocateNotchOntoCuttingLine: if notch sits on a net vertex, uses
     cuttingOutline[vertexIndex] — same index into cut. Mid-edge notches offset
     by edge normal (no index). If net vertex count changes, notch-at-vertex
     indices still work as long as the notch point is re-found on the new net;
     they do NOT survive a topology change that moves the notch's host vertex
     without re-placing the notch.

2. lib/patternHighlight.ts — edgeRunsForRoles → runToPolyline / runToCuttingPolyline
   - edgeRunsForRoles: indexes the NET outline by role runs (startIndex/endIndex).
   - runToPolyline(cutting, run): uses run indices directly into cutting[] with
     modulus cutting.length — REQUIRES cutting.length === net.length (or runs
     mis-index / wrap wrongly).
   - runToCuttingPolyline: if netToCutIndex present, maps net→cut and fills
     inserted cut verts between mapped endpoints; else falls back to runToPolyline.
   - runToNetPolyline: always indexes piece.outline (net) — safe when net changes
     as long as roles are re-tagged.

3. lib/geometry/trouserHemTurnback.ts — applyTrouserHemTurnback
   - Preconditions: cutting.length === collapsed net.length (else skip + warn).
   - THEN rebuilds hem as Fp→Rc→Rc′→Fp′ — cut.length > net.length.
   - Emits netToCutIndex: net-vertex-index → cuttingOutline index (raw outline
     mapped through collapse). Front AND back legs with straight hems.
   - Reusable by any consumer that has net-derived edge runs (TrousersView
     already does via runToCuttingPolyline). Not front-leg-specific.

4. lib/elements/sideOpening.ts — sideSeamVertices
   - Uses edgeRunsForRoles on NET only; places zip notch by arc along side.
   - Unaffected by cut length; WOULD care if side-seam role starts at mouth-side
     instead of waist∩side (zip length measured from new top of side run).

5. app/garments/gathered-skirt/page.tsx
   - Uses runToPolyline(boundary, run) directly — no netToCutIndex path.
   - Trousers use runToCuttingPolyline (map-aware).

6. lib/pattern/mirrorPiece.ts — copies netToCutIndex through when mirroring.

What happens if front leg net vertex count changes (corner trim):
  - SA still emits 1:1 cut for the new net (engine-safe for length).
  - Hem turnback still requires 1:1 at entry, then inserts ONLY at the hem;
    waist/slant region stays 1:1 in the map.
  - Highlight runs re-derived from new net roles — OK if roles retagged.
  - Notch relocation by vertex index OK for notches re-found on new net.
  - sideOpening zip arc starts from new side-seam run start (= mouth-side).
`);

// ===========================================================================
console.log("=== B. Front leg net outline around waist∩side (Helen-print / Mila) ===\n");

const eased = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
const style = milaStyle(eased);
const front = draftTrouserFront(eased, style);
const fPts = trouserFrontPoints(eased, style);

const waistPts = front.outline.filter((o) => o.role === "waist").map((o) => o.at);
const sidePts = front.outline.filter((o) => o.role === "side-seam").map((o) => o.at);

console.log("Role runs on front net outline:");
for (const r of roleRuns(front.outline)) {
  const a = front.outline[r.start]!.at;
  const b = front.outline[r.end]!.at;
  console.log(
    `  [${r.start}..${r.end}] role=${r.role} n=${r.n}  ${pt(a)} → ${pt(b)}`,
  );
}

const cornerNet = front.outline.find(
  (o, i) =>
    o.role === "waist" &&
    front.outline[(i + 1) % front.outline.length]?.role === "side-seam",
);
// Last waist / first side
const lastWaistIdx = (() => {
  let last = -1;
  front.outline.forEach((o, i) => {
    if (o.role === "waist") last = i;
  });
  return last;
})();
const firstSideIdx = front.outline.findIndex((o) => o.role === "side-seam");

console.log(`\nWaist∩side corner (construction p11): ${pt(fPts.p11)}`);
console.log(
  `  last waist sample idx=${lastWaistIdx} ${pt(front.outline[lastWaistIdx]!.at)} role=${front.outline[lastWaistIdx]!.role}`,
);
console.log(
  `  first side sample idx=${firstSideIdx} ${pt(front.outline[firstSideIdx]!.at)} role=${front.outline[firstSideIdx]!.role}`,
);
console.log(
  `  corner coincidence |p11−lastWaist|=${f3(dist(fPts.p11, front.outline[lastWaistIdx]!.at))} |p11−firstSide|=${f3(dist(fPts.p11, front.outline[firstSideIdx]!.at))}`,
);

const waistLen = polylineLength(waistPts);
const sideLen = polylineLength(sidePts);
const mouthTop = pointAtArc([...waistPts].reverse(), MOUTH_IN_FROM_SIDE); // from side back along waist
// waist is CF→side; side corner is end. 75 mm in from side = waistLen - 75 from CF start.
const mouthTopFromCf = pointAtArc(waistPts, Math.max(0, waistLen - MOUTH_IN_FROM_SIDE));
const mouthSide = pointAtArc(sidePts, MOUTH_DOWN_SIDE);

console.log(`\nRepresentative slant (≈${MOUTH_IN_FROM_SIDE} mm in / ≈${MOUTH_DOWN_SIDE} mm down):`);
console.log(`  waist arc length=${f1(waistLen)} mm; side arc length=${f1(sideLen)} mm`);
console.log(`  mouth-top (from side ${MOUTH_IN_FROM_SIDE} mm along waist): ${pt(mouthTopFromCf.at)}`);
console.log(`  mouth-side (${MOUTH_DOWN_SIDE} mm down side): ${pt(mouthSide.at)}`);

// Angle sample: previous waist point → mouth-top → mouth-side → next side point
const mt = mouthTopFromCf.at;
const ms = mouthSide.at;
const waistPrev = pointAtArc(waistPts, Math.max(0, waistLen - MOUTH_IN_FROM_SIDE - 20)).at;
const sideNext = pointAtArc(sidePts, MOUTH_DOWN_SIDE + 20).at;
const angTop = interiorAngleDeg(waistPrev, mt, ms);
const angSide = interiorAngleDeg(mt, ms, sideNext);
const slantDx = ms.x - mt.x;
const slantDy = ms.y - mt.y;
const slantLen = dist(mt, ms);
const slantFromHoriz = (Math.atan2(slantDy, slantDx) * 180) / Math.PI;

console.log(`  slant length=${f1(slantLen)} mm; angle from +x (horiz)=${f1(slantFromHoriz)}°`);
console.log(`  interior angle at mouth-top (waist→slant): ${f1(angTop)}°`);
console.log(`  interior angle at mouth-side (slant→side): ${f1(angSide)}°`);
console.log(
  `  (Mitre: acute <90° is the risk class for long mitres; SA still emits 1 cut vert/net vert —`,
);
console.log(
  `   it averages when miter > ${MITER_LIMIT}×allowance, never inserts extras.)`,
);

// ===========================================================================
console.log("\n=== C. Probe: synthetic trimmed outline through real SA + highlight ===\n");

/**
 * Fabricate a simplified closed front-leg net with corner trimmed.
 * Shape inspired by Helen/Mila extents but NOT real pocket geometry.
 * Outline order matches trouser front: waist → (slant) → side → hem → inseam → crotch/cf.
 */
function fabricateTrimmedFront(): PatternPiece {
  // Rough extents from real front points
  const p10 = fPts.p10;
  const p11 = fPts.p11;
  const p8 = fPts.p8;
  const p12 = fPts.p12;
  const p14 = fPts.p14;
  const p9 = fPts.p9;

  const waistFull = [p10, p11];
  const wLen = dist(p10, p11);
  const mtAt = {
    x: p11.x - (MOUTH_IN_FROM_SIDE / wLen) * (p11.x - p10.x),
    y: p11.y - (MOUTH_IN_FROM_SIDE / wLen) * (p11.y - p10.y),
  };
  const sideFull = [p11, p8, p12];
  const msAt = pointAtArc(sideFull, MOUTH_DOWN_SIDE).at;

  const outline: OutlinePoint[] = [
    // waist CF → mouth-top (corner trimmed — no p11)
    { at: { ...p10 }, edge: "seam", role: "waist" },
    { at: { ...mtAt }, edge: "seam", role: "waist" },
    // slant mouth
    { at: { ...msAt }, edge: "seam", role: "pocket-mouth" },
    // side from mouth-side down
    { at: { ...p8 }, edge: "seam", role: "side-seam" },
    { at: { ...p12 }, edge: "seam", role: "side-seam" },
    // hem
    { at: { ...p14 }, edge: "hem", role: "hem" },
    // inseam up (simplified: hem → tip)
    { at: { ...p9 }, edge: "seam", role: "inseam" },
    // crotch/cf back to CF waist (simplified single segment)
    { at: { ...p10 }, edge: "seam", role: "crotch" },
  ];
  // drop closing duplicate of p10 — closed polygon: last≠first for our engine
  outline.pop();

  return {
    name: "Trouser front",
    cutCount: 1,
    onFold: false,
    outline,
    markings: [
      {
        kind: "notch",
        role: "balance",
        at: { ...mtAt },
        label: "mouth-top-probe",
        mates: { piece: "stay", seam: "waist" },
      },
    ],
  };
}

const synthetic = fabricateTrimmedFront();
console.log("Synthetic trimmed net outline:");
for (const r of roleRuns(synthetic.outline)) {
  const a = synthetic.outline[r.start]!.at;
  const b = synthetic.outline[r.end]!.at;
  console.log(
    `  [${r.start}..${r.end}] ${r.role} n=${r.n}  ${pt(a)} → ${pt(b)}`,
  );
}
console.log(`  net.length = ${synthetic.outline.length}`);

const withSA = withSeamAllowance({ pieces: [synthetic] }, DEFAULT_SEAM_ALLOWANCE);
const cutPiece = withSA.pieces[0]!;
const cut = cutPiece.cuttingOutline!;
console.log(`\nAfter withSeamAllowance:`);
console.log(`  cut.length = ${cut.length}`);
console.log(
  `  cut.length === net.length? ${cut.length === synthetic.outline.length ? "YES" : "NO"}`,
);

// Miter distance at mouth corners
function miterDistAt(net: OutlinePoint[], cutPts: Point[], idx: number) {
  return dist(net[idx]!.at, cutPts[idx]!);
}
const mouthTopIdx = 1; // second waist = mouth-top
const mouthSideIdx = 2; // pocket-mouth end = mouth-side
const mdTop = miterDistAt(synthetic.outline, cut, mouthTopIdx);
const mdSide = miterDistAt(synthetic.outline, cut, mouthSideIdx);
const maxMiter = SEAM_A * MITER_LIMIT;
console.log(`  mouth-top miter extension |cut−net|=${f2(mdTop)} mm (limit ${f1(maxMiter)})`);
console.log(`  mouth-side miter extension |cut−net|=${f2(mdSide)} mm (limit ${f1(maxMiter)})`);
console.log(
  `  Extra cut vertices inserted by SA? ${cut.length === synthetic.outline.length ? "NO — still 1:1" : "YES"}`,
);

// Angles on synthetic
const synAngTop = interiorAngleDeg(
  synthetic.outline[0]!.at,
  synthetic.outline[1]!.at,
  synthetic.outline[2]!.at,
);
const synAngSide = interiorAngleDeg(
  synthetic.outline[1]!.at,
  synthetic.outline[2]!.at,
  synthetic.outline[3]!.at,
);
console.log(`  synthetic interior ∠ mouth-top=${f1(synAngTop)}° mouth-side=${f1(synAngSide)}°`);

// Highlight
console.log("\nHighlight (edgeRunsForRoles → runToPolyline / runToCuttingPolyline):");
try {
  const roles = ["waist", "pocket-mouth", "side-seam", "hem"];
  const runs = edgeRunsForRoles(cutPiece.outline, roles);
  console.log(`  runs found: ${runs.map((r) => `${r.role}[${r.startIndex}..${r.endIndex}]`).join(", ")}`);
  let highlightOk = true;
  for (const run of runs) {
    const netPoly = runToNetPolyline(cutPiece, run, 0, 0);
    const cutPolyFallback = runToPolyline(cut, run, 0, 0);
    const cutPolyMapped = runToCuttingPolyline(cut, run, undefined, 0, 0);
    const netVerts = netPoly.split(" ").filter(Boolean).length;
    const cutVerts = cutPolyFallback.split(" ").filter(Boolean).length;
    const idxSafe =
      run.endIndex < cut.length || run.endIndex === cutPiece.outline.length;
    // runToPolyline uses i % cutting.length — if lengths equal, indices align
    const aligned = cut.length === cutPiece.outline.length;
    if (!aligned || netVerts === 0 || cutVerts === 0) highlightOk = false;
    console.log(
      `  ${run.role}: netVerts=${netVerts} cutVerts=${cutVerts} aligned=${aligned} mapped≡fallback=${cutPolyFallback === cutPolyMapped}`,
    );
  }
  console.log(
    highlightOk
      ? "  RESULT: highlight maps correctly (1:1 indices)."
      : "  RESULT: highlight MIS-INDEXES or empty.",
  );
} catch (err) {
  console.log(
    `  RESULT: highlight THREW — ${err instanceof Error ? err.message : String(err)}`,
  );
}

// Hem turnback on synthetic (straight hem) — does it still accept 1:1 then expand?
console.log("\nHem turnback post-pass on synthetic (straight hem):");
const afterTB = applyTrouserHemTurnback(cutPiece);
const cut2 = afterTB.cuttingOutline!;
console.log(`  after TB: cut.length=${cut2.length} net.length=${afterTB.outline.length}`);
console.log(
  `  netToCutIndex present? ${afterTB.netToCutIndex ? `yes (len=${afterTB.netToCutIndex.length})` : "no"}`,
);
if (afterTB.netToCutIndex) {
  const map = afterTB.netToCutIndex;
  console.log(
    `  map[mouth-top=${mouthTopIdx}]=${map[mouthTopIdx]} map[mouth-side=${mouthSideIdx}]=${map[mouthSideIdx]} (expect 1:1 in waist/slant region)`,
  );
  console.log(
    `  cut > net by ${cut2.length - afterTB.outline.length} (hem Fp/Rc inserts only)`,
  );
  // Highlight with map
  const runs = edgeRunsForRoles(afterTB.outline, ["waist", "pocket-mouth", "side-seam"]);
  for (const run of runs) {
    try {
      const poly = runToCuttingPolyline(cut2, run, afterTB.netToCutIndex, 0, 0);
      const n = poly.split(" ").filter(Boolean).length;
      console.log(`  mapped highlight ${run.role}: ${n} cut verts — OK`);
    } catch (err) {
      console.log(
        `  mapped highlight ${run.role}: THREW ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

// ===========================================================================
console.log("\n=== D. New pieces isolation ===\n");
console.log(`Facing / bag / stay would be separate PatternPiece entries (like waistband):
  - Own outline + own cuttingOutline from addSeamAllowance.
  - Do NOT share the front leg's outline array or netToCutIndex.
  - Highlight is per-piece (findPieceHighlight by piece name).
  - Risk of net↔cut indexing breakage is ISOLATED to the modified front leg.
  - Stay restores trimmed waist+side as its own edges — mates by notch/label,
    not by sharing indexed vertices with the front outline.
  - Flag: if a future design stitched the stay by splicing into the front's
    cuttingOutline (rather than a separate piece), that WOULD couple — but the
    brief's piece list is independent pieces, so no shared index.
`);

// ===========================================================================
console.log("=== E. Waist finish / mouth-top interaction ===\n");

function mouthMetrics(label: string, st: TrouserFrontStyle) {
  const fr = draftTrouserFront(eased, st);
  const waist = fr.outline.filter((o) => o.role === "waist").map((o) => o.at);
  const side = fr.outline.filter((o) => o.role === "side-seam").map((o) => o.at);
  const wL = polylineLength(waist);
  const mtP = pointAtArc(waist, Math.max(0, wL - MOUTH_IN_FROM_SIDE)).at;
  const msP = pointAtArc(side, MOUTH_DOWN_SIDE).at;
  const midNotch = fr.markings.find(
    (m) => m.kind === "notch" && m.label === "mid-waist",
  );
  const midAt =
    midNotch && midNotch.kind === "notch" ? midNotch.at : waist[Math.floor(waist.length / 2)]!;
  // Arc along waist from mid-waist notch to mouth-top
  // Walk waist CF→side; find arc positions
  const midArc = (() => {
    let best = 0;
    let bestD = Infinity;
    let acc = 0;
    for (let i = 0; i < waist.length - 1; i++) {
      const a = waist[i]!;
      const b = waist[i + 1]!;
      const L = dist(a, b);
      for (let s = 0; s <= 10; s++) {
        const t = s / 10;
        const p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        const d = dist(p, midAt);
        if (d < bestD) {
          bestD = d;
          best = acc + t * L;
        }
      }
      acc += L;
    }
    return best;
  })();
  const mtArc = wL - MOUTH_IN_FROM_SIDE;
  const arcMidToMouth = mtArc - midArc;
  const yCf = waist[0]!.y;
  const ySide = waist[waist.length - 1]!.y;
  const foldY = yCf + TURNDOWN; // level fold from CF (elastic casing model)
  const mouthAboveFold = mtP.y < foldY; // smaller y = higher on pattern (SVG y-down: waist ~0, down = +)
  // Actually waist y≈0, fold at +50. Mouth-top on waist y≈0. So mouth is ABOVE fold (toward CB/waist).
  const depthIntoGarment = mtP.y; // ~0
  const alongSlantToFold = (() => {
    // Distance along slant from mouth-top until y = foldY
    const dy = msP.y - mtP.y;
    const dx = msP.x - mtP.x;
    const L = Math.hypot(dx, dy);
    if (Math.abs(dy) < 1e-9) return NaN;
    const t = (foldY - mtP.y) / dy;
    return t * L;
  })();

  console.log(`${label}:`);
  console.log(
    `  waist y CF=${f1(yCf)} side=${f1(ySide)}; mouth-top ${pt(mtP)}; mouth-side ${pt(msP)}`,
  );
  console.log(
    `  level ${TURNDOWN} mm fold from CF → foldY=${f1(foldY)}; mouth-top y=${f1(mtP.y)} → ${mtP.y < foldY - 0.5 ? "ABOVE fold (in turndown zone)" : "at/below fold"}`,
  );
  console.log(
    `  slant length to fold line ≈ ${f1(alongSlantToFold)} mm (of ${f1(dist(mtP, msP))} mm mouth); remainder of opening below casing`,
  );
  console.log(
    `  mid-waist → mouth-top along waist arc = ${f1(arcMidToMouth)} mm (landmark-relative)`,
  );
  console.log(
    `  mouth-top depth into garment from waist edge = ${f1(depthIntoGarment)} mm (on the edge)`,
  );
  return { mtP, msP, arcMidToMouth, alongSlantToFold, yCf };
}

const baseE = mouthMetrics("Mila elastic default (scoop 0, rise 20)", style);
const drop10 = mouthMetrics(
  "waistDrop +10 (Helen front-rise tuning probe)",
  milaStyle(eased, { waistDrop: 10, block: blockFromWaistDrop(10) }),
);
const rise76 = mouthMetrics(
  "backCbWaistRise 76 (raised CB — front should be static)",
  milaStyle(eased, { backCbWaistRise: 76 }),
);

console.log("\nStability:");
console.log(
  `  Δ(arc mid→mouth) waistDrop+10 vs default: ${f2(drop10.arcMidToMouth - baseE.arcMidToMouth)} mm`,
);
console.log(
  `  Δ(arc mid→mouth) CB rise 76 vs default: ${f2(rise76.arcMidToMouth - baseE.arcMidToMouth)} mm`,
);
console.log(
  `  Δ(mouth-top y) waistDrop+10: ${f2(drop10.mtP.y - baseE.mtP.y)} mm; CB76: ${f2(rise76.mtP.y - baseE.mtP.y)} mm`,
);
console.log(
  `  Constraint (unsolved): elastic ${TURNDOWN} mm casing swallows the top ~${f1(baseE.alongSlantToFold)} mm of the slant opening;`,
);
console.log(
  `  mouth-top sits ON the unfinished waist edge — inside the turndown, not below it.`,
);
console.log(
  `  Analogous to side-pocket ↔ waistband-depth: pocket mouth and casing share the waist edge.`,
);

console.log("\n=== done (no product changes) ===");
