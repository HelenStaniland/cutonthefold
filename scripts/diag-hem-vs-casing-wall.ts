/**
 * Probe: hem turnback cut indices vs casing wall survival.
 * Run: npx tsx scripts/diag-hem-vs-casing-wall.ts
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
const front = cased.pieces.find((p) => p.name === "Trouser front")!;
const cut = front.cuttingOutline!;
const map = front.netToCutIndex!;

console.log(`cut n=${cut.length} net n=${front.outline.length} map n=${map.length}`);
console.log("cut-only indices (not in map values):");
const mapped = new Set(map);
for (let i = 0; i < cut.length; i++) {
  if (!mapped.has(i)) {
    console.log(`  cut[${i}] (${f(cut[i]!.x)},${f(cut[i]!.y)})`);
  }
}
console.log("\nLook for wall at x≈170:");
for (let i = 0; i < cut.length; i++) {
  if (Math.abs(cut[i]!.x - 170) < 0.5) {
    console.log(`  cut[${i}] (${f(cut[i]!.x)},${f(cut[i]!.y)}) mapped=${mapped.has(i)}`);
  }
}
