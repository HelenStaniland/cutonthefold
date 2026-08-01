/**
 * DIAGNOSTIC — back CB rise (print only, change nothing).
 * Run: npx tsx scripts/diag-back-cb-rise.ts
 *
 * BACK_CB_WAIST_RISE is a hardcoded const (20) — not style-driven.
 * Sweep mode: analytical (rebuild p21/p22 + draftBackCrotch with raised CB).
 * No product code edits.
 */
import {
  applyEase,
  type BodyMeasurements,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { polylineLength } from "../lib/geometry/curves";
import { MILA_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftBackCrotch,
  draftTrouserBack,
  draftTrouserFront,
  resolveWaistTaper,
  trouserBackPoints,
  trouserDraftMeasures,
  trouserFrontPoints,
  withWaistband,
  type BackPoints,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

/** Known source constant — not exported. */
const BACK_CB_WAIST_RISE_DEFAULT = 20;
/** Elastic casing turndown depth (Helen's comparison). */
const TURNDOWN = 50;

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN_VERTICALS = {
  waistToFloor: 1020,
  hipDepth: 215,
  bodyRise: 301,
} as const;

/** Extra CB rise above today's 20 mm constant → absolute p21.y = −(20+extra). */
const EXTRA_RISES = [0, 20, 40, 56] as const;

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const f3 = (n: number) => n.toFixed(3);

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN_VERTICALS };
}

/** Mila elastic draft boundary (matches TrousersView). */
function milaElasticStyle(
  body: BodyMeasurements,
  waistDrop = MILA_TROUSER_STYLE.waistDrop,
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

/**
 * Analytical back points with a hypothetical CB rise (mm above waistline → p21.y = −rise).
 * Mirrors trouserBackPoints CB/side waist construction only.
 */
function backPointsWithRise(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  rise: number,
): BackPoints {
  const b = trouserBackPoints(body, style);
  const m = trouserDraftMeasures(body, style);
  const W = m.W;
  const taper = resolveWaistTaper(style);
  const p21 = { x: b.p21.x, y: -rise };
  const aldrichBackL = W / 4 + 40;
  const under = aldrichBackL * aldrichBackL - p21.y * p21.y;
  const aldrichP22x =
    under > 0 ? p21.x + Math.sqrt(under) : p21.x + aldrichBackL;
  const p22x = (1 - taper) * b.p25.x + taper * aldrichP22x;
  const p22 = { x: p22x, y: 0 };
  return { ...b, p21, p22 };
}

function roleY(
  piece: ReturnType<typeof draftTrouserBack>,
  role: string,
  which: "first" | "last",
): number {
  const pts = piece.outline.filter((o) => o.role === role);
  if (pts.length === 0) return NaN;
  return which === "first" ? pts[0]!.at.y : pts[pts.length - 1]!.at.y;
}

function midWaistY(waistSeam: Point[]): number {
  if (waistSeam.length < 2) return NaN;
  const mid = waistSeam[Math.floor(waistSeam.length / 2)]!;
  return mid.y;
}

/** Sample crotch curve tip→p19 region for coupling check (y ≤ D + eps). */
function crotchBelowHipLen(points: Point[], D: number): number {
  const below: Point[] = [];
  for (const p of points) {
    if (p.y <= D + 0.5) below.push(p);
    else break;
  }
  // Include first point above hip if we stopped early — better: take until past D
  return polylineLength(below.length >= 2 ? below : points.slice(0, 2));
}

function maxPointDelta(a: Point[], b: Point[]): number {
  const n = Math.min(a.length, b.length);
  let m = 0;
  for (let i = 0; i < n; i++) {
    m = Math.max(m, Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y));
  }
  return m;
}

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

console.log("=== DIAG: back CB rise (analytical sweep) ===\n");
console.log(
  `Product constant BACK_CB_WAIST_RISE = ${BACK_CB_WAIST_RISE_DEFAULT} mm (hardcoded — not style-driven).`,
);
console.log(
  "Sweep mode: ANALYTICAL — rebuild p21/p22 + draftBackCrotch; no product edits.",
);
console.log(
  "Style: Mila + elastic (taper 0, inset 0, shaped@0). Target extras +20/+40/+56 mm.\n",
);

// ---------------------------------------------------------------------------
// A — how the back top edge is built (default)
// ---------------------------------------------------------------------------
console.log("=== A. Back top-edge construction (default rise = 20) ===\n");
console.log(
  "Construction: p20x = p18.x + backWaistStep; p21 = (p20x, −BACK_CB_WAIST_RISE);",
);
console.log(
  "  p22.y = 0 always; p22.x blends Aldrich L-chord vs p25.x by waistTaper.",
);
console.log(
  "  At r=0, wr.waistSeam is the straight chord p21→p22 (scoopDepth back = 0).",
);
console.log(
  "  Rise is a SINGLE vertical offset at CB only — not distributed along the edge.\n",
);

console.log(
  "body | p21 | p22 | slant(CB−side)y | topEdge | crotchLen | sideY_b | sideY_f | ΔsideY | meet?",
);

for (const bod of bodies) {
  const eased = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const style = milaElasticStyle(eased);
  const b = trouserBackPoints(eased, style);
  const f = trouserFrontPoints(eased, style);
  const back = draftTrouserBack(eased, style);
  const front = draftTrouserFront(eased, style);
  const crotchLen = back.seamLengths!.crotch;
  const topEdge = back.seamLengths!.topEdge;
  const slant = b.p21.y - b.p22.y; // CB − side (negative when CB is above)
  const sideYb = b.p22.y;
  const sideYf = f.p11.y;
  const dSide = sideYb - sideYf;
  // Drafted waist endpoints (resolved)
  const yCb = roleY(back, "waist", "first");
  const ySideB = roleY(back, "waist", "last");
  void yCb;
  void ySideB;
  console.log(
    `${bod.name} | (${f1(b.p21.x)},${f1(b.p21.y)}) | (${f1(b.p22.x)},${f1(b.p22.y)}) | ${f1(slant)} | ${f1(topEdge)} | ${f1(crotchLen)} | ${f1(sideYb)} | ${f1(sideYf)} | ${f3(dSide)} | ${Math.abs(dSide) < 0.05 ? "yes" : "NO"}`,
  );
}

console.log("\n=== A detail (Helen-print / size-12) — waist seam samples ===\n");
{
  const eased = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const style = milaElasticStyle(eased);
  const b = trouserBackPoints(eased, style);
  const back = draftTrouserBack(eased, style);
  const waist = back.outline.filter((o) => o.role === "waist").map((o) => o.at);
  console.log(
    `  p21 construction (${f2(b.p21.x)}, ${f2(b.p21.y)}); p22 (${f2(b.p22.x)}, ${f2(b.p22.y)})`,
  );
  console.log(
    `  drafted waist n=${waist.length}: yCB=${f2(waist[0]?.y ?? NaN)} yMid=${f2(midWaistY(waist))} ySide=${f2(waist[waist.length - 1]?.y ?? NaN)}`,
  );
  console.log(
    `  seamLengths: crotch=${f2(back.seamLengths!.crotch)} topEdge=${f2(back.seamLengths!.topEdge)}`,
  );
  console.log(
    `  backWaistStep (in p21.x): p18.x=${f2(b.p18.x)} → p21.x=${f2(b.p21.x)} (step=${f2(b.p21.x - b.p18.x)})`,
  );
}

// ---------------------------------------------------------------------------
// B — analytical sweep
// ---------------------------------------------------------------------------
console.log("\n=== B. Analytical CB rise sweep (Mila elastic) ===\n");
console.log(
  "Absolute rise = 20+extra. p21.y = −rise; p22.y stays 0; taper=0 → p22.x = p25.x unchanged.\n",
);

for (const bod of bodies) {
  const eased = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const style = milaElasticStyle(eased);
  const m = trouserDraftMeasures(eased, style);
  const D = m.D;
  const base = backPointsWithRise(eased, style, BACK_CB_WAIST_RISE_DEFAULT);
  const baseCrotch = draftBackCrotch(base, style);
  const baseRiseLen = polylineLength(baseCrotch.points);
  const baseBelow = crotchBelowHipLen(baseCrotch.points, D);

  console.log(`\n--- ${bod.name} (D=${f1(D)}, R=${f1(m.R)}) ---`);
  console.log(
    "extra | rise | p21.y | p22.y | p22.x | slant | crotchLen | Δcrotch | Δ/extra | belowHipLen | Δbelow | maxΔpts | sideY | p22Δx | notes",
  );

  for (const extra of EXTRA_RISES) {
    const rise = BACK_CB_WAIST_RISE_DEFAULT + extra;
    const br = backPointsWithRise(eased, style, rise);
    let notes = "";
    let crotch;
    try {
      crotch = draftBackCrotch(br, style);
    } catch (e) {
      notes = `THROW:${e instanceof Error ? e.message.slice(0, 60) : e}`;
      console.log(
        `${extra} | ${rise} | ${f1(br.p21.y)} | ${f1(br.p22.y)} | ${f1(br.p22.x)} | ${f1(br.p21.y - br.p22.y)} | — | — | — | — | — | — | ${f1(br.p22.y)} | ${f3(br.p22.x - base.p22.x)} | ${notes}`,
      );
      continue;
    }
    const len = polylineLength(crotch.points);
    const dLen = len - baseRiseLen;
    const perMm = extra === 0 ? 0 : dLen / extra;
    const below = crotchBelowHipLen(crotch.points, D);
    const dBelow = below - baseBelow;
    const maxΔ = maxPointDelta(crotch.points, baseCrotch.points);
    const p22dx = br.p22.x - base.p22.x;

    // Aldrich L feasibility: L must exceed |p21.y|
    const L = m.W / 4 + 40;
    if (L * L - rise * rise < 0) {
      notes += "AldrichL-imaginary ";
    }
    // Level fold 50mm down from CB
    const foldY = br.p21.y + TURNDOWN;
    if (foldY > br.p22.y + 1e-6) {
      notes += `levelFoldAboveSide(foldY=${f1(foldY)}) `;
    }
    // Corner: vector crotch→p21 vs waist p21→p22
    const before = crotch.points[crotch.points.length - 2] ?? br.p19;
    const v1x = before.x - br.p21.x;
    const v1y = before.y - br.p21.y;
    const v2x = br.p22.x - br.p21.x;
    const v2y = br.p22.y - br.p21.y;
    const m1 = Math.hypot(v1x, v1y);
    const m2 = Math.hypot(v2x, v2y);
    const ang =
      m1 > 1e-9 && m2 > 1e-9
        ? (Math.acos(
            Math.max(
              -1,
              Math.min(1, (v1x * v2x + v1y * v2y) / (m1 * m2)),
            ),
          ) *
            180) /
          Math.PI
        : NaN;
    notes += `corner∠=${f1(ang)}°`;

    console.log(
      `${extra} | ${rise} | ${f1(br.p21.y)} | ${f1(br.p22.y)} | ${f1(br.p22.x)} | ${f1(br.p21.y - br.p22.y)} | ${f1(len)} | ${f1(dLen)} | ${f3(perMm)} | ${f1(below)} | ${f1(dBelow)} | ${f2(maxΔ)} | ${f1(br.p22.y)} | ${f3(p22dx)} | ${notes}`,
    );
  }
}

console.log("\n=== B — front untouched? (analytical: front points ignore CB rise) ===\n");
{
  const eased = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const style = milaElasticStyle(eased);
  const f0 = trouserFrontPoints(eased, style);
  console.log(
    "  Front p10/p11/p9 are independent of BACK_CB_WAIST_RISE (no shared constant).",
  );
  console.log(
    `  Helen-print front: p10=(${f1(f0.p10.x)},${f1(f0.p10.y)}) p11=(${f1(f0.p11.x)},${f1(f0.p11.y)}) — side y=0.`,
  );
  console.log(
    "  Back side y stays 0 at every rise → front/back side corners still meet at y=0.",
  );
}

console.log("\n=== B — crotch coupling detail (Helen-print) ===\n");
{
  const eased = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const style = milaElasticStyle(eased);
  const m = trouserDraftMeasures(eased, style);
  const b0 = backPointsWithRise(eased, style, 20);
  const b56 = backPointsWithRise(eased, style, 20 + 56);
  const c0 = draftBackCrotch(b0, style);
  const c56 = draftBackCrotch(b56, style);
  // Leave direction at p19
  const u0 = {
    x: b0.p19.x - b0.p21.x,
    y: b0.p19.y - b0.p21.y,
  };
  const u56 = {
    x: b56.p19.x - b56.p21.x,
    y: b56.p19.y - b56.p21.y,
  };
  const n0 = Math.hypot(u0.x, u0.y);
  const n56 = Math.hypot(u56.x, u56.y);
  console.log(
    `  Leave dir p21→p19 (unit): rise20=(${f3(u0.x / n0)},${f3(u0.y / n0)}) rise76=(${f3(u56.x / n56)},${f3(u56.y / n56)})`,
  );
  console.log(
    `  draftBackCrotch uses that leave dir for P1 — so the Bézier tip→p19 MOVES when CB rises.`,
  );
  console.log(
    `  max |Δ| over samples tip→waist: ${f2(maxPointDelta(c0.points, c56.points))} mm`,
  );
  console.log(
    `  length: ${f1(polylineLength(c0.points))} → ${f1(polylineLength(c56.points))} (Δ ${f1(polylineLength(c56.points) - polylineLength(c0.points))})`,
  );
  console.log(
    `  below-hip arc proxy: ${f1(crotchBelowHipLen(c0.points, m.D))} → ${f1(crotchBelowHipLen(c56.points, m.D))}`,
  );
  console.log(
    `  Straight CB run |p19−p21|: ${f1(Math.hypot(b0.p19.x - b0.p21.x, b0.p19.y - b0.p21.y))} → ${f1(Math.hypot(b56.p19.x - b56.p21.x, b56.p19.y - b56.p21.y))}`,
  );
}

// ---------------------------------------------------------------------------
// C — elastic turndown vs slant
// ---------------------------------------------------------------------------
console.log("\n=== C. Elastic 50 mm turndown vs CB slant ===\n");
console.log(
  "Two fold models (print both — product does not yet implement casing fold):\n",
);
console.log(
  "  (1) LEVEL fold: fold line at y = p21.y + 50 (50 mm down the CB).",
);
console.log(
  "      Depth at side = foldY − p22.y. Non-flatness = |depth_CB − depth_side| = |slant|.",
);
console.log(
  "  (2) EDGE-PARALLEL fold: constant 50 mm perpendicular to the top-edge chord.",
);
console.log(
  "      Strip is geometrically flat (parallelogram); slant remains in the finished",
);
console.log(
  "      upper edge after fold — side and CB finish at different heights by |slant|.\n",
);

console.log(
  "body | extra | rise | slant(=rise) | depthCB | depthSide | uneven(level) | parallel residual height Δ",
);

for (const bod of [{ name: "Helen-print", body: helenBody() }, { name: "size-12", body: bodyForSizeCode("12")! }]) {
  const eased = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const style = milaElasticStyle(eased);
  for (const extra of EXTRA_RISES) {
    const rise = BACK_CB_WAIST_RISE_DEFAULT + extra;
    const br = backPointsWithRise(eased, style, rise);
    const slant = br.p22.y - br.p21.y; // positive: how much higher CB is than side
    const foldY = br.p21.y + TURNDOWN;
    const depthCB = TURNDOWN;
    const depthSide = foldY - br.p22.y; // can be negative
    const uneven = depthCB - depthSide; // = slant when side at 0
    // Parallel fold: after folding, the finished top is the fold line (parallel to
    // original edge). Height difference CB vs side along vertical = slant still.
    const parallelResidual = Math.abs(br.p21.y - br.p22.y);
    console.log(
      `${bod.name} | +${extra} | ${rise} | ${f1(slant)} | ${f1(depthCB)} | ${f1(depthSide)} | ${f1(uneven)} | ${f1(parallelResidual)}`,
    );
  }
}

console.log("\n=== C note at +56 (rise = 76) ===");
console.log(
  "  Level 50 mm turndown from CB: foldY = −76+50 = −26, but side top is at y=0.",
);
console.log(
  "  → fold line sits 26 mm ABOVE the side corner — cannot take 50 mm off the side.",
);
console.log(
  "  Unevenness of a level fold = full slant = 76 mm (CB gets 50 mm, side gets −26).",
);
console.log(
  "  Edge-parallel 50 mm fold folds flat as a strip, but finished heights still",
);
console.log(
  "  differ by 76 mm CB vs side — the casing upper edge stays slanted.\n",
);

console.log("=== done (no product changes) ===");
