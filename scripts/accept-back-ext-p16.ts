/**
 * Acceptance: back extension anchored to p16.
 * Run: npx tsx scripts/accept-back-ext-p16.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { CLEO_PRESET } from "../lib/pattern/blockPresets";
import {
  draftTrouserFront,
  draftTrouserBack,
  trouserFrontPoints,
  trouserBackPoints,
  withWaistband,
  aldrichBackExtension,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const outDir = join(process.cwd(), "tmp", "back-ext-p16");
mkdirSync(outDir, { recursive: true });

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
const cleoBody = applyEase({ ...chart, hip: 1100 }, CLEO_PRESET.measured.ease);

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

function mk(
  partial: Partial<TrouserFrontStyle>,
  b = body,
  depth = 0,
  mode: "darted" | "shaped" = "darted",
) {
  return withWaistband(
    { bottomWidth: 220, block: "classic", waistDrop: 0, ...partial },
    depth,
    mode,
    b,
  );
}

const H = body.hip;
const fork = H / 12 + 20;
const baseline = aldrichBackExtension(H, fork, 8);
console.log("=== aldrichBackExtension ===");
console.log({ baselineMm: baseline, equals15977: Math.abs(baseline - 159.77083333333331) < 1e-9 });

const omit = mk({});
const both1 = mk({
  frontCrotchExtensionScale: 1,
  backCrotchExtensionScale: 1,
});
const frontOnly = mk({
  frontCrotchExtensionScale: 0.55,
  backCrotchExtensionScale: 1,
});

function span(style: TrouserFrontStyle, b = body) {
  const bp = trouserBackPoints(b, style);
  const fp = trouserFrontPoints(b, style);
  return {
    p16toP23: Math.abs(bp.p16.x - bp.p23.x),
    p5toP9: Math.abs(fp.p5.x - fp.p9.x),
    p9: fp.p9,
    p23: bp.p23,
  };
}

const sOmit = span(omit);
const sBoth = span(both1);
const sFront = span(frontOnly);

console.log("\n=== Critical: 1.0/1.0 vs omit ===");
console.log({
  p16toP23_omit: sOmit.p16toP23,
  p16toP23_both1: sBoth.p16toP23,
  frontOutlineΔ: hausdorff(
    draftTrouserFront(body, omit).outline.map((o) => o.at),
    draftTrouserFront(body, both1).outline.map((o) => o.at),
  ),
  backOutlineΔ: hausdorff(
    draftTrouserBack(body, omit).outline.map((o) => o.at),
    draftTrouserBack(body, both1).outline.map((o) => o.at),
  ),
  p9Δ: Math.hypot(sOmit.p9.x - sBoth.p9.x, sOmit.p9.y - sBoth.p9.y),
  p23Δ: Math.hypot(sOmit.p23.x - sBoth.p23.x, sOmit.p23.y - sBoth.p23.y),
});

console.log("\n=== Front 0.55 / back 1.0 (bug fix) ===");
console.log({
  p16toP23: sFront.p16toP23,
  unchangedFromAldrich: Math.abs(sFront.p16toP23 - sOmit.p16toP23) < 1e-9,
  frontExt: sFront.p5toP9,
});

const m = CLEO_PRESET.measured;
const Cleo = mk(
  {
    crotchStraightRun: m.crotchStraightRun,
    frontWaistInset: m.frontWaistInset,
    crotchArrivalAngle: m.crotchArrivalAngle,
    backCrotchDrop: m.backCrotchDrop,
    frontCrotchFullness: m.frontCrotchFullness,
    backCrotchFullness: m.backCrotchFullness,
    frontCrotchExtensionScale: m.frontCrotchExtensionScale,
    backCrotchExtensionScale: m.backCrotchExtensionScale,
    waistDrop: m.waistDrop,
    waistlineCurveFront: CLEO_PRESET.provisional.waistlineCurveFront,
  },
  cleoBody,
  m.waistbandDepth,
  m.waistbandMode,
);
const sCleo = span(Cleo, cleoBody);
console.log("\n=== Cleo preset (0.55 / 0.88) ===");
console.log({
  frontExt_p5toP9: sCleo.p5toP9,
  backExt_p16toP23: sCleo.p16toP23,
  scales: {
    front: m.frontCrotchExtensionScale,
    back: m.backCrotchExtensionScale,
  },
});

// mono
let frontFail = 0,
  backFail = 0,
  combos = 0;
for (const fs of [0.4, 0.55, 1]) {
  for (const bs of [0.4, 0.88, 1]) {
    for (const ff of [0.3, 0.84, 1]) {
      combos++;
      const st = mk({
        frontCrotchExtensionScale: fs,
        backCrotchExtensionScale: bs,
        frontCrotchFullness: ff,
        backCrotchFullness: 0.3,
        crotchStraightRun: 0,
        crotchArrivalAngle: 32,
      });
      try {
        draftTrouserFront(body, st);
      } catch {
        frontFail++;
      }
      try {
        draftTrouserBack(body, st);
      } catch {
        backFail++;
      }
    }
  }
}
console.log("\n=== Mono ===", { combos, frontFail, backFail });

function writeSvg(
  name: string,
  front: Point[],
  back: Point[],
  marks: { p: Point; label: string }[],
) {
  const all = [...front, ...back, ...marks.map((m) => m.p)];
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
  const pad = 25;
  const w = maxX - minX + 2 * pad;
  const h = maxY - minY + 2 * pad;
  const tx = (p: Point) => p.x - minX + pad;
  const ty = (p: Point) => p.y - minY + pad;
  const poly = (pts: Point[], c: string) =>
    `<polyline fill="none" stroke="${c}" stroke-width="1.2" points="${pts.map((p) => `${tx(p).toFixed(1)},${ty(p).toFixed(1)}`).join(" ")}" />`;
  const dots = marks
    .map(
      (m) =>
        `<circle cx="${tx(m.p).toFixed(1)}" cy="${ty(m.p).toFixed(1)}" r="2.2" fill="#c45"/><text x="${tx(m.p) + 4}" y="${ty(m.p) - 3}" font-size="9">${m.label}</text>`,
    )
    .join("");
  writeFileSync(
    join(outDir, name),
    `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}"><rect width="100%" height="100%" fill="#faf8f5"/>${poly(front, "#1a5f7a")}${poly(back, "#2d6a4f")}${dots}</svg>`,
  );
}

const fD = draftTrouserFront(cleoBody, Cleo);
const bD = draftTrouserBack(cleoBody, Cleo);
const fP = trouserFrontPoints(cleoBody, Cleo);
const bP = trouserBackPoints(cleoBody, Cleo);
writeSvg(
  "cleo-full.svg",
  fD.outline.map((o) => o.at),
  bD.outline.map((o) => o.at),
  [
    { p: fP.p5, label: "p5" },
    { p: fP.p9, label: "p9" },
    { p: bP.p16, label: "p16" },
    { p: bP.p23, label: "p23" },
  ],
);
writeSvg(
  "cleo-front-crotch.svg",
  fD.outline.filter((o) => o.role === "crotch").map((o) => o.at),
  [],
  [
    { p: fP.p5, label: "p5" },
    { p: fP.p9, label: "p9" },
  ],
);
writeSvg(
  "cleo-back-crotch.svg",
  [],
  bD.outline.filter((o) => o.role === "crotch").map((o) => o.at),
  [
    { p: bP.p16, label: "p16" },
    { p: bP.p23, label: "p23" },
    { p: bP.p19, label: "p19" },
  ],
);
console.log("\nSVGs →", outDir);
