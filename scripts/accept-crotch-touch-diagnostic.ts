/**
 * Acceptance: touch demoted from solve to diagnostic; fixed crotch k1/k2.
 * Run: npx tsx scripts/accept-crotch-touch-diagnostic.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { cubicBezier } from "../lib/geometry/curves";
import {
  draftTrouserFront,
  draftTrouserBack,
  draftBackCrotch,
  frontCrotchCurve,
  frontCrotchExtension,
  frontCrotchTouch,
  resolveCrotchArrivalAngle,
  resolveCrotchExtensionScale,
  resolveCrotchStraightRun,
  resolveWaistlineCurveFront,
  trouserFrontPoints,
  trouserBackPoints,
  withWaistband,
  DEFAULT_CROTCH_ARRIVAL_ANGLE,
  DEFAULT_FRONT_WAIST_INSET,
  WAISTLINE_CURVE_FRONT,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { CLEO_PRESET } from "../lib/pattern/blockPresets";
import {
  ALDRICH_P46_SIZE_12_BODY,
  ALDRICH_P46_DEPTH0_STYLE,
} from "../lib/patterns/aldrichProductionVerify";

const outDir = join(process.cwd(), "tmp", "crotch-touch-diagnostic");
mkdirSync(outDir, { recursive: true });

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const cleoBody = applyEase({ ...chart, hip: 1100 }, CLEO_PRESET.measured.ease);

function mk(
  partial: Partial<TrouserFrontStyle> = {},
  b = body,
  depth = 0,
  mode: "darted" | "shaped" = "darted",
) {
  return withWaistband(
    {
      bottomWidth: 220,
      block: "classic",
      waistDrop: 0,
      crotchExtensionScale: 1,
      crotchArrivalAngle: DEFAULT_CROTCH_ARRIVAL_ANGLE,
      waistlineCurveFront: WAISTLINE_CURVE_FRONT,
      frontWaistInset: DEFAULT_FRONT_WAIST_INSET,
      ...partial,
    },
    depth,
    mode,
    b,
  );
}

function hausdorff(a: Point[], b: Point[]): number {
  const oneWay = (from: Point[], to: Point[]) => {
    let worst = 0;
    for (const p of from) {
      let best = Infinity;
      for (const q of to) {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < best) best = d;
      }
      if (best > worst) worst = best;
    }
    return worst;
  };
  return Math.max(oneWay(a, b), oneWay(b, a));
}

function frontBez(style: TrouserFrontStyle, b = body) {
  const f = trouserFrontPoints(b, style);
  const H = b.hip;
  const scale = resolveCrotchExtensionScale(style);
  const waistCfY = resolveWaistlineCurveFront(style);
  const R = f.p9.y;
  const D = f.p6.y;
  return frontCrotchCurve({
    p5: f.p5,
    p9: f.p9,
    fork: Math.abs(f.p5.x),
    R,
    waistCfY,
    straightRun: resolveCrotchStraightRun(style, R, D, waistCfY),
    extension: frontCrotchExtension(H, scale),
    arrivalAngleDeg: resolveCrotchArrivalAngle(style),
    touch: frontCrotchTouch(H) * scale,
  });
}

/** Former touch-solve curve at defaults (frozen control points from pre-change). */
const FORMER_FRONT = {
  owner: { k1: 0.6183936929702759, k2: 0.44773729984521066 },
  aldrich: { k1: 0.6175, k2: 0.4203 },
};
const FORMER_BACK_DROP5 = {
  // Former touch-solve on owner UI body (hip 1100+50) — for Δ report only.
  owner: { k1: 0.94204184897244, k2: 0.5382137453488433 },
  // Former touch-solve on ALDRICH_P46 body — calibration target.
  aldrich: { k1: 0.865, k2: 0.5004 },
};

function rebuildFrontAtK(
  style: TrouserFrontStyle,
  k1: number,
  k2: number,
  b = body,
): Point[] {
  const f = trouserFrontPoints(b, style);
  const H = b.hip;
  const scale = resolveCrotchExtensionScale(style);
  const waistCfY = resolveWaistlineCurveFront(style);
  const R = f.p9.y;
  const D = f.p6.y;
  const straightRun = resolveCrotchStraightRun(style, R, D, waistCfY);
  const P0 = { x: -Math.abs(f.p5.x), y: waistCfY + straightRun };
  const P3 = f.p9;
  const drop = Math.max(1e-6, P3.y - P0.y);
  const chord = Math.max(1e-6, Math.hypot(P3.x - P0.x, P3.y - P0.y));
  const theta = (resolveCrotchArrivalAngle(style) * Math.PI) / 180;
  const dir = { x: -Math.cos(theta), y: Math.sin(theta) };
  const P1 = { x: P0.x, y: P0.y + k1 * drop };
  const P2 = {
    x: P3.x - k2 * chord * dir.x,
    y: P3.y - k2 * chord * dir.y,
  };
  return cubicBezier(P0, P1, P2, P3, 64);
}

function rebuildBackAtK(
  style: TrouserFrontStyle,
  k1: number,
  k2: number,
  b = body,
): Point[] {
  const bp = trouserBackPoints(b, style);
  const d = draftBackCrotch(bp);
  const P0 = d.P0;
  const P3 = d.P3;
  const uLen = Math.hypot(bp.p19.x - bp.p21.x, bp.p19.y - bp.p21.y);
  const u = {
    x: (bp.p19.x - bp.p21.x) / uLen,
    y: (bp.p19.y - bp.p21.y) / uLen,
  };
  const towardCb = Math.sign(bp.p19.x - bp.p23.x) || 1;
  const flat = d.crotchDrop < 1e-9;
  const arrive = flat
    ? { x: -towardCb, y: 0 }
    : (() => {
        const len = Math.hypot(d.T.x - d.K.x, d.T.y - d.K.y);
        return { x: (d.T.x - d.K.x) / len, y: (d.T.y - d.K.y) / len };
      })();
  const vert = Math.max(1e-6, P3.y - P0.y);
  const chord = Math.max(1e-6, Math.hypot(P3.x - P0.x, P3.y - P0.y));
  const P1 = { x: P0.x + k1 * vert * u.x, y: P0.y + k1 * vert * u.y };
  const P2 = {
    x: P3.x - k2 * chord * arrive.x,
    y: P3.y - k2 * chord * arrive.y,
  };
  return cubicBezier(P0, P1, P2, P3, 64);
}

const def = mk({ backCrotchDrop: 5 });
const frontNow = frontBez(def);
const backNow = draftBackCrotch(trouserBackPoints(body, def));
const frontΔOwner = hausdorff(
  rebuildFrontAtK(def, FORMER_FRONT.owner.k1, FORMER_FRONT.owner.k2),
  rebuildFrontAtK(def, frontNow.k1, frontNow.k2),
);
const frontΔAldrich = hausdorff(
  rebuildFrontAtK(
    ALDRICH_P46_DEPTH0_STYLE,
    FORMER_FRONT.aldrich.k1,
    FORMER_FRONT.aldrich.k2,
    ALDRICH_P46_SIZE_12_BODY,
  ),
  rebuildFrontAtK(
    ALDRICH_P46_DEPTH0_STYLE,
    frontNow.k1,
    frontNow.k2,
    ALDRICH_P46_SIZE_12_BODY,
  ),
);
const backΔOwner = hausdorff(
  rebuildBackAtK(def, FORMER_BACK_DROP5.owner.k1, FORMER_BACK_DROP5.owner.k2),
  rebuildBackAtK(def, backNow.k1, backNow.k2),
);
const backΔAldrich = hausdorff(
  rebuildBackAtK(
    ALDRICH_P46_DEPTH0_STYLE,
    FORMER_BACK_DROP5.aldrich.k1,
    FORMER_BACK_DROP5.aldrich.k2,
    ALDRICH_P46_SIZE_12_BODY,
  ),
  rebuildBackAtK(
    ALDRICH_P46_DEPTH0_STYLE,
    backNow.k1,
    backNow.k2,
    ALDRICH_P46_SIZE_12_BODY,
  ),
);

console.log("=== Fixed k (calibrated at Aldrich p.46 defaults) ===");
console.log("front", {
  k1: frontNow.k1,
  k2: frontNow.k2,
  touchMissOwnerBody: +frontNow.touchMiss.toFixed(3),
  maxΔVsFormerOwnerSolveMm: +frontΔOwner.toFixed(4),
  maxΔVsAldrichCalibMm: +frontΔAldrich.toFixed(4),
});
console.log("back drop5", {
  k1: backNow.k1,
  k2: backNow.k2,
  touchMissOwnerBody: +backNow.touchMiss.toFixed(3),
  maxΔVsFormerOwnerSolveMm: +backΔOwner.toFixed(4),
  maxΔVsAldrichCalibMm: +backΔAldrich.toFixed(4),
});

const Cleo = mk(
  {
    crotchStraightRun: CLEO_PRESET.measured.crotchStraightRun,
    frontWaistInset: CLEO_PRESET.measured.frontWaistInset,
    crotchArrivalAngle: CLEO_PRESET.measured.crotchArrivalAngle,
    backCrotchDrop: CLEO_PRESET.measured.backCrotchDrop,
    waistDrop: CLEO_PRESET.measured.waistDrop,
    crotchExtensionScale: CLEO_PRESET.provisional.crotchExtensionScale,
    waistlineCurveFront: CLEO_PRESET.provisional.waistlineCurveFront,
  },
  cleoBody,
  CLEO_PRESET.measured.waistbandDepth,
  CLEO_PRESET.measured.waistbandMode,
);
const frontCleo = frontBez(Cleo, cleoBody);
const backCleo = draftBackCrotch(trouserBackPoints(cleoBody, Cleo));
console.log("\n=== Aldrich p.46 body (verify:aldrich) ===");
{
  const af = frontBez(ALDRICH_P46_DEPTH0_STYLE, ALDRICH_P46_SIZE_12_BODY);
  const ab = draftBackCrotch(
    trouserBackPoints(ALDRICH_P46_SIZE_12_BODY, ALDRICH_P46_DEPTH0_STYLE),
  );
  console.log("front", {
    k1: af.k1,
    k2: af.k2,
    touchMiss: +af.touchMiss.toFixed(3),
  });
  console.log("back", {
    k1: ab.k1,
    k2: ab.k2,
    touchMiss: +ab.touchMiss.toFixed(3),
  });
}

console.log("\n=== cleo-like ===");
console.log("front", {
  k1: frontCleo.k1,
  k2: frontCleo.k2,
  touchMiss: +frontCleo.touchMiss.toFixed(3),
});
console.log("back", {
  k1: backCleo.k1,
  k2: backCleo.k2,
  touchMiss: +backCleo.touchMiss.toFixed(3),
});

// Timing: full UI-like draft path (no solve)
const N = 200;
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  draftTrouserFront(body, def);
  draftTrouserBack(body, def);
}
const ms = performance.now() - t0;
console.log("\n=== Timing ===");
console.log({
  drafts: N,
  totalMs: +ms.toFixed(1),
  perPairMs: +(ms / N).toFixed(3),
});

// Monotonicity sweep (432 combos — same spirit as prior loop-proof accept)
const runs = [0, 60, 120, 180];
const arrivals = [0, 14, 30, 45];
const waistDrops = [0, 25, 50];
const scales = [0.5, 1.0, 1.5];
const backDrops = [0, 5, 10];
let monoFront = 0;
let monoBack = 0;
let combos = 0;
const tSweep0 = performance.now();
for (const run of runs) {
  for (const arr of arrivals) {
    for (const wd of waistDrops) {
      for (const sc of scales) {
        for (const bd of backDrops) {
          combos++;
          const st = mk({
            crotchStraightRun: run,
            crotchArrivalAngle: arr,
            waistDrop: wd,
            crotchExtensionScale: sc,
            backCrotchDrop: bd,
          });
          try {
            draftTrouserFront(body, st);
          } catch (e) {
            monoFront++;
            console.error("front mono", { run, arr, wd, sc, bd }, e);
          }
          try {
            draftTrouserBack(body, st);
          } catch (e) {
            monoBack++;
            console.error("back mono", { run, arr, wd, sc, bd }, e);
          }
        }
      }
    }
  }
}
const sweepMs = performance.now() - tSweep0;
console.log("\n=== Mono sweep ===");
console.log({
  combos,
  frontFailures: monoFront,
  backFailures: monoBack,
  sweepMs: +sweepMs.toFixed(1),
});

function svgFor(
  name: string,
  frontPts: Point[],
  backPts: Point[],
  guides: Point[],
) {
  const all = [...frontPts, ...backPts, ...guides];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of all) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = 20;
  const w = maxX - minX + 2 * pad;
  const h = maxY - minY + 2 * pad;
  const tx = (p: Point) => p.x - minX + pad;
  const ty = (p: Point) => p.y - minY + pad;
  const poly = (pts: Point[], stroke: string) =>
    `<polyline fill="none" stroke="${stroke}" stroke-width="1.2" points="${pts
      .map((p) => `${tx(p).toFixed(2)},${ty(p).toFixed(2)}`)
      .join(" ")}" />`;
  const dots = guides
    .map(
      (p) =>
        `<circle cx="${tx(p).toFixed(2)}" cy="${ty(p).toFixed(2)}" r="2.5" fill="#c45" />`,
    )
    .join("\n");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}">
  <rect width="100%" height="100%" fill="#faf8f5"/>
  ${poly(frontPts, "#1a5f7a")}
  ${poly(backPts, "#2d6a4f")}
  ${dots}
</svg>`;
  writeFileSync(join(outDir, `${name}.svg`), svg);
}

{
  const fDraft = draftTrouserFront(body, def);
  const bDraft = draftTrouserBack(body, def);
  const fp = trouserFrontPoints(body, def);
  const bp = trouserBackPoints(body, def);
  svgFor(
    "aldrich-defaults",
    fDraft.outline.filter((_, i) => i < 80),
    bDraft.outline.filter((_, i) => i < 80),
    [
      {
        x: fp.p5.x - frontCrotchTouch(body.hip) * Math.SQRT1_2,
        y: fp.p5.y - frontCrotchTouch(body.hip) * Math.SQRT1_2,
      },
      bp.guide,
    ],
  );
  // Crotch-only close-ups
  const fc = frontBez(def);
  const bc = draftBackCrotch(bp);
  svgFor("aldrich-defaults-crotch", fc.points, bc.points, [
    {
      x: fp.p5.x - frontCrotchTouch(body.hip) * Math.SQRT1_2,
      y: fp.p5.y - frontCrotchTouch(body.hip) * Math.SQRT1_2,
    },
    bp.guide,
  ]);
}
{
  const fp = trouserFrontPoints(cleoBody, Cleo);
  const bp = trouserBackPoints(cleoBody, Cleo);
  const fc = frontBez(Cleo, cleoBody);
  const bc = draftBackCrotch(bp);
  svgFor("cleo-like-crotch", fc.points, bc.points, [
    {
      x: fp.p5.x - frontCrotchTouch(cleoBody.hip) * Math.SQRT1_2,
      y: fp.p5.y - frontCrotchTouch(cleoBody.hip) * Math.SQRT1_2,
    },
    bp.guide,
  ]);
}

console.log("\nSVGs →", outDir);
