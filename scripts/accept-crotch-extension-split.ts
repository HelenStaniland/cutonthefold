/**
 * Acceptance: split front/back crotch extension scales + full Cleo preset.
 * Run: npx tsx scripts/accept-crotch-extension-split.ts
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
  aldrichBackCrotchOffset,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const outDir = join(process.cwd(), "tmp", "crotch-extension-split");
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

function outlinePts(piece: { outline: { at: Point }[] }): Point[] {
  return piece.outline.map((o) => o.at);
}

function mk(
  partial: Partial<TrouserFrontStyle>,
  b = body,
  depth = 0,
  mode: "darted" | "shaped" = "darted",
): TrouserFrontStyle {
  return withWaistband(
    {
      bottomWidth: 220,
      block: "classic",
      waistDrop: 0,
      ...partial,
    },
    depth,
    mode,
    b,
  );
}

// --- Critical: 1.0/1.0 identical to omitting both (Aldrich) ---
const omit = mk({});
const both1 = mk({
  frontCrotchExtensionScale: 1,
  backCrotchExtensionScale: 1,
});
const fOmit = draftTrouserFront(body, omit);
const fBoth = draftTrouserFront(body, both1);
const bOmit = draftTrouserBack(body, omit);
const bBoth = draftTrouserBack(body, both1);
const fpOmit = trouserFrontPoints(body, omit);
const fpBoth = trouserFrontPoints(body, both1);
const bpOmit = trouserBackPoints(body, omit);
const bpBoth = trouserBackPoints(body, both1);

console.log("=== Scales 1.0/1.0 vs omit (must be 0 mm) ===");
console.log({
  frontOutlineΔ: +hausdorff(outlinePts(fOmit), outlinePts(fBoth)).toFixed(6),
  backOutlineΔ: +hausdorff(outlinePts(bOmit), outlinePts(bBoth)).toFixed(6),
  p9Δ: Math.hypot(fpOmit.p9.x - fpBoth.p9.x, fpOmit.p9.y - fpBoth.p9.y),
  p23Δ: Math.hypot(bpOmit.p23.x - bpBoth.p23.x, bpOmit.p23.y - bpBoth.p23.y),
});

// Algebra check: at 1/1, |p9.x − p23.x| = Aldrich frontExt/2 + add
{
  const H = body.hip;
  // classic block backCrotchAdd from trouserBlockSpec internals: 8 - 3*s
  // Prefer measuring from points vs importing private spec.
  const got = Math.abs(fpOmit.p9.x - bpOmit.p23.x);
  const frontExt1 = Math.abs(fpOmit.p9.x) - Math.abs(fpOmit.p5.x);
  // backCrotchAdd = got - frontExt1/2
  const impliedAdd = got - frontExt1 / 2;
  const expected = aldrichBackCrotchOffset(H, impliedAdd);
  console.log("Aldrich offset check", {
    frontExt1Mm: +frontExt1.toFixed(3),
    p9toP23Mm: +got.toFixed(3),
    impliedAddMm: +impliedAdd.toFixed(3),
    rebuildMm: +expected.toFixed(3),
    Δ: +(Math.abs(expected - got)).toFixed(6),
  });
}

// --- Cleo preset extensions in cm ---
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
const fCleo = trouserFrontPoints(cleoBody, Cleo);
const bCleo = trouserBackPoints(cleoBody, Cleo);
const fork = Math.abs(fCleo.p5.x);
const frontExtMm = Math.abs(fCleo.p9.x) - fork; // beyond fork
const backExtMm = Math.abs(bCleo.p23.x - bCleo.p16.x); // tip to fork-line CB (p16)

console.log("\n=== Cleo preset extensions (owner drafted hip) ===");
console.log({
  draftedHipCm: (cleoBody.hip / 10).toFixed(1),
  frontExtCm: (frontExtMm / 10).toFixed(2),
  backExtP16toP23Cm: (backExtMm / 10).toFixed(2),
  // Also report offset from CF fork (p5) for front — same as frontExt
  targetFrontCm: 4.5,
  targetBackCm: 14.0,
});

// --- Mono sweep: both scales × both fullness ---
const scales = [0.4, 0.51, 0.875, 1.0];
const fullness = [0.2, 0.3, 0.6175, 0.84, 1.0];
let frontFail = 0;
let backFail = 0;
let combos = 0;
for (const fs of scales) {
  for (const bs of scales) {
    for (const ff of fullness) {
      for (const bf of fullness) {
        combos++;
        const st = mk({
          frontCrotchExtensionScale: fs,
          backCrotchExtensionScale: bs,
          frontCrotchFullness: ff,
          backCrotchFullness: bf,
          crotchStraightRun: 0,
          crotchArrivalAngle: 32,
        });
        try {
          draftTrouserFront(body, st);
        } catch (e) {
          frontFail++;
          console.error("front", { fs, bs, ff, bf }, e);
        }
        try {
          draftTrouserBack(body, st);
        } catch (e) {
          backFail++;
          console.error("back", { fs, bs, ff, bf }, e);
        }
      }
    }
  }
}
console.log("\n=== Mono sweep ===");
console.log({ combos, frontFail, backFail });

// --- Renders full Cleo ---
function svgPiece(
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
  const pad = 30;
  const w = maxX - minX + 2 * pad;
  const h = maxY - minY + 2 * pad;
  const tx = (p: Point) => p.x - minX + pad;
  const ty = (p: Point) => p.y - minY + pad;
  const poly = (pts: Point[], stroke: string) =>
    `<polyline fill="none" stroke="${stroke}" stroke-width="1.2" points="${pts
      .map((p) => `${tx(p).toFixed(1)},${ty(p).toFixed(1)}`)
      .join(" ")}" />`;
  const dots = marks
    .map(
      (m) =>
        `<circle cx="${tx(m.p).toFixed(1)}" cy="${ty(m.p).toFixed(1)}" r="2.2" fill="#c45"/><text x="${tx(m.p) + 4}" y="${ty(m.p) - 4}" font-size="9" fill="#333">${m.label}</text>`,
    )
    .join("\n");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}">
  <rect width="100%" height="100%" fill="#faf8f5"/>
  ${poly(front, "#1a5f7a")}
  ${poly(back, "#2d6a4f")}
  ${dots}
</svg>`;
  writeFileSync(join(outDir, name), svg);
}

const frontDraft = draftTrouserFront(cleoBody, Cleo);
const backDraft = draftTrouserBack(cleoBody, Cleo);
svgPiece(
  "cleo-full-preset.svg",
  outlinePts(frontDraft),
  outlinePts(backDraft),
  [
    { p: fCleo.p5, label: "p5" },
    { p: fCleo.p9, label: "p9" },
    { p: bCleo.p16, label: "p16" },
    { p: bCleo.p23, label: "p23" },
    { p: bCleo.p19, label: "p19" },
  ],
);

// Crotch close-ups
function crotchOnly(
  name: string,
  pts: Point[],
  marks: { p: Point; label: string }[],
  color: string,
) {
  const all = [...pts, ...marks.map((m) => m.p)];
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
  const crotchRole = frontDraft.outline.filter((o) => o.role === "crotch");
  void crotchRole;
  const poly = `<polyline fill="none" stroke="${color}" stroke-width="1.5" points="${pts
    .map((p) => `${tx(p).toFixed(1)},${ty(p).toFixed(1)}`)
    .join(" ")}" />`;
  const dots = marks
    .map(
      (m) =>
        `<circle cx="${tx(m.p).toFixed(1)}" cy="${ty(m.p).toFixed(1)}" r="2.5" fill="#c45"/><text x="${tx(m.p) + 3}" y="${ty(m.p) - 3}" font-size="9">${m.label}</text>`,
    )
    .join("\n");
  writeFileSync(
    join(outDir, name),
    `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}"><rect width="100%" height="100%" fill="#faf8f5"/>${poly}${dots}</svg>`,
  );
}

const frontCrotch = frontDraft.outline
  .filter((o) => o.role === "crotch")
  .map((o) => o.at);
const backCrotch = backDraft.outline
  .filter((o) => o.role === "crotch")
  .map((o) => o.at);
crotchOnly(
  "cleo-front-crotch.svg",
  frontCrotch,
  [
    { p: fCleo.p5, label: "p5" },
    { p: fCleo.p9, label: "p9" },
  ],
  "#1a5f7a",
);
crotchOnly(
  "cleo-back-crotch.svg",
  backCrotch,
  [
    { p: bCleo.p16, label: "p16" },
    { p: bCleo.p23, label: "p23" },
    { p: bCleo.p19, label: "p19" },
  ],
  "#2d6a4f",
);

console.log("\nSVGs →", outDir);
