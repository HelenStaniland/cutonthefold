/**
 * Acceptance: three-part back crotch.
 * Run: npx tsx scripts/verify-back-crotch-three-part.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { polylineLength, catmullRomCentripetal } from "../lib/geometry/curves";
import {
  BACK_CROTCH_HORIZ_RUN_FRAC,
  draftBackCrotch,
  draftTrouserBack,
  draftTrouserFront,
  trouserBackPoints,
  trouserFrontPoints,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  formatAldrichReport,
  verifyAldrichProductionDepth0,
  verifyCrotchTouchFormula,
  verifyFrontWaistSeamBow,
} from "../lib/patterns/aldrichProductionVerify";

function angleDeg(dx: number, dy: number) {
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function turnDeg(a: Point, b: Point, c: Point): number {
  const a1 = angleDeg(b.x - a.x, b.y - a.y);
  const a2 = angleDeg(c.x - b.x, c.y - b.y);
  let d = a2 - a1;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function svgPath(pts: Point[]): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

function rolePts(
  piece: ReturnType<typeof draftTrouserBack>,
  role: string,
): Point[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at);
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

const base: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
};

console.log("=== Owner body, scale 1.0 ===");
{
  const b = trouserBackPoints(body, base);
  const d = draftBackCrotch(b);
  const u = {
    x: b.p19.x - b.p21.x,
    y: b.p19.y - b.p21.y,
  };
  const uLen = Math.hypot(u.x, u.y);
  const uHat = { x: u.x / uLen, y: u.y / uLen };
  const leave = {
    x: d.P1.x - d.P0.x,
    y: d.P1.y - d.P0.y,
  };
  const leaveLen = Math.hypot(leave.x, leave.y);
  const leaveHat = { x: leave.x / leaveLen, y: leave.y / leaveLen };
  const leaveDot = leaveHat.x * uHat.x + leaveHat.y * uHat.y;
  const leaveAngle = (Math.acos(Math.max(-1, Math.min(1, leaveDot))) * 180) / Math.PI;

  const arrive = { x: d.P3.x - d.P2.x, y: d.P3.y - d.P2.y };
  const arriveAngle = Math.abs(angleDeg(arrive.x, arrive.y)); // 0 or 180 = horizontal
  const arriveFromHoriz = Math.min(arriveAngle, Math.abs(180 - arriveAngle), Math.abs(arriveAngle - 0));

  // Turn at K on outline path: p23 → K → first bez sample after K
  const pts = d.points;
  const iK = pts.findIndex(
    (p) => Math.hypot(p.x - d.K.x, p.y - d.K.y) < 0.05,
  );
  const turnK =
    iK > 0 && iK < pts.length - 1
      ? turnDeg(pts[iK - 1]!, pts[iK]!, pts[iK + 1]!)
      : NaN;

  // Turn at p19: sample before p19, p19, p21
  const i19 = pts.findIndex(
    (p) => Math.hypot(p.x - b.p19.x, p.y - b.p19.y) < 0.05,
  );
  const turn19 =
    i19 > 0 && i19 < pts.length - 1
      ? turnDeg(pts[i19 - 1]!, pts[i19]!, pts[i19 + 1]!)
      : NaN;

  const extent = Math.abs(b.p19.x - b.p23.x);
  console.log(`horiz extent |p19.x−p23.x| = ${extent.toFixed(3)} mm`);
  console.log(
    `horizRun = ${BACK_CROTCH_HORIZ_RUN_FRAC} × extent = ${d.horizRun.toFixed(3)} mm`,
  );
  console.log(`K = (${d.K.x.toFixed(3)}, ${d.K.y.toFixed(3)})`);
  console.log(`k = ${d.k.toFixed(4)}, touchMiss = ${d.touchMiss.toFixed(4)} mm`);
  console.log(`leave vs CB dir at p19: ${leaveAngle.toFixed(3)}° (want ~0)`);
  console.log(`arrive vs horizontal at K: ${arriveFromHoriz.toFixed(3)}° (want ~0)`);
  console.log(`polyline turn at K: ${turnK.toFixed(3)}°`);
  console.log(`polyline turn at p19: ${turn19.toFixed(3)}°`);
}

console.log("\n=== Inseam lengths (23–24 = 5 mm) ===");
{
  const f = trouserFrontPoints(body, base);
  const b = trouserBackPoints(body, base);
  const frontPiece = draftTrouserFront(body, base);
  const backPiece = draftTrouserBack(body, base);
  const frontIn = rolePts(frontPiece, "inseam");
  const backIn = rolePts(backPiece, "inseam");
  const fLen = polylineLength(frontIn);
  const bLen = polylineLength(backIn);
  console.log(`front inseam = ${fLen.toFixed(3)} mm`);
  console.log(`back inseam  = ${bLen.toFixed(3)} mm`);
  console.log(`Δ (back − front) = ${(bLen - fLen).toFixed(3)} mm`);
  console.log(`p24.y − p23.y = ${(b.p24.y - b.p23.y).toFixed(3)} mm`);
  console.log(`p9.y = ${f.p9.y.toFixed(3)}, p23.y = ${b.p23.y.toFixed(3)}`);
}

console.log("\n=== Extension scales ===");
for (const scale of [1.0, 0.7, 0.5]) {
  const style: TrouserFrontStyle = { ...base, crotchExtensionScale: scale };
  const b = trouserBackPoints(body, style);
  const d = draftBackCrotch(b);
  const u = normalize({ x: b.p19.x - b.p21.x, y: b.p19.y - b.p21.y });
  const leave = normalize({ x: d.P1.x - d.P0.x, y: d.P1.y - d.P0.y });
  const leaveAngle =
    (Math.acos(Math.max(-1, Math.min(1, leave.x * u.x + leave.y * u.y))) *
      180) /
    Math.PI;
  const arrive = { x: d.P3.x - d.P2.x, y: d.P3.y - d.P2.y };
  const ah = Math.abs(angleDeg(arrive.x, arrive.y));
  const fromH = Math.min(ah, Math.abs(180 - ah));
  console.log(
    `scale ${scale}: horizRun=${d.horizRun.toFixed(1)} touchMiss=${d.touchMiss.toFixed(3)} leave=${leaveAngle.toFixed(2)}° arriveH=${fromH.toFixed(2)}°`,
  );
}

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-12) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

console.log("\n=== Max delta vs old catmullRomCentripetal ===");
{
  const b = trouserBackPoints(body, base);
  const oldPts = catmullRomCentripetal([b.p24, b.guide, b.p19, b.p21]);
  const newPts = draftBackCrotch(b).points;
  const oneWay = (a: Point[], bpts: Point[]) => {
    let m = 0;
    for (const p of a) {
      let best = Infinity;
      for (const q of bpts) {
        best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
      }
      m = Math.max(m, best);
    }
    return m;
  };
  const hd = Math.max(oneWay(oldPts, newPts), oneWay(newPts, oldPts));
  console.log(`Hausdorff old Catmull ↔ new three-part: ${hd.toFixed(3)} mm`);
}

console.log("\n=== verify:aldrich (report only, no re-baseline) ===");
{
  const touchChecks = verifyCrotchTouchFormula({ assert: false });
  const bowChecks = verifyFrontWaistSeamBow({ assert: false });
  const aldrichChecks = verifyAldrichProductionDepth0({ assert: false });
  const checks = [...touchChecks, ...bowChecks, ...aldrichChecks];
  const fails = checks.filter((c) => !c.pass);
  console.log(formatAldrichReport(checks));
  console.log(`\nFailures: ${fails.length}`);
  for (const f of fails) {
    console.log(
      `  FAIL ${f.id}: computed=${f.computed} expected=${f.expected}${f.note ? ` (${f.note})` : ""}`,
    );
  }
}

function writeSvg(scale: number, file: string) {
  const style: TrouserFrontStyle = { ...base, crotchExtensionScale: scale };
  const piece = draftTrouserBack(body, style);
  const b = trouserBackPoints(body, style);
  const d = draftBackCrotch(b);
  const crotch = [
    ...rolePts(piece, "crotch"),
    ...rolePts(piece, "centre-back"),
  ];
  const inseam = rolePts(piece, "inseam");
  const all = [...crotch, ...inseam, d.K, b.p19, b.p21, b.guide];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of all) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = 30;
  const sh = (p: Point) => ({ x: p.x - minX + pad, y: p.y - minY + pad });
  const w = maxX - minX + 2 * pad;
  const h = maxY - minY + 2 * pad;
  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">
  <rect width="100%" height="100%" fill="#faf8f5"/>
  <path d="${svgPath(inseam.map(sh))}" fill="none" stroke="#888" stroke-width="1.5"/>
  <path d="${svgPath(crotch.map(sh))}" fill="none" stroke="#c44" stroke-width="2.5"/>
  <circle cx="${sh(d.K).x}" cy="${sh(d.K).y}" r="3" fill="#06c"/>
  <circle cx="${sh(b.p19).x}" cy="${sh(b.p19).y}" r="3" fill="#0a0"/>
  <circle cx="${sh(b.guide).x}" cy="${sh(b.guide).y}" r="2.5" fill="#a60"/>
  <text x="8" y="16" font-size="12" fill="#333">scale=${scale} horizRun=${d.horizRun.toFixed(1)} touchMiss=${d.touchMiss.toFixed(2)}</text>
</svg>`;
  writeFileSync(join("scripts", file), svg);
  console.log(`wrote scripts/${file}`);
}

console.log("\n=== SVGs ===");
writeSvg(1.0, "back-crotch-three-part-s10.svg");
writeSvg(0.7, "back-crotch-three-part-s07.svg");
writeSvg(0.5, "back-crotch-three-part-s05.svg");
