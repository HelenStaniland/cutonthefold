/**
 * Find styles where assertBackCbClearOfCrotch / draft throws.
 * Run: npx tsx scripts/repro-assert-throw.ts
 */
import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrousers,
  maxBackShapedWaistDepth,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

const cases: { label: string; style: TrouserFrontStyle }[] = [];

for (const drop of [0, 25, 50, 80]) {
  for (const scale of [1, 0.7, 0.5, 0.4]) {
    for (const depth of [0, 40, 80, 120, 160]) {
      cases.push({
        label: `drop=${drop} scale=${scale} depth=${depth}`,
        style: withWaistband(
          {
            bottomWidth: 220,
            block: "classic",
            waistDrop: drop,
            crotchExtensionScale: scale,
          },
          depth,
          depth === 0 ? "darted" : "shaped",
          body,
        ),
      });
    }
  }
}

let throws = 0;
for (const c of cases) {
  try {
    draftTrousers(body, c.style);
  } catch (e) {
    throws++;
    console.log("THROW", c.label);
    console.log(String(e));
    if (e instanceof Error && e.message.length < 500) console.log(e.message);
  }
}
console.log(`done: ${cases.length} cases, ${throws} throws`);

// Time a single TrousersView-like render body (what runs outside useMemo too)
const t0 = performance.now();
maxBackShapedWaistDepth(body, "classic", 220, 25);
maxBackShapedWaistDepth(body, "classic", 220, 25); // second call like depthRange
console.log(
  `two maxBackShapedWaistDepth calls: ${(performance.now() - t0).toFixed(0)} ms`,
);
