/**
 * Run: npx tsx scripts/debug-back-waist-slope.ts
 */
import { applyEase } from "../lib/types/measurements";
import { DEFAULT_FIT, easeForFit } from "../lib/pattern/fitPresets";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserBack,
  draftTrouserFront,
  trouserBackPoints,
  withWaistband,
} from "../lib/patterns/trouserBlock";

const body = applyEase(bodyForSizeCode("12")!, easeForFit(DEFAULT_FIT)!);

function waistEnds(block: "production" | "classic", depth: number, mode: "shaped" | "darted") {
  const style = withWaistband(
    { bottomWidth: 220, block, waistbandMode: mode },
    depth,
    mode,
    body,
  );
  const b = trouserBackPoints(body, style);
  const piece = draftTrouserBack(body, style);
  const ws = piece.outline.filter((o) => o.role === "waist").map((o) => o.at);
  const cf = ws[0];
  const side = ws[ws.length - 1];
  const slopeOk = cf.y < side.y;
  console.log(
    `${block} ${mode} depth=${depth}: p21.y=${b.p21.y.toFixed(1)} p22.y=${b.p22.y.toFixed(1)} | ` +
      `wr.cf=(${cf.x.toFixed(1)},${cf.y.toFixed(1)}) wr.side=(${side.x.toFixed(1)},${side.y.toFixed(1)}) | ` +
      `Δy=${(side.y - cf.y).toFixed(1)} slope CB→side down: ${slopeOk}`,
  );
  draftTrouserFront(body, style);
  return slopeOk;
}

console.log("Back cut waist slope (wr.cf.y < wr.side.y = CB higher):\n");
let allOk = true;
for (const depth of [0, 30, 40]) {
  allOk = waistEnds("production", depth, depth === 0 ? "darted" : "shaped") && allOk;
}
waistEnds("classic", 40, "shaped");

const style = withWaistband({ bottomWidth: 220, block: "production" }, 40, "shaped", body);
const b = trouserBackPoints(body, style);
console.log(`\nBack crotch guide: (${b.guide.x.toFixed(1)}, ${b.guide.y.toFixed(1)}) from p16 (${b.p16.x.toFixed(1)}, ${b.p16.y.toFixed(1)})`);
console.log(`guide.x < p16.x (toward fork): ${b.guide.x < b.p16.x}`);

if (!allOk) process.exit(1);
