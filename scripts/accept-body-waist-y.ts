/**
 * Acceptance: bodyWaistY (anchor A — absolute construction waist).
 * Run: npx tsx scripts/accept-body-waist-y.ts
 */
import { createHash } from "node:crypto";
import {
  applyEase,
  type BodyMeasurements,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  BLOCK_TROUSER_STYLE,
  CARGO_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrouserFront,
  resolveBackCbWaistRise,
  resolveBodyWaistY,
  resolveCrotchP0Y,
  trouserBackPoints,
  trouserDraftMeasures,
  trouserFrontPoints,
  waistToHipGap,
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

type FinishCase = {
  kind: string;
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

const GARMENTS: { name: string; s: TrouserStyleSettings }[] = [
  { name: "Aldrich", s: BLOCK_TROUSER_STYLE },
  { name: "Cleo", s: CLEO_TROUSER_STYLE },
  { name: "Mila", s: MILA_TROUSER_STYLE },
  { name: "Cargo", s: CARGO_TROUSER_STYLE },
];

let failures = 0;
function fail(msg: string) {
  failures++;
  console.log(`  FAIL: ${msg}`);
}
function ok(msg: string) {
  console.log(`  ok: ${msg}`);
}

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

function garmentStyle(
  s: TrouserStyleSettings,
  body: BodyMeasurements,
): TrouserFrontStyle {
  const elastic = s.dartedWaistFinish === "elastic";
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

function pairHash(body: BodyMeasurements, style: TrouserFrontStyle): string {
  return (
    outlineHash(draftTrouserFront(body, style)) +
    outlineHash(draftTrouserBack(body, style))
  );
}

console.log("=== ACCEPT: bodyWaistY (anchor A — absolute) ===\n");

// --- 1. Garment outline identity smoke (geometry must not move) ---
console.log("=== 1. Garment drafts (hash smoke) + construction identity ===\n");
for (const bod of bodies) {
  for (const g of GARMENTS) {
    const body = applyEase(bod.body, g.s.ease);
    const style = garmentStyle(g.s, body);
    const f = trouserFrontPoints(body, style);
    const bw = resolveBodyWaistY(body, style);
    const h = pairHash(body, style);
    if (Math.abs(bw - f.p10.y) > 1e-9) {
      fail(`${bod.name}×${g.name}: bodyWaistY ≠ p10.y`);
    } else if (Math.abs(bw - f.p11.y) > 1e-9) {
      fail(`${bod.name}×${g.name}: bodyWaistY ≠ p11.y (side)`);
    } else {
      ok(`${bod.name}×${g.name}: bodyWaistY=${f1(bw)} ≡ constr CF/side  hash=${h.slice(0, 12)}…`);
    }
  }
}

// --- 2. Finish invariance of absolute bodyWaistY ---
console.log("\n=== 2. bodyWaistY invariant across finishes (fixed drop) ===\n");
console.log("body | finish | bodyWaistY | D | D−bodyWaistY | CB(=bodyWaistY−rise)");
for (const bod of bodies) {
  const vals: number[] = [];
  for (const fin of FINISHES) {
    const eased = applyEase(bod.body, fin.settings.ease);
    const style = resolveDraftStyle(fin, eased);
    const m = trouserDraftMeasures(eased, style);
    const rise = resolveBackCbWaistRise(style);
    const cb = m.bodyWaistY - rise;
    const b = trouserBackPoints(eased, style);
    vals.push(m.bodyWaistY);
    console.log(
      `${bod.name} | ${fin.kind} | ${f1(m.bodyWaistY)} | ${f1(m.D)} | ${f1(m.D - m.bodyWaistY)} | ${f1(cb)} (p21=${f1(b.p21.y)})`,
    );
    if (Math.abs(cb - b.p21.y) > 0.01) {
      fail(`${bod.name}/${fin.kind}: CB offset ≠ p21`);
    }
  }
  const uniq = [...new Set(vals.map((v) => v.toFixed(6)))];
  if (uniq.length !== 1) {
    fail(`${bod.name}: bodyWaistY varies with finish: ${uniq.join(", ")}`);
  } else {
    ok(`${bod.name}: bodyWaistY = ${uniq[0]} across all 4 finishes`);
  }
}

// --- 3. waistDrop follow (absolute stays frame origin; gap = D) ---
console.log("\n=== 3. bodyWaistY follows waistDrop (frame re-zero) ===\n");
console.log("body | drop | bodyWaistY | D | gap(D−bwY) | note");
for (const bod of bodies) {
  const fin = FINISHES.find((f) => f.kind === "elastic-casing")!;
  const eased = applyEase(bod.body, fin.settings.ease);
  for (const drop of DROP_SWEEP) {
    const style = resolveDraftStyle(fin, eased, drop);
    const m = trouserDraftMeasures(eased, style);
    const gap = waistToHipGap(eased, style);
    console.log(
      `${bod.name} | ${drop} | ${f1(m.bodyWaistY)} | ${f1(m.D)} | ${f1(gap)} | waist at frame origin; D shrinks with drop`,
    );
    if (Math.abs(m.bodyWaistY) > 1e-9) {
      fail(`${bod.name}@drop${drop}: bodyWaistY ≠ 0`);
    }
    if (Math.abs(gap - m.D) > 1e-9) {
      fail(`${bod.name}@drop${drop}: gap ≠ D`);
    }
  }
  ok(`${bod.name}: bodyWaistY locked at 0 under drop; gap = D tracks hipDepth−drop`);
}

// --- 4. Derived gap = waist-to-hip (anchor B as derived) ---
console.log("\n=== 4. Derived gap D − bodyWaistY ===\n");
{
  const eased = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const style = resolveDraftStyle(FINISHES[3]!, eased);
  const m = trouserDraftMeasures(eased, style);
  const gap = waistToHipGap(eased, style);
  // Girth uses body.hipDepth via D; same D.
  console.log(
    `  Helen-print elastic: bodyWaistY=${f1(m.bodyWaistY)} D=${f1(m.D)} gap=${f1(gap)} hipDepth=${eased.hipDepth}`,
  );
  if (Math.abs(gap - (eased.hipDepth - style.waistDrop!)) > 0.01) {
    fail("gap ≠ hipDepth − drop");
  } else {
    ok("gap = hipDepth − drop (= D when bodyWaistY = 0) — anchor B as derived only");
  }
}

// --- 5. Re-point no-op: girth W unchanged (same formula, now documented at bodyWaistY) ---
console.log("\n=== 5. Girth / measures re-point — expect identical W ===\n");
for (const bod of bodies) {
  const eased = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const style = resolveDraftStyle(FINISHES[3]!, eased);
  const m = trouserDraftMeasures(eased, style);
  // Same W whether read via measures or recomputed from body+drop (the "before" path).
  const drop = style.waistDrop ?? 0;
  const wBefore =
    eased.waist + (drop / 50) * (eased.lowWaist - eased.waist);
  const dW = m.W - wBefore;
  console.log(
    `  ${bod.name}: W=${f1(m.W)} before-path=${f1(wBefore)} Δ=${f3(dW)}`,
  );
  if (Math.abs(dW) > 1e-6) {
    fail(`${bod.name}: W drifted`);
  } else {
    ok(`${bod.name}: W unchanged (Δ=0.000)`);
  }
}

// --- 6. piece-top consumers unchanged ("waistEdge") ---
console.log("\n=== 6. waistEdge sentinel still = piece-top CF ===\n");
for (const fin of FINISHES) {
  const eased = applyEase(helenBody(), fin.settings.ease);
  const style = resolveDraftStyle(fin, eased);
  const front = draftTrouserFront(eased, style);
  const pieceCF = front.outline.find((o) => o.role === "waist")!.at.y;
  const m = trouserDraftMeasures(eased, style);
  const p0 = resolveCrotchP0Y({ crotchDeparture: "waistEdge" }, m.D, pieceCF);
  console.log(
    `  ${fin.kind}: bodyWaistY=${f1(m.bodyWaistY)} pieceTopCF=${f1(pieceCF)} waistEdge→P0=${f1(p0)}`,
  );
  if (Math.abs(p0 - pieceCF) > 1e-9) {
    fail(`${fin.kind}: waistEdge ≠ piece top`);
  } else {
    ok(`${fin.kind}: waistEdge → piece top (not bodyWaistY)`);
  }
}

// --- 7. Concept count ---
console.log("\n=== 7. Concept count ===\n");
console.log(`  Before: silent construction plane + piece top + colloquial "yoke seam" (+ CB rise).
  After:  named bodyWaistY + piece top (yoke subsumed as alias) + CB rise offset.
  Net: concept count LOWER (silent plane named; yoke no longer a third seam).
  Naming trap left open: TrousersView departure-max still feeds scoop depth
  where piece-top CF y is meant — reported, not fixed (separate brief).
`);

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS ===\n"
    : `\n=== ACCEPT FAIL (${failures}) ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
