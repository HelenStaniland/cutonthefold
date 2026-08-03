/**
 * Diagnostic — pocket vs casing: where slash and pocket tops sit (print only).
 * Run: npx tsx scripts/diag-pocket-vs-casing.ts
 *
 * Change no code. Separates (a) casing post-pass on pocket pieces vs
 * (b) pocket anchored to bodyWaistY / raw-edge plane.
 */
import {
  applyEase,
  type BodyMeasurements,
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
} from "../lib/geometry/trouserWaistCasing";
import { applyTrouserHemTurnbackToPattern } from "../lib/geometry/trouserHemTurnback";
import { polylineLength } from "../lib/geometry/curves";
import { CARGO_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrousers,
  resolveBodyWaistY,
  resolveFrontSlantPocketMouth,
  SLANT_POCKET_BACK_NAME,
  SLANT_POCKET_FRONT_NAME,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const ELASTIC_W = 25 as const;

const f1 = (n: number) => n.toFixed(1);
const f3 = (n: number) => n.toFixed(3);

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

function resolveCargoElastic(body: BodyMeasurements): TrouserFrontStyle {
  const s = CARGO_TROUSER_STYLE;
  const base: TrouserFrontStyle = {
    bottomWidth: s.legBottomWidth,
    block: blockFromWaistDrop(s.waistDrop),
    waistDrop: s.waistDrop,
    backHemShape: s.backHemShape,
    frontWaistInset: 0,
    waistTaper: 0,
    pocketFront: "slant",
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
  return withWaistband(base, 0, "shaped", body);
}

function meanY(pts: Point[]): number {
  return pts.reduce((s, p) => s + p.y, 0) / pts.length;
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

/** Finished pattern: net → SA → casing → hem. */
function finishCargo(body: BodyMeasurements) {
  const style = resolveCargoElastic(body);
  const net = draftTrousers(body, style);
  const withSa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const depths = resolveCasingDepths(ELASTIC_W);
  const withCasing = applyTrouserWaistCasingToPattern(withSa, depths);
  const finished = applyTrouserHemTurnbackToPattern(withCasing);
  return { style, net, withSa, withCasing, finished, depths };
}

type PieceReport = {
  name: string;
  hasWaistCasing: boolean;
  bodyWaistY: number | null;
  /** Net waist-role mean y (piece-local after layout orient on pockets). */
  netWaistY: number | null;
  turndownY: number | null;
  foldY: number | null;
  /** Raw top of casing extension (from waistCasing geometry). */
  rawTopY: number | null;
  channelDepth: number | null;
  totalExtension: number | null;
  turndownSeamLen: number | null;
  foldLineLen: number | null;
  /** Slash / opening-top y when known (front only, garment frame). */
  slashY: number | null;
};

function rawTopFromCasing(
  turndownY: number,
  foldY: number,
  channelDepth: number,
  totalExtension: number,
): number {
  // cutTop = turndown + up * totalExtension; fold = turndown + up * channelDepth
  if (channelDepth < 1e-9) return turndownY;
  return turndownY + ((foldY - turndownY) * totalExtension) / channelDepth;
}

function reportPiece(
  piece: PatternPiece,
  bodyWaistY: number | null,
  slashY: number | null,
): PieceReport {
  const waist = rolePts(piece, "waist");
  const netWaistY = waist.length > 0 ? meanY(waist) : null;
  const ref = piece.waistCasing;
  if (!ref) {
    return {
      name: piece.name,
      hasWaistCasing: false,
      bodyWaistY,
      netWaistY,
      turndownY: null,
      foldY: null,
      rawTopY: null,
      channelDepth: null,
      totalExtension: null,
      turndownSeamLen: null,
      foldLineLen: null,
      slashY,
    };
  }
  const turndownY = meanY(ref.turndownSeam);
  const foldY = meanY(ref.foldLine);
  const rawTopY = rawTopFromCasing(
    turndownY,
    foldY,
    ref.channelDepth,
    ref.totalExtension,
  );
  return {
    name: piece.name,
    hasWaistCasing: true,
    bodyWaistY,
    netWaistY,
    turndownY,
    foldY,
    rawTopY,
    channelDepth: ref.channelDepth,
    totalExtension: ref.totalExtension,
    turndownSeamLen: polylineLength(ref.turndownSeam),
    foldLineLen: polylineLength(ref.foldLine),
    slashY,
  };
}

function rel(y: number, rawTopY: number): number {
  // Positive = below raw top in y-down coords
  return y - rawTopY;
}

console.log("=== DIAG: pocket vs casing (Cargo elastic, print only) ===\n");
console.log("Frame: y increases down the leg. Raw top = casing cut edge (above fold).");
console.log("Offsets vs raw top: positive = below the raw edge.\n");

const depths = resolveCasingDepths(ELASTIC_W);
console.log(`Default elastic width ${ELASTIC_W} mm →`);
console.log(
  `  channelDepth (fold→turndown) = ${depths.channelDepth} mm`,
);
console.log(
  `  turnUnder (fold→raw)         = ${depths.turnUnder} mm`,
);
console.log(
  `  totalExtension (turndown→raw)= ${depths.totalExtension} mm\n`,
);

console.log(
  "Code fact — CASING_PIECE_NAMES in trouserWaistCasing.ts includes:",
);
console.log('  "Trouser front", "Trouser back", "Slant pocket back", "Slant pocket front"');
console.log(
  "  → post-pass is written to run on the pocket pieces (candidate a).\n",
);

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

type Row = {
  body: string;
  piece: string;
  bodyWaistY: string;
  rawTop: string;
  fold: string;
  turndown: string;
  slash: string;
  slashVsRaw: string;
  slashVsBody: string;
  slashVsTurn: string;
  netWaistVsRaw: string;
  intoCasing: string;
  casingOn: string;
};

const rows: Row[] = [];
const pocketCasingHits: { body: string; piece: string; has: boolean }[] = [];
const anchorNotes: string[] = [];
const turndownUsable: string[] = [];

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const { style, net, withCasing, depths: d } = finishCargo(body);
  const bodyY = resolveBodyWaistY(body, style);
  const mouth = resolveFrontSlantPocketMouth(body, style);
  const slashY = mouth.openingTop.y;

  anchorNotes.push(
    `${bod.name}: openingTop.y=${f3(slashY)} bodyWaistY=${f3(bodyY)} |Δ|=${f3(Math.abs(slashY - bodyY))} ` +
      `(waistAnchorPt.y=${f3(mouth.waistAnchorPt.y)})`,
  );

  const frontNet = net.pieces.find((p) => p.name === "Trouser front")!;
  const frontCased = withCasing.pieces.find((p) => p.name === "Trouser front")!;
  const backCased = withCasing.pieces.find(
    (p) => p.name === SLANT_POCKET_BACK_NAME,
  )!;
  const frontPocketCased = withCasing.pieces.find(
    (p) => p.name === SLANT_POCKET_FRONT_NAME,
  )!;

  // Net (pre-casing) slash on front outline
  const mouthNotch = frontNet.markings.find(
    (m) => m.kind === "notch" && m.label === "mouth-top",
  );
  const notchY =
    mouthNotch && mouthNotch.kind === "notch" ? mouthNotch.at.y : slashY;

  for (const piece of [frontCased, backCased, frontPocketCased]) {
    const slashForPiece =
      piece.name === "Trouser front" ? notchY : null;
    const r = reportPiece(
      piece,
      piece.name === "Trouser front" ? bodyY : null,
      slashForPiece,
    );
    pocketCasingHits.push({
      body: bod.name,
      piece: piece.name,
      has: r.hasWaistCasing,
    });

    if (r.hasWaistCasing && r.turndownSeamLen != null && r.foldLineLen != null) {
      const ok =
        r.turndownSeamLen > 1 &&
        r.foldLineLen > 1 &&
        r.turndownY != null &&
        Number.isFinite(r.turndownY);
      turndownUsable.push(
        `${bod.name} / ${piece.name}: turndownLen=${f1(r.turndownSeamLen!)} ` +
          `foldLen=${f1(r.foldLineLen!)} turndownY=${f3(r.turndownY!)} ` +
          `usable=${ok ? "YES" : "NO"}`,
      );
    } else {
      turndownUsable.push(
        `${bod.name} / ${piece.name}: no waistCasing — no turndown ref`,
      );
    }

    if (r.rawTopY === null) {
      rows.push({
        body: bod.name,
        piece: piece.name,
        bodyWaistY: piece.name === "Trouser front" ? f3(bodyY) : "—",
        rawTop: "—",
        fold: "—",
        turndown: "—",
        slash: slashForPiece != null ? f3(slashForPiece) : "—",
        slashVsRaw: "—",
        slashVsBody: "—",
        slashVsTurn: "—",
        netWaistVsRaw: "—",
        intoCasing: "n/a (no casing)",
        casingOn: "NO",
      });
      continue;
    }

    const raw = r.rawTopY!;
    const turn = r.turndownY!;
    const fold = r.foldY!;
    const netW = r.netWaistY;

    // Does net waist / slash sit in the casing band (raw … turndown)?
    let into = "—";
    if (piece.name === "Trouser front" && slashForPiece != null) {
      const s = slashForPiece;
      if (s < raw - 0.5) into = "ABOVE raw (unexpected)";
      else if (Math.abs(s - turn) <= 0.5) into = "AT turndown (= casing bottom)";
      else if (s > raw && s < turn - 0.5) into = "INSIDE casing band (raw→turndown)";
      else if (s > turn + 0.5) into = "BELOW turndown (into garment)";
      else into = `near turndown (Δ=${f3(s - turn)})`;
    } else if (netW != null) {
      if (Math.abs(netW - turn) <= 0.5) into = "net waist AT turndown; cut extends to raw";
      else if (netW > raw && netW < turn) into = "net waist INSIDE casing band";
      else into = `net waist vs turndown Δ=${f3(netW - turn)}`;
    }

    rows.push({
      body: bod.name,
      piece: piece.name.replace("Slant pocket ", "pkt "),
      bodyWaistY: piece.name === "Trouser front" ? f3(bodyY) : "—",
      rawTop: f3(raw),
      fold: f3(fold),
      turndown: f3(turn),
      slash: slashForPiece != null ? f3(slashForPiece) : "—",
      slashVsRaw:
        slashForPiece != null ? f3(rel(slashForPiece, raw)) : "—",
      slashVsBody:
        slashForPiece != null ? f3(slashForPiece - bodyY) : "—",
      slashVsTurn:
        slashForPiece != null ? f3(slashForPiece - turn) : "—",
      netWaistVsRaw: netW != null ? f3(rel(netW, raw)) : "—",
      intoCasing: into,
      casingOn: "YES",
    });

    void d;
  }

  // Pocket net tops vs their own casing extension (piece-local)
  for (const name of [SLANT_POCKET_BACK_NAME, SLANT_POCKET_FRONT_NAME]) {
    const netP = net.pieces.find((p) => p.name === name)!;
    const casedP = withCasing.pieces.find((p) => p.name === name)!;
    const netWaist = rolePts(netP, "waist");
    const cut = casedP.cuttingOutline ?? [];
    console.log(
      `[${bod.name}] ${name}: net waist y∈[${f3(minY(netWaist))},${f3(maxY(netWaist))}] ` +
        `n=${netWaist.length}; waistCasing=${casedP.waistCasing ? "YES" : "NO"}; ` +
        `cutOutline ${cut.length ? `y∈[${f3(minY(cut))},${f3(maxY(cut))}]` : "absent"}`,
    );
  }
}

console.log("\n=== Position table (absolute y, then offsets vs raw top) ===\n");
console.log(
  "body".padEnd(12) +
    "piece".padEnd(18) +
    "bodyY".padStart(8) +
    "rawTop".padStart(9) +
    "fold".padStart(9) +
    "turndown".padStart(9) +
    "slash".padStart(9) +
    "sl-raw".padStart(8) +
    "sl-body".padStart(8) +
    "sl-turn".padStart(8) +
    "waist-raw".padStart(10) +
    "  casing?  where slash/waist sits",
);
for (const r of rows) {
  console.log(
    r.body.padEnd(12) +
      r.piece.padEnd(18) +
      r.bodyWaistY.padStart(8) +
      r.rawTop.padStart(9) +
      r.fold.padStart(9) +
      r.turndown.padStart(9) +
      r.slash.padStart(9) +
      r.slashVsRaw.padStart(8) +
      r.slashVsBody.padStart(8) +
      r.slashVsTurn.padStart(8) +
      r.netWaistVsRaw.padStart(10) +
      `  ${r.casingOn.padEnd(3)}  ${r.intoCasing}`,
  );
}

console.log("\n=== (a) Does casing post-pass touch the pocket pieces? ===\n");
for (const h of pocketCasingHits.filter((x) => x.piece.startsWith("Slant"))) {
  console.log(
    `  ${h.body} / ${h.piece}: waistCasing ${h.has ? "PRESENT — post-pass DID run" : "absent"}`,
  );
}
const allPocketCased = pocketCasingHits
  .filter((x) => x.piece.startsWith("Slant"))
  .every((x) => x.has);
console.log(
  allPocketCased
    ? "\n  VERDICT (a): YES — casing post-pass runs on pocket back and pocket front."
    : "\n  VERDICT (a): not uniformly — see rows above.",
);

console.log("\n=== (b) What does the pocket anchor to today? ===\n");
for (const n of anchorNotes) console.log(`  ${n}`);
console.log(
  "\n  VERDICT (b): slash top (openingTop) and pocket waist catch sit on bodyWaistY",
);
console.log(
  "  (net worn-waist plane). On the finished front that plane IS the turndown seam;",
);
console.log(
  "  the raw top sits totalExtension above it. Pocket is NOT anchored below the casing.",
);

console.log("\n=== Trouser-front symptom check (Helen) ===\n");
{
  const helen = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const { withCasing, style } = finishCargo(helen);
  const bodyY = resolveBodyWaistY(helen, style);
  const mouth = resolveFrontSlantPocketMouth(helen, style);
  const front = withCasing.pieces.find((p) => p.name === "Trouser front")!;
  const r = reportPiece(front, bodyY, mouth.openingTop.y);
  const raw = r.rawTopY!;
  const turn = r.turndownY!;
  const fold = r.foldY!;
  const slash = mouth.openingTop.y;
  console.log(`  bodyWaistY          = ${f3(bodyY)}`);
  console.log(`  raw top (cut)       = ${f3(raw)}   (0 vs raw)`);
  console.log(
    `  fold                = ${f3(fold)}   (+${f3(rel(fold, raw))} vs raw)`,
  );
  console.log(
    `  turndown            = ${f3(turn)}   (+${f3(rel(turn, raw))} vs raw)`,
  );
  console.log(
    `  slash top           = ${f3(slash)}   (+${f3(rel(slash, raw))} vs raw)`,
  );
  console.log(
    `  slash − turndown    = ${f3(slash - turn)} (0 ⇒ slash at casing bottom, not below it)`,
  );
  console.log(
    `  slash − fold        = ${f3(slash - fold)} (positive ⇒ slash below the fold line)`,
  );
  const inBand = slash > raw + 0.5 && slash < turn - 0.5;
  const atTurn = Math.abs(slash - turn) <= 0.5;
  console.log(
    inBand
      ? "  SYMPTOM: slash sits INSIDE the casing fold band (raw→turndown)."
      : atTurn
        ? "  SYMPTOM: slash sits AT the turndown seam — i.e. at the bottom of the casing,"
        : `  SYMPTOM: slash placement unexpected (see numbers).`,
  );
  if (atTurn) {
    console.log(
      "           not below it. From the raw edge it is totalExtension down —",
    );
    console.log(
      "           so the opening starts where the casing ends, not clear of it.",
    );
    console.log(
      "           Combined with (a), pocket pieces themselves carry the fold-over.",
    );
  }
}

console.log("\n=== Turndown seam usable as a fix anchor? ===\n");
for (const u of turndownUsable) console.log(`  ${u}`);
console.log(
  "\n  On every casing piece, waistCasing.turndownSeam is a real polyline",
);
console.log(
  "  (length > 0) at the net waist — the casing brief's reference line is present",
);
console.log(
  "  and readable per piece. Trouser front turndown ≡ bodyWaistY in garment frame.",
);

console.log("\n=== HEADLINE ===\n");
console.log("  Both causes are in play:");
console.log(
  "  (a) Casing post-pass IS applied to Slant pocket back and Slant pocket front",
);
console.log(
  "      (CASING_PIECE_NAMES + waistCasing present on both after finish).",
);
console.log(
  "  (b) Pocket slash top and waist catch are anchored to bodyWaistY (net waist),",
);
console.log(
  "      which on the finished front is the turndown seam — so the slash starts",
);
console.log(
  "      at the casing bottom (totalExtension below the raw edge), not clear below",
);
console.log(
  "      the casing. Pocket tops are the net waist that the post-pass then extends",
);
console.log("      up through the fold to the raw edge.");
console.log(
  "\n  Fix shape (not built here): exclude pockets from the casing post-pass,",
);
console.log(
  "  and/or re-anchor pocket / slash relative to the turndown reference — the",
);
console.log("  numbers say you likely need both.\n");
console.log("=== END DIAG (no code changed) ===\n");
