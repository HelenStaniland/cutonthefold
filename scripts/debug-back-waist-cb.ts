/**
 * Run: npx tsx scripts/debug-back-waist-cb.ts
 * Diagnose back CB waist tangle: cut seam vs construction overlay.
 */
import { applyEase } from "../lib/types/measurements";
import { DEFAULT_FIT, easeForFit } from "../lib/pattern/fitPresets";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserBack,
  trouserBackPoints,
  trouserConstruction,
  trouserFramePoints,
  withWaistband,
} from "../lib/patterns/trouserBlock";
import { catmullRom } from "../lib/geometry/curves";
import type { Point } from "../lib/types/measurements";

function fmt(p: Point): string {
  return `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;
}

function turnAngleDeg(a: Point, b: Point, c: Point): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const m1 = Math.hypot(v1.x, v1.y);
  const m2 = Math.hypot(v2.x, v2.y);
  if (m1 < 1e-9 || m2 < 1e-9) return 0;
  const dot = (v1.x * v2.x + v1.y * v2.y) / (m1 * m2);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

function xBacktrack(seam: Point[], n: number): boolean {
  for (let i = 1; i < Math.min(n, seam.length); i++) {
    if (seam[i].x < seam[i - 1].x - 0.01) return true;
  }
  return false;
}

function waistFromPiece(piece: ReturnType<typeof draftTrouserBack>): Point[] {
  return piece.outline.filter((o) => o.role === "waist").map((o) => o.at);
}

function crotchFromPiece(piece: ReturnType<typeof draftTrouserBack>): Point[] {
  return piece.outline.filter((o) => o.role === "crotch").map((o) => o.at);
}

function report(block: "classic" | "production", depth: number) {
  const body = applyEase(bodyForSizeCode("12")!, easeForFit(DEFAULT_FIT)!);
  const style = withWaistband({ bottomWidth: 220, block }, depth, "shaped", body);
  const b = trouserBackPoints(body, style);
  const piece = draftTrouserBack(body, style);
  const waistSeam = waistFromPiece(piece);
  const crotch = crotchFromPiece(piece);
  const wrCf = waistSeam[0];
  const wrSide = waistSeam[waistSeam.length - 1];

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${block} block, shaped depth ${depth} mm`);
  console.log(`${"=".repeat(60)}`);

  console.log("\n--- Drafted CB corner vs cut waist start ---");
  console.log(`  p21 (cfWaist):     ${fmt(b.p21)}`);
  console.log(`  p22 (sideWaist):   ${fmt(b.p22)}`);
  console.log(`  wr.cf (= seam[0]): ${fmt(wrCf)}`);
  console.log(`  wr.side:           ${fmt(wrSide)}`);
  console.log(
    `  wr.cf vs p21: Δx=${(wrCf.x - b.p21.x).toFixed(2)} mm  Δy=${(wrCf.y - b.p21.y).toFixed(2)} mm`,
  );
  console.log(
    `  (At depth ${depth}, CB waist is arc-walked down cfEdge from p21 + §2a scoop — not identical to p21.)`,
  );

  console.log("\n--- wr.waistSeam first 8 points (CB → side) ---");
  for (let i = 0; i < Math.min(8, waistSeam.length); i++) {
    const p = waistSeam[i];
    const dx = i > 0 ? p.x - waistSeam[i - 1].x : 0;
    const dy = i > 0 ? p.y - waistSeam[i - 1].y : 0;
    console.log(
      `  [${i}] ${fmt(p)}${i > 0 ? `  Δ(${dx.toFixed(2)}, ${dy.toFixed(2)})` : ""}`,
    );
  }

  console.log("\n--- Cut seam quality at CB ---");
  const xBack = xBacktrack(waistSeam, 12);
  console.log(`  x backtrack in first 12 points: ${xBack ? "YES (problem)" : "no"}`);
  const turn01 = turnAngleDeg(waistSeam[0], waistSeam[1], waistSeam[2]);
  console.log(`  turn angle at seam[1]: ${turn01.toFixed(1)}° (180° = straight)`);

  const crotchEnd = crotch[crotch.length - 1];
  const crotchBefore = crotch[crotch.length - 2];
  const joinGap = Math.hypot(crotchEnd.x - wrCf.x, crotchEnd.y - wrCf.y);
  const crotchWaistTurn = turnAngleDeg(crotchBefore, wrCf, waistSeam[1]);
  console.log(`  crotch end vs wr.cf gap: ${joinGap.toFixed(3)} mm`);
  console.log(
    `  interior angle crotch→waist at CB: ${crotchWaistTurn.toFixed(1)}°`,
  );

  console.log("\n--- Construction lines near CB (Trouser back) ---");
  const constr = trouserConstruction(body, style).find(
    (c) => c.pieceName === "Trouser back",
  )!;
  const frame = trouserFramePoints(body, block);
  const nearCb = constr.lines.filter((line) => {
    const pts = [line.from, line.to];
    return pts.some(
      (p) =>
        Math.hypot(p.x - b.p21.x, p.y - b.p21.y) < 80 ||
        Math.hypot(p.x - b.p18.x, p.y - b.p18.y) < 80 ||
        Math.abs(p.x) < 30 && p.y < 30,
    );
  });
  for (const line of nearCb) {
    const kind = line.kind ?? "?";
    const ids = [line.from, line.to]
      .map((p) => {
        if (Math.hypot(p.x - frame.p0.x, p.y - frame.p0.y) < 0.01) return "p0";
        if (Math.hypot(p.x - b.p18.x, p.y - b.p18.y) < 0.01) return "p18";
        if (Math.hypot(p.x - b.p21.x, p.y - b.p21.y) < 0.01) return "p21";
        if (Math.hypot(p.x - b.p22.x, p.y - b.p22.y) < 0.01) return "p22";
        if (Math.hypot(p.x - b.p16.x, p.y - b.p16.y) < 0.01) return "p16";
        if (Math.hypot(p.x - b.guide.x, p.y - b.guide.y) < 0.01) return "guide";
        return "?";
      })
      .join("→");
    console.log(`  [${kind}] ${ids || `${fmt(line.from)} → ${fmt(line.to)}`}`);
  }
  console.log("  Frame vertical at x=0: p0→p1→p2→p4→p3 (centre line, not on CB waist)");
  console.log(
    `  Note: p18→p21 is a single construction chord (Aldrich goes p18→p20 along waist, then up);`,
  );
  console.log(
    `        p21→p22 is the Aldrich waist slope; horizLine y=0 crosses the whole piece.`,
  );
}

for (const block of ["production", "classic"] as const) {
  report(block, 40);
}
