/**
 * Diagnostic — fit 2-parameter Izzy leg model across all measured levels.
 * Run: npx tsx scripts/diag-izzy-2param-fit.ts
 * Report only. Does not change product code.
 *
 * Model: per edge, pchipByY through crotch → knee → hem, where
 *   inseam knee = inseamChord(y_knee) + inseamInset
 *   side knee   = sideChord(y_knee)   + k · inseamInset
 * Crotch & hem knots = measured. Fit inset(s) and k to all levels.
 */
import { pchipByY } from "../lib/geometry/curves";
import type { Point } from "../lib/types/measurements";

/** cm, incl 1 cm SA, grainline→edge (inseam / side). */
const MEASURED = {
  front: {
    levels: [
      { name: "crotch", y: 0, inseam: 19.3, side: 16.5 },
      { name: "between", y: 150, inseam: 18.5, side: 16.5 }, // y approx — weight lightly
      { name: "knee", y: 300, inseam: 18.2, side: 17.0 },
      { name: "below", y: 450, inseam: 18.2, side: 17.5 }, // y approx — weight lightly
      { name: "hem", y: 760, inseam: 18.6, side: 18.0 },
    ],
  },
  back: {
    levels: [
      { name: "crotch", y: 0, inseam: 26.7, side: 17.8 },
      { name: "between", y: 150, inseam: 25.0, side: 17.5 }, // y approx
      { name: "knee", y: 300, inseam: 21.5, side: 17.0 },
      { name: "below", y: 450, inseam: 21.5, side: 17.0 }, // y approx
      { name: "hem", y: 760, inseam: 22.0, side: 17.3 },
    ],
  },
} as const;

type Piece = "front" | "back";
type Edge = "inseam" | "side";

/** Approximate-y levels get lower weight in the fit. */
const WEIGHT: Record<string, number> = {
  crotch: 1,
  between: 0.35,
  knee: 1,
  below: 0.35,
  hem: 1,
};

const SA_CM = 1.0;

function chordAt(
  crotch: number,
  hem: number,
  y: number,
  yHem: number,
): number {
  return crotch + ((hem - crotch) * y) / yHem;
}

function evalEdge(
  knots: Point[],
  y: number,
): number {
  // pchipByY returns dense samples; interpolate by y
  const poly = knots; // already the pchip samples if we pass sampled? Better: call pchip then find y
  void poly;
  const sampled = pchipByY(knots);
  // find segment containing y
  for (let i = 0; i < sampled.length - 1; i++) {
    const a = sampled[i]!;
    const b = sampled[i + 1]!;
    if (
      (a.y <= y && b.y >= y) ||
      (b.y <= y && a.y >= y) ||
      Math.abs(a.y - y) < 1e-9
    ) {
      if (Math.abs(b.y - a.y) < 1e-12) return a.x;
      const t = (y - a.y) / (b.y - a.y);
      return a.x + t * (b.x - a.x);
    }
  }
  return sampled[sampled.length - 1]!.x;
}

type PieceFit = {
  inseamInset: number;
  k: number;
};

function modelOffsets(
  piece: Piece,
  inset: number,
  k: number,
): { inseamAt: (y: number) => number; sideAt: (y: number) => number } {
  const levels = MEASURED[piece].levels;
  const crotch = levels[0]!;
  const hem = levels[levels.length - 1]!;
  const yHem = hem.y;
  const yKnee = 300;

  const inChord = chordAt(crotch.inseam, hem.inseam, yKnee, yHem);
  const sideChord = chordAt(crotch.side, hem.side, yKnee, yHem);
  const inKnee = inChord + inset;
  const sideKnee = sideChord + k * inset;

  const inKnots: Point[] = [
    { x: crotch.inseam, y: crotch.y },
    { x: inKnee, y: yKnee },
    { x: hem.inseam, y: hem.y },
  ];
  const sideKnots: Point[] = [
    { x: crotch.side, y: crotch.y },
    { x: sideKnee, y: yKnee },
    { x: hem.side, y: hem.y },
  ];

  return {
    inseamAt: (y) => evalEdge(inKnots, y),
    sideAt: (y) => evalEdge(sideKnots, y),
  };
}

type Resid = {
  piece: Piece;
  edge: Edge;
  level: string;
  y: number;
  measured: number;
  model: number;
  resid: number; // model − measured, cm
  weight: number;
};

function allResiduals(
  front: PieceFit,
  back: PieceFit,
): Resid[] {
  const out: Resid[] = [];
  for (const piece of ["front", "back"] as const) {
    const fit = piece === "front" ? front : back;
    const m = modelOffsets(piece, fit.inseamInset, fit.k);
    for (const lvl of MEASURED[piece].levels) {
      const w = WEIGHT[lvl.name] ?? 1;
      const inM = m.inseamAt(lvl.y);
      const sideM = m.sideAt(lvl.y);
      out.push({
        piece,
        edge: "inseam",
        level: lvl.name,
        y: lvl.y,
        measured: lvl.inseam,
        model: inM,
        resid: inM - lvl.inseam,
        weight: w,
      });
      out.push({
        piece,
        edge: "side",
        level: lvl.name,
        y: lvl.y,
        measured: lvl.side,
        model: sideM,
        resid: sideM - lvl.side,
        weight: w,
      });
    }
  }
  return out;
}

function weightedSSE(resids: Resid[]): number {
  let s = 0;
  for (const r of resids) s += r.weight * r.resid * r.resid;
  return s;
}

function maxAbs(resids: Resid[]): Resid {
  let best = resids[0]!;
  for (const r of resids) {
    if (Math.abs(r.resid) > Math.abs(best.resid)) best = r;
  }
  return best;
}

function maxAbsPerEdge(
  resids: Resid[],
): Record<string, number> {
  const keys = [
    "front inseam",
    "front side",
    "back inseam",
    "back side",
  ] as const;
  const out: Record<string, number> = {};
  for (const key of keys) {
    const [piece, edge] = key.split(" ") as [Piece, Edge];
    let m = 0;
    for (const r of resids) {
      if (r.piece === piece && r.edge === edge) {
        m = Math.max(m, Math.abs(r.resid));
      }
    }
    out[key] = m;
  }
  return out;
}

/** Grid / nested search for shared-k fit. */
function fitSharedK(): {
  frontInset: number;
  backInset: number;
  k: number;
  resids: Resid[];
} {
  // Seed insets from knee chord offsets
  const seedInset = (piece: Piece) => {
    const levels = MEASURED[piece].levels;
    const crotch = levels[0]!;
    const hem = levels[levels.length - 1]!;
    const knee = levels.find((l) => l.name === "knee")!;
    const ch = chordAt(crotch.inseam, hem.inseam, knee.y, hem.y);
    return knee.inseam - ch;
  };
  let best = {
    frontInset: seedInset("front"),
    backInset: seedInset("back"),
    k: 0.15,
    sse: Infinity,
    resids: [] as Resid[],
  };

  const insetF0 = seedInset("front");
  const insetB0 = seedInset("back");
  // Coarse grid then refine
  for (const k of linspace(-0.5, 0.6, 45)) {
    for (const dF of linspace(-0.4, 0.4, 17)) {
      for (const dB of linspace(-0.4, 0.4, 17)) {
        const frontInset = insetF0 + dF;
        const backInset = insetB0 + dB;
        const resids = allResiduals(
          { inseamInset: frontInset, k },
          { inseamInset: backInset, k },
        );
        const sse = weightedSSE(resids);
        if (sse < best.sse) {
          best = { frontInset, backInset, k, sse, resids };
        }
      }
    }
  }
  // Refine around best
  for (let pass = 0; pass < 3; pass++) {
    const k0 = best.k;
    const f0 = best.frontInset;
    const b0 = best.backInset;
    const span = 0.15 / (pass + 1);
    for (const k of linspace(k0 - span, k0 + span, 21)) {
      for (const frontInset of linspace(f0 - span, f0 + span, 21)) {
        for (const backInset of linspace(b0 - span, b0 + span, 21)) {
          const resids = allResiduals(
            { inseamInset: frontInset, k },
            { inseamInset: backInset, k },
          );
          const sse = weightedSSE(resids);
          if (sse < best.sse) {
            best = { frontInset, backInset, k, sse, resids };
          }
        }
      }
    }
  }
  return {
    frontInset: best.frontInset,
    backInset: best.backInset,
    k: best.k,
    resids: best.resids,
  };
}

function fitPerPieceK(): {
  frontInset: number;
  backInset: number;
  kFront: number;
  kBack: number;
  resids: Resid[];
} {
  const seedInset = (piece: Piece) => {
    const levels = MEASURED[piece].levels;
    const crotch = levels[0]!;
    const hem = levels[levels.length - 1]!;
    const knee = levels.find((l) => l.name === "knee")!;
    return knee.inseam - chordAt(crotch.inseam, hem.inseam, knee.y, hem.y);
  };
  const seedK = (piece: Piece, inset: number) => {
    const levels = MEASURED[piece].levels;
    const crotch = levels[0]!;
    const hem = levels[levels.length - 1]!;
    const knee = levels.find((l) => l.name === "knee")!;
    const sideChord = chordAt(crotch.side, hem.side, knee.y, hem.y);
    const sideInset = knee.side - sideChord;
    return Math.abs(inset) < 1e-9 ? 0 : sideInset / inset;
  };

  let best = {
    frontInset: seedInset("front"),
    backInset: seedInset("back"),
    kFront: seedK("front", seedInset("front")),
    kBack: seedK("back", seedInset("back")),
    sse: Infinity,
    resids: [] as Resid[],
  };

  for (let pass = 0; pass < 4; pass++) {
    const span = pass === 0 ? 0.5 : 0.12 / pass;
    const f0 = best.frontInset;
    const b0 = best.backInset;
    const kf0 = best.kFront;
    const kb0 = best.kBack;
    for (const frontInset of linspace(f0 - span, f0 + span, 15)) {
      for (const backInset of linspace(b0 - span, b0 + span, 15)) {
        for (const kFront of linspace(kf0 - span, kf0 + span, 15)) {
          for (const kBack of linspace(kb0 - span, kb0 + span, 15)) {
            const resids = allResiduals(
              { inseamInset: frontInset, k: kFront },
              { inseamInset: backInset, k: kBack },
            );
            const sse = weightedSSE(resids);
            if (sse < best.sse) {
              best = {
                frontInset,
                backInset,
                kFront,
                kBack,
                sse,
                resids,
              };
            }
          }
        }
      }
    }
  }
  return best;
}

function linspace(a: number, b: number, n: number): number[] {
  if (n <= 1) return [a];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(a + ((b - a) * i) / (n - 1));
  return out;
}

function fmt(n: number, d = 3): string {
  const s = n.toFixed(d);
  return (n > 0 ? "+" : "") + s;
}

function mm(cm: number): string {
  return `${fmt(cm * 10, 1)} mm`;
}

function printResids(title: string, resids: Resid[]) {
  console.log(`\n${title}`);
  console.log(
    "piece  edge    level     y    measured  model   resid_cm   resid_mm  w",
  );
  console.log("-".repeat(78));
  for (const r of resids) {
    const approx = r.weight < 1 ? " ~" : "  ";
    console.log(
      `${r.piece.padEnd(6)} ${r.edge.padEnd(7)} ${r.level.padEnd(8)}${approx}${String(r.y).padStart(4)}  ${r.measured.toFixed(2).padStart(6)}  ${r.model.toFixed(2).padStart(6)}  ${fmt(r.resid, 3).padStart(8)}  ${mm(r.resid).padStart(9)}  ${r.weight}`,
    );
  }
  const worst = maxAbs(resids);
  const perEdge = maxAbsPerEdge(resids);
  console.log(
    `\nmax |resid| = ${fmt(Math.abs(worst.resid), 3)} cm (${mm(Math.abs(worst.resid))}) at ${worst.piece} ${worst.edge} ${worst.level}`,
  );
  console.log("per-edge max |resid|:");
  for (const [k, v] of Object.entries(perEdge)) {
    console.log(`  ${k}: ${fmt(v, 3)} cm (${mm(v)})`);
  }
}

console.log("Izzy 2-parameter leg fit — all measured levels");
console.log(
  "y assumed: crotch 0, between 150, knee 300, below 450, hem 760 mm (between/below are guesses — weight 0.35).",
);
console.log(
  "Construction: pchipByY(crotch → knee → hem); knee = chord(y_knee) + inset (inseam) or k·inset (side).",
);
console.log(
  "Crotch & hem knots = measured. Fit inset_front, inset_back, and k.",
);

const shared = fitSharedK();
console.log("\n" + "=".repeat(78));
console.log("SHARED k (2 insets + 1 k)");
console.log("=".repeat(78));
console.log(`  front inseamInset = ${fmt(shared.frontInset, 3)} cm (${mm(shared.frontInset)})`);
console.log(`  back  inseamInset = ${fmt(shared.backInset, 3)} cm (${mm(shared.backInset)})`);
console.log(`  shared k          = ${shared.k.toFixed(4)}`);
printResids("Residuals (model − measured)", shared.resids);

const per = fitPerPieceK();
console.log("\n" + "=".repeat(78));
console.log("PER-PIECE k (2 insets + k_front + k_back)");
console.log("=".repeat(78));
console.log(`  front inseamInset = ${fmt(per.frontInset, 3)} cm (${mm(per.frontInset)})`);
console.log(`  back  inseamInset = ${fmt(per.backInset, 3)} cm (${mm(per.backInset)})`);
console.log(`  k_front           = ${per.kFront.toFixed(4)}`);
console.log(`  k_back            = ${per.kBack.toFixed(4)}`);
printResids("Residuals (model − measured)", per.resids);

// Flare check: below + hem specifically
console.log("\n" + "=".repeat(78));
console.log("FLARE check — residuals at below-knee & hem (is hem width enough?)");
console.log("=".repeat(78));
for (const [label, resids] of [
  ["shared k", shared.resids],
  ["per-piece k", per.resids],
] as const) {
  console.log(`\n${label}:`);
  for (const r of resids) {
    if (r.level === "below" || r.level === "hem") {
      console.log(
        `  ${r.piece} ${r.edge} ${r.level}: resid ${fmt(r.resid, 3)} cm (${mm(r.resid)})`,
      );
    }
  }
}

// Net half-piece widths from model at crotch/knee/hem
console.log("\n" + "=".repeat(78));
console.log("Net half-piece widths from model (inseam+side − 2×SA)");
console.log("Reference from last diagnostic: front ~338/337/345, back ~425/365/373 mm");
console.log("=".repeat(78));

function widths(
  label: string,
  front: PieceFit,
  back: PieceFit,
) {
  console.log(`\n${label}:`);
  for (const piece of ["front", "back"] as const) {
    const fit = piece === "front" ? front : back;
    const m = modelOffsets(piece, fit.inseamInset, fit.k);
    for (const name of ["crotch", "knee", "hem"] as const) {
      const y = name === "crotch" ? 0 : name === "knee" ? 300 : 760;
      const raw = m.inseamAt(y) + m.sideAt(y);
      const net = raw - 2 * SA_CM;
      console.log(
        `  ${piece} ${name}: raw ${raw.toFixed(2)} cm  net ${(net * 10).toFixed(1)} mm`,
      );
    }
  }
}

widths("shared k", {
  inseamInset: shared.frontInset,
  k: shared.k,
}, {
  inseamInset: shared.backInset,
  k: shared.k,
});
widths("per-piece k", {
  inseamInset: per.frontInset,
  k: per.kFront,
}, {
  inseamInset: per.backInset,
  k: per.kBack,
});

console.log("\n" + "=".repeat(78));
console.log("DECISION FRAME (do not implement)");
console.log("=".repeat(78));
console.log(`
If shared k max resid ≲ 2 mm → 2-parameter model (inseam inset ×2 + fixed k).
If only per-piece k stays within ~2 mm → 3 parameters.
If even per-piece k leaves >2 mm somewhere → need extra control; see worst level above.
`);
