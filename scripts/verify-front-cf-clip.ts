/**
 * Report: front CF clip at lowered waist (spike fix).
 * Run: npx tsx scripts/verify-front-cf-clip.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  draftTrouserFront,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

function svgPath(pts: Point[]): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

function rolePts(
  piece: ReturnType<typeof draftTrouserFront>,
  role: string,
): Point[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at);
}

function serializeGeom(piece: ReturnType<typeof draftTrouserFront>): string {
  return piece.outline
    .map((o) => `${o.at.x.toFixed(6)},${o.at.y.toFixed(6)}`)
    .join("|");
}

function maxCrotchTongueAboveWaist(
  piece: ReturnType<typeof draftTrouserFront>,
  waistY: number,
): number {
  let worst = 0;
  for (const o of piece.outline) {
    if (o.role !== "crotch" && o.role !== "centre-front") continue;
    if (o.at.y < waistY - 0.05) {
      worst = Math.max(worst, waistY - o.at.y);
    }
  }
  return worst;
}

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

const base: TrouserFrontStyle = {
  bottomWidth: 220,
  block: "classic",
  waistDrop: 0,
};

// --- r = 0 byte-identical: compare default vs explicit waistReduction 0 ---
const r0a = draftTrouserFront(body, base);
const r0b = draftTrouserFront(body, { ...base, waistReduction: 0 });
console.log(
  `r=0 default vs explicit 0: ${serializeGeom(r0a) === serializeGeom(r0b) ? "IDENTICAL" : "DIFFERS"}`,
);

const waist0 = rolePts(r0a, "waist")[0]!;
const lastCf = r0a.outline[r0a.outline.length - 1]!;
console.log(
  `r=0 outline closes at (${lastCf.at.x.toFixed(2)}, ${lastCf.at.y.toFixed(2)}) ` +
    `vs waist CF (${waist0.x.toFixed(2)}, ${waist0.y.toFixed(2)}) ` +
    `gap=${Math.hypot(lastCf.at.x - waist0.x, lastCf.at.y - waist0.y).toFixed(4)} mm`,
);
console.log(
  `r=0 crotch/CF tongue above waist: ${maxCrotchTongueAboveWaist(r0a, waist0.y).toFixed(3)} mm (want 0)`,
);

function checkDepth(depth: number, straightRun: number | undefined, label: string) {
  const style = withWaistband(
    {
      ...base,
      ...(straightRun !== undefined ? { crotchStraightRun: straightRun } : {}),
    },
    depth,
    "shaped",
    body,
  );
  const piece = draftTrouserFront(body, style);
  const wrCf = rolePts(piece, "waist")[0]!;
  const outlineEnd = piece.outline[piece.outline.length - 1]!;
  const joinGap = Math.hypot(outlineEnd.at.x - wrCf.x, outlineEnd.at.y - wrCf.y);
  const tongue = maxCrotchTongueAboveWaist(piece, wrCf.y);
  const hipNotches = piece.markings.filter(
    (m) => m.kind === "notch" && Math.abs(m.at.y - body.hipDepth) < 2 && m.at.x < -50,
  );
  console.log(`\n=== ${label} ===`);
  console.log(`  wr.cf=(${wrCf.x.toFixed(2)}, ${wrCf.y.toFixed(2)})`);
  console.log(`  outline→waist gap: ${joinGap.toFixed(4)} mm`);
  console.log(`  tongue above waist: ${tongue.toFixed(3)} mm`);
  console.log(`  CF hip notches: ${hipNotches.length}`);
  if (hipNotches[0] && hipNotches[0].kind === "notch") {
    const onOutline = piece.outline.some(
      (o) =>
        Math.hypot(o.at.x - hipNotches[0]!.at.x, o.at.y - hipNotches[0]!.at.y) <
        0.15,
    );
    console.log(
      `  hip notch on outline: ${onOutline} at (${hipNotches[0].at.x.toFixed(2)}, ${hipNotches[0].at.y.toFixed(2)})`,
    );
  }

  // Natural clip crossing on the fork-line path vs forced wr.cf (7–10 inset).
  const cfPts = [
    ...rolePts(piece, "crotch"),
    ...rolePts(piece, "centre-front"),
  ];
  // Second-to-last sample is the last kept point before forced wr.cf join.
  if (cfPts.length >= 2) {
    const before = cfPts[cfPts.length - 2]!;
    const gap = Math.hypot(before.x - wrCf.x, before.y - wrCf.y);
    // Only meaningful as "cross gap" when before is near the cut height.
    if (Math.abs(before.y - wrCf.y) < 5) {
      console.log(
        `  natural→wr.cf gap near cut: ${gap.toFixed(2)} mm` +
          (gap > 0.1 ? " (above 0.1 — 7–10 inset; join forced)" : ""),
      );
    }
  }
  console.log(
    `  trouser top == waist CF: ${joinGap < 0.1 ? "YES" : "NO"}`,
  );
  return piece;
}

const depths = [0, 40, 120];
const runs: { run: number | undefined; tag: string }[] = [
  { run: undefined, tag: "defaultRun" },
  { run: 0, tag: "run0" },
];

for (const { run, tag } of runs) {
  for (const d of depths) {
    checkDepth(d, run, `depth=${d} ${tag}`);
  }
}

function writeFrontSvg(
  piece: ReturnType<typeof draftTrouserFront>,
  label: string,
  filename: string,
) {
  const roles = ["waist", "crotch", "centre-front", "side-seam"] as const;
  const colors: Record<string, string> = {
    waist: "#888",
    crotch: "#c44",
    "centre-front": "#2563eb",
    "side-seam": "#aaa",
  };
  const all = piece.outline.map((o) => o.at);
  const minX = Math.min(...all.map((p) => p.x)) - 20;
  const minY = Math.min(...all.map((p) => p.y)) - 20;
  const maxX = Math.max(...all.map((p) => p.x)) + 20;
  const maxY = Math.max(...all.map((p) => p.y)) + 30;
  // Crop to upper body for spike visibility
  const cropMaxY = Math.min(maxY, minY + 280);
  const w = maxX - minX;
  const h = cropMaxY - minY;
  const sh = (p: Point) => ({ x: p.x - minX, y: p.y - minY });
  const paths: string[] = [];
  for (const role of roles) {
    const pts = rolePts(piece, role);
    if (pts.length < 2) continue;
    paths.push(
      `  <path d="${svgPath(pts.map(sh))}" fill="none" stroke="${colors[role]}" stroke-width="${role === "crotch" || role === "centre-front" ? 2.5 : 1.5}"/>`,
    );
  }
  const wrCf = rolePts(piece, "waist")[0]!;
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">`,
    `  <rect width="100%" height="100%" fill="#faf8f5"/>`,
    ...paths,
    `  <circle cx="${sh(wrCf).x}" cy="${sh(wrCf).y}" r="3.5" fill="#111"/>`,
    `  <text x="8" y="16" font-size="12" fill="#333">${label}</text>`,
    `</svg>`,
  ].join("\n");
  writeFileSync(join(process.cwd(), "scripts", filename), svg);
  console.log(`Wrote scripts/${filename}`);
}

for (const { run, tag } of runs) {
  for (const d of depths) {
    const style = withWaistband(
      {
        ...base,
        ...(run !== undefined ? { crotchStraightRun: run } : {}),
      },
      d,
      "shaped",
      body,
    );
    const piece = draftTrouserFront(body, style);
    writeFrontSvg(
      piece,
      `depth ${d}, ${tag}`,
      `front-cf-clip-d${d}-${tag}.svg`,
    );
  }
}

// Consumer report
console.log("\n=== centre-front consumers ===");
console.log(
  "  waistband.ts — fold role on the BAND piece only (not trouser outline).",
);
console.log(
  "  verify scripts — diagnostics. Trouser front keeps centre-front as the",
);
console.log(
  "  upper half of the clipped path (split at hipline), continuous with crotch.",
);
