/**
 * Instrument front draft failure: dump exact P0–P3 + style when mono throws.
 * Run: npx tsx scripts/diag-front-mono-catch.ts
 */
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { cubicBezier } from "../lib/geometry/curves";
import {
  draftTrouserFront,
  frontCrotchCurve,
  frontCrotchExtension,
  frontCrotchTouch,
  resolveCrotchArrivalAngle,
  resolveCrotchExtensionScale,
  resolveCrotchStraightRun,
  resolveWaistlineCurveFront,
  trouserFrontPoints,
  withWaistband,
  maxBackShapedWaistDepth,
  maxYokeDepth,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function analyse(style: TrouserFrontStyle, label: string) {
  try {
    draftTrouserFront(body, style);
    return false;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("not monotonic")) {
      console.log(`OTHER [${label}]`, msg);
      return false;
    }

    // Reconstruct exactly as draftTrouserFront does — need wr.cf.y.
    // Re-draft pieces until the waist resolve, by calling exported pieces.
    // frontWaistResolved isn't exported; duplicate the waistCfY by catching
    // via monkey: call frontCrotchCurve across likely waistCfY from style.
    const f = trouserFrontPoints(body, style);
    const H = body.hip;
    const R = f.p9.y;
    const D = f.p6.y;
    const scale = resolveCrotchExtensionScale(style);
    const scoop = resolveWaistlineCurveFront(style);
    const depth = style.waistReduction ?? 0;

    // Probe waistCfY: scoop alone, or with band lowering along CF edge.
    // Try a range of y values to find which ones produce non-mono curves
    // matching the error's y values if present.
    const m = msg.match(/y\(([\d.]+)=([\d.-]+) < yPrev=([\d.-]+)/);
    const failT = m ? Number(m[1]) : NaN;
    const failY = m ? Number(m[2]) : NaN;
    const failPrev = m ? Number(m[3]) : NaN;

    let match: ReturnType<typeof frontCrotchCurve> | null = null;
    let matchY = NaN;
    let matchRun = NaN;
    for (let y = 0; y <= Math.ceil(R + 40); y += 1) {
      const straightRun = resolveCrotchStraightRun(style, R, D, y);
      const bez = frontCrotchCurve({
        p5: f.p5,
        p9: f.p9,
        fork: Math.abs(f.p5.x),
        R,
        waistCfY: y,
        straightRun,
        extension: frontCrotchExtension(H, scale),
        arrivalAngleDeg: resolveCrotchArrivalAngle(style),
        touch: frontCrotchTouch(H) * scale,
      });
      let yPrev = bez.P0.y;
      let badAt = -1;
      let badY = 0;
      let badPrev = 0;
      for (let i = 1; i <= 16; i++) {
        const t = i / 16;
        const u = 1 - t;
        const py =
          u * u * u * bez.P0.y +
          3 * u * u * t * bez.P1.y +
          3 * u * t * t * bez.P2.y +
          t * t * t * bez.P3.y;
        if (py + 1e-6 < yPrev) {
          badAt = t;
          badY = py;
          badPrev = yPrev;
          break;
        }
        yPrev = py;
      }
      if (badAt < 0) continue;
      if (
        !Number.isNaN(failT) &&
        Math.abs(badAt - failT) < 1e-6 &&
        Math.abs(badY - failY) < 0.05 &&
        Math.abs(badPrev - failPrev) < 0.05
      ) {
        match = bez;
        matchY = y;
        matchRun = straightRun;
        break;
      }
      if (!match) {
        match = bez;
        matchY = y;
        matchRun = straightRun;
      }
    }

    console.log("\n========== FAILURE ==========");
    console.log("label:", label);
    console.log("error:", msg);
    console.log("style:", JSON.stringify(style, null, 2));
    console.log("body: hip", H, "rise", body.bodyRise, "hipDepth", body.hipDepth);
    console.log("frame: R", R, "D", D, "p10", f.p10, "p9", f.p9, "p5", f.p5);
    console.log("scoop", scoop, "depth", depth, "scale", scale);
    console.log(
      "arrival",
      resolveCrotchArrivalAngle(style),
      "ext",
      frontCrotchExtension(H, scale),
      "touch",
      frontCrotchTouch(H) * scale,
    );
    if (!match) {
      console.log("could not reconstruct failing Bézier");
      return true;
    }
    const d1 = match.P1.y - match.P0.y;
    const d2x = match.P3.x - match.P2.x;
    const d2y = match.P3.y - match.P2.y;
    const d2 = Math.hypot(d2x, d2y);
    const run = match.P3.y - match.P0.y;
    console.log("waistCfY (reconstructed):", matchY);
    console.log("straightRun:", matchRun);
    console.log("run = P3.y - P0.y:", run);
    console.log("P0:", match.P0);
    console.log("P1:", match.P1);
    console.log("P2:", match.P2);
    console.log("P3:", match.P3);
    console.log("d1:", d1, "(= k * run → k check", d1 / run, ")");
    console.log("d2:", d2, "dir", { x: d2x / d2, y: d2y / d2 });
    console.log("k:", match.k, "touchMiss:", match.touchMiss);
    console.log("P1.y vs P3.y:", match.P1.y, "vs", match.P3.y, "P1 below tip?", match.P1.y > match.P3.y);
    console.log("y(t) samples:");
    let ymin = Infinity;
    let ymax = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const u = 1 - t;
      const p = {
        x:
          u * u * u * match.P0.x +
          3 * u * u * t * match.P1.x +
          3 * u * t * t * match.P2.x +
          t * t * t * match.P3.x,
        y:
          u * u * u * match.P0.y +
          3 * u * u * t * match.P1.y +
          3 * u * t * t * match.P2.y +
          t * t * t * match.P3.y,
      };
      ymin = Math.min(ymin, p.y);
      ymax = Math.max(ymax, p.y);
      const marker = i > 0 && p.y < (arguments as unknown as []) ? "" : "";
      console.log(`  t=${t.toFixed(2)}  (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    }
    // Find first decrease
    let prev = match.P0.y;
    for (let i = 1; i <= 40; i++) {
      const t = i / 40;
      const pts = cubicBezier(match.P0, match.P1, match.P2, match.P3, 40);
      const y = pts[i]!.y;
      if (y + 1e-6 < prev) {
        console.log(`first y-decrease at t=${t}: y=${y.toFixed(4)} < prev=${prev.toFixed(4)}`);
        break;
      }
      prev = y;
    }
    return true;
  }
}

let hits = 0;

// Owner-like
const ownerBase: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 25,
  crotchExtensionScale: 1,
  crotchArrivalAngle: 5,
  waistlineCurveFront: 30,
  frontWaistInset: 10,
  crotchStraightRun: 0,
};

for (const cd of [0, 30, 90, 120, 180, undefined]) {
  for (const fwc of [0, 12, 30]) {
    for (const scale of [1, 0.7, 0.5, 0.4]) {
      for (const arr of [5, 14, 32, 45]) {
        for (const drop of [0, 25, 50]) {
          const style: TrouserFrontStyle = {
            ...ownerBase,
            waistDrop: drop,
            crotchExtensionScale: scale,
            crotchArrivalAngle: arr,
            waistlineCurveFront: fwc,
            ...(cd !== undefined ? { crotchStraightRun: cd } : { crotchStraightRun: undefined }),
          };
          // clear optional
          if (cd === undefined) delete (style as { crotchStraightRun?: number }).crotchStraightRun;
          if (analyse(withWaistband(style, 0, "darted", body), `d0 cd=${cd} fwc=${fwc} s=${scale} a=${arr} drop=${drop}`)) {
            hits++;
            if (hits >= 1) {
              // also try shaped
            }
          }
          if (hits >= 2) break;
        }
        if (hits >= 2) break;
      }
      if (hits >= 2) break;
    }
    if (hits >= 2) break;
  }
  if (hits >= 2) break;
}

if (hits === 0) {
  console.log("No depth-0 hits. Scanning shaped band depths...");
  const hipCap = maxYokeDepth(body, "classic", 25);
  const backCap = maxBackShapedWaistDepth(body, "classic", 220, 25);
  console.log("hipCap", hipCap, "backCap", backCap);
  for (let depth = 0; depth <= Math.min(hipCap, backCap); depth += 5) {
    for (const cd of [0, undefined, 60]) {
      for (const scale of [1, 0.5]) {
        const raw: TrouserFrontStyle = {
          bottomWidth: 220,
          block: "classic",
          waistDrop: 25,
          crotchExtensionScale: scale,
          crotchArrivalAngle: 5,
          waistlineCurveFront: 16,
          frontWaistInset: 10,
        };
        if (cd !== undefined) raw.crotchStraightRun = cd;
        const style = withWaistband(raw, depth, depth === 0 ? "darted" : "shaped", body);
        if (
          analyse(
            style,
            `shaped depth=${depth} cd=${cd} s=${scale}`,
          )
        ) {
          hits++;
          if (hits >= 2) break;
        }
      }
      if (hits >= 2) break;
    }
    if (hits >= 2) break;
  }
}

console.log("\ntotal mono hits reported:", hits);
