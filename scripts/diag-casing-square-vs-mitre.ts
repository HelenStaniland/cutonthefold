/**
 * Compare mitre vs square casing corners and side-wall SA.
 * Run: npx tsx scripts/diag-casing-square-vs-mitre.ts
 */
import {
  applyEase,
  type Point,
} from "../lib/types/measurements";
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
const SA = DEFAULT_SEAM_ALLOWANCE.seam;
const f = (n: number) => n.toFixed(3);

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function distToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
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
  const ref = p.waistCasing!;
  const cut = p.cuttingOutline!;
  const midT = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
  const midF = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
  const upLen = Math.hypot(midF.x - midT.x, midF.y - midT.y) || 1;
  const up = { x: (midF.x - midT.x) / upLen, y: (midF.y - midT.y) / upLen };

  const onTop = (q: Point) => {
    const along = (q.x - midT.x) * up.x + (q.y - midT.y) * up.y;
    return Math.abs(along - d.totalExtension) < 3;
  };
  let topCount = 0;
  while (topCount < cut.length && onTop(cut[topCount]!)) topCount++;

  const startCorner = cut[0]!;
  const endCorner = cut[topCount - 1]!;
  const afterTop = cut[topCount]!;
  const cfWaist = cut[cut.length - 1]!;
  const startV = ref.turndownSeam[0]!;
  const endV = ref.turndownSeam[ref.turndownSeam.length - 1]!;

  console.log(`\n=== ${name} ===`);
  console.log(
    `  startCorner ${f(startCorner.x)},${f(startCorner.y)}  ` +
      `alongUp from startV=${f((startCorner.x - startV.x) * up.x + (startCorner.y - startV.y) * up.y)}`,
  );
  console.log(
    `  expect square alongUp=${d.totalExtension}; CF wall gaps:`,
  );
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const q = {
      x: cfWaist.x + (startCorner.x - cfWaist.x) * t,
      y: cfWaist.y + (startCorner.y - cfWaist.y) * t,
    };
    // CF net: find outline points
    const o = p.outline;
    let iStart = 0;
    let best = Infinity;
    for (let k = 0; k < o.length; k++) {
      const dd = dist(o[k]!.at, startV);
      if (dd < best) {
        best = dd;
        iStart = k;
      }
    }
    const cfA = o[((iStart - 1) % o.length + o.length) % o.length]!.at;
    const gap = distToLine(q, cfA, startV);
    console.log(`    t=${t}: gap=${f(gap)}`);
  }
  console.log(
    `  side wall endCorner→afterTop; endV=${f(endV.x)},${f(endV.y)}`,
  );
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const q = {
      x: endCorner.x + (afterTop.x - endCorner.x) * t,
      y: endCorner.y + (afterTop.y - endCorner.y) * t,
    };
    console.log(`    t=${t}: pt ${f(q.x)},${f(q.y)}`);
  }
  console.log(
    `  |startCorner − (startV+up*ext)| xy extras: ` +
      `dx=${f(startCorner.x - (startV.x + up.x * d.totalExtension))} ` +
      `dy=${f(startCorner.y - (startV.y + up.y * d.totalExtension))}`,
  );
  console.log(
    `  |startCorner − cfWaist| = ${f(dist(startCorner, cfWaist))} ` +
      `(should be ~ext if wall // up)`,
  );
}
