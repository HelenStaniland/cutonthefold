import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  maxYokeDepth,
  maxBackShapedWaistDepth,
  waistbandDepthRange,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 80, hip: 50 });
console.log("hipDepth", body.hipDepth);
console.log("yokeCap", maxYokeDepth(body, "classic", 0));
console.log("backCap", maxBackShapedWaistDepth(body, "classic", 220, 0));
console.log("range", waistbandDepthRange("shaped", body, "classic", 220, 0));
