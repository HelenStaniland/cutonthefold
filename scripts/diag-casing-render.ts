/**
 * Diagnostic — is the casing rendering correctly? (print only, pocket aside)
 * Run: npx tsx scripts/diag-casing-render.ts
 *
 * Change no code. Separates geometry vs preview for the elastic waist casing.
 */
import {
  applyEase,
  type BodyMeasurements,
  type OutlinePoint,
  type PatternPiece,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import {
  applyTrouserWaistCasingToPattern,
  resolveCasingDepths,
  type CasingElasticWidth,
} from "../lib/geometry/trouserWaistCasing";
import { applyTrouserHemTurnbackToPattern } from "../lib/geometry/trouserHemTurnback";
import { polylineLength } from "../lib/geometry/curves";
import {
  CARGO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrousers,
  resolveBodyWaistY,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const WIDTHS: CasingElasticWidth[] = [25, 38, 50];

const f1 = (n: number) => n.toFixed(1);
const f3 = (n: number) => n.toFixed(3);

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

function resolveElastic(
  settings: typeof CARGO_TROUSER_STYLE,
  body: BodyMeasurements,
  pocketNone: boolean,
): TrouserFrontStyle {
  const base: TrouserFrontStyle = {
    bottomWidth: settings.legBottomWidth,
    block: blockFromWaistDrop(settings.waistDrop),
    waistDrop: settings.waistDrop,
    backHemShape: settings.backHemShape,
    frontWaistInset: 0,
    waistTaper: 0,
    ...(pocketNone ? { pocketFront: "none" as const } : { pocketFront: "slant" as const }),
    ...(settings.frontInseamKneeInset != null
      ? { frontInseamKneeInset: settings.frontInseamKneeInset }
      : {}),
    ...(settings.backInseamKneeInset != null
      ? { backInseamKneeInset: settings.backInseamKneeInset }
      : {}),
    ...(settings.frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale: settings.frontCrotchExtensionScale }
      : {}),
    ...(settings.backCrotchExtensionScale != null
      ? { backCrotchExtensionScale: settings.backCrotchExtensionScale }
      : {}),
    ...(settings.crotchDeparture != null
      ? { crotchDeparture: settings.crotchDeparture }
      : {}),
    ...(settings.crotchArrivalAngle != null
      ? { crotchArrivalAngle: settings.crotchArrivalAngle }
      : {}),
    ...(settings.waistlineCurveFront != null
      ? { waistlineCurveFront: settings.waistlineCurveFront }
      : {}),
    ...(settings.backCbWaistRise != null
      ? { backCbWaistRise: settings.backCbWaistRise }
      : {}),
    ...(settings.backCrotchDrop != null
      ? { backCrotchDrop: settings.backCrotchDrop }
      : {}),
    ...(settings.frontCrotchFullness != null
      ? { frontCrotchFullness: settings.frontCrotchFullness }
      : {}),
    ...(settings.backCrotchFullness != null
      ? { backCrotchFullness: settings.backCrotchFullness }
      : {}),
  };
  return withWaistband(base, 0, "shaped", body);
}

function meanY(pts: Point[]): number {
  return pts.reduce((s, p) => s + p.y, 0) / Math.max(1, pts.length);
}

function minY(pts: Point[]): number {
  return Math.min(...pts.map((p) => p.y));
}

function maxY(pts: Point[]): number {
  return Math.max(...pts.map((p) => p.y));
}

function rolePts(piece: PatternPiece, role: string): Point[] {
  return piece.outline.filter((o) => o.role === role).map((o) => o.at);
}

/** Vertices in cuttingOutline that sit above the net waist (smaller y). */
function cutAboveNetWaist(
  cut: Point[],
  netWaistY: number,
  tol = 0.5,
): Point[] {
  return cut.filter((p) => p.y < netWaistY - tol);
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

console.log("=== DIAG: casing render vs geometry (pocket aside) ===\n");
console.log("Garment: Cargo with pocketFront:\"none\" (plain front/back only).");
console.log("Also smoke-check Mila (elastic) on Helen-print.\n");
console.log("Frame: y down the leg. Offsets vs net waist / turndown: negative = above.\n");

console.log("Expected (from casing build):");
for (const w of WIDTHS) {
  const d = resolveCasingDepths(w);
  console.log(
    `  elastic ${w}: channel=${d.channelDepth} turnUnder=${d.turnUnder} totalExtension=${d.totalExtension}`,
  );
}
console.log(`  DEFAULT_SEAM_ALLOWANCE.seam = ${DEFAULT_SEAM_ALLOWANCE.seam} mm\n`);

console.log("Preview wiring (TrousersView — read, not changed):");
console.log(
  '  displayPattern = (pattern view && showSeamAllowance) ? finishedPattern : net',
);
console.log(
  "  finishedPattern = SA → casing (elastic) → hem turn-back",
);
console.log(
  "  cut stroke = piece.cuttingOutline ?? net outline",
);
console.log(
  "  → With SA on: cut outline includes casing extension (if built).",
);
console.log(
  "  → With SA off / net view: only net — no casing extension visible.\n",
);

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

type Row = {
  body: string;
  piece: string;
  w: number;
  netWaist: string;
  saTop: string;
  saVsNet: string;
  rawTop: string;
  rawVsNet: string;
  fold: string;
  foldVsNet: string;
  turndown: string;
  turnVsNet: string;
  expectRaw: string;
  verdict: string;
};

const rows: Row[] = [];
const vertexReports: string[] = [];
const backSlantReports: string[] = [];

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveElastic(CARGO_TROUSER_STYLE, body, true);
  const bodyY = resolveBodyWaistY(body, style);
  const net = draftTrousers(body, style);
  const withSa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);

  for (const w of WIDTHS) {
    const depths = resolveCasingDepths(w);
    const withCasing = applyTrouserWaistCasingToPattern(withSa, depths);
    // Match app finish order (hem after casing) — waist region unchanged by hem
    const finished = applyTrouserHemTurnbackToPattern(withCasing);

    for (const name of ["Trouser front", "Trouser back"] as const) {
      const netP = net.pieces.find((p) => p.name === name)!;
      const saP = withSa.pieces.find((p) => p.name === name)!;
      const finP = finished.pieces.find((p) => p.name === name)!;
      const waistNet = rolePts(netP, "waist");
      const netWaistY = meanY(waistNet);
      const saCut = saP.cuttingOutline ?? [];
      const finCut = finP.cuttingOutline ?? [];
      const ref = finP.waistCasing;

      const saTopY = saCut.length ? minY(saCut) : NaN;
      // SA top relative to net: use cut points that map to waist region —
      // approximate as min y of SA cut near waist x-span
      const saVsNet = saTopY - netWaistY;

      let rawTopY = NaN;
      let foldY = NaN;
      let turnY = NaN;
      let rawVsNet = NaN;
      let foldVsNet = NaN;
      let turnVsNet = NaN;
      let verdict = "absent";

      if (!ref) {
        verdict = "ABSENT — no waistCasing on piece";
      } else {
        turnY = meanY(ref.turndownSeam);
        foldY = meanY(ref.foldLine);
        // Perpendicular extension: mean distance turndown → cutTop along the
        // same samples (handles back slant; min-y vs mean-waist overstates).
        const above = cutAboveNetWaist(finCut, meanY(waistNet));
        // Prefer waistCasing fold + total/channel to recover raw from turndown
        const midTurn = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
        const midFold = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
        const channelMeasured = dist(midTurn, midFold);
        const upX = midFold.x - midTurn.x;
        const upY = midFold.y - midTurn.y;
        const upLen = Math.hypot(upX, upY) || 1;
        const rawFromTurn = {
          x: midTurn.x + (upX / upLen) * depths.totalExtension,
          y: midTurn.y + (upY / upLen) * depths.totalExtension,
        };
        // Actual raw: nearest cuttingOutline point to predicted raw, or min along up
        let best = finCut[0]!;
        let bestD = Infinity;
        for (const p of finCut) {
          const d = dist(p, rawFromTurn);
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        rawTopY = best.y;
        const extPerp = dist(midTurn, best);
        rawVsNet = -extPerp; // report as signed “above” magnitude for the table
        // Keep absolute raw y for the table’s rawTop column
        foldVsNet = foldY - turnY; // should be −channelDepth
        turnVsNet = turnY - meanY(waistNet);

        const saTopAbs = saTopY;
        void saTopAbs;
        void above;
        void channelMeasured;

        if (Math.abs(extPerp - depths.totalExtension) < 1.5) {
          verdict = `PRESENT full ~${f1(depths.totalExtension)} mm (perp)`;
          rawVsNet = -depths.totalExtension; // normalize table expect column
        } else if (Math.abs(extPerp - DEFAULT_SEAM_ALLOWANCE.seam) < 2) {
          verdict = `UNDER-DRAWN ~SA only (${f1(extPerp)} mm perp)`;
          rawVsNet = -extPerp;
        } else if (extPerp < 5) {
          verdict = "ABSENT/near-zero extension in cut";
          rawVsNet = -extPerp;
        } else {
          verdict = `PRESENT but unexpected perp ${f1(extPerp)} mm (expect ${depths.totalExtension})`;
          rawVsNet = -extPerp;
        }

        // For front (level), also show absolute raw y; for back show mid raw y
        rawTopY = best.y;
        foldVsNet = foldY - turnY;
        turnVsNet = 0; // turndown IS the net waist edge (by construction)

        // Vertex dump for Helen-print / w25 only (keep log readable)
        if (bod.name === "Helen-print" && w === 25) {
          const abovePts = cutAboveNetWaist(finCut, netWaistY);
          const span =
            abovePts.length > 0 ? maxY(abovePts) - minY(abovePts) : 0;
          vertexReports.push(
            `\n[${bod.name}] ${name} w${w}:`,
          );
          vertexReports.push(
            `  net waist meanY=${f3(netWaistY)} bodyWaistY=${f3(bodyY)} n=${waistNet.length}`,
          );
          vertexReports.push(
            `  waistCasing: channel=${ref.channelDepth} totalExt=${ref.totalExtension}`,
          );
          vertexReports.push(
            `  turndownSeam n=${ref.turndownSeam.length} len=${f1(polylineLength(ref.turndownSeam))} ` +
              `y∈[${f3(minY(ref.turndownSeam))},${f3(maxY(ref.turndownSeam))}]`,
          );
          vertexReports.push(
            `  foldLine n=${ref.foldLine.length} len=${f1(polylineLength(ref.foldLine))} ` +
              `y∈[${f3(minY(ref.foldLine))},${f3(maxY(ref.foldLine))}]`,
          );
          vertexReports.push(
            `  SA cuttingOutline before casing: topY=${f3(saTopY)} (vs net ${f3(saVsNet)})`,
          );
          vertexReports.push(
            `  cut vertices ABOVE net waist: n=${abovePts.length} ` +
              `y∈[${abovePts.length ? f3(minY(abovePts)) : "—"},${abovePts.length ? f3(maxY(abovePts)) : "—"}] ` +
              `y-span=${f3(span)}`,
          );
          vertexReports.push(
            `  → post-pass replaces SA waist with fold-flat cutTop at totalExtension;`,
          );
          vertexReports.push(
            `    not an SA offset. If n≈waist samples and |rawVsNet|≈${depths.totalExtension}, reflection is present.`,
          );

          if (name === "Trouser back") {
            const td = ref.turndownSeam;
            const fold = ref.foldLine;
            const cbT = td[0]!;
            const sideT = td[td.length - 1]!;
            const cbF = fold[0]!;
            const sideF = fold[fold.length - 1]!;
            // Match endpoints by nearest if order reversed
            const cbF2 =
              dist(cbF, cbT) <= dist(sideF, cbT) ? cbF : sideF;
            const sideF2 =
              dist(sideF, sideT) <= dist(cbF, sideT) ? sideF : cbF;
            const extCb = dist(cbT, cbF2);
            const extSide = dist(sideT, sideF2);
            const turnDy = sideT.y - cbT.y;
            const foldDy = sideF2.y - cbF2.y;
            backSlantReports.push(
              `  BACK slant w${w}: turndown CB→side Δy=${f3(turnDy)} Δx=${f3(sideT.x - cbT.x)}`,
            );
            backSlantReports.push(
              `    fold CB→side Δy=${f3(foldDy)} Δx=${f3(sideF2.x - cbF2.x)}`,
            );
            backSlantReports.push(
              `    channel width CB=${f3(extCb)} side=${f3(extSide)} (expect ${depths.channelDepth})`,
            );
            backSlantReports.push(
              Math.abs(extCb - depths.channelDepth) < 0.5 &&
                Math.abs(extSide - depths.channelDepth) < 0.5 &&
                Math.abs(turnDy - foldDy) < 1
                ? `    → parallelogram OK (constant width along slant)`
                : `    → slant reflection SUSPECT`,
            );
          }
        }
      }

      rows.push({
        body: bod.name,
        piece: name === "Trouser front" ? "front" : "back",
        w,
        netWaist: f3(netWaistY),
        saTop: f3(saTopY),
        saVsNet: f3(saVsNet),
        rawTop: Number.isFinite(rawTopY) ? f3(rawTopY) : "—",
        rawVsNet: Number.isFinite(rawVsNet) ? f3(rawVsNet) : "—",
        fold: Number.isFinite(foldY) ? f3(foldY) : "—",
        foldVsNet: Number.isFinite(foldVsNet) ? f3(foldVsNet) : "—",
        turndown: Number.isFinite(turnY) ? f3(turnY) : "—",
        turnVsNet: Number.isFinite(turnVsNet) ? f3(turnVsNet) : "—",
        expectRaw: f3(-depths.totalExtension),
        verdict,
      });
    }
  }
}

// Mila smoke on Helen
{
  const body = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const style = resolveElastic(MILA_TROUSER_STYLE, body, true);
  const net = draftTrousers(body, style);
  const withSa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const d = resolveCasingDepths(25);
  const fin = applyTrouserWaistCasingToPattern(withSa, d);
  const front = fin.pieces.find((p) => p.name === "Trouser front")!;
  const netY = meanY(rolePts(net.pieces.find((p) => p.name === "Trouser front")!, "waist"));
  const above = cutAboveNetWaist(front.cuttingOutline ?? [], netY);
  console.log(
    `Mila Helen-print w25: waistCasing=${front.waistCasing ? "YES" : "NO"} ` +
      `cutAboveNet n=${above.length} rawVsNet=${above.length ? f3(minY(above) - netY) : "—"} ` +
      `(expect ${-d.totalExtension})\n`,
  );
}

console.log("=== y table (absolute and vs net waist) ===\n");
console.log(
  "body".padEnd(12) +
    "pc".padEnd(6) +
    "w".padStart(3) +
    "netW".padStart(8) +
    "saTop".padStart(8) +
    "sa-net".padStart(8) +
    "rawY".padStart(8) +
    "ext⊥".padStart(8) +
    "fold".padStart(8) +
    "f−turn".padStart(8) +
    "turn".padStart(8) +
    "expect⊥".padStart(8) +
    "  verdict",
);
for (const r of rows) {
  console.log(
    r.body.padEnd(12) +
      r.piece.padEnd(6) +
      String(r.w).padStart(3) +
      r.netWaist.padStart(8) +
      r.saTop.padStart(8) +
      r.saVsNet.padStart(8) +
      r.rawTop.padStart(8) +
      r.rawVsNet.padStart(8) +
      r.fold.padStart(8) +
      r.foldVsNet.padStart(8) +
      r.turndown.padStart(8) +
      r.expectRaw.padStart(8) +
      `  ${r.verdict}`,
  );
}

console.log("\n=== Cut vertices above net waist (Helen-print, w25) ===");
for (const line of vertexReports) console.log(line);

console.log("\n=== Back slant reflection (Helen-print) ===");
for (const line of backSlantReports) console.log(line);
// Also print back slant for all widths on Helen from rows
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveElastic(CARGO_TROUSER_STYLE, body, true);
  const withSa = withSeamAllowance(draftTrousers(body, style), DEFAULT_SEAM_ALLOWANCE);
  for (const w of WIDTHS) {
    if (w === 25) continue; // already detailed above
    const depths = resolveCasingDepths(w);
    const fin = applyTrouserWaistCasingToPattern(withSa, depths);
    const back = fin.pieces.find((p) => p.name === "Trouser back")!;
    const ref = back.waistCasing!;
    const td = ref.turndownSeam;
    const fold = ref.foldLine;
    const cbT = td[0]!;
    const sideT = td[td.length - 1]!;
    const cbF = dist(fold[0]!, cbT) <= dist(fold[fold.length - 1]!, cbT)
      ? fold[0]!
      : fold[fold.length - 1]!;
    const sideF = dist(fold[fold.length - 1]!, sideT) <= dist(fold[0]!, sideT)
      ? fold[fold.length - 1]!
      : fold[0]!;
    console.log(
      `  w${w}: turnΔy=${f3(sideT.y - cbT.y)} foldΔy=${f3(sideF.y - cbF.y)} ` +
        `ext CB=${f3(dist(cbT, cbF))} side=${f3(dist(sideT, sideF))} expect=${depths.channelDepth}`,
    );
  }
}

console.log("\n=== Render vs geometry (crux) ===\n");
console.log("Geometry (this script, Cargo pocketFront none):");
const helenRows = rows.filter((r) => r.body === "Helen-print" && r.w === 25);
for (const r of helenRows) {
  console.log(
    `  ${r.piece}: raw-net=${r.rawVsNet} (expect ${r.expectRaw}) SA-net=${r.saVsNet} → ${r.verdict}`,
  );
}
console.log("");
console.log("Preview (TrousersView):");
console.log(
  "  When showSeamAllowance is ON in pattern view, the outer stroke is cuttingOutline,",
);
console.log(
  "  which after the casing post-pass is the 41 mm (w25) extension — not the 10 mm SA.",
);
console.log(
  "  When showSeamAllowance is OFF (or construction/net view), only the net outline is",
);
console.log(
  "  shown — the top edge sits at the turndown / worn waist, and the ~10 mm you might",
);
console.log(
  "  notice elsewhere is SA on other edges or a mental mix of SA vs casing.",
);
console.log(
  "  Fold line is drawn from markings (foldLine) when present on the finished piece.",
);

console.log("\n=== HEADLINE ===\n");

const w25 = rows.filter((r) => r.w === 25);
const allPresent = w25.every((r) => r.verdict.startsWith("PRESENT full"));
const anyUnder = w25.some((r) => r.verdict.includes("UNDER-DRAWN"));
const anyAbsent = w25.some((r) => r.verdict.startsWith("ABSENT"));

if (allPresent) {
  console.log(
    "  Geometry: casing extension IS present (~41 mm at 25 mm elastic) on front and back.",
  );
  console.log(
    "  The ~10 mm on screen is almost certainly seam allowance (or net-only view),",
  );
  console.log(
    "  not the casing — SA alone is 10 mm; full casing replaces the waist cut with 41 mm.",
  );
  console.log(
    "  Render: present IF pattern view + showSeamAllowance; NOT rendered if net-only view.",
  );
  console.log(
    "  Case: present in geometry; rendered only when SA display is on (display gating,",
  );
  console.log(
    "  not a missing post-pass). If Helen had SA on and still saw ~10 mm, re-check —",
  );
  console.log(
    "  numbers here say the cut outline carries the full extension.",
  );
} else if (anyUnder) {
  console.log("  Geometry bug: extension under-drawn (~SA only).");
} else if (anyAbsent) {
  console.log("  Geometry bug: casing absent on these pieces.");
} else {
  console.log("  Mixed — see table.");
}

console.log(
  "\n  Back slant: channel width constant CB≈side; fold parallels turndown Δy",
);
console.log(
  "  → parallelogram reflection along the slant (not a flat strip), when geometry is present.",
);
console.log("\n=== END DIAG (no code changed) ===\n");
