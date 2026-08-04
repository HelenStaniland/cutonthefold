/**
 * Compare cut vs sewing at casing top-outer corners (mitre vs square L).
 * Run: npx tsx scripts/diag-cut-vs-sew-corner.ts
 */
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import {
  applyTrouserWaistCasingToPattern,
  resolveCasingDepths,
} from "../lib/geometry/trouserWaistCasing";
import { CARGO_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrousers,
  withWaistband,
} from "../lib/patterns/trouserBlock";

const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const f = (n: number) => n.toFixed(2);

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function turnAngle(a: Point, b: Point, c: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const ab = Math.hypot(abx, aby) || 1;
  const bc = Math.hypot(bcx, bcy) || 1;
  const cos = Math.max(-1, Math.min(1, (abx * bcx + aby * bcy) / (ab * bc)));
  return (Math.acos(cos) * 180) / Math.PI;
}

const body = applyEase(
  { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN },
  CARGO_TROUSER_STYLE.ease,
);
const style = withWaistband(
  {
    bottomWidth: CARGO_TROUSER_STYLE.legBottomWidth,
    block: blockFromWaistDrop(CARGO_TROUSER_STYLE.waistDrop),
    waistDrop: CARGO_TROUSER_STYLE.waistDrop,
    backHemShape: CARGO_TROUSER_STYLE.backHemShape,
    frontWaistInset: 0,
    waistTaper: 0,
    pocketFront: "slant" as const,
  },
  0,
  "shaped",
  body,
);

const d = resolveCasingDepths(25);
const sa = withSeamAllowance(draftTrousers(body, style), DEFAULT_SEAM_ALLOWANCE);
const cased = applyTrouserWaistCasingToPattern(sa, d);

for (const name of ["Trouser front", "Trouser back"] as const) {
  const p = cased.pieces.find((x) => x.name === name)!;
  const cut = p.cuttingOutline!;
  const net = p.outline.map((o) => o.at);
  const ref = p.waistCasing!;
  const midT = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
  const midF = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
  const upLen = Math.hypot(midF.x - midT.x, midF.y - midT.y) || 1;
  const up = { x: (midF.x - midT.x) / upLen, y: (midF.y - midT.y) / upLen };
  const along = (q: Point) =>
    (q.x - midT.x) * up.x + (q.y - midT.y) * up.y;

  console.log(`\n=== ${name} ===`);
  console.log(`totalExt=${d.totalExtension} hemDepth=${2 * d.channelDepth}`);

  // Cut: verts near top (along ≈ totalExt)
  console.log("CUT verts near top edge (along ≈ totalExt ± 5):");
  for (let i = 0; i < cut.length; i++) {
    const a = along(cut[i]!);
    if (a > d.totalExtension - 8) {
      const prev = cut[(i - 1 + cut.length) % cut.length]!;
      const next = cut[(i + 1) % cut.length]!;
      const ang = turnAngle(prev, cut[i]!, next);
      console.log(
        `  cut[${i}] (${f(cut[i]!.x)},${f(cut[i]!.y)}) along=${f(a)} ` +
          `turn=${f(ang)}°  ΔfromPrev=(${f(cut[i]!.x - prev.x)},${f(cut[i]!.y - prev.y)})`,
      );
    }
  }

  // Also print first ~5 and last ~3 of cut (CF corner / close)
  console.log("CUT head (CF corner region):");
  for (let i = 0; i < Math.min(5, cut.length); i++) {
    const prev = cut[(i - 1 + cut.length) % cut.length]!;
    console.log(
      `  cut[${i}] (${f(cut[i]!.x)},${f(cut[i]!.y)}) along=${f(along(cut[i]!))} ` +
        `fromPrev Δ=(${f(cut[i]!.x - prev.x)},${f(cut[i]!.y - prev.y)}) dist=${f(dist(prev, cut[i]!))}`,
    );
  }

  // Sewing: verts near hem fold (along ≈ 2*channel)
  const hemAlong = 2 * d.channelDepth;
  console.log(`SEWING verts near hem fold (along ≈ ${hemAlong} ± 5):`);
  for (let i = 0; i < net.length; i++) {
    const a = along(net[i]!);
    if (Math.abs(a - hemAlong) < 8 || a > hemAlong - 2) {
      const prev = net[(i - 1 + net.length) % net.length]!;
      const next = net[(i + 1) % net.length]!;
      const ang = turnAngle(prev, net[i]!, next);
      if (a > 5) {
        console.log(
          `  net[${i}] (${f(net[i]!.x)},${f(net[i]!.y)}) along=${f(a)} ` +
            `turn=${f(ang)}°  ΔfromPrev=(${f(net[i]!.x - prev.x)},${f(net[i]!.y - prev.y)})`,
        );
      }
    }
  }

  // Square reference: vertex + up*T + sideNormal*SA (parallelogram)
  // vs actual corner — show how far mitre sticks out past square
  const topStart = cut[0]!;
  let topEndIdx = 0;
  while (
    topEndIdx + 1 < cut.length &&
    along(cut[topEndIdx + 1]!) > d.totalExtension - 8
  ) {
    topEndIdx++;
  }
  const topEnd = cut[topEndIdx]!;
  const afterTop = cut[topEndIdx + 1]!;
  console.log(
    `Top run: cut[0]→cut[${topEndIdx}] then wall to cut[${topEndIdx + 1}]`,
  );
  console.log(
    `  topEnd (${f(topEnd.x)},${f(topEnd.y)}) → after (${f(afterTop.x)},${f(afterTop.y)}) ` +
      `Δ=(${f(afterTop.x - topEnd.x)},${f(afterTop.y - topEnd.y)})`,
  );
  // Is the corner a bevel? Compare angle at topEnd
  if (topEndIdx > 0) {
    const before = cut[topEndIdx - 1]!;
    console.log(
      `  angle at top-outer cut[${topEndIdx}]: ${f(turnAngle(before, topEnd, afterTop))}° ` +
        `(90° = square L; ~135° = 45° mitre bevel)`,
    );
  }
  if (cut.length > 2) {
    const last = cut[cut.length - 1]!;
    console.log(
      `  angle at CF cut[0]: ${f(turnAngle(last, topStart, cut[1]!))}°`,
    );
  }
}
