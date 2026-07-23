/**
 * DIAGNOSTIC ONLY — what makes Mila's front crotch project at the top.
 * Run: npx tsx scripts/diag-front-crotch-projection.ts
 *
 * Print only. Changes no product code.
 *
 * Projection = max outward x-excursion of the CF edge vs the straight chord
 * waistCf → P3. Outward = more negative x than the chord at the same y
 * (front crotch extension direction). Reported with the Y of that maximum.
 */
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { polylineLength } from "../lib/geometry/curves";
import {
  BLOCK_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserFront,
  frontCrotchCurve,
  frontCrotchExtension,
  frontCrotchTouch,
  resolveCrotchArrivalAngle,
  resolveCrotchStraightRun,
  resolveFrontCrotchExtensionScale,
  resolveFrontCrotchFullness,
  resolveFrontWaistInset,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const f3 = (n: number) => n.toFixed(3);
const pt = (p: Point) => `(${f2(p.x)}, ${f2(p.y)})`;

const chart = bodyForSizeCode(DEFAULT_SIZE_CODE)!;

function bodyFor(s: TrouserStyleSettings) {
  return applyEase({ ...chart, hip: 1100 }, s.ease);
}

function toDraft(
  s: TrouserStyleSettings,
  body: ReturnType<typeof applyEase>,
  overrides: Partial<TrouserFrontStyle> = {},
): TrouserFrontStyle {
  const merged: TrouserStyleSettings = { ...s, ...{} };
  // Apply TrouserFrontStyle field overrides on top of settings-derived base.
  const base: TrouserFrontStyle = {
    bottomWidth: merged.legBottomWidth,
    block: blockFromWaistDrop(merged.waistDrop),
    waistDrop: merged.waistDrop,
    backHemShape: merged.backHemShape,
    ...(merged.frontCrotchFullness != null
      ? { frontCrotchFullness: merged.frontCrotchFullness }
      : {}),
    ...(merged.frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale: merged.frontCrotchExtensionScale }
      : {}),
    ...(merged.backCrotchExtensionScale != null
      ? { backCrotchExtensionScale: merged.backCrotchExtensionScale }
      : {}),
    ...(merged.crotchDeparture != null
      ? { crotchDeparture: merged.crotchDeparture }
      : {}),
    ...(merged.crotchArrivalAngle != null
      ? { crotchArrivalAngle: merged.crotchArrivalAngle }
      : {}),
    ...(merged.waistlineCurveFront != null
      ? { waistlineCurveFront: merged.waistlineCurveFront }
      : {}),
    ...(merged.frontWaistInset != null
      ? { frontWaistInset: merged.frontWaistInset }
      : {}),
    ...(merged.backCrotchDrop != null
      ? { backCrotchDrop: merged.backCrotchDrop }
      : {}),
    ...(merged.backCrotchFullness != null
      ? { backCrotchFullness: merged.backCrotchFullness }
      : {}),
    ...(merged.frontInseamKneeInset != null
      ? { frontInseamKneeInset: merged.frontInseamKneeInset }
      : {}),
    ...(merged.backInseamKneeInset != null
      ? { backInseamKneeInset: merged.backInseamKneeInset }
      : {}),
    ...overrides,
  };

  const depth =
    merged.waistbandMode === "darted"
      ? merged.dartedWaistFinish === "facing"
        ? 0
        : merged.dartedBandDepth
      : merged.waistbandDepth;
  if (merged.waistbandMode === "darted") {
    return withWaistband(base, depth, "darted", body);
  }
  return depth > 0 ? withWaistband(base, depth, "shaped", body) : base;
}

function rolePts(
  piece: { outline: { role?: string; at: Point }[] },
  role: string,
): Point[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at);
}

/** Tip → waist CF path on the drafted front. */
function frontCfEdge(piece: {
  outline: { role?: string; at: Point }[];
}): Point[] {
  const crotch = rolePts(piece, "crotch");
  const cf = rolePts(piece, "centre-front");
  if (crotch.length === 0) return cf;
  if (cf.length === 0) return crotch;
  const last = crotch[crotch.length - 1]!;
  const first = cf[0]!;
  if (Math.hypot(last.x - first.x, last.y - first.y) < 1e-6) {
    return [...crotch, ...cf.slice(1)];
  }
  return [...crotch, ...cf];
}

function xOnChord(a: Point, b: Point, y: number): number {
  if (Math.abs(b.y - a.y) < 1e-12) return (a.x + b.x) / 2;
  const t = (y - a.y) / (b.y - a.y);
  return a.x + t * (b.x - a.x);
}

/**
 * Max outward x-excursion of CF edge vs straight waistCf → P3.
 * Outward = sample more negative-x than the chord at the same y.
 * Returns { projection, yAtMax }.
 */
function cfProjectionVsChord(
  cfEdge: Point[],
  waistCf: Point,
  P3: Point,
): { projection: number; yAtMax: number } {
  let projection = 0;
  let yAtMax = waistCf.y;
  const yLo = Math.min(waistCf.y, P3.y);
  const yHi = Math.max(waistCf.y, P3.y);
  for (const p of cfEdge) {
    if (p.y < yLo - 1e-6 || p.y > yHi + 1e-6) continue;
    const chordX = xOnChord(waistCf, P3, p.y);
    const outward = chordX - p.x; // >0 ⇒ sample left of chord
    if (outward > projection) {
      projection = outward;
      yAtMax = p.y;
    }
  }
  return { projection, yAtMax };
}

/**
 * Secondary: max left-of-vertical at x = waistCf.x (pattern “forward” of CF).
 * Captures upper-CF bow when the waistCf→P3 chord already covers the tip slant.
 */
function cfProjectionVsVertical(
  cfEdge: Point[],
  waistCf: Point,
  tipY: number,
): { projection: number; yAtMax: number } {
  let projection = 0;
  let yAtMax = waistCf.y;
  for (const p of cfEdge) {
    if (p.y < waistCf.y - 1e-6 || p.y > tipY + 1e-6) continue;
    const outward = waistCf.x - p.x;
    if (outward > projection) {
      projection = outward;
      yAtMax = p.y;
    }
  }
  return { projection, yAtMax };
}

/** Max right-of-vertical (into the piece) — P2 belly direction. */
function cfInwardVsVertical(
  cfEdge: Point[],
  waistCf: Point,
  tipY: number,
): { inward: number; yAtMax: number } {
  let inward = 0;
  let yAtMax = waistCf.y;
  for (const p of cfEdge) {
    if (p.y < waistCf.y - 1e-6 || p.y > tipY + 1e-6) continue;
    const inn = p.x - waistCf.x;
    if (inn > inward) {
      inward = inn;
      yAtMax = p.y;
    }
  }
  return { inward, yAtMax };
}

type Row = {
  id: string;
  note: string;
  waistCfY: number;
  straightRun: number;
  P0: Point;
  P1: Point;
  P2: Point;
  P3: Point;
  drop: number;
  d1: number;
  chord: number;
  k1: number;
  arrivalAngleDeg: number;
  frontWaistInset: number;
  frontCrotchLen: number;
  /** Mandated: vs waistCf→P3 chord. */
  projection: number;
  yAtMax: number;
  /** Secondary: left of vertical CF (x=waistCf.x). */
  projVert: number;
  yVert: number;
  /** Secondary: right of vertical CF (into piece). */
  inwardVert: number;
  yInward: number;
  waistCf: Point;
};

function measure(
  id: string,
  note: string,
  settings: TrouserStyleSettings,
  overrides: Partial<TrouserFrontStyle> = {},
): Row {
  const body = bodyFor(settings);
  const style = toDraft(settings, body, overrides);
  const f = trouserFrontPoints(body, style);
  const piece = draftTrouserFront(body, style);
  const waistCf = rolePts(piece, "waist")[0]!;
  const waistCfY = waistCf.y;

  const H = body.hip;
  const R = f.p9.y;
  const D = f.p6.y;
  const fork = Math.abs(f.p5.x);
  const scale = resolveFrontCrotchExtensionScale(style);
  const straightRun = resolveCrotchStraightRun(style, R, D, waistCfY);
  const arrivalAngleDeg = resolveCrotchArrivalAngle(style);
  const k1 = resolveFrontCrotchFullness(style);
  const frontWaistInset = resolveFrontWaistInset(style);

  const bez = frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    fork,
    R,
    waistCfY,
    straightRun,
    extension: frontCrotchExtension(H, scale),
    arrivalAngleDeg,
    touch: frontCrotchTouch(H) * scale,
    k1,
  });

  const drop = bez.P3.y - bez.P0.y;
  const d1 = bez.P1.y - bez.P0.y;
  const chord = Math.hypot(bez.P3.x - bez.P0.x, bez.P3.y - bez.P0.y);
  const cfEdge = frontCfEdge(piece);
  const { projection, yAtMax } = cfProjectionVsChord(cfEdge, waistCf, bez.P3);
  const vert = cfProjectionVsVertical(cfEdge, waistCf, bez.P3.y);
  const inn = cfInwardVsVertical(cfEdge, waistCf, bez.P3.y);

  return {
    id,
    note,
    waistCfY,
    straightRun,
    P0: bez.P0,
    P1: bez.P1,
    P2: bez.P2,
    P3: bez.P3,
    drop,
    d1,
    chord,
    k1,
    arrivalAngleDeg,
    frontWaistInset,
    frontCrotchLen: polylineLength(bez.points),
    projection,
    yAtMax,
    projVert: vert.projection,
    yVert: vert.yAtMax,
    inwardVert: inn.inward,
    yInward: inn.yAtMax,
    waistCf,
  };
}

function printRow(r: Row) {
  console.log(
    `${r.id.padEnd(4)} | ${f1(r.projection).padStart(6)} | ${f1(r.projVert).padStart(6)} | ${f1(r.inwardVert).padStart(6)} | ${f1(r.yVert).padStart(6)} | ${f1(r.straightRun).padStart(6)} | ${f1(r.P0.y).padStart(6)} | ${f1(r.drop).padStart(6)} | ${f1(r.d1).padStart(6)} | ${f2(r.k1).padStart(5)} | ${f1(r.arrivalAngleDeg).padStart(5)} | ${f1(r.frontWaistInset).padStart(5)} | ${f1(r.frontCrotchLen).padStart(7)} | ${r.note}`,
  );
}

function printDetail(r: Row) {
  console.log(`\n--- ${r.id}: ${r.note} ---`);
  console.log(
    `  waistCfY=${f3(r.waistCfY)}  straightRun=${f3(r.straightRun)}  inset=${f3(r.frontWaistInset)}  k1=${f3(r.k1)}  angle=${f3(r.arrivalAngleDeg)}`,
  );
  console.log(`  waistCf ${pt(r.waistCf)}`);
  console.log(`  P0 ${pt(r.P0)}`);
  console.log(`  P1 ${pt(r.P1)}`);
  console.log(`  P2 ${pt(r.P2)}`);
  console.log(`  P3 ${pt(r.P3)}`);
  console.log(
    `  drop=${f3(r.drop)}  d1=${f3(r.d1)}  chord=${f3(r.chord)}  tip→P0 len=${f3(r.frontCrotchLen)}`,
  );
  console.log(
    `  PROJECT chord ${f3(r.projection)} @ y=${f3(r.yAtMax)}  |  vert-left ${f3(r.projVert)} @ y=${f3(r.yVert)}  |  vert-right(in) ${f3(r.inwardVert)} @ y=${f3(r.yInward)}`,
  );
}

console.log("=== DIAG: front crotch projection — Aldrich → Mila fields ===\n");
console.log(
  "Projection(chord) = max (chordX − sampleX) vs waistCf→P3 (brief definition).",
);
console.log(
  "Projection(vert)  = max (waistCf.x − sampleX) — left of vertical CF.",
);
console.log(
  "Inward(vert)      = max (sampleX − waistCf.x) — right of vertical CF into the piece.\n",
);
console.log(
  `Body: size ${DEFAULT_SIZE_CODE}, hip 1100; ease from the style under test.\n`,
);

const mila = MILA_TROUSER_STYLE;
const aldrich = BLOCK_TROUSER_STYLE;

const baselines = [
  measure("A0", "Aldrich block baseline", aldrich),
  measure("Mila", "Mila full baseline", mila),
];

console.log("## Baselines\n");
console.log(
  "id   | chord | vLeft | vIn   | yvL   |  run  |  P0.y |  drop |   d1  |   k1 | ang  | inset | F len  | note",
);
console.log(
  "-----|-------|-------|-------|-------|-------|-------|-------|-------|------|------|-------|--------|-----",
);
for (const r of baselines) printRow(r);
for (const r of baselines) printDetail(r);

const A0 = baselines[0]!;
const milaBase = baselines[1]!;
const fullDeltaChord = milaBase.projection - A0.projection;
const fullDeltaVert = milaBase.projVert - A0.projVert;
const fullDeltaIn = milaBase.inwardVert - A0.inwardVert;

console.log("\n## Sweep — one field from Aldrich → Mila value\n");
console.log(
  "id   | chord | vLeft | vIn   | yvL   |  run  |  P0.y |  drop |   d1  |   k1 | ang  | inset | F len  | note",
);
console.log(
  "-----|-------|-------|-------|-------|-------|-------|-------|-------|------|------|-------|--------|-----",
);

printRow(A0);

const sweep: Row[] = [
  measure("A1", "crotchDeparture → 0", aldrich, {
    crotchDeparture: 0,
  }),
  measure("A2", "frontWaistInset → 0", aldrich, {
    frontWaistInset: 0,
  }),
  measure("A3", "frontCrotchFullness → 0.50", aldrich, {
    frontCrotchFullness: 0.5,
  }),
  measure("A4", "crotchArrivalAngle → 32", aldrich, {
    crotchArrivalAngle: 32,
  }),
  measure("A5", "frontCrotchExtensionScale → 0.55", aldrich, {
    frontCrotchExtensionScale: 0.55,
  }),
];

for (const r of sweep) printRow(r);

const cum = measure("A1+2", "crotchDeparture→0 + frontWaistInset→0", aldrich, {
  crotchDeparture: 0,
  frontWaistInset: 0,
});
printRow(cum);

const M0 = measure("M0", "full Mila (sanity = Mila baseline)", mila);
printRow(M0);

console.log("\n### Sweep detail\n");
for (const r of [...sweep, cum, M0]) printDetail(r);

// Rank by vertical-left and inward (visual), and by chord (brief metric)
console.log("\n## Ranking — vs A0\n");
console.log(
  `A0: chord=${f3(A0.projection)}  vLeft=${f3(A0.projVert)}  vIn=${f3(A0.inwardVert)}`,
);
console.log(
  `Mila: chord=${f3(milaBase.projection)}  vLeft=${f3(milaBase.projVert)}  vIn=${f3(milaBase.inwardVert)}`,
);
console.log(
  `Full Δ: chord=${f3(fullDeltaChord)}  vLeft=${f3(fullDeltaVert)}  vIn=${f3(fullDeltaIn)}\n`,
);

type C = {
  id: string;
  note: string;
  dChord: number;
  dVert: number;
  dIn: number;
  dDrop: number;
  dD1: number;
  dP0y: number;
};
const contribs: C[] = sweep.map((r) => ({
  id: r.id,
  note: r.note,
  dChord: r.projection - A0.projection,
  dVert: r.projVert - A0.projVert,
  dIn: r.inwardVert - A0.inwardVert,
  dDrop: r.drop - A0.drop,
  dD1: r.d1 - A0.d1,
  dP0y: r.P0.y - A0.P0.y,
}));

console.log("By |Δ vIn| (into-piece belly — likely visual “projection”):");
console.log("rank | id  | ΔvIn    | ΔvLeft  | Δchord  | ΔP0.y  | Δdrop  | Δd1    | field");
console.log("-----|-----|---------|---------|---------|--------|--------|--------|------");
[...contribs]
  .sort((a, b) => Math.abs(b.dIn) - Math.abs(a.dIn))
  .forEach((c, i) => {
    console.log(
      `${String(i + 1).padStart(4)} | ${c.id} | ${f2(c.dIn).padStart(7)} | ${f2(c.dVert).padStart(7)} | ${f2(c.dChord).padStart(7)} | ${f1(c.dP0y).padStart(6)} | ${f1(c.dDrop).padStart(6)} | ${f1(c.dD1).padStart(6)} | ${c.note}`,
    );
  });

console.log("\nBy |Δ chord| (brief-mandated metric):");
console.log("rank | id  | Δchord  | field");
console.log("-----|-----|---------|------");
[...contribs]
  .sort((a, b) => Math.abs(b.dChord) - Math.abs(a.dChord))
  .forEach((c, i) => {
    console.log(
      `${String(i + 1).padStart(4)} | ${c.id} | ${f2(c.dChord).padStart(7)} | ${c.note}`,
    );
  });

const sumIn = contribs.reduce((s, c) => s + c.dIn, 0);
const sumVert = contribs.reduce((s, c) => s + c.dVert, 0);
const sumChord = contribs.reduce((s, c) => s + c.dChord, 0);
console.log(`\nSum A1..A5 ΔvIn=${f3(sumIn)} (full ${f3(fullDeltaIn)}, residual ${f3(fullDeltaIn - sumIn)})`);
console.log(`Sum A1..A5 ΔvLeft=${f3(sumVert)} (full ${f3(fullDeltaVert)}, residual ${f3(fullDeltaVert - sumVert)})`);
console.log(`Sum A1..A5 Δchord=${f3(sumChord)} (full ${f3(fullDeltaChord)}, residual ${f3(fullDeltaChord - sumChord)})`);

console.log("\n### Cumulative A1+A2\n");
console.log(
  `A1: ΔvIn=${f3(sweep[0]!.inwardVert - A0.inwardVert)}  Δchord=${f3(sweep[0]!.projection - A0.projection)}  P0.y=${f1(sweep[0]!.P0.y)} d1=${f1(sweep[0]!.d1)}`,
);
console.log(
  `A2: ΔvIn=${f3(sweep[1]!.inwardVert - A0.inwardVert)}  Δchord=${f3(sweep[1]!.projection - A0.projection)}`,
);
console.log(
  `A1+A2: ΔvIn=${f3(cum.inwardVert - A0.inwardVert)}  Δchord=${f3(cum.projection - A0.projection)}  P0.y=${f1(cum.P0.y)} d1=${f1(cum.d1)}`,
);

console.log("\n### Sanity — M0 vs Mila baseline\n");
const ok =
  Math.abs(M0.projection - milaBase.projection) < 1e-6 &&
  Math.abs(M0.projVert - milaBase.projVert) < 1e-6 &&
  Math.abs(M0.inwardVert - milaBase.inwardVert) < 1e-6 &&
  Math.hypot(M0.P0.x - milaBase.P0.x, M0.P0.y - milaBase.P0.y) < 1e-6;
console.log(
  `M0 chord/vLeft/vIn = ${f3(M0.projection)}/${f3(M0.projVert)}/${f3(M0.inwardVert)}`,
);
console.log(
  `Mila chord/vLeft/vIn = ${f3(milaBase.projection)}/${f3(milaBase.projVert)}/${f3(milaBase.inwardVert)}`,
);
console.log(ok ? "  ok: M0 reproduces Mila baseline" : "  FAIL: M0 ≠ Mila baseline");

console.log("\n=== end diagnostic (no code changed) ===");
