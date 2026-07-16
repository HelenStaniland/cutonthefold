/**
 * Diagnostic — derive leg model from measured Izzy grainline→edge table.
 * Run: npx tsx scripts/diag-izzy-measured-leg.ts
 * Report only. Does not change product code.
 *
 * Measured data: cm INCLUDING 1 cm SA, half-piece grainline → edge.
 * Levels: crotch y=0; knee y=300 mm; hem y=760 mm (net below crotch line).
 */
type Edge = "inseam" | "side";

/** grainline→edge offsets in cm (as measured, with SA). */
const MEASURED_CM = {
  front: {
    crotch: { inseam: 19.3, side: 16.5 },
    midUpper: { inseam: 18.5, side: 16.5 }, // between crotch & knee — y unknown
    knee: { inseam: 18.2, side: 17.5 },
    midLower: { inseam: 19.2, side: 17.5 }, // below knee — y unknown
    hem: { inseam: 18.5, side: 18.0 },
  },
  back: {
    crotch: { inseam: 26.7, side: 17.8 },
    knee: { inseam: 21.5, side: 17.0 },
    midLower: { inseam: 21.5, side: 17.0 }, // below knee — y unknown
    hem: { inseam: 22.0, side: 17.3 },
  },
} as const;

/** Net y below crotch line (mm). Intermediates not used for chord (y unknown). */
const Y = {
  crotch: 0,
  knee: 300,
  hem: 760,
} as const;

const SA_CM = 1.0;

function chordAtKnee(crotch: number, hem: number): number {
  const t = (Y.knee - Y.crotch) / (Y.hem - Y.crotch);
  return crotch + (hem - crotch) * t;
}

type EdgeRow = {
  piece: "front" | "back";
  edge: Edge;
  mode: "raw" | "net−SA";
  crotch: number;
  hem: number;
  kneeActual: number;
  kneeChord: number;
  /** actual − chord (cm): − = inset toward grainline, + = outset */
  inset: number;
  flareKneeToHem: number;
};

function analyse(
  piece: "front" | "back",
  edge: Edge,
  subtractSa: boolean,
): EdgeRow {
  const src = MEASURED_CM[piece];
  const sub = subtractSa ? SA_CM : 0;
  const crotch = src.crotch[edge] - sub;
  const hem = src.hem[edge] - sub;
  const kneeActual = src.knee[edge] - sub;
  const kneeChord = chordAtKnee(crotch, hem);
  return {
    piece,
    edge,
    mode: subtractSa ? "net−SA" : "raw",
    crotch,
    hem,
    kneeActual,
    kneeChord,
    inset: kneeActual - kneeChord,
    flareKneeToHem: hem - kneeActual,
  };
}

function fmt(n: number, d = 2): string {
  const s = n.toFixed(d);
  return (n > 0 ? "+" : "") + s;
}

function mm(cm: number): string {
  return fmt(cm * 10, 1) + " mm";
}

function printMode(subtractSa: boolean) {
  const label = subtractSa
    ? "NET (measured − 1 cm SA on each edge)"
    : "RAW (measured as given, SA included)";
  console.log("\n" + "=".repeat(96));
  console.log(label);
  console.log(
    `y used: crotch=${Y.crotch} mm, knee=${Y.knee} mm, hem=${Y.hem} mm (below crotch line)`,
  );
  console.log(
    "Intermediates (midUpper / midLower) omitted from chord — their y is unknown.",
  );
  console.log("=".repeat(96));

  const rows: EdgeRow[] = [];
  for (const piece of ["front", "back"] as const) {
    for (const edge of ["inseam", "side"] as const) {
      rows.push(analyse(piece, edge, subtractSa));
    }
  }

  console.log(
    "\npiece  edge    | crotch  hem    kneeAct kneeChord | inset(act−chord) | flare(knee→hem)",
  );
  console.log("-".repeat(96));
  for (const r of rows) {
    console.log(
      `${r.piece.padEnd(6)} ${r.edge.padEnd(7)} | ${r.crotch.toFixed(2).padStart(6)} ${r.hem.toFixed(2).padStart(6)} ${r.kneeActual.toFixed(2).padStart(7)} ${r.kneeChord.toFixed(2).padStart(9)} | ${fmt(r.inset).padStart(8)} cm (${mm(r.inset).padStart(10)}) | ${fmt(r.flareKneeToHem).padStart(7)} cm (${mm(r.flareKneeToHem)})`,
    );
  }

  console.log("\n--- Summary per piece (inset − = toward grainline; flare = hem − knee) ---");
  console.log("| edge         | knee inset from chord | flare knee→hem |");
  console.log("|--------------|-----------------------|----------------|");
  for (const r of rows) {
    console.log(
      `| ${`${r.piece} ${r.edge}`.padEnd(12)} | ${fmt(r.inset).padStart(8)} cm ${mm(r.inset).padStart(11)} | ${fmt(r.flareKneeToHem).padStart(7)} cm ${mm(r.flareKneeToHem).padStart(10)} |`,
    );
  }

  const fi = rows.find((r) => r.piece === "front" && r.edge === "inseam")!;
  const fs = rows.find((r) => r.piece === "front" && r.edge === "side")!;
  const bi = rows.find((r) => r.piece === "back" && r.edge === "inseam")!;
  const bs = rows.find((r) => r.piece === "back" && r.edge === "side")!;

  console.log("\n--- Direct answers ---");
  console.log("Which edges have a knee inset (actual < chord), and how big?");
  for (const r of rows) {
    const verdict =
      r.inset < -0.05
        ? `YES inset ${mm(Math.abs(r.inset))}`
        : r.inset > 0.05
          ? `NO — outset ${mm(r.inset)}`
          : `≈ 0 (${mm(r.inset)})`;
    console.log(`  ${r.piece} ${r.edge}: ${verdict}`);
  }
  console.log(
    "  (Owner expected: F inseam ~1 cm yes; F side ≈0; B inseam ~5 cm; B side ~0.8 cm.)",
  );
  console.log(
    "  Note: owner’s ~5 cm back inseam is crotch−knee (26.7−21.5=5.2); chord test is smaller because hem is also inboard of crotch.",
  );

  // Split ratios: side_inset / inseam_inset. Use signed insets; if inseam not inset, n/a.
  console.log("\nSplit ratio side_inset / inseam_inset (using signed inset = act−chord):");
  for (const [piece, i, s] of [
    ["front", fi, fs],
    ["back", bi, bs],
  ] as const) {
    if (Math.abs(i.inset) < 1e-6) {
      console.log(`  ${piece}: n/a (inseam inset ≈ 0)`);
      continue;
    }
    const ratio = s.inset / i.inset;
    console.log(
      `  ${piece}: side ${fmt(s.inset)} / inseam ${fmt(i.inset)} = ${ratio.toFixed(3)}  (want ~0.13–0.15 for universal 85/15)`,
    );
  }

  // Candidates — residuals in cm on the four knee edge offsets.
  // Truth = measured kneeActual. Models predict knee from crotch/hem + inset params.
  console.log("\n--- Candidate residuals at the knee (cm); max |residual| ---");
  console.log(
    "Truth = measured knee offset. Model predicts knee = chord + inset_model.",
  );

  // (a) 4 numbers: exact measured insets → residual 0
  console.log("\n(a) per-piece inseam inset + per-piece side inset (4 numbers)");
  console.log("    Uses measured insets exactly → residual 0.00 cm on all four edges.");
  console.log("    max residual = 0.00 cm (0.0 mm)");

  // (b) per-piece inseam inset + fixed split k = side/inseam
  // Try k = 0.15 (85/15), and also best single k fitting both pieces.
  const kFixed = 0.15;
  function residB(k: number): { max: number; detail: string[] } {
    const detail: string[] = [];
    let max = 0;
    for (const [piece, i, s] of [
      ["front", fi, fs],
      ["back", bi, bs],
    ] as const) {
      const predIn = i.kneeChord + i.inset; // exact for inseam
      const predSide = s.kneeChord + k * i.inset;
      const rIn = i.kneeActual - predIn; // 0
      const rSide = s.kneeActual - predSide;
      detail.push(
        `    ${piece}: inseam resid ${fmt(rIn)} cm; side resid ${fmt(rSide)} cm (pred inset ${fmt(k * i.inset)})`,
      );
      max = Math.max(max, Math.abs(rIn), Math.abs(rSide));
    }
    return { max, detail };
  }
  console.log(
    `\n(b) per-piece inseam inset + fixed split k=side/inseam (2 numbers + constant)`,
  );
  const b15 = residB(kFixed);
  console.log(`  With k=${kFixed} (side gets 15% of inseam inset):`);
  for (const d of b15.detail) console.log(d);
  console.log(`    max residual = ${b15.max.toFixed(3)} cm (${(b15.max * 10).toFixed(1)} mm)`);

  // Best single k minimising sum of squared side residuals (inseam exact).
  // sideActual = sideChord + k * inseamInset  ⇒  k = (sideActual − sideChord) / inseamInset
  // for each piece; average? least squares over both pieces:
  // minimise Σ (s.inset − k·i.inset)²  ⇒  k = Σ(s·i) / Σ(i²)
  const num = fs.inset * fi.inset + bs.inset * bi.inset;
  const den = fi.inset * fi.inset + bi.inset * bi.inset;
  const kBest = den > 1e-12 ? num / den : NaN;
  const bBest = residB(kBest);
  console.log(`  With least-squares k=${kBest.toFixed(3)} fitted to both pieces:`);
  for (const d of bBest.detail) console.log(d);
  console.log(
    `    max residual = ${bBest.max.toFixed(3)} cm (${(bBest.max * 10).toFixed(1)} mm)`,
  );

  // (c) per-piece inseam inset, side seam straight (inset 0)
  console.log("\n(c) per-piece inseam inset, side seam straight (inset 0) — 2 numbers");
  {
    let max = 0;
    for (const [piece, i, s] of [
      ["front", fi, fs],
      ["back", bi, bs],
    ] as const) {
      const rIn = 0;
      const rSide = s.kneeActual - s.kneeChord; // = s.inset
      console.log(
        `    ${piece}: inseam resid ${fmt(rIn)} cm; side resid ${fmt(rSide)} cm`,
      );
      max = Math.max(max, Math.abs(rIn), Math.abs(rSide));
    }
    console.log(`    max residual = ${max.toFixed(3)} cm (${(max * 10).toFixed(1)} mm)`);
  }

  // Half-piece widths at levels (sanity)
  console.log("\n--- Half-piece widths (inseam+side) at crotch / knee / hem ---");
  for (const piece of ["front", "back"] as const) {
    const src = MEASURED_CM[piece];
    const sub = subtractSa ? SA_CM : 0;
    const w = (lvl: { inseam: number; side: number }) =>
      lvl.inseam + lvl.side - 2 * sub;
    console.log(
      `  ${piece}: crotch ${w(src.crotch).toFixed(1)}  knee ${w(src.knee).toFixed(1)}  hem ${w(src.hem).toFixed(1)} cm` +
        (subtractSa ? " (net)" : " (raw)"),
    );
  }

  // Intermediate sanity (no chord)
  console.log("\n--- Intermediate levels (y unknown — listed only) ---");
  console.log(
    `  front midUpper (crotch→knee): inseam ${MEASURED_CM.front.midUpper.inseam}, side ${MEASURED_CM.front.midUpper.side}`,
  );
  console.log(
    `  front midLower (below knee):  inseam ${MEASURED_CM.front.midLower.inseam}, side ${MEASURED_CM.front.midLower.side}`,
  );
  console.log(
    `  back  midLower (below knee):  inseam ${MEASURED_CM.back.midLower.inseam}, side ${MEASURED_CM.back.midLower.side}`,
  );
}

console.log("Izzy measured leg — grainline→edge, cm, SA included in raw.");
console.log("SA assumption: each edge measurement includes +1 cm beyond the sewing line;");
console.log("  net = raw − 1.0 cm per edge. Both raw and net reported.");
console.log(
  `Chord: straight from crotch (y=${Y.crotch}) to hem (y=${Y.hem} mm); sample at knee y=${Y.knee} mm.`,
);

printMode(false);
printMode(true);

console.log("\n" + "=".repeat(96));
console.log("PICK FRAME (do not implement)");
console.log("=".repeat(96));
console.log(`
Compare (a)/(b)/(c) max residuals above. Prefer the simplest candidate that stays within ~2 mm.
If front and back split ratios disagree, a universal fixed split is not supported by the table.
`);
