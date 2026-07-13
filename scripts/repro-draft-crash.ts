/**
 * Reproduce slider/draft crash. Run: npx tsx scripts/repro-draft-crash.ts
 */
import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserBack,
  draftTrousers,
  draftBackCrotch,
  trouserBackPoints,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function tryDraft(label: string, style: TrouserFrontStyle) {
  try {
    const p = draftTrousers(body, style);
    console.log(`OK ${label}: ${p.pieces.map((x) => x.name).join(", ")}`);
  } catch (e) {
    console.error(`FAIL ${label}:`);
    console.error(e);
    if (e instanceof Error && e.stack) console.error(e.stack);
  }
}

const base: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
};

tryDraft("defaults", withWaistband(base, 0, "darted", body));
tryDraft("scale 0.5", withWaistband({ ...base, crotchExtensionScale: 0.5 }, 0, "darted", body));
tryDraft("waistDrop 25", withWaistband({ ...base, waistDrop: 25 }, 0, "darted", body));
tryDraft("shaped band 40", withWaistband(base, 40, "shaped", body));

try {
  const b = trouserBackPoints(body, base);
  const d = draftBackCrotch(b);
  console.log("draftBackCrotch ok", d.touchMiss, d.horizRun);
  const piece = draftTrouserBack(body, base);
  console.log("draftTrouserBack ok", piece.outline.length);
} catch (e) {
  console.error("FAIL back-only:");
  console.error(e);
  if (e instanceof Error && e.stack) console.error(e.stack);
}
