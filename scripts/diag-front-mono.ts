/**
 * Find when front crotch monotonicity fires; dump handles + style.
 * Run: npx tsx scripts/diag-front-mono.ts
 */
import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserFront,
  draftTrousers,
  frontCrotchCurve,
  frontCrotchExtension,
  frontCrotchTouch,
  resolveCrotchArrivalAngle,
  resolveCrotchExtensionScale,
  resolveCrotchStraightRun,
  resolveWaistlineCurveFront,
  resolveFrontWaistInset,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function tryStyle(label: string, style: TrouserFrontStyle) {
  try {
    draftTrouserFront(body, style);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("not monotonic")) {
      console.log(`OTHER ${label}: ${msg}`);
      return null;
    }
    return msg;
  }
}

function dump(style: TrouserFrontStyle, err: string) {
  const f = trouserFrontPoints(body, style);
  const H = body.hip;
  const R = f.p9.y;
  const D = f.p6.y;
  // Need wr.cf.y — draft fails, so approximate from scoop / resolve waist another way
  const scale = resolveCrotchExtensionScale(style);
  const scoop = resolveWaistlineCurveFront(style);
  const inset = resolveFrontWaistInset(style);
  // Try to get wr.cf via a partial path: frontWaistResolved isn't exported.
  // Use scoop as waistCfY when depth 0; with band, depth lowers CF.
  const depth = style.waistReduction ?? 0;
  // When draft fails inside frontCrotchPathToWaist, frontCrotchCurve already ran.
  // Call frontCrotchCurve directly with waistCfY guesses.
  const waistCfY = scoop + (depth > 0 ? depth : 0); // rough; refine below

  // Better: intercept by calling frontCrotchCurve with same args as draft
  // Read draftTrouserFront — uses wr.cf.y from frontWaistResolved.
  // Import isn't exported. Simulate: at depth 0, wr.cf.y ≈ scoop.
  const candidates = [scoop, 0, scoop + depth, depth];
  let bez: ReturnType<typeof frontCrotchCurve> | null = null;
  let usedY = scoop;
  for (const y of candidates) {
    const straightRun = resolveCrotchStraightRun(style, R, D, y);
    bez = frontCrotchCurve({
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
    usedY = y;
    // Check mono
    let yPrev = bez.P0.y;
    let bad = false;
    for (let i = 1; i <= 16; i++) {
      const t = i / 16;
      const u = 1 - t;
      const py =
        u * u * u * bez.P0.y +
        3 * u * u * t * bez.P1.y +
        3 * u * t * t * bez.P2.y +
        t * t * t * bez.P3.y;
      if (py + 1e-6 < yPrev) {
        bad = true;
        break;
      }
      yPrev = py;
    }
    if (bad) break;
  }

  if (!bez) return;
  const d1 = bez.P1.y - bez.P0.y;
  const d2 = Math.hypot(bez.P3.x - bez.P2.x, bez.P3.y - bez.P2.y);
  console.log("\n=== FAILURE ===");
  console.log("error:", err);
  console.log("style:", JSON.stringify(style, null, 2));
  console.log("resolved:");
  console.log("  waistCfY used:", usedY);
  console.log("  scoop:", scoop, "inset:", inset, "scale:", scale);
  console.log("  arrival:", resolveCrotchArrivalAngle(style));
  console.log(
    "  straightRun:",
    resolveCrotchStraightRun(style, R, D, usedY),
  );
  console.log("  extension:", frontCrotchExtension(H, scale));
  console.log("  touch:", frontCrotchTouch(H) * scale);
  console.log("  R:", R, "D:", D, "fork:", Math.abs(f.p5.x));
  console.log("P0:", bez.P0);
  console.log("P1:", bez.P1);
  console.log("P2:", bez.P2);
  console.log("P3:", bez.P3);
  console.log("d1 (P1.y-P0.y):", d1);
  console.log("d2 (|P3-P2|):", d2);
  console.log("k:", bez.k, "touchMiss:", bez.touchMiss);
  // Sample y(t)
  console.log("y(t):");
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const u = 1 - t;
    const py =
      u * u * u * bez.P0.y +
      3 * u * u * t * bez.P1.y +
      3 * u * t * t * bez.P2.y +
      t * t * t * bez.P3.y;
    console.log(`  t=${t.toFixed(4)} y=${py.toFixed(4)}`);
  }
}

// Sweep common UI styles
const sweeps: { label: string; style: TrouserFrontStyle }[] = [];

for (const cd of [0, 30, 60, 90, 120, 180, undefined]) {
  for (const fwc of [0, 12, 16, 30]) {
    for (const scale of [1, 0.7, 0.5, 0.4]) {
      for (const arrival of [5, 14, 32, 45]) {
        for (const drop of [0, 25]) {
          for (const inset of [0, 10, 20]) {
            const style: TrouserFrontStyle = {
              bottomWidth: 220,
              block: "classic",
              waistDrop: drop,
              crotchExtensionScale: scale,
              crotchArrivalAngle: arrival,
              waistlineCurveFront: fwc,
              frontWaistInset: inset,
              ...(cd !== undefined ? { crotchStraightRun: cd } : {}),
            };
            sweeps.push({
              label: `cd=${cd} fwc=${fwc} s=${scale} arr=${arrival} drop=${drop} in=${inset}`,
              style,
            });
          }
        }
      }
    }
  }
}

console.log(`sweeping ${sweeps.length} styles...`);
let found = 0;
for (const s of sweeps) {
  const err = tryStyle(s.label, withWaistband(s.style, 0, "darted", body));
  if (err) {
    found++;
    console.log("HIT", s.label);
    dump(withWaistband(s.style, 0, "darted", body), err);
    if (found >= 3) break;
  }
}
if (found === 0) {
  // Try shaped band depths
  console.log("no hit at depth 0; trying shaped bands...");
  for (const depth of [40, 80, 120]) {
    for (const cd of [0, 60, undefined]) {
      for (const scale of [1, 0.5]) {
        const style = withWaistband(
          {
            bottomWidth: 220,
            block: "classic",
            waistDrop: 25,
            crotchExtensionScale: scale,
            crotchArrivalAngle: 5,
            waistlineCurveFront: 30,
            frontWaistInset: 10,
            ...(cd !== undefined ? { crotchStraightRun: cd } : {}),
          },
          depth,
          "shaped",
          body,
        );
        const err = tryStyle(`shaped d=${depth} cd=${cd} s=${scale}`, style);
        if (err) {
          found++;
          console.log("HIT shaped");
          dump(style, err);
          break;
        }
      }
      if (found) break;
    }
    if (found) break;
  }
}

if (found === 0) {
  // draftTrousers path
  console.log("trying draftTrousers defaults...");
  try {
    draftTrousers(
      body,
      withWaistband(
        { bottomWidth: 220, block: "classic", waistDrop: 0 },
        0,
        "darted",
        body,
      ),
    );
    console.log("defaults OK");
  } catch (e) {
    console.log("defaults FAIL", e);
  }
}

console.log(`\nfound ${found} mono failures`);
