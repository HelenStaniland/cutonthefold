/**
 * Acceptance: loop-proof crotch d1/d2 reparameterisation.
 * Run: npx tsx scripts/accept-crotch-loop-proof.ts
 */
import { writeFileSync } from "node:fs";
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
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

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

function crotchGuide45(corner: Point, touch: number): Point {
  const c = Math.SQRT1_2;
  return { x: corner.x - touch * c, y: corner.y - touch * c };
}

/** Pre-fix front: d1=k·run, d2=k·extension, k∈[0.15,2]. */
function oldFrontHandles(args: {
  p5: Point;
  p9: Point;
  fork: number;
  waistCfY: number;
  straightRun: number;
  extension: number;
  arrivalAngleDeg: number;
  touch: number;
}): { points: Point[] } {
  const P0: Point = { x: -args.fork, y: args.waistCfY + args.straightRun };
  const P3 = args.p9;
  const run = Math.max(1e-6, P3.y - P0.y);
  const theta = (args.arrivalAngleDeg * Math.PI) / 180;
  const dir = { x: -Math.cos(theta), y: Math.sin(theta) };
  const touchPt = crotchGuide45(args.p5, args.touch);
  const handles = (k: number) => {
    const d1 = k * run;
    const d2 = k * args.extension;
    return {
      P1: { x: P0.x, y: P0.y + d1 },
      P2: { x: P3.x - d2 * dir.x, y: P3.y - d2 * dir.y },
    };
  };
  const miss = (k: number) => {
    const { P1, P2 } = handles(k);
    const curve = cubicBezier(P0, P1, P2, P3, 48);
    let best = Infinity;
    for (const p of curve) {
      best = Math.min(best, Math.hypot(p.x - touchPt.x, p.y - touchPt.y));
    }
    return best;
  };
  let bestK = 0.55;
  let bestMiss = miss(bestK);
  for (let i = 0; i <= 40; i++) {
    const k = 0.15 + (i / 40) * 1.85;
    const m = miss(k);
    if (m < bestMiss) {
      bestMiss = m;
      bestK = k;
    }
  }
  let lo = Math.max(0.05, bestK - 0.08);
  let hi = bestK + 0.08;
  for (let iter = 0; iter < 24; iter++) {
    const mid = (lo + hi) / 2;
    if (miss(mid - 1e-3) < miss(mid + 1e-3)) hi = mid;
    else lo = mid;
  }
  const { P1, P2 } = handles((lo + hi) / 2);
  return { points: cubicBezier(P0, P1, P2, P3, 48) };
}

function oldBackCurve(b: ReturnType<typeof trouserBackPoints>): Point[] {
  const R = b.p23.y;
  const tipToCb = Math.abs(b.p19.x - b.p23.x);
  const horizRun = 0.22 * tipToCb;
  const towardCb = Math.sign(b.p19.x - b.p23.x) || 1;
  const K: Point = { x: b.p23.x + towardCb * horizRun, y: R };
  const P0 = b.p19;
  const P3 = K;
  const len = Math.hypot(b.p19.x - b.p21.x, b.p19.y - b.p21.y) || 1;
  const u = {
    x: (b.p19.x - b.p21.x) / len,
    y: (b.p19.y - b.p21.y) / len,
  };
  const a = Math.max(1, Math.abs(K.y - P0.y));
  const bLen = Math.max(1, Math.abs(P0.x - K.x));
  const touchPt = b.guide;
  const handles = (k: number) => ({
    P1: { x: P0.x + k * a * u.x, y: P0.y + k * a * u.y },
    P2: { x: K.x + towardCb * k * bLen, y: K.y },
  });
  const miss = (k: number) => {
    const { P1, P2 } = handles(k);
    const curve = cubicBezier(P0, P1, P2, P3, 48);
    let best = Infinity;
    for (const p of curve) {
      best = Math.min(best, Math.hypot(p.x - touchPt.x, p.y - touchPt.y));
    }
    return best;
  };
  let bestK = 0.55;
  let bestMiss = miss(bestK);
  for (let i = 0; i <= 40; i++) {
    const k = 0.15 + (i / 40) * 1.85;
    const m = miss(k);
    if (m < bestMiss) {
      bestMiss = m;
      bestK = k;
    }
  }
  let lo = Math.max(0.05, bestK - 0.08);
  let hi = bestK + 0.08;
  for (let iter = 0; iter < 24; iter++) {
    const mid = (lo + hi) / 2;
    if (miss(mid - 1e-3) < miss(mid + 1e-3)) hi = mid;
    else lo = mid;
  }
  const { P1, P2 } = handles((lo + hi) / 2);
  const kToP19 = cubicBezier(P0, P1, P2, P3, 48).slice().reverse();
  return [{ ...b.p24 }, { ...b.p23 }, ...kToP19, { ...b.p21 }];
}

function angleDeg(vx: number, vy: number, wx: number, wy: number): number {
  const c =
    (vx * wx + vy * wy) /
    (Math.hypot(vx, vy) * Math.hypot(wx, wy) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

function frontArgs(style: TrouserFrontStyle) {
  const f = trouserFrontPoints(body, style);
  const H = body.hip;
  const scale = resolveCrotchExtensionScale(style);
  const waistCfY = resolveWaistlineCurveFront(style);
  const R = f.p9.y;
  const D = f.p6.y;
  const straightRun = resolveCrotchStraightRun(style, R, D, waistCfY);
  return {
    args: {
      p5: f.p5,
      p9: f.p9,
      fork: Math.abs(f.p5.x),
      R,
      waistCfY,
      straightRun,
      extension: frontCrotchExtension(H, scale),
      arrivalAngleDeg: resolveCrotchArrivalAngle(style),
      touch: frontCrotchTouch(H) * scale,
    },
  };
}

let failures = 0;
function check(ok: boolean, msg: string) {
  if (!ok) {
    console.log("FAIL:", msg);
    failures++;
  } else console.log("OK:", msg);
}

console.log("=== Previously failing cases (mono) ===");
for (const drop of [25, 30, 40, 50]) {
  const style = withWaistband(
    {
      bottomWidth: 220,
      block: "classic",
      waistDrop: drop,
      crotchExtensionScale: 1,
      crotchArrivalAngle: 45,
      waistlineCurveFront: 0,
      frontWaistInset: 10,
      crotchStraightRun: 0,
    },
    0,
    "darted",
    body,
  );
  try {
    draftTrouserFront(body, style);
    const { args } = frontArgs(style);
    const bez = frontCrotchCurve(args);
    console.log(
      `  drop=${drop}: k1=${bez.k1.toFixed(3)} k2=${bez.k2.toFixed(3)} miss=${bez.touchMiss.toFixed(3)} P1.y=${bez.P1.y.toFixed(1)} tip=${bez.P3.y.toFixed(1)}`,
    );
    check(bez.P1.y <= bez.P3.y + 1e-6, `drop=${drop}: P1 not past tip`);
    check(true, `drop=${drop}: drafts (mono ok)`);
  } catch (e) {
    check(false, `drop=${drop}: ${(e as Error).message}`);
  }
}

console.log("\n=== Defaults ===");
{
  const style = withWaistband(
    {
      bottomWidth: 220,
      block: "classic",
      waistDrop: 0,
      crotchExtensionScale: 1,
      crotchArrivalAngle: DEFAULT_CROTCH_ARRIVAL_ANGLE,
      waistlineCurveFront: 0,
      frontWaistInset: 10,
    },
    0,
    "darted",
    body,
  );
  const { args } = frontArgs(style);
  const neu = frontCrotchCurve(args);
  const old = oldFrontHandles(args);
  const frontDelta = hausdorff(neu.points, old.points);
  check(
    frontDelta <= 1,
    `front Δ=${frontDelta.toFixed(3)} mm k1=${neu.k1.toFixed(3)} k2=${neu.k2.toFixed(3)} miss=${neu.touchMiss.toFixed(3)}`,
  );
  check(neu.touchMiss <= 0.5, `front defaults touch ≤0.5 (${neu.touchMiss.toFixed(3)})`);

  const b = trouserBackPoints(body, style);
  const back = draftBackCrotch(b);
  const backDelta = hausdorff(back.points, oldBackCurve(b));
  const leave = angleDeg(
    back.P1.x - back.P0.x,
    back.P1.y - back.P0.y,
    b.p19.x - b.p21.x,
    b.p19.y - b.p21.y,
  );
  const arriveH = Math.abs(
    (Math.atan2(back.P3.y - back.P2.y, back.P3.x - back.P2.x) * 180) / Math.PI,
  );
  check(leave < 0.05, `back leave ${leave.toFixed(4)}°`);
  check(
    arriveH < 0.05 || Math.abs(arriveH - 180) < 0.05,
    `back arrive H ${arriveH.toFixed(4)}°`,
  );
  check(
    back.touchMiss <= 0.5,
    `back miss=${back.touchMiss.toFixed(3)} k1=${back.k1.toFixed(3)} k2=${back.k2.toFixed(3)} Δ=${backDelta.toFixed(3)}`,
  );
}

console.log("\n=== Slider sweep ===");
{
  const drops = [0, 25, 50];
  const angles = [5, 14, 32, 45];
  const scales = [1, 0.7, 0.5, 0.4];
  const fwcs = [0, 12, 30];
  const cds: (number | undefined)[] = [0, 60, undefined];
  let swept = 0;
  let monoHits = 0;
  let otherHits = 0;
  let maxFrontMiss = 0;
  let maxBackMiss = 0;
  for (const drop of drops) {
    for (const a of angles) {
      for (const scale of scales) {
        for (const fwc of fwcs) {
          for (const cd of cds) {
            const raw: TrouserFrontStyle = {
              bottomWidth: 220,
              block: "classic",
              waistDrop: drop,
              crotchExtensionScale: scale,
              crotchArrivalAngle: a,
              waistlineCurveFront: fwc,
              frontWaistInset: 10,
            };
            if (cd !== undefined) raw.crotchStraightRun = cd;
            const style = withWaistband(raw, 0, "darted", body);
            swept++;
            try {
              draftTrouserFront(body, style);
              draftTrouserBack(body, style);
              const { args } = frontArgs(style);
              const bez = frontCrotchCurve(args);
              const bb = draftBackCrotch(trouserBackPoints(body, style));
              maxFrontMiss = Math.max(maxFrontMiss, bez.touchMiss);
              maxBackMiss = Math.max(maxBackMiss, bb.touchMiss);
            } catch (e) {
              const m = e instanceof Error ? e.message : String(e);
              if (m.includes("not monotonic")) monoHits++;
              else {
                otherHits++;
                if (otherHits <= 5) console.log("  other:", m.slice(0, 100));
              }
            }
          }
        }
      }
    }
  }
  console.log(
    `swept ${swept} (drop×arr×scale×fwc×cd); mono=${monoHits} other=${otherHits}; maxMiss front=${maxFrontMiss.toFixed(2)} back=${maxBackMiss.toFixed(2)}`,
  );
  check(monoHits === 0, "no mono failures");
}

console.log("\n=== Izzy-like ===");
{
  const style = withWaistband(
    {
      bottomWidth: 220,
      block: "classic",
      waistDrop: 25,
      crotchExtensionScale: 0.5,
      crotchArrivalAngle: 32,
      waistlineCurveFront: 0,
      frontWaistInset: 0,
      crotchStraightRun: 0,
    },
    0,
    "darted",
    body,
  );
  try {
    const front = draftTrouserFront(body, style);
    const back = draftTrouserBack(body, style);
    const { args } = frontArgs(style);
    const bez = frontCrotchCurve(args);
    const bb = draftBackCrotch(trouserBackPoints(body, style));
    console.log(
      `  front k1=${bez.k1.toFixed(3)} k2=${bez.k2.toFixed(3)} miss=${bez.touchMiss.toFixed(3)}`,
    );
    console.log(
      `  back  k1=${bb.k1.toFixed(3)} k2=${bb.k2.toFixed(3)} miss=${bb.touchMiss.toFixed(3)}`,
    );
    check(bez.P1.y <= bez.P3.y + 1e-6, "Izzy front P1 not past tip");
    check(true, "Izzy drafts mono-ok");

    const toPts = (outline: { at: Point }[]): Point[] =>
      outline.map((p) => ({ x: p.at.x, y: p.at.y }));
    const fPts = toPts(front.outline);
    const bPts = toPts(back.outline);
    const toSvg = (pts: Point[], stroke: string) => {
      const d = pts
        .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.2"/>`;
    };
    const all = [...fPts, ...bPts];
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of all) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = 20;
    writeFileSync(
      join("scripts", "crotch-loop-proof-izzy.svg"),
      `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}">
${toSvg(fPts, "#1a5fb4")}
${toSvg(bPts, "#c64600")}
<text x="${minX}" y="${minY - 6}" font-size="14">Izzy-like cd=0 arr=32 scale=0.5 drop=25</text>
</svg>`,
    );
    console.log("  wrote scripts/crotch-loop-proof-izzy.svg");
  } catch (e) {
    check(false, `Izzy: ${(e as Error).message}`);
  }
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " FAILURES"}`);
process.exitCode = failures === 0 ? 0 : 1;
