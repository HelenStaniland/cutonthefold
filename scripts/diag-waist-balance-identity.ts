/**
 * Report: trouser waist mid-balance + back-band identity offset.
 * Run: npx tsx scripts/diag-waist-balance-identity.ts
 * Print only — no geometry / baseline changes.
 */
import {
  applyEase,
  notchCount,
  type NotchMarking,
  type PatternPiece,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import { arcToPoint } from "../lib/geometry/notchPlacement";
import { polylineLength } from "../lib/geometry/curves";
import { notchSegments } from "../lib/pattern/markingGeometry";
import {
  blockFromWaistDrop,
  draftTrousers,
  trouserWaistEdges,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { IZZY_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import {
  draftWaistband,
  WAISTBAND_IDENTITY_FROM_FOLD_MM,
} from "../lib/elements/waistband";
import { applySideOpening } from "../lib/elements/sideOpening";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const f3 = (n: number) => n.toFixed(3);
const pt = (p: Point) => `(${f3(p.x)}, ${f3(p.y)})`;

function notches(piece: PatternPiece): NotchMarking[] {
  return piece.markings.filter((m): m is NotchMarking => m.kind === "notch");
}

function byLabel(piece: PatternPiece, label: string) {
  return notches(piece).find((n) => n.label === label);
}

function waistPts(piece: PatternPiece): Point[] {
  const pts = piece.outline.filter((o) => o.role === "waist").map((o) => o.at);
  const side = piece.outline.find((o) => o.role === "side-seam");
  if (side && pts.length > 0) {
    const last = pts[pts.length - 1]!;
    if (Math.hypot(side.at.x - last.x, side.at.y - last.y) > 1e-6) {
      pts.push(side.at);
    }
  }
  return pts;
}

const body = applyEase(
  bodyForSizeCode(DEFAULT_SIZE_CODE)!,
  IZZY_TROUSER_STYLE.ease,
);
const s = IZZY_TROUSER_STYLE;
const base: TrouserFrontStyle = {
  bottomWidth: s.legBottomWidth,
  block: blockFromWaistDrop(s.waistDrop),
  waistDrop: s.waistDrop,
  backHemShape: s.backHemShape,
  ...(s.frontWaistInset != null ? { frontWaistInset: s.frontWaistInset } : {}),
};
const style = withWaistband(base, s.waistbandDepth, "shaped", body);
const net = draftTrousers(body, style);
const opened = applySideOpening(net.pieces, { side: "left", length: 180 });
const e = trouserWaistEdges(body, style);
const fb = draftWaistband({
  innerLen: e.front.inner,
  outerLen: e.front.outer,
  depth: style.waistReduction ?? 0,
  foldSide: "CF",
  label: "Front waistband",
});
const bb = draftWaistband({
  innerLen: e.back.inner,
  outerLen: e.back.outer,
  depth: style.waistReduction ?? 0,
  foldSide: "CB",
  label: "Back waistband",
});
const front = opened.pieces.find((p) => p.name === "Trouser front")!;
const back = opened.pieces.find((p) => p.name === "Trouser back")!;

console.log("=== DIAG: waist mid-balance + band identity ===\n");

console.log("--- 1. Trouser waist mid-balance ---");
for (const [name, piece, bandName] of [
  ["Front", front, "Front waistband"],
  ["Back", back, "Back waistband"],
] as const) {
  const n = byLabel(piece, "mid-waist")!;
  const w = waistPts(piece);
  const arc = arcToPoint(w, n.at);
  const half = polylineLength(w) / 2;
  console.log(
    `  ${name}: ${pt(n.at)}  arc-from-centre=${f3(arc)} mm (half=${f3(half)})  role=${n.role} ticks=${notchCount(n)}`,
  );
  console.log(
    `         mates → ${n.mates?.piece}/${n.mates?.seam}  (expect ${bandName}/waist)`,
  );
}

const bandF = fb.piece;
const bandB = bb.piece;
const fBandMid = notches(bandF).find((n) => n.role === "balance")!;
const bBandMid = notches(bandB).find((n) => n.role === "balance")!;
console.log(
  `  Band centre mates: Front ${fBandMid.mates?.piece}/${fBandMid.mates?.seam}; Back ${bBandMid.mates?.piece}/${bBandMid.mates?.seam}`,
);
console.log(
  `  Band centre positions: F ${pt(fBandMid.at)}; B ${pt(bBandMid.at)} (unchanged mid of lower/waist edge)`,
);

console.log("\n--- 2. Back-band identity (off fold) ---");
console.log(
  `  Constant WAISTBAND_IDENTITY_FROM_FOLD_MM = ${WAISTBAND_IDENTITY_FROM_FOLD_MM}`,
);
const id = notches(bandB).find((n) => n.role === "identity")!;
const topFromFold: Point[] = [];
for (const o of bandB.outline) {
  if (o.role === "side-seam") break;
  topFromFold.push(o.at);
}
console.log(
  `  Position ${pt(id.at)}  arc-from-fold(band-top)=${f3(arcToPoint(topFromFold, id.at))} mm  ticks=${notchCount(id)}`,
);
console.log(
  `  Front band notches: ${notches(bandF).map((n) => `${n.label}/${n.role}`).join(", ")} (no identity)`,
);
console.log(
  `  Fold: onFold=${bandB.onFold}, foldSide=CB; geometry is the drafted half reflected about CB.`,
);
console.log(
  `  Identity sits on that half only → one double on the unfolded full band (not a mirrored pair in the draft).`,
);

console.log("\n--- 4. PDF path (notchSegments = pdf.ts) ---");
const bbCut = withSeamAllowance({ pieces: [bandB] }, DEFAULT_SEAM_ALLOWANCE)
  .pieces[0]!;
const idCut = notches(bbCut).find((n) => n.role === "identity")!;
const segs = notchSegments(bbCut, idCut);
const fold = bbCut.markings.find((m) => m.kind === "placeOnFold");
let minClear = Infinity;
if (fold && fold.kind === "placeOnFold") {
  const A = fold.line.from;
  const B = fold.line.to;
  for (const s of segs) {
    for (const p of [s.from, s.to]) {
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((p.x - A.x) * dx + (p.y - A.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      minClear = Math.min(
        minClear,
        Math.hypot(p.x - (A.x + t * dx), p.y - (A.y + t * dy)),
      );
    }
  }
}
console.log(`  Identity ticks drawn by PDF: ${segs.length} (expect 2)`);
for (let i = 0; i < segs.length; i++) {
  console.log(
    `    tick[${i}] ${pt(segs[i]!.from)} → ${pt(segs[i]!.to)}`,
  );
}
console.log(
  `  Min distance of any tick endpoint to fold line: ${f3(minClear)} mm`,
);
console.log(
  minClear > 5
    ? "  → Full double clear of fold (not a half-notch on the fold)."
    : "  → FAIL: ticks too close to fold.",
);

// Tiny SVG for visual PDF-equivalent check
const OUT = join("scripts", "diag-notch-render");
mkdirSync(OUT, { recursive: true });
const outline = bbCut.cuttingOutline ?? bbCut.outline.map((o) => o.at);
const xs = outline.map((p) => p.x);
const ys = outline.map((p) => p.y);
const pad = 20;
const minX = Math.min(...xs) - pad;
const minY = Math.min(...ys) - pad;
const maxX = Math.max(...xs) + pad;
const maxY = Math.max(...ys) + pad;
const poly = outline.map((p) => `${p.x},${p.y}`).join(" ");
const tickLines = segs
  .map(
    (s) =>
      `<line x1="${s.from.x}" y1="${s.from.y}" x2="${s.to.x}" y2="${s.to.y}" stroke="#1d4ed8" stroke-width="1.2"/>`,
  )
  .join("\n  ");
const bal = notches(bbCut).find((n) => n.role === "balance")!;
const balSegs = notchSegments(bbCut, bal);
const balLines = balSegs
  .map(
    (s) =>
      `<line x1="${s.from.x}" y1="${s.from.y}" x2="${s.to.x}" y2="${s.to.y}" stroke="#b45309" stroke-width="1.2"/>`,
  )
  .join("\n  ");
const foldLine =
  fold && fold.kind === "placeOnFold"
    ? `<line x1="${fold.line.from.x}" y1="${fold.line.from.y}" x2="${fold.line.to.x}" y2="${fold.line.to.y}" stroke="#999" stroke-width="0.8" stroke-dasharray="4 3"/>`
    : "";
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}">
  <polygon points="${poly}" fill="#fafafa" stroke="#333" stroke-width="0.6"/>
  ${foldLine}
  ${balLines}
  ${tickLines}
  <text x="${minX + 8}" y="${minY + 16}" font-size="10" fill="#333">Back WB cutting · blue=identity double · amber=mid-waist · dashed=fold</text>
</svg>
`;
writeFileSync(join(OUT, "izzy-back-wb-identity-pdf-check.svg"), svg);
console.log(
  `\nWrote ${join(OUT, "izzy-back-wb-identity-pdf-check.svg")} (visual of PDF tick geometry)`,
);

console.log("\n=== end ===");
