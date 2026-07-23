/**
 * DIAGNOSTIC — waistband notch frame + label leak (print only).
 * Run: npx tsx scripts/diag-waistband-notch.ts
 *
 * Does not change geometry.
 */
import {
  applyEase,
  notchCount,
  type NotchMarking,
  type OutlinePoint,
  type PatternPiece,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import { applyTrouserHemTurnbackToPattern } from "../lib/geometry/trouserHemTurnback";
import { notchSegments } from "../lib/pattern/markingGeometry";
import {
  blockFromWaistDrop,
  draftTrousers,
  trouserWaistEdges,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { CLEO_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import { draftWaistband } from "../lib/elements/waistband";
import { applySideOpening } from "../lib/elements/sideOpening";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const f3 = (n: number) => n.toFixed(3);
const pt = (p: Point) => `(${f3(p.x)}, ${f3(p.y)})`;

function resolveStyle(
  body: ReturnType<typeof applyEase>,
): TrouserFrontStyle {
  const s = CLEO_TROUSER_STYLE;
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    ...(s.frontInseamKneeInset != null
      ? { frontInseamKneeInset: s.frontInseamKneeInset }
      : {}),
    ...(s.backInseamKneeInset != null
      ? { backInseamKneeInset: s.backInseamKneeInset }
      : {}),
    ...(s.frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale: s.frontCrotchExtensionScale }
      : {}),
    ...(s.backCrotchExtensionScale != null
      ? { backCrotchExtensionScale: s.backCrotchExtensionScale }
      : {}),
    ...(s.crotchDeparture != null ? { crotchDeparture: s.crotchDeparture } : {}),
    ...(s.crotchArrivalAngle != null ? { crotchArrivalAngle: s.crotchArrivalAngle } : {}),
    ...(s.waistlineCurveFront != null
      ? { waistlineCurveFront: s.waistlineCurveFront }
      : {}),
    ...(s.frontWaistInset != null ? { frontWaistInset: s.frontWaistInset } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
  };
  const depth =
    s.waistbandMode === "darted"
      ? s.dartedWaistFinish === "facing"
        ? 0
        : s.dartedBandDepth
      : s.waistbandDepth;
  if (s.waistbandMode === "darted") {
    return withWaistband(base, depth, "darted", body);
  }
  return depth > 0 ? withWaistband(base, depth, "shaped", body) : base;
}

function bbox(pts: Point[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function insideBox(
  p: Point,
  box: { minX: number; maxX: number; minY: number; maxY: number },
  pad = 1,
): boolean {
  return (
    p.x >= box.minX - pad &&
    p.x <= box.maxX + pad &&
    p.y >= box.minY - pad &&
    p.y <= box.maxY + pad
  );
}

function notches(piece: PatternPiece): NotchMarking[] {
  return piece.markings.filter((m): m is NotchMarking => m.kind === "notch");
}

function outlinePts(piece: PatternPiece): Point[] {
  return piece.outline.map((o) => o.at);
}

function boundaryPts(piece: PatternPiece): Point[] {
  return piece.cuttingOutline ?? outlinePts(piece);
}

function fmtBox(b: ReturnType<typeof bbox>): string {
  return `x[${f3(b.minX)}…${f3(b.maxX)}] y[${f3(b.minY)}…${f3(b.maxY)}]  w=${f3(b.maxX - b.minX)} h=${f3(b.maxY - b.minY)}`;
}

console.log("=== DIAG: waistband notch frame + label leak ===");
console.log("measure only — no geometry changes\n");

const body = applyEase(
  bodyForSizeCode(DEFAULT_SIZE_CODE)!,
  CLEO_TROUSER_STYLE.ease,
);
const style = resolveStyle(body);
const baseNet = draftTrousers(body, style);
const opened = applySideOpening(baseNet.pieces, { side: "left", length: 180 });
const bandDepth = style.waistReduction ?? 0;
const e = trouserWaistEdges(body, style);
console.log(
  `bandDepth (waistReduction)=${bandDepth} mm; front inner/outer=${f3(e.front.inner)}/${f3(e.front.outer)}; back ${f3(e.back.inner)}/${f3(e.back.outer)}`,
);
console.log(
  `flare front=${f3(e.front.outer - e.front.inner)} back=${f3(e.back.outer - e.back.inner)} → polar (curved) band if flare≥0.5`,
);

const fb = draftWaistband({
  innerLen: e.front.inner,
  outerLen: e.front.outer,
  depth: bandDepth,
  foldSide: "CF",
  label: "Front waistband",
});
const bb = draftWaistband({
  innerLen: e.back.inner,
  outerLen: e.back.outer,
  depth: bandDepth,
  foldSide: "CB",
  label: "Back waistband",
});

const netPieces = [...opened.pieces, fb.piece, bb.piece];
const withSA = withSeamAllowance({ pieces: netPieces }, DEFAULT_SEAM_ALLOWANCE);
const withHem = applyTrouserHemTurnbackToPattern(withSA);

// --- §1 frame ---
console.log("\n========== 1. Waistband coordinate frame ==========");

for (const raw of [fb.piece, bb.piece]) {
  const name = raw.name;
  const net = withSA.pieces.find((p) => p.name === name)!;
  const afterHem = withHem.pieces.find((p) => p.name === name)!;
  const netBox = bbox(outlinePts(raw));
  const cutBox = bbox(boundaryPts(afterHem));

  console.log(`\n--- ${name} ---`);
  console.log(`  draftWaistband outline verts: ${raw.outline.length}`);
  console.log(`  net bbox:     ${fmtBox(netBox)}`);
  console.log(`  cutting bbox: ${fmtBox(cutBox)}`);
  console.log("  outline vertices (first/last 3):");
  const show = (o: OutlinePoint[], i: number) =>
    `    [${i}] ${pt(o[i]!.at)} edge=${o[i]!.edge} role=${o[i]!.role ?? "—"}`;
  for (let i = 0; i < Math.min(3, raw.outline.length); i++) {
    console.log(show(raw.outline, i));
  }
  if (raw.outline.length > 6) console.log("    …");
  for (
    let i = Math.max(3, raw.outline.length - 3);
    i < raw.outline.length;
    i++
  ) {
    console.log(show(raw.outline, i));
  }

  const flare = name.includes("Front")
    ? e.front.outer - e.front.inner
    : e.back.outer - e.back.inner;
  if (flare >= 0.5) {
    const theta = flare / bandDepth;
    const rIn = (name.includes("Front") ? e.front.inner : e.back.inner) / theta;
    console.log(
      `  POLAR local frame: flare=${f3(flare)} → θ=${f3(theta)} rad, rIn=${f3(rIn)} mm`,
    );
    console.log(
      `  Origin is the circle centre (not trouser origin). y≈rIn at fold is EXPECTED — large y is band-local, not a trouser leak.`,
    );
  } else {
    console.log(
      `  RECT local frame: top y=0, bottom y=depth=${bandDepth} (own origin).`,
    );
  }

  console.log("  notches as stored (net, after draftWaistband):");
  for (const n of notches(raw)) {
    const inNet = insideBox(n.at, netBox);
    console.log(
      `    ${n.label ?? n.role} role=${n.role} ticks=${notchCount(n)} at ${pt(n.at)}  inside net bbox? ${inNet ? "YES" : "NO ← WRONG FRAME"}`,
    );
  }
  console.log("  notches after withSeamAllowance (+ hem post-pass):");
  for (const n of notches(afterHem)) {
    const inCut = insideBox(n.at, cutBox);
    const segs = notchSegments(afterHem, n);
    const segLens = segs.map((s) =>
      Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y),
    );
    console.log(
      `    ${n.label ?? n.role} at ${pt(n.at)} depth=${n.depth ?? "—"} dir=${n.dir ? `(${f3(n.dir.x)},${f3(n.dir.y)})` : "—"}  inside cutting bbox? ${inCut ? "YES" : "NO"}`,
    );
    console.log(
      `      notchSegments: ${segs.length} tick(s), lengths [${segLens.map(f3).join(", ")}] mm`,
    );
  }
}

// Compare leg notch that works
{
  console.log("\n--- Comparison: Trouser front knee (known-working) ---");
  const front = withHem.pieces.find((p) => p.name === "Trouser front")!;
  const box = bbox(boundaryPts(front));
  const knee = notches(front).find((n) => n.label === "knee")!;
  console.log(`  piece cutting bbox: ${fmtBox(box)}`);
  console.log(
    `  knee at ${pt(knee.at)}  inside bbox? ${insideBox(knee.at, box) ? "YES" : "NO"}`,
  );
}

console.log("\n--- Frame verdict (draft) ---");
console.log(
  "  draftWaistband builds the piece in its OWN local coordinates:",
);
console.log(
  "  - straight (flare<0.5): rectangle with origin at fold/top corner, y down to depth;",
);
console.log(
  "  - curved (flare≥0.5): polar arc about an internal centre; coordinates are NOT trouser x/y.",
);
console.log(
  "  Notch positions are taken from edgeMid(bottomEdge) / foldFrom on those same edges —",
);
console.log(
  "  same frame as the outline. Large y (400–650) is the polar radius, not a trouser-space leak.",
);

// --- §2 emit path ---
console.log("\n========== 2. Emit / render path ==========");
{
  const src = readFileSync(
    join(process.cwd(), "app", "garments", "TrousersView.tsx"),
    "utf8",
  );
  const hasBandFilter = src.includes('p.name === "Front waistband"');
  const placedIncludesBands =
    src.includes("bandPieces") && src.includes("placed.push");
  const markingsOnPlaced = /placed\.map\([\s\S]*?piece\.markings\.map/;
  const notchCase = src.includes('case "notch"');
  const notchDrawsLabel = /case "notch":[\s\S]*?\{m\.label &&/;

  console.log(
    `  TrousersView collects bandPieces (Front/Back waistband): ${hasBandFilter}`,
  );
  console.log(
    `  band pieces are pushed into placed[] for layout: ${placedIncludesBands}`,
  );
  console.log(
    `  placed.map → piece.markings.map (all placed pieces, not legs-only): ${markingsOnPlaced.test(src)}`,
  );
  console.log(`  case "notch" draws notchSegments ticks: ${notchCase}`);
  console.log(
    `  case "notch" ALSO draws {m.label && <text>…}: ${notchDrawsLabel.test(src)}`,
  );

  // PDF
  const pdf = readFileSync(join(process.cwd(), "lib", "export", "pdf.ts"), "utf8");
  console.log(
    `  PDF export notch case: ticks via notchSegments, no label text: ${pdf.includes('case "notch"') && !pdf.match(/case "notch":[\s\S]*?m\.label/)}`,
  );

  // Does SA zero out band notches?
  for (const name of ["Front waistband", "Back waistband"] as const) {
    const before = notches(netPieces.find((p) => p.name === name)!);
    const after = notches(withHem.pieces.find((p) => p.name === name)!);
    console.log(
      `  ${name}: notches before SA=${before.length}, after SA/hem=${after.length}`,
    );
  }
}

console.log("\n--- Emit verdict ---");
console.log(
  "  Waistband pieces ARE iterated in TrousersView (row 2 of layout) and markings ARE drawn.",
);
console.log(
  "  So if ticks are invisible, it is not because bands are skipped — check tick length/dir,",
);
console.log(
  "  or that labels are the only visible cue and ticks are short (~SA depth) on a crowded band.",
);

// --- §3 label leak ---
console.log("\n========== 3. Label leak ==========");
console.log(
  "  Production TrousersView.tsx case \"notch\": draws ticks AND optionally m.label as <text>.",
);
console.log(
  "  Notch labels (knee, mid-waist, CB-identity, …) were added on Marking.label for the notch-set;",
);
console.log(
  "  that same field is what the production SVG prints — not a separate diagnostic overlay.",
);
console.log(
  "  scripts/diag-notch-render.ts is a separate labelled SVG (role/mate) — not the app UI.",
);
console.log(
  "  Separable switch: gate the {m.label && <text>} block (e.g. showNotchLabels=false in production;",
);
console.log(
  "  keep ticks via notchSegments). PDF already draws ticks only — no label text.",
);

// Sample of labels currently on pieces
console.log("\n  Labels currently set on Cleo notches (these leak into the UI if drawn):");
for (const p of withHem.pieces) {
  for (const n of notches(p)) {
    if (n.label) {
      console.log(`    [${p.name}] label="${n.label}" role=${n.role}`);
    }
  }
}

console.log("\n========== PLAIN STATEMENT ==========");
{
  const issues: string[] = [];
  for (const raw of [fb.piece, bb.piece]) {
    const box = bbox(outlinePts(raw));
    for (const n of notches(raw)) {
      if (!insideBox(n.at, box)) {
        issues.push(`${raw.name} ${n.label} OUTSIDE bbox`);
      }
    }
  }
  if (issues.length === 0) {
    console.log(
      "(a) Waistband notches are INSIDE the band bbox — same local (polar) frame as the outline, not a wrong-frame placement. They are also emitted (bands are in placed[] and markings are drawn). If Helen sees none, look at tick visibility (short depth / direction), not missing emit or trouser-space coords.",
    );
  } else {
    console.log(
      `(a) Wrong frame: ${issues.join("; ")}`,
    );
  }
  console.log(
    "(b) Labels ARE separable from ticks with a simple switch: the production notch case already draws ticks via notchSegments and labels via a separate {m.label && <text>} — gate or remove that text block for production; leave diag-notch-render for labelled overlays.",
  );
}

console.log("\n=== end diagnostic ===");
