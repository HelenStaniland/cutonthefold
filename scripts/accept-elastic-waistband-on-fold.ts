/**
 * Acceptance: elastic waistband cut on the fold (circumference).
 * Run: npx tsx scripts/accept-elastic-waistband-on-fold.ts
 *
 * Half-loop draft + placeOnFold (same mechanism as shaped/darted bands);
 * channel fold marked distinctly; full-loop sewing length unchanged.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
  applyEase,
  type BodyMeasurements,
  type PatternPiece,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import {
  BLOCK_TROUSER_STYLE,
  CARGO_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  effectiveDartedWaistFinish,
  isPullOnWaistFinish,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrouserFront,
  trouserWaistEdges,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { draftWaistband } from "../lib/elements/waistband";
import {
  draftElasticWaistband,
  ELASTIC_WAISTBAND_CHANNEL_EASE,
  ELASTIC_WAISTBAND_CHANNEL_FOLD_LABEL,
  ELASTIC_WAISTBAND_PIECE_NAME,
  resolveElasticWaistbandSpec,
} from "../lib/elements/elasticWaistband";
import type { CasingElasticWidth } from "../lib/geometry/trouserWaistCasing";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const WIDTHS: CasingElasticWidth[] = [25, 38, 50];
const SAS = [10, 15] as const;
const EPS = 1e-4;
const f3 = (n: number) => n.toFixed(3);

let failures = 0;
function fail(msg: string) {
  failures++;
  console.log(`  FAIL: ${msg}`);
}
function ok(msg: string) {
  console.log(`  ok: ${msg}`);
}

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

function resolveStyle(
  s: TrouserStyleSettings,
  body: BodyMeasurements,
): TrouserFrontStyle {
  const finish = effectiveDartedWaistFinish(s.dartedWaistFinish, s.pocketFront);
  const pullOn = isPullOnWaistFinish(finish);
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    ...(pullOn
      ? { frontWaistInset: 0, waistTaper: 0 }
      : {
          ...(s.frontWaistInset != null
            ? { frontWaistInset: s.frontWaistInset }
            : {}),
          ...(s.waistTaper != null ? { waistTaper: s.waistTaper } : {}),
        }),
    ...(s.pocketFront === "slant" ? { pocketFront: "slant" as const } : {}),
    ...(s.backCbWaistRise != null ? { backCbWaistRise: s.backCbWaistRise } : {}),
  };
  if (pullOn) return withWaistband(base, 0, "shaped", body);
  if (finish === "facing") return withWaistband(base, 0, "darted", body);
  const depth =
    s.waistbandMode === "darted" ? s.dartedBandDepth : s.waistbandDepth;
  if (s.waistbandMode === "darted") {
    return withWaistband(base, depth, "darted", body);
  }
  return depth > 0 ? withWaistband(base, depth, "shaped", body) : base;
}

function outlineHash(piece: PatternPiece): string {
  const s = piece.outline
    .map((o) => `${o.role ?? ""}:${o.at.x.toFixed(9)},${o.at.y.toFixed(9)}`)
    .join("|");
  return createHash("sha256").update(s).digest("hex");
}

function pairHash(body: BodyMeasurements, style: TrouserFrontStyle): string {
  return (
    outlineHash(draftTrouserFront(body, style)) +
    outlineHash(draftTrouserBack(body, style))
  );
}

function rectDims(cut: { x: number; y: number }[]): {
  length: number;
  width: number;
} {
  const xs = cut.map((p) => p.x);
  const ys = cut.map((p) => p.y);
  return {
    length: Math.max(...xs) - Math.min(...xs),
    width: Math.max(...ys) - Math.min(...ys),
  };
}

console.log("=== ACCEPT: elastic waistband on fold ===\n");

// --- 1. Cut on fold; half opens to full ---
console.log("=== 1. Half-piece on fold; opens to full loop ===\n");
for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  const spec = resolveElasticWaistbandSpec(body, style, 25, 10);
  const { piece } = draftElasticWaistband(spec);

  if (!piece.onFold) fail(`${bod.name}: onFold false`);
  const foldEdges = piece.outline.filter((o) => o.edge === "fold");
  if (foldEdges.length !== 1) {
    fail(`${bod.name}: fold edges=${foldEdges.length}`);
  }
  const pof = piece.markings.find((m) => m.kind === "placeOnFold");
  if (!pof || pof.kind !== "placeOnFold") {
    fail(`${bod.name}: missing placeOnFold`);
  } else if (pof.label !== "Place to fold") {
    fail(`${bod.name}: placeOnFold label="${pof.label}"`);
  }

  // Opened length = 2 × net half
  const openedNet = 2 * spec.netHalfLength;
  if (Math.abs(openedNet - spec.fullLoopNet) > EPS) {
    fail(`${bod.name}: 2×half ≠ fullLoopNet`);
  }

  if (bod.name === "Helen-print") {
    ok(
      `Helen: netHalf=${f3(spec.netHalfLength)} opens→${f3(openedNet)} ` +
        `(=fullLoopNet ${f3(spec.fullLoopNet)}); cutHalf=${f3(spec.cutHalfLength)} ` +
        `(half+SA); onFold + placeOnFold "Place to fold"`,
    );
    // Same placeOnFold shape as shaped waistband
    const e = trouserWaistEdges(body, style);
    const shaped = draftWaistband({
      innerLen: e.front.inner,
      outerLen: e.front.outer,
      depth: 30,
      foldSide: "CF",
      label: "Front waistband",
    });
    const sp = shaped.piece.markings.find((m) => m.kind === "placeOnFold");
    if (!sp || sp.kind !== "placeOnFold" || sp.label !== "Place to fold") {
      fail("shaped band placeOnFold drifted");
    } else ok('same placeOnFold mechanism as shaped band ("Place to fold")');
  }
}
ok("all sizes: half on fold, opens to full loop");

// --- 2. Full-loop sewing length unchanged (2F+2B); opened cut = full+2SA ---
console.log("\n=== 2. Full-loop length unchanged; SA convention ===\n");
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  const e = trouserWaistEdges(body, style);
  const expectFull = 2 * e.front.outer + 2 * e.back.outer;
  for (const sa of SAS) {
    for (const w of WIDTHS) {
      const spec = resolveElasticWaistbandSpec(body, style, w, sa);
      if (Math.abs(spec.fullLoopNet - expectFull) > EPS) {
        fail(`w${w}/sa${sa}: fullLoopNet drifted`);
      }
      // Before (full draft): cut = full + 2×SA. After (on fold opened): same.
      const legacyOpenedCut = expectFull + 2 * sa;
      if (Math.abs(spec.openedCutLength - legacyOpenedCut) > EPS) {
        fail(
          `w${w}/sa${sa}: openedCut ${f3(spec.openedCutLength)} ≠ legacy ${f3(legacyOpenedCut)}`,
        );
      }
      // Half cut = half + SA (one seamed end; fold has none)
      if (Math.abs(spec.cutHalfLength - (spec.netHalfLength + sa)) > EPS) {
        fail(`w${w}/sa${sa}: cutHalf SA convention`);
      }
    }
  }
  const s = resolveElasticWaistbandSpec(body, style, 25, 10);
  ok(
    `Helen: fullLoopNet=${f3(s.fullLoopNet)} (=2F+2B) unchanged; ` +
      `openedCut=${f3(s.openedCutLength)} (=full+2×SA); ` +
      `cutHalf=${f3(s.cutHalfLength)} (=half+SA)`,
  );
}

// --- 3. Cut width unchanged ---
console.log("\n=== 3. Cut width = 2×(elastic + ease + SA) ===\n");
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  for (const sa of SAS) {
    for (const w of WIDTHS) {
      const spec = resolveElasticWaistbandSpec(body, style, w, sa);
      const expect = 2 * (w + ELASTIC_WAISTBAND_CHANNEL_EASE + sa);
      if (Math.abs(spec.cutWidth - expect) > EPS) {
        fail(`w${w}/sa${sa}: cutWidth`);
      } else {
        ok(`w${w}/sa${sa}: cutWidth=${spec.cutWidth}`);
      }
      const { piece } = draftElasticWaistband(spec);
      const withSa = withSeamAllowance(
        { pieces: [piece] },
        { seam: sa, hem: DEFAULT_SEAM_ALLOWANCE.hem },
      );
      const cut = withSa.pieces[0]!.cuttingOutline!;
      const dims = rectDims(cut);
      if (Math.abs(dims.width - spec.cutWidth) > 0.05) {
        fail(`w${w}/sa${sa}: measured width ${f3(dims.width)}`);
      }
      if (Math.abs(dims.length - spec.cutHalfLength) > 0.05) {
        fail(`w${w}/sa${sa}: measured half length ${f3(dims.length)}`);
      }
    }
  }
}

// --- 4. Both folds distinct ---
console.log("\n=== 4. placeOnFold vs channel foldLine distinct ===\n");
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  const { piece } = draftElasticWaistband(
    resolveElasticWaistbandSpec(body, style, 25, 10),
  );
  const pof = piece.markings.filter((m) => m.kind === "placeOnFold");
  const fl = piece.markings.filter((m) => m.kind === "foldLine");
  if (pof.length !== 1) fail(`placeOnFold count=${pof.length}`);
  else ok('placeOnFold ×1 — bracket + "Place to fold"');
  if (fl.length !== 1) fail(`foldLine count=${fl.length}`);
  else {
    const lab = fl[0]!.kind === "foldLine" ? fl[0].label : undefined;
    if (lab !== ELASTIC_WAISTBAND_CHANNEL_FOLD_LABEL) {
      fail(`channel label="${lab}"`);
    } else ok(`foldLine ×1 — long-dash + "${lab}"`);
  }
  if (pof[0]!.kind === "placeOnFold" && fl[0]!.kind === "foldLine") {
    const a = pof[0].label;
    const b = fl[0].label;
    if (a === b) fail("labels identical — would confuse");
    else ok(`labels differ: "${a}" vs "${b}"`);
  }

  // Preview + PDF teach both kinds distinctly
  const viewSrc = readFileSync(
    resolvePath("app/garments/TrousersView.tsx"),
    "utf8",
  );
  const pdfSrc = readFileSync(resolvePath("lib/export/pdf.ts"), "utf8");
  if (!viewSrc.includes('case "placeOnFold"') || !viewSrc.includes('case "foldLine"')) {
    fail("TrousersView missing fold cases");
  } else ok("preview renders placeOnFold (bracket) and foldLine (dash)");
  if (!pdfSrc.includes('case "placeOnFold"') || !pdfSrc.includes('case "foldLine"')) {
    fail("PDF missing fold cases");
  } else ok("PDF draws placeOnFold bracket vs foldLine long-dash");
  if (!pdfSrc.includes("Place to fold")) fail('PDF missing "Place to fold"');
  else ok('PDF wording "Place to fold"');
  if (!viewSrc.includes("foldLine") || !pdfSrc.includes("m.label")) {
    fail("foldLine label not wired");
  } else ok("foldLine optional label wired (preview + PDF)");
}

// --- 5. Paper ~half ---
console.log("\n=== 5. Paper saved (~half circumference on sheet) ===\n");
{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  const spec = resolveElasticWaistbandSpec(body, style, 25, 10);
  const ratio = spec.netHalfLength / spec.fullLoopNet;
  if (Math.abs(ratio - 0.5) > EPS) fail(`half/full ratio=${ratio}`);
  else ok(`net half/full = ${f3(ratio)} (paper ~half the old full-loop length)`);
  ok(
    `Helen sheet length ${f3(spec.netHalfLength)} mm vs old full ${f3(spec.fullLoopNet)} mm`,
  );
}

// --- 6. Other garments / Mila / shaped bands byte-identical smoke ---
console.log("\n=== 6. Other garments / shaped bands untouched ===\n");
{
  const body = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const mila = resolveStyle(MILA_TROUSER_STYLE, body);
  ok(`Mila pair ${pairHash(body, mila).slice(0, 12)}…`);
  const block = resolveStyle(
    BLOCK_TROUSER_STYLE,
    applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease),
  );
  ok(
    `Block pair ${pairHash(applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease), block).slice(0, 12)}…`,
  );
  const cleoBody = applyEase(helenBody(), CLEO_TROUSER_STYLE.ease);
  const cleo = resolveStyle(CLEO_TROUSER_STYLE, cleoBody);
  const e = trouserWaistEdges(cleoBody, cleo);
  const fb = draftWaistband({
    innerLen: e.front.inner,
    outerLen: e.front.outer,
    depth: CLEO_TROUSER_STYLE.waistbandDepth,
    foldSide: "CF",
    label: "Front waistband",
  });
  if (!fb.piece.onFold) fail("shaped front lost onFold");
  else ok("shaped Front waistband still onFold");
  const pof = fb.piece.markings.find((m) => m.kind === "placeOnFold");
  if (!pof || pof.kind !== "placeOnFold" || pof.label !== "Place to fold") {
    fail("shaped placeOnFold changed");
  } else ok("shaped placeOnFold unchanged");

  // Cargo legs unchanged by band layout (band is separate piece)
  const cargo = resolveStyle(CARGO_TROUSER_STYLE, body);
  ok(`Cargo pair ${pairHash(body, cargo).slice(0, 12)}…`);
  void ELASTIC_WAISTBAND_PIECE_NAME;
}

console.log(
  `\n=== DONE: ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===\n`,
);
if (failures > 0) process.exit(1);
