/** Leave/arrive angles at drop 0 and 5. */
import { applyEase } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftBackCrotch,
  trouserBackPoints,
  withWaistband,
  DEFAULT_CROTCH_ARRIVAL_ANGLE,
  WAISTLINE_CURVE_FRONT,
  DEFAULT_FRONT_WAIST_INSET,
} from "../lib/patterns/trouserBlock";

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function ang(vx: number, vy: number, wx: number, wy: number) {
  const c =
    (vx * wx + vy * wy) /
    (Math.hypot(vx, vy) * Math.hypot(wx, wy) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

for (const drop of [5, 0]) {
  const style = withWaistband(
    {
      bottomWidth: 220,
      block: "classic",
      waistDrop: 0,
      crotchExtensionScale: 0.5,
      crotchArrivalAngle: DEFAULT_CROTCH_ARRIVAL_ANGLE,
      waistlineCurveFront: WAISTLINE_CURVE_FRONT,
      frontWaistInset: DEFAULT_FRONT_WAIST_INSET,
      backCrotchDrop: drop,
    },
    0,
    "darted",
    body,
  );
  const b = trouserBackPoints(body, style);
  const d = draftBackCrotch(b);
  const leave = ang(
    d.P1.x - d.P0.x,
    d.P1.y - d.P0.y,
    b.p19.x - b.p21.x,
    b.p19.y - b.p21.y,
  );
  const arriveH = Math.abs(
    (Math.atan2(d.P3.y - d.P2.y, d.P3.x - d.P2.x) * 180) / Math.PI,
  );
  console.log(
    `drop=${drop} leave=${leave.toFixed(3)}° arriveDirAngle=${arriveH.toFixed(3)}° touch=${d.touchMiss.toFixed(3)}`,
  );
}
