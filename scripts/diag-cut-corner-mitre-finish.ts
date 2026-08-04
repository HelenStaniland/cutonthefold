/**
 * Focused: cut vs sew outer corners after full finish (casing + hem turnback).
 * Run: npx tsx scripts/diag-cut-corner-mitre-finish.ts
 */
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import { applyTrouserHemTurnbackToPattern } from "../lib/geometry/trouserHemTurnback";
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
const f = (n: number) => n.toFixed(2);

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function unit(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** Square corner = V + up*T + sideNormal*SA. Mitre = offset-line intersection. */
function squareCorner(
  V: Point,
  up: Point,
  sideN: Point,
  T: number,
  sa: number,
): Point {
  return {
    x: V.x + up.x * T + sideN.x * sa,
    y: V.y + up.y * T + sideN.y * sa,
  };
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
const saPat = withSeamAllowance(draftTrousers(body, style), DEFAULT_SEAM_ALLOWANCE);
const cased = applyTrouserWaistCasingToPattern(saPat, d);
const finished = applyTrouserHemTurnbackToPattern(cased);

for (const label of ["cased", "finished"] as const) {
  const pat = label === "cased" ? cased : finished;
  console.log(`\n######## ${label} ########`);
  for (const name of ["Trouser front", "Trouser back"] as const) {
    const p = pat.pieces.find((x) => x.name === name)!;
    const cut = p.cuttingOutline!;
    const net = p.outline;
    const ref = p.waistCasing!;
    const midT = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
    const midF = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
    const up = unit(midF.x - midT.x, midF.y - midT.y);
    const along = (q: Point) =>
      (q.x - midT.x) * up.x + (q.y - midT.y) * up.y;
    const across = (q: Point) =>
      -(q.x - midT.x) * up.y + (q.y - midT.y) * up.x;

    // Find top-run on cut
    const onTop = (q: Point) => along(q) > d.totalExtension - 12;
    let i0 = 0;
    while (i0 < cut.length && !onTop(cut[i0]!)) i0++;
    // After hem, top may not start at 0 — search
    let topStart = -1;
    let topEnd = -1;
    for (let i = 0; i < cut.length; i++) {
      if (onTop(cut[i]!)) {
        if (topStart < 0) topStart = i;
        topEnd = i;
      } else if (topStart >= 0 && topEnd >= 0 && i > topEnd + 2) {
        // allow one wall vert; break after leaving top for good
        break;
      }
    }
    // Better: contiguous max-along run
    let bestStart = 0;
    let bestLen = 0;
    let curStart = 0;
    let curLen = 0;
    for (let i = 0; i < cut.length; i++) {
      if (onTop(cut[i]!)) {
        if (curLen === 0) curStart = i;
        curLen++;
        if (curLen > bestLen) {
          bestLen = curLen;
          bestStart = curStart;
        }
      } else {
        curLen = 0;
      }
    }
    topStart = bestStart;
    topEnd = bestStart + bestLen - 1;

    const cfCorner = cut[topStart]!;
    const sideCorner = cut[topEnd]!;
    const beforeCf = cut[(topStart - 1 + cut.length) % cut.length]!;
    const afterCf = cut[(topStart + 1) % cut.length]!;
    const beforeSide = cut[(topEnd - 1 + cut.length) % cut.length]!;
    const afterSide = cut[(topEnd + 1) % cut.length]!;

    // Sewing hem-fold ends
    const hemAlong = 2 * d.channelDepth;
    const hemPts = net
      .map((o, i) => ({ i, p: o.at, a: along(o.at) }))
      .filter((x) => Math.abs(x.a - hemAlong) < 5);
    const sewCf = hemPts[0]?.p;
    const sewSide = hemPts[hemPts.length - 1]?.p;

    console.log(`\n=== ${name} top[${topStart}..${topEnd}] n=${bestLen} ===`);
    console.log(
      `  CF cut[${topStart}] (${f(cfCorner.x)},${f(cfCorner.y)}) ` +
        `along=${f(along(cfCorner))} across=${f(across(cfCorner))}`,
    );
    console.log(
      `    ←wall (${f(beforeCf.x)},${f(beforeCf.y)}) Δ=(${f(cfCorner.x - beforeCf.x)},${f(cfCorner.y - beforeCf.y)})`,
    );
    console.log(
      `    →top  (${f(afterCf.x)},${f(afterCf.y)}) Δ=(${f(afterCf.x - cfCorner.x)},${f(afterCf.y - cfCorner.y)})`,
    );
    if (sewCf) {
      // Constant-offset of sew CF hem corner: sew + up*(T - hem) + outward SA-ish
      const cutAsOffsetSew = {
        x: sewCf.x + up.x * (d.totalExtension - hemAlong),
        y: sewCf.y + up.y * (d.totalExtension - hemAlong),
      };
      console.log(
        `    sew hem CF (${f(sewCf.x)},${f(sewCf.y)}) ` +
          `+up*10 → (${f(cutAsOffsetSew.x)},${f(cutAsOffsetSew.y)}) ` +
          `Δcut−that=(${f(cfCorner.x - cutAsOffsetSew.x)},${f(cfCorner.y - cutAsOffsetSew.y)}) dist=${f(dist(cfCorner, cutAsOffsetSew))}`,
      );
    }

    console.log(
      `  Side cut[${topEnd}] (${f(sideCorner.x)},${f(sideCorner.y)}) ` +
        `along=${f(along(sideCorner))} across=${f(across(sideCorner))}`,
    );
    console.log(
      `    ←top  (${f(beforeSide.x)},${f(beforeSide.y)}) Δ=(${f(sideCorner.x - beforeSide.x)},${f(sideCorner.y - beforeSide.y)})`,
    );
    console.log(
      `    →wall (${f(afterSide.x)},${f(afterSide.y)}) Δ=(${f(afterSide.x - sideCorner.x)},${f(afterSide.y - sideCorner.y)})`,
    );
    if (sewSide) {
      const cutAsOffsetSew = {
        x: sewSide.x + up.x * (d.totalExtension - hemAlong),
        y: sewSide.y + up.y * (d.totalExtension - hemAlong),
      };
      console.log(
        `    sew hem side (${f(sewSide.x)},${f(sewSide.y)}) ` +
          `+up*10 → (${f(cutAsOffsetSew.x)},${f(cutAsOffsetSew.y)}) ` +
          `Δcut−that=(${f(sideCorner.x - cutAsOffsetSew.x)},${f(sideCorner.y - cutAsOffsetSew.y)}) dist=${f(dist(sideCorner, cutAsOffsetSew))}`,
      );
    }

    // Chord from last top-interior to side corner — is it a long mitre-like jump?
    if (bestLen >= 2) {
      const jump = dist(beforeSide, sideCorner);
      console.log(
        `  last-top→sideCorner chord ${f(jump)} mm (huge = top extends past sew end)`,
      );
    }
  }
}
