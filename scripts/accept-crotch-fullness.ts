/**
 * Acceptance: crotch fullness style params.
 * Run: npx tsx scripts/accept-crotch-fullness.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  ALDRICH_P46_SIZE_12_BODY,
  ALDRICH_P46_DEPTH0_STYLE,
} from "../lib/patterns/aldrichProductionVerify";
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
  resolveFrontCrotchFullness,
  resolveBackCrotchFullness,
  resolveWaistlineCurveFront,
  trouserFrontPoints,
  trouserBackPoints,
  withWaistband,
  DEFAULT_FRONT_CROTCH_FULLNESS,
  DEFAULT_BACK_CROTCH_FULLNESS,
  CROTCH_FULLNESS_MIN,
  CROTCH_FULLNESS_MAX,
  DEFAULT_CROTCH_ARRIVAL_ANGLE,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const outDir = join(process.cwd(), "tmp", "crotch-fullness");
mkdirSync(outDir, { recursive: true });

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

function mk(partial: Partial<TrouserFrontStyle> = {}): TrouserFrontStyle {
  return withWaistband(
    {
      bottomWidth: 220,
      block: "classic",
      waistDrop: 0,
      crotchExtensionScale: 1,
      crotchArrivalAngle: DEFAULT_CROTCH_ARRIVAL_ANGLE,
      ...partial,
    },
    0,
    "darted",
    body,
  );
}

function frontCurve(style: TrouserFrontStyle, b = body) {
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
    k1: resolveFrontCrotchFullness(style),
  });
}

// --- Defaults: byte-identical / 0 mm vs omitting fullness ---
const defExplicit = mk({
  frontCrotchFullness: DEFAULT_FRONT_CROTCH_FULLNESS,
  backCrotchFullness: DEFAULT_BACK_CROTCH_FULLNESS,
});
const defOmit = mk({});
const fExp = frontCurve(defExplicit);
const fOmit = frontCurve(defOmit);
const bExp = draftBackCrotch(trouserBackPoints(body, defExplicit), defExplicit);
const bOmit = draftBackCrotch(trouserBackPoints(body, defOmit), defOmit);
const frontΔ = hausdorff(fExp.points, fOmit.points);
const backΔ = hausdorff(bExp.points, bOmit.points);

// Aldrich textbook body
const afExp = frontCurve(ALDRICH_P46_DEPTH0_STYLE, ALDRICH_P46_SIZE_12_BODY);
const afOmit = frontCurve(
  { ...ALDRICH_P46_DEPTH0_STYLE, frontCrotchFullness: DEFAULT_FRONT_CROTCH_FULLNESS },
  ALDRICH_P46_SIZE_12_BODY,
);
const abExp = draftBackCrotch(
  trouserBackPoints(ALDRICH_P46_SIZE_12_BODY, ALDRICH_P46_DEPTH0_STYLE),
  ALDRICH_P46_DEPTH0_STYLE,
);
const abOmit = draftBackCrotch(
  trouserBackPoints(ALDRICH_P46_SIZE_12_BODY, {
    ...ALDRICH_P46_DEPTH0_STYLE,
    backCrotchFullness: DEFAULT_BACK_CROTCH_FULLNESS,
  }),
  {
    ...ALDRICH_P46_DEPTH0_STYLE,
    backCrotchFullness: DEFAULT_BACK_CROTCH_FULLNESS,
  },
);

console.log("=== Defaults (omit vs explicit Aldrich constants) ===");
console.log({
  frontΔMm: +frontΔ.toFixed(6),
  backΔMm: +backΔ.toFixed(6),
  frontK1: fOmit.k1,
  backK1: bOmit.k1,
  aldrichFrontΔMm: +hausdorff(afExp.points, afOmit.points).toFixed(6),
  aldrichBackΔMm: +hausdorff(abExp.points, abOmit.points).toFixed(6),
});

// --- Mono sweep fullness × arrival × scale ---
const fullnesses: number[] = [];
for (let v = CROTCH_FULLNESS_MIN; v <= CROTCH_FULLNESS_MAX + 1e-9; v += 0.1) {
  fullnesses.push(+v.toFixed(2));
}
if (!fullnesses.includes(1)) fullnesses.push(1);
const arrivals = [0, 14, 32, 45];
const scales = [0.5, 1.0];
let frontFail = 0;
let backFail = 0;
let combos = 0;
for (const ff of fullnesses) {
  for (const bf of fullnesses) {
    for (const arr of arrivals) {
      for (const sc of scales) {
        combos++;
        const st = mk({
          frontCrotchFullness: ff,
          backCrotchFullness: bf,
          crotchArrivalAngle: arr,
          crotchExtensionScale: sc,
          crotchStraightRun: 0,
        });
        try {
          draftTrouserFront(body, st);
        } catch (e) {
          frontFail++;
          console.error("front mono", { ff, arr, sc }, e);
        }
        try {
          draftTrouserBack(body, st);
        } catch (e) {
          backFail++;
          console.error("back mono", { bf, arr, sc }, e);
        }
      }
    }
  }
}
console.log("\n=== Mono sweep (fullness × arrival × scale) ===");
console.log({ combos, frontFail, backFail });

// --- Overlay render: Aldrich vs Cleo fullness, same Cleo corner ---
const cleoCorner = mk({
  crotchStraightRun: 0,
  crotchArrivalAngle: 32,
  crotchExtensionScale: 0.5,
  frontWaistInset: 0,
  frontCrotchFullness: DEFAULT_FRONT_CROTCH_FULLNESS,
});
const cleoFull = mk({
  ...cleoCorner,
  frontCrotchFullness: 0.84,
});
const aldrichPts = frontCurve(cleoCorner).points;
const cleoPts = frontCurve(cleoFull).points;

function svgOverlay(a: Point[], b: Point[], name: string) {
  const all = [...a, ...b];
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
  const poly = (pts: Point[], stroke: string, sw: number) =>
    `<polyline fill="none" stroke="${stroke}" stroke-width="${sw}" points="${pts
      .map((p) => `${tx(p).toFixed(2)},${ty(p).toFixed(2)}`)
      .join(" ")}" />`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}">
  <rect width="100%" height="100%" fill="#faf8f5"/>
  ${poly(a, "#1a5f7a", 1.5)}
  ${poly(b, "#c45c26", 1.5)}
  <text x="12" y="18" font-family="sans-serif" font-size="11" fill="#1a5f7a">Aldrich fullness 0.6175</text>
  <text x="12" y="34" font-family="sans-serif" font-size="11" fill="#c45c26">Cleo fullness 0.84</text>
</svg>`;
  writeFileSync(join(outDir, name), svg);
}

svgOverlay(aldrichPts, cleoPts, "front-fullness-overlay.svg");
console.log("\n=== Cleo corner (run=0, arr=32°, scale=0.5, inset=0) ===");
console.log({
  aldrichK1: frontCurve(cleoCorner).k1,
  cleoK1: frontCurve(cleoFull).k1,
  hausdorffMm: +hausdorff(aldrichPts, cleoPts).toFixed(3),
  svg: join(outDir, "front-fullness-overlay.svg"),
});

console.log("\nresolve check", {
  frontDefault: resolveFrontCrotchFullness({}),
  backDefault: resolveBackCrotchFullness({}),
  frontClampHi: resolveFrontCrotchFullness({ frontCrotchFullness: 1.5 }),
  frontClampLo: resolveFrontCrotchFullness({ frontCrotchFullness: 0.05 }),
});
