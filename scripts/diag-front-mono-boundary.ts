import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserFront,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });
let hits = 0;
for (const a of [45, 42, 40, 38, 35, 32]) {
  for (const drop of [0, 10, 20, 25, 30, 40, 50]) {
    const style = withWaistband(
      {
        bottomWidth: 220,
        block: "classic",
        waistDrop: drop,
        crotchExtensionScale: 1,
        crotchArrivalAngle: a,
        waistlineCurveFront: 0,
        frontWaistInset: 10,
        crotchDeparture: 0,
      },
      0,
      "darted",
      body,
    );
    try {
      draftTrouserFront(body, style);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.includes("not monotonic")) {
        console.log(`HIT a=${a} drop=${drop}`);
        hits++;
      } else {
        console.log(`OTHER a=${a} drop=${drop}: ${m.slice(0, 60)}`);
      }
    }
  }
}
console.log("hits", hits);
