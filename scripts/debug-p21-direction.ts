/**
 * Run: npx tsx scripts/debug-p21-direction.ts
 */
import { applyEase } from "../lib/types/measurements";
import { DEFAULT_FIT, easeForFit } from "../lib/pattern/fitPresets";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserBack,
  trouserBackPoints,
  withWaistband,
} from "../lib/patterns/trouserBlock";

const body = applyEase(bodyForSizeCode("12")!, easeForFit(DEFAULT_FIT)!);

// Before values (p18.x - backWaistStep) from prior verification
const BEFORE = {
  production: {
    p21: { x: -98.13, y: -20 },
    p18: { x: -80.63, y: 0 },
    wrCf: { x: -92.0, y: 14.5 },
    wrSide: { x: 152.3, y: 36.9 },
  },
};

function report(block: "production" | "classic", depth: number) {
  const style = withWaistband({ bottomWidth: 220, block }, depth, "shaped", body);
  const b = trouserBackPoints(body, style);
  const piece = draftTrouserBack(body, style);
  const ws = piece.outline.filter((o) => o.role === "waist").map((o) => o.at);
  const cf = ws[0];
  const side = ws[ws.length - 1];

  console.log(`\n${block} shaped depth ${depth} mm:`);
  console.log(`  p18: (${b.p18.x.toFixed(1)}, ${b.p18.y.toFixed(1)})`);
  console.log(`  p21: (${b.p21.x.toFixed(1)}, ${b.p21.y.toFixed(1)})  inboard of p18 (+x): ${b.p21.x > b.p18.x}`);
  console.log(`  p22: (${b.p22.x.toFixed(1)}, ${b.p22.y.toFixed(1)})`);
  console.log(`  21→22 slopes down: ${b.p22.y > b.p21.y && b.p22.x > b.p21.x}`);
  console.log(`  wr.cf:  (${cf.x.toFixed(1)}, ${cf.y.toFixed(1)})`);
  console.log(`  wr.side: (${side.x.toFixed(1)}, ${side.y.toFixed(1)})`);
  console.log(`  wr.cf.y < wr.side.y (CB higher): ${cf.y < side.y}`);
  return { cf, side, p21: b.p21 };
}

console.log("=== BEFORE (p18.x - backWaistStep) — recorded prior run ===");
console.log(`  p21: (${BEFORE.production.p21.x}, ${BEFORE.production.p21.y})  CB-side of p18: ${BEFORE.production.p21.x < BEFORE.production.p18.x}`);
console.log(`  wr.cf:  (${BEFORE.production.wrCf.x}, ${BEFORE.production.wrCf.y})`);
console.log(`  wr.side: (${BEFORE.production.wrSide.x}, ${BEFORE.production.wrSide.y})`);

console.log("\n=== AFTER (p18.x + backWaistStep) ===");
const after = report("production", 40);
report("classic", 40);

console.log("\n=== wr.side / wr.cf delta (production depth 40) ===");
console.log(`  wr.cf  Δx=${(after.cf.x - BEFORE.production.wrCf.x).toFixed(1)}  Δy=${(after.cf.y - BEFORE.production.wrCf.y).toFixed(1)}`);
console.log(`  wr.side Δx=${(after.side.x - BEFORE.production.wrSide.x).toFixed(1)}  Δy=${(after.side.y - BEFORE.production.wrSide.y).toFixed(1)}`);
