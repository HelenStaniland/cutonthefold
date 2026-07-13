/**
 * Acceptance: scalar back-crotch solve + depth-cap memo.
 * Run: npx tsx scripts/verify-back-crotch-scalar.ts
 */
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { cubicBezier } from "../lib/geometry/curves";
import {
  draftBackCrotch,
  draftTrouserBack,
  draftTrousers,
  maxBackShapedWaistDepth,
  trouserBackPoints,
  trouserConstruction,
  waistbandDepthRange,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  formatAldrichReport,
  verifyAldrichProductionDepth0,
  verifyCrotchTouchFormula,
  verifyFrontWaistSeamBow,
} from "../lib/patterns/aldrichProductionVerify";

function angleDeg(dx: number, dy: number) {
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function hausdorff(a: Point[], b: Point[]): number {
  const one = (p: Point[], q: Point[]) => {
    let m = 0;
    for (const pt of p) {
      let best = Infinity;
      for (const qt of q) {
        best = Math.min(best, Math.hypot(pt.x - qt.x, pt.y - qt.y));
      }
      m = Math.max(m, best);
    }
    return m;
  };
  return Math.max(one(a, b), one(b, a));
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const base: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
};

console.log("=== Tangency + touch (scale 1.0) ===");
{
  const b = trouserBackPoints(body, base);
  const d = draftBackCrotch(b);
  const uLen = Math.hypot(b.p19.x - b.p21.x, b.p19.y - b.p21.y);
  const u = {
    x: (b.p19.x - b.p21.x) / uLen,
    y: (b.p19.y - b.p21.y) / uLen,
  };
  const leave = {
    x: d.P1.x - d.P0.x,
    y: d.P1.y - d.P0.y,
  };
  const leaveLen = Math.hypot(leave.x, leave.y);
  const leaveDot =
    (leave.x / leaveLen) * u.x + (leave.y / leaveLen) * u.y;
  const leaveAngle =
    (Math.acos(Math.max(-1, Math.min(1, leaveDot))) * 180) / Math.PI;
  const arrive = { x: d.P3.x - d.P2.x, y: d.P3.y - d.P2.y };
  const ah = Math.abs(angleDeg(arrive.x, arrive.y));
  const fromH = Math.min(ah, Math.abs(180 - ah));
  console.log(`leave vs CB: ${leaveAngle.toFixed(3)}°`);
  console.log(`arrive vs horizontal: ${fromH.toFixed(3)}°`);
  console.log(`touchMiss: ${d.touchMiss.toFixed(4)} mm`);
  console.log(`k: ${d.k.toFixed(4)}`);
}

console.log("\n=== Delta vs reconstructed 2-D grid (same tangency directions) ===");
{
  function gridSolve(b: ReturnType<typeof trouserBackPoints>) {
    const R = b.p23.y;
    const horizRun = 0.22 * Math.abs(b.p19.x - b.p23.x);
    const towardCb = Math.sign(b.p19.x - b.p23.x) || 1;
    const K = { x: b.p23.x + towardCb * horizRun, y: R };
    const P0 = b.p19;
    const uLen = Math.hypot(b.p19.x - b.p21.x, b.p19.y - b.p21.y);
    const u = {
      x: (b.p19.x - b.p21.x) / uLen,
      y: (b.p19.y - b.p21.y) / uLen,
    };
    const chord = Math.hypot(K.x - P0.x, K.y - P0.y);
    const spanX = Math.abs(P0.x - K.x);
    const touchPt = b.guide;
    const miss = (d1: number, d2: number) => {
      const P1 = { x: P0.x + d1 * u.x, y: P0.y + d1 * u.y };
      const P2 = { x: K.x + towardCb * d2, y: K.y };
      const curve = cubicBezier(P0, P1, P2, K, 48);
      let best = Infinity;
      for (const p of curve) {
        best = Math.min(best, Math.hypot(p.x - touchPt.x, p.y - touchPt.y));
      }
      return best;
    };
    let bestD1 = 0.55 * chord;
    let bestD2 = 0.55 * spanX;
    let bestMiss = miss(bestD1, bestD2);
    for (let i = 0; i <= 40; i++) {
      for (let j = 0; j <= 40; j++) {
        const d1 = 0.05 * chord + (i / 40) * 1.5 * chord;
        const d2 = 0.05 * spanX + (j / 40) * 1.5 * spanX;
        const m = miss(d1, d2);
        if (m < bestMiss) {
          bestMiss = m;
          bestD1 = d1;
          bestD2 = d2;
        }
      }
    }
    const P1 = { x: P0.x + bestD1 * u.x, y: P0.y + bestD1 * u.y };
    const P2 = { x: K.x + towardCb * bestD2, y: K.y };
    const kToP19 = cubicBezier(P0, P1, P2, K, 48).slice().reverse();
    const points = [{ ...b.p24 }, { ...b.p23 }, ...kToP19, { ...b.p21 }];
    return { points, bestMiss };
  }

  for (const scale of [1.0, 0.7, 0.5]) {
    const style = { ...base, crotchExtensionScale: scale };
    const b = trouserBackPoints(body, style);
    const d = draftBackCrotch(b);
    const g = gridSolve(b);
    console.log(
      `scale ${scale}: Hausdorff=${hausdorff(d.points, g.points).toFixed(3)} mm  scalarMiss=${d.touchMiss.toFixed(3)} gridMiss=${g.bestMiss.toFixed(3)}`,
    );
  }
}

console.log("\n=== Timings ===");
{
  // cold then warm (memo)
  const t0 = performance.now();
  const cap1 = maxBackShapedWaistDepth(body, "classic", 220, 25);
  const cold = performance.now() - t0;
  const t1 = performance.now();
  const cap2 = maxBackShapedWaistDepth(body, "classic", 220, 25);
  const warm = performance.now() - t1;
  console.log(
    `maxBackShapedWaistDepth cold: ${cold.toFixed(1)} ms (cap=${cap1})`,
  );
  console.log(
    `maxBackShapedWaistDepth warm: ${warm.toFixed(1)} ms (cap=${cap2})`,
  );

  const t2 = performance.now();
  const style = withWaistband(
    { bottomWidth: 220, block: "classic", waistDrop: 25 },
    40,
    "shaped",
    body,
  );
  draftTrousers(body, style);
  trouserConstruction(body, style);
  maxBackShapedWaistDepth(body, "classic", 220, 25);
  waistbandDepthRange("shaped", body, "classic", 220, 25);
  console.log(`full UI-ish path: ${(performance.now() - t2).toFixed(1)} ms`);
}

console.log("\n=== verify:aldrich ===");
{
  const checks = [
    ...verifyCrotchTouchFormula({ assert: false }),
    ...verifyFrontWaistSeamBow({ assert: false }),
    ...verifyAldrichProductionDepth0({ assert: false }),
  ];
  console.log(formatAldrichReport(checks));
  const fails = checks.filter((c) => !c.pass);
  console.log(`Failures: ${fails.length}`);
}

console.log(
  "\nNote: aldrich 'catmullRom 24→guide→19→21' builds its own Catmull and does not assert the drafted back crotch polyline.",
);
