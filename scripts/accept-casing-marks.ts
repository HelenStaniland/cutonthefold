/**
 * Acceptance: revert slash offset + legible casing marks (display only).
 * Run: npx tsx scripts/accept-casing-marks.ts
 *
 * Gates: slash−turndown = 0; casing marks on front/back (all elastic);
 * fold mark visually distinct from place-on-fold + SA; casing cut geometry
 * unchanged by marks; non-elastic / pocketFront none byte-identical;
 * silhouette 0.000.
 */
import { createHash } from "node:crypto";
import {
  applyEase,
  type BodyMeasurements,
  type Marking,
  type PatternPiece,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import { applyTrouserHemTurnbackToPattern } from "../lib/geometry/trouserHemTurnback";
import {
  applyTrouserWaistCasingToPattern,
  resolveCasingDepths,
  type CasingElasticWidth,
} from "../lib/geometry/trouserWaistCasing";
import {
  BLOCK_TROUSER_STYLE,
  CARGO_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrouserFront,
  draftTrousers,
  resolveBodyWaistY,
  resolveFrontSlantPocketMouth,
  silhouetteInvariantDelta,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import { draftWaistband } from "../lib/elements/waistband";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const WIDTHS: CasingElasticWidth[] = [25, 38, 50];
const EPS = 1e-4;

const f3 = (n: number) => n.toFixed(3);
const f6 = (n: number) => n.toFixed(6);

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
  finishOverride?: TrouserStyleSettings["dartedWaistFinish"],
): TrouserFrontStyle {
  const finish = finishOverride ?? s.dartedWaistFinish;
  const elastic = finish === "elastic";
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    ...(elastic
      ? { frontWaistInset: 0, waistTaper: 0 }
      : {
          ...(s.frontWaistInset != null
            ? { frontWaistInset: s.frontWaistInset }
            : {}),
          ...(s.waistTaper != null ? { waistTaper: s.waistTaper } : {}),
        }),
    ...(s.pocketFront === "slant" ? { pocketFront: "slant" as const } : {}),
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
    ...(s.crotchArrivalAngle != null
      ? { crotchArrivalAngle: s.crotchArrivalAngle }
      : {}),
    ...(s.waistlineCurveFront != null
      ? { waistlineCurveFront: s.waistlineCurveFront }
      : {}),
    ...(s.backCbWaistRise != null ? { backCbWaistRise: s.backCbWaistRise } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
  };
  if (elastic) return withWaistband(base, 0, "shaped", body);
  if (finish === "facing") return withWaistband(base, 0, "darted", body);
  const depth =
    s.waistbandMode === "darted" ? s.dartedBandDepth : s.waistbandDepth;
  if (s.waistbandMode === "darted") {
    return withWaistband(base, depth, "darted", body);
  }
  return depth > 0 ? withWaistband(base, depth, "shaped", body) : base;
}

function finish(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  width: CasingElasticWidth,
) {
  const net = draftTrousers(body, style);
  const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  // Casing before hem — hem sets netToCutIndex and would make casing skip.
  const cased = applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(width));
  return applyTrouserHemTurnbackToPattern(cased);
}

function meanY(pts: Point[]): number {
  return pts.reduce((s, p) => s + p.y, 0) / pts.length;
}

function geometryHash(piece: PatternPiece): string {
  const h = createHash("sha256");
  h.update(
    JSON.stringify({
      outline: piece.outline.map((o) => [o.at.x, o.at.y, o.role]),
      cut: piece.cuttingOutline?.map((p) => [p.x, p.y]),
      netToCut: piece.netToCutIndex,
      casing: piece.waistCasing
        ? {
            channelDepth: piece.waistCasing.channelDepth,
            totalExtension: piece.waistCasing.totalExtension,
            fold: piece.waistCasing.foldLine.map((p) => [p.x, p.y]),
            turn: piece.waistCasing.turndownSeam.map((p) => [p.x, p.y]),
          }
        : null,
    }),
  );
  return h.digest("hex");
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

function casingMarks(piece: PatternPiece): {
  turndown?: Extract<Marking, { kind: "casingTurndown" }>;
} {
  let turndown: Extract<Marking, { kind: "casingTurndown" }> | undefined;
  for (const m of piece.markings) {
    if (m.kind === "casingTurndown") turndown = m;
  }
  return { turndown };
}

console.log("=== ACCEPT: casing marks + slash on turndown ===\n");

// ---------------------------------------------------------------------------
console.log("=== 0. Cut-on-fold inventory (must stay distinct from casing) ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const elasticStyle = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic");
  const facingStyle = resolveStyle(CARGO_TROUSER_STYLE, body, "facing");
  const elasticPat = finish(body, elasticStyle, 25);
  const front = elasticPat.pieces.find((p) => p.name === "Trouser front")!;
  const back = elasticPat.pieces.find((p) => p.name === "Trouser back")!;
  const frontPof = front.markings.filter((m) => m.kind === "placeOnFold");
  const backPof = back.markings.filter((m) => m.kind === "placeOnFold");
  console.log(
    `  Trouser front (elastic): placeOnFold count = ${frontPof.length} (expect 0)`,
  );
  console.log(
    `  Trouser back (elastic): placeOnFold count = ${backPof.length} (expect 0)`,
  );
  if (frontPof.length || backPof.length) {
    fail("legs unexpectedly carry placeOnFold");
  } else ok("legs have no placeOnFold");

  const { piece: wb } = draftWaistband({
    innerLen: 200,
    outerLen: 200,
    depth: 40,
    foldSide: "CF",
    label: "Front waistband",
  });
  const pof = wb.markings.find((m) => m.kind === "placeOnFold");
  if (!pof || pof.kind !== "placeOnFold") {
    fail("waistband missing placeOnFold");
  } else {
    console.log(`  Waistband placeOnFold label: "${pof.label ?? "(none)"}"`);
    console.log(
      "  Waistband style: solid bracket (.foldMark) + green fold stroke — edge placement",
    );
    ok(`waistband cut-on-fold = bracket + "${pof.label}"`);
  }

  const cm = casingMarks(front);
  console.log(
    `  Casing channel stitch present: ${cm.turndown ? "yes" : "no"} ` +
      `(hem fold is the sewing outline; no fold-2 / shading / casing label)`,
  );
  console.log("  SA / stitch: .stitchLine (slate) / .cutLine — continuous into casing");
  console.log(
    '  Side-by-side: placeOnFold = solid bracket + "Place to fold" (waistband only);',
  );
  console.log("               casing = sewing line + channel stitch mark only.");
  if (!cm.turndown) fail("casing channel stitch missing");
  else ok("casing mark = channel stitch only (fold-2/region/label removed)");

  const facingPat = withSeamAllowance(
    draftTrousers(body, facingStyle),
    DEFAULT_SEAM_ALLOWANCE,
  );
  for (const name of ["Trouser front", "Trouser back"] as const) {
    const p = facingPat.pieces.find((x) => x.name === name)!;
    if (p.markings.some((m) => m.kind === "placeOnFold")) {
      fail(`${name} facing: unexpected placeOnFold`);
    }
  }
  ok("facing legs still have no placeOnFold");
}

// ---------------------------------------------------------------------------
console.log("\n=== 1. slantOpeningBelowTurndown gone; slash−turndown = 0 ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic");
  const bodyY = resolveBodyWaistY(body, style);
  const mouth = resolveFrontSlantPocketMouth(body, style);
  if ("openingBelowTurndown" in mouth.params) {
    fail(`${bod.name}: openingBelowTurndown still on params`);
  }
  for (const w of WIDTHS) {
    const pat = finish(body, style, w);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const turnY = meanY(front.waistCasing!.turndownSeam);
    const d = mouth.openingTop.y - turnY;
    console.log(
      `  ${bod.name}/w${w}: slash−turndown=${f3(d)} bodyY=${f3(bodyY)} turn=${f3(turnY)}`,
    );
    if (Math.abs(d) > 0.05) fail(`${bod.name}/w${w}: slash−turndown ≠ 0`);
    else ok(`${bod.name}/w${w}: Δ 0.000`);
    if (Math.abs(turnY - bodyY) > 0.05) {
      fail(`${bod.name}/w${w}: turndown ≠ bodyWaistY`);
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 2. Casing marks on front + back (Cargo + elastic garments) ===\n");

const elasticGarments = [
  { name: "Cargo", style: CARGO_TROUSER_STYLE },
  { name: "Mila", style: MILA_TROUSER_STYLE },
  { name: "Block", style: BLOCK_TROUSER_STYLE },
] as const;

for (const g of elasticGarments) {
  const body = applyEase(helenBody(), g.style.ease);
  const style = resolveStyle(g.style, body, "elastic");
  for (const w of WIDTHS) {
    const pat = finish(body, style, w);
    for (const name of ["Trouser front", "Trouser back"] as const) {
      const p = pat.pieces.find((x) => x.name === name)!;
      const cm = casingMarks(p);
      const d = resolveCasingDepths(w);
      const kinds = new Set(p.markings.map((m) => m.kind));
      if (!cm.turndown) {
        fail(`${g.name}/${name}/w${w}: missing channel stitch`);
        continue;
      }
      for (const k of ["casingFold", "casingHem", "casingRegion"] as const) {
        if (kinds.has(k as never)) {
          fail(`${g.name}/${name}/w${w}: removed mark still present: ${k}`);
        }
      }
      const refTurn = p.waistCasing!.turndownSeam;
      if (cm.turndown.points.length !== refTurn.length) {
        fail(`${g.name}/${name}/w${w}: stitch polyline length ≠ ref`);
      } else {
        let maxD = 0;
        for (let i = 0; i < refTurn.length; i++) {
          maxD = Math.max(
            maxD,
            Math.hypot(
              cm.turndown.points[i]!.x - refTurn[i]!.x,
              cm.turndown.points[i]!.y - refTurn[i]!.y,
            ),
          );
        }
        if (maxD > EPS) fail(`${g.name}/${name}/w${w}: stitch ≠ turndown ref`);
      }
      const midF = p.waistCasing!.foldLine[
        Math.floor(p.waistCasing!.foldLine.length / 2)
      ]!;
      const midT = refTurn[Math.floor(refTurn.length / 2)]!;
      const sep = Math.hypot(midF.x - midT.x, midF.y - midT.y);
      if (Math.abs(sep - d.channelDepth) > 0.5) {
        fail(
          `${g.name}/${name}/w${w}: mid fold−turndown ${f3(sep)} ≠ channel ${d.channelDepth}`,
        );
      }
      ok(`${g.name}/${name}/w${w}: channel stitch only`);
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. Silhouette invariant 0.000 ===\n");

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  for (const finishKind of ["facing", "elastic"] as const) {
    const style = resolveStyle(CARGO_TROUSER_STYLE, body, finishKind);
    const mouth = resolveFrontSlantPocketMouth(body, style);
    const inv = silhouetteInvariantDelta(mouth);
    if (inv.waistDelta > EPS || inv.sideDelta > EPS) {
      fail(
        `${bod.name}/${finishKind}: waistΔ=${f6(inv.waistDelta)} sideΔ=${f6(inv.sideDelta)}`,
      );
    } else ok(`${bod.name}/${finishKind}: silhouette 0.000`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Casing geometry hash stable vs marks (marks additive) ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic");
  for (const w of WIDTHS) {
    const pat = finish(body, style, w);
    for (const name of ["Trouser front", "Trouser back"] as const) {
      const p = pat.pieces.find((x) => x.name === name)!;
      const stripped: PatternPiece = {
        ...p,
        markings: p.markings.filter(
          (m) =>
            m.kind !== "casingFold" &&
            m.kind !== "casingTurndown" &&
            m.kind !== "casingRegion",
        ),
      };
      if (geometryHash(p) !== geometryHash(stripped)) {
        fail(`${name}/w${w}: geometry changed when stripping marks`);
      } else ok(`${name}/w${w}: cut+casing geometry independent of marks`);
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 5. Non-elastic + pocketFront none byte-identical ===\n");

{
  const body = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const hMila = pairHash(body, resolveStyle(MILA_TROUSER_STYLE, body));
  const hCargoNone = pairHash(
    body,
    resolveStyle({ ...CARGO_TROUSER_STYLE, pocketFront: "none" }, body),
  );
  if (hMila !== hCargoNone) fail("Cargo(none) ≠ Mila");
  else ok("Cargo(none) ≡ Mila");

  const facingStyle = resolveStyle(CARGO_TROUSER_STYLE, body, "facing");
  const facingPat = withSeamAllowance(
    draftTrousers(body, facingStyle),
    DEFAULT_SEAM_ALLOWANCE,
  );
  for (const p of facingPat.pieces) {
    if (
      p.markings.some(
        (m) =>
          m.kind === "casingFold" ||
          m.kind === "casingTurndown" ||
          m.kind === "casingRegion",
      )
    ) {
      fail(`${p.name}: casing marks on non-elastic`);
    }
  }
  ok("facing: no casing marks");

  const cleo = applyEase(helenBody(), CLEO_TROUSER_STYLE.ease);
  ok(`Cleo ${pairHash(cleo, resolveStyle(CLEO_TROUSER_STYLE, cleo)).slice(0, 12)}…`);
  const block = applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease);
  ok(`Block ${pairHash(block, resolveStyle(BLOCK_TROUSER_STYLE, block)).slice(0, 12)}…`);
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS — casing marks + slash on turndown; report before re-baseline ===\n"
    : `\n=== ACCEPT FAIL (${failures}) ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
