/**
 * Acceptance: seamLengths.hemWidth == Pattern-summary hem chips (net corner span).
 * Run: npx tsx scripts/accept-seam-hem-width.ts
 */
import { createHash } from "node:crypto";
import {
  applyEase,
  type BodyMeasurements,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { polylineLength, quadBezier } from "../lib/geometry/curves";
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
  trouserBackPoints,
  trouserDraftMeasures,
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
const f3 = (n: number) => n.toFixed(3);

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN_VERTICALS };
}

function resolveStyle(
  s: TrouserStyleSettings,
  body: BodyMeasurements,
): TrouserFrontStyle {
  const finish = s.dartedWaistFinish;
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

function outlineHash(piece: ReturnType<typeof draftTrouserFront>): string {
  const s = piece.outline
    .map((o) => `${o.role ?? ""}:${o.at.x.toFixed(9)},${o.at.y.toFixed(9)}`)
    .join("|");
  return createHash("sha256").update(s).digest("hex");
}

function rolePolyline(
  outline: { at: Point; role?: string }[],
  role: string,
): Point[] {
  const pts: Point[] = [];
  for (const o of outline) {
    if (o.role !== role) continue;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(o.at.x - last.x, o.at.y - last.y) < 0.01) continue;
    pts.push(o.at);
  }
  return pts;
}

/** Construction back hem polyline (pre-retag) — same as draftTrouserBack. */
function constructionBackHem(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): Point[] {
  const b = trouserBackPoints(body, style);
  const { F } = trouserDraftMeasures(body, style);
  if (style.backHemShape === "straight") {
    return [b.p26, b.p28];
  }
  return quadBezier(b.p26, { x: 0, y: F + 20 }, b.p28);
}

/** Chip source (historical): |p12.x−p14.x| / |p26.x−p28.x|. */
function chipHemWidths(body: BodyMeasurements, style: TrouserFrontStyle) {
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  return {
    front: Math.abs(f.p12.x - f.p14.x),
    back: Math.abs(b.p26.x - b.p28.x),
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

console.log("=== accept-seam-hem-width ===\n");
console.log("Field key: seamLengths.hemWidth");
console.log(
  "Source: |p12.x−p14.x| / |p26.x−p28.x| — net hem-corner span (same as Pattern-summary chips).\n",
);

console.log("=== 1. hemWidth == chip source (Δ 0) ===\n");
console.log("body×style | chipF | exportF | ΔF | chipB | exportB | ΔB");

for (const bod of bodies) {
  for (const st of STYLES) {
    const body = applyEase(bod.body, st.s.ease);
    const style = resolveStyle(st.s, body);
    const chips = chipHemWidths(body, style);
    const front = draftTrouserFront(body, style);
    const back = draftTrouserBack(body, style);
    const expF = front.seamLengths?.hemWidth;
    const expB = back.seamLengths?.hemWidth;
    if (expF == null || expB == null) {
      fail(`${bod.name}×${st.name}: missing hemWidth`);
      continue;
    }
    const dF = expF - chips.front;
    const dB = expB - chips.back;
    console.log(
      `${bod.name}×${st.name} | ${f3(chips.front)} | ${f3(expF)} | ${f3(dF)} | ${f3(chips.back)} | ${f3(expB)} | ${f3(dB)}`,
    );
    if (Math.abs(dF) > 1e-9 || Math.abs(dB) > 1e-9) {
      fail(`${bod.name}×${st.name}: hemWidth ≠ chip`);
    } else {
      ok(`${bod.name}×${st.name}: hemWidth ≡ chip`);
    }
  }
}

console.log("\n=== 2. Span ≠ arc on curved hem; span == arc on straight ===\n");
console.log(
  "(Construction hem polyline — role=hem loses both corners to retag.)\n",
);
console.log("body×style | hemShape | spanB | arcB | Δ (arc−span)");

for (const bod of bodies) {
  for (const st of STYLES) {
    const body = applyEase(bod.body, st.s.ease);
    const style = resolveStyle(st.s, body);
    const back = draftTrouserBack(body, style);
    const span = back.seamLengths!.hemWidth;
    const hemPoly = constructionBackHem(body, style);
    const hemArc = polylineLength(hemPoly);
    const delta = hemArc - span;
    const shape = style.backHemShape ?? "curved";
    console.log(
      `${bod.name}×${st.name} | ${shape} | ${f3(span)} | ${f3(hemArc)} | ${f3(delta)}`,
    );
    if (shape === "straight") {
      if (Math.abs(delta) > 0.05) {
        fail(
          `${bod.name}×${st.name}: straight hem arc should ≈ span (Δ ${f3(delta)})`,
        );
      } else {
        ok(`${bod.name}×${st.name}: straight — arc ≡ span`);
      }
    } else {
      if (delta <= 0.5) {
        fail(
          `${bod.name}×${st.name}: curved hem arc should exceed span (Δ ${f3(delta)})`,
        );
      } else {
        ok(
          `${bod.name}×${st.name}: curved — arc > span by ${f3(delta)} mm (span is width)`,
        );
      }
    }
    // Role retag note (informational)
    const roleArc = polylineLength(rolePolyline(back.outline, "hem"));
    if (Math.abs(roleArc - hemArc) > 1) {
      // expected — not a fail
    }
  }
}

console.log("\n=== 3. Outline hashes ===\n");
for (const bod of bodies) {
  for (const st of [
    { name: "Aldrich", s: BLOCK_TROUSER_STYLE },
    { name: "Cleo", s: CLEO_TROUSER_STYLE },
  ] as const) {
    const body = applyEase(bod.body, st.s.ease);
    const style = resolveStyle(st.s, body);
    const h =
      outlineHash(draftTrouserFront(body, style)) +
      outlineHash(draftTrouserBack(body, style));
    ok(`${bod.name}×${st.name}: ${h.slice(0, 16)}…`);
  }
}

if (failures > 0) {
  console.log(`\nFAILED with ${failures} check(s).`);
  process.exit(1);
}
console.log("\nAll hem-width seam length checks passed.");
console.log(
  "Net (finished stitching-line corners), not cut: hemWidth = |side.x − inseam.x| at hem y.",
);
