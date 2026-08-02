/**
 * DIAGNOSTIC — map current waist references (print only, change nothing).
 * Run: npx tsx scripts/diag-waist-references.ts
 *
 * Inventory before a canonical waist-line model. Surfaces every waist-related
 * concept and where finishes sit relative to the hipline D.
 */
import {
  applyEase,
  type BodyMeasurements,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { draftWaistband } from "../lib/elements/waistband";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  BACK_CB_WAIST_RISE,
  blockFromWaistDrop,
  draftTrouserBack,
  draftTrouserFront,
  resolveBackCbWaistRise,
  resolveCrotchP0Y,
  resolveWaistlineCurveFront,
  trouserBackPoints,
  trouserDraftMeasures,
  trouserFrontPoints,
  trouserWaistEdges,
  withWaistband,
  type TrouserFrontStyle,
  type WaistbandMode,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
/** Elastic casing turndown used in fit comparisons (not yet in product geometry). */
const CASING_TURNDOWN = 50;

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

type FinishKind =
  | "facing"
  | "waistband-darted"
  | "waistband-shaped"
  | "elastic-casing";

type FinishCase = {
  kind: FinishKind;
  label: string;
  /** Base settings to clone ease / geometry from. */
  settings: TrouserStyleSettings;
  mode: WaistbandMode;
  depth: number;
  elastic: boolean;
  scoop: number | null;
};

/**
 * Four finishes on a shared geometry base (Mila-like leg, scoop as noted).
 * Depths: facing 0; darted band 25; shaped 120 (Cleo-like yoke); elastic 0.
 */
const FINISHES: FinishCase[] = [
  {
    kind: "facing",
    label: "facing (darted r=0)",
    settings: BLOCK_TROUSER_STYLE,
    mode: "darted",
    depth: 0,
    elastic: false,
    scoop: null, // Aldrich default scoop 12
  },
  {
    kind: "waistband-darted",
    label: "waistband-darted (r=25)",
    settings: BLOCK_TROUSER_STYLE,
    mode: "darted",
    depth: 25,
    elastic: false,
    scoop: null,
  },
  {
    kind: "waistband-shaped",
    label: "waistband-shaped (r=120, Cleo-like)",
    settings: CLEO_TROUSER_STYLE,
    mode: "shaped",
    depth: 120,
    elastic: false,
    scoop: CLEO_TROUSER_STYLE.waistlineCurveFront,
  },
  {
    kind: "elastic-casing",
    label: "elastic-casing (r=0, scoop 0)",
    settings: MILA_TROUSER_STYLE,
    mode: "shaped",
    depth: 0,
    elastic: true,
    scoop: 0,
  },
];

function resolveDraftStyle(
  fin: FinishCase,
  body: BodyMeasurements,
): TrouserFrontStyle {
  const s = fin.settings;
  const elastic = fin.elastic;
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
    ...(s.crotchArrivalAngle != null
      ? { crotchArrivalAngle: s.crotchArrivalAngle }
      : {}),
    ...(fin.scoop != null
      ? { waistlineCurveFront: fin.scoop }
      : s.waistlineCurveFront != null
        ? { waistlineCurveFront: s.waistlineCurveFront }
        : {}),
    ...(elastic
      ? { frontWaistInset: 0, waistTaper: 0 }
      : {
          ...(s.frontWaistInset != null
            ? { frontWaistInset: s.frontWaistInset }
            : {}),
          ...(s.waistTaper != null ? { waistTaper: s.waistTaper } : {}),
        }),
    ...(s.backCbWaistRise != null ? { backCbWaistRise: s.backCbWaistRise } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
  };
  if (elastic) {
    return withWaistband(base, 0, "shaped", body);
  }
  return withWaistband(base, fin.depth, fin.mode, body);
}

function roleY(
  piece: ReturnType<typeof draftTrouserFront>,
  role: string,
  which: "first" | "last",
): number {
  const pts = piece.outline.filter((o) => o.role === role);
  if (pts.length === 0) return NaN;
  return which === "first" ? pts[0]!.at.y : pts[pts.length - 1]!.at.y;
}

function midWaistY(piece: ReturnType<typeof draftTrouserFront>): number {
  const n = piece.markings.find(
    (m) => m.kind === "notch" && m.label === "mid-waist",
  );
  return n && n.kind === "notch" ? n.at.y : NaN;
}

/** y relative to hipline D (negative = above hip toward waist). */
function rel(y: number, D: number): number {
  return y - D;
}

console.log("=== DIAG: waist references inventory (print only) ===\n");

// ===========================================================================
console.log("=== A. Enumerate every waist-related reference ===\n");

console.log(`1. Construction waist corners (pattern frame y = 0 at front/side)
   Meaning: Aldrich block waist points p10/p11 (front), p22 (back side); p21 at −backCbWaistRise.
   Relative to: dropped body frame (R,D,F all subtract waistDrop).
   Moves with finish? NO — construction points ignore waistReduction / finish.
   Moves with waistDrop? YES — frame shifts (D = hipDepth − drop); y=0 stays "this block's waist".

2. waistCfY / wr.cf.y (front) — and wr.cf.y on the back (CB top of piece)
   Meaning: CF/CB endpoint of the *resolved* waist seam (piece top at centre).
   Relative to: construction cfWaist + depth r (arc-walk) + scoopTerm.
   Moves with finish? YES — shaped/darted band depth lowers it; scoop dips front CF;
     back CB also has −backCbWaistRise in construction before seam resolve.
   Note: TrousersView slider math sometimes uses resolveWaistlineCurveFront() *as if*
   it were waistCfY — that is the scoop *depth*, not CF y (known naming trap).

3. waist side y — wr.side.y (front p11 path / back p22 path after resolve)
   Meaning: side-seam end of the resolved waist seam (piece top at side).
   Relative to: construction sideWaist arc-walked by depth r (no scoop at side).
   Moves with finish? YES with depth r; NO with scoop (envelope 0 at side).

4. waistDrop
   Meaning: continuous low-waist offset (0…50). Sets riseDrop = hipDepthDrop.
   Relative to: body natural waist → shifts the whole vertical frame.
   Moves with finish? NO — independent control. Changes W girth blend too.

5. waistReduction / band depth (r) — from withWaistband → style.waistReduction
   Meaning: how far the waist seam is walked down CF/side from construction corners.
   Relative to: construction waist corners.
   Moves with finish? It *is* the finish depth for band modes; elastic forces r=0.

6. Yoke seam position (shaped mode, r > 0)
   Meaning: the piece top edge AFTER lowering — i.e. wr.waistSeam / wr.cf / wr.side.
   Relative to: construction waist + r. This IS the piece top for shaped garments.
   Moves with finish? YES — it is the finish.

7. Casing fold line (elastic) — NOT drafted in product code yet
   Meaning: conceptual level fold CASING_TURNDOWN (${CASING_TURNDOWN} mm) below piece top.
   Relative to: piece top (raw edge). Product has no fold geometry; fit comparisons use ${CASING_TURNDOWN} mm.
   Moves with finish? Only meaningful for elastic; piece top at r=0.

8. crotchDeparture: "waistEdge"
   Meaning: sentinel → P0.y = waistCfY (= wr.cf.y passed into resolveCrotchP0Y).
   Relative to: the *piece top CF*, not construction y=0 and not the body waist.
   Moves with finish? YES — resolves to whatever wr.cf.y the finish produced.
   Per finish: facing ≈ scoop; shaped ≈ r+scoop; elastic ≈ 0 (scoop 0).

9. backCbWaistRise / BACK_CB_WAIST_RISE (default ${BACK_CB_WAIST_RISE})
   Meaning: vertical rise of back construction CB (p21.y = −rise). Side stays y=0.
   Relative to: construction waist plane (front/side at 0).
   Moves with finish? NO — independent fit control; waist seam then builds from p21.

10. waistlineCurveFront (scoop)
    Meaning: §2a front CF dip depth (mm). Default 12; Mila/Cargo store 0.
    Relative to: the r-lowered chord (added as centre-heavy term on CF).
    Moves with finish? Independent param; elastic presets force 0 for a level fold.

11. dartedWaistFinish / waistbandMode / waistbandDepth / dartedBandDepth
    Meaning: UI/store controls. Elastic derives mode=shaped, r=0, taper/inset 0.
    Relative to: n/a (policy). They select which of the above geometries apply.

12. mid-waist notch
    Meaning: balance notch at arc midpoint of wr.waistSeam (piece top edge).
    Relative to: piece top seam (moves with finish / scoop / CB rise slant).
    Moves with finish? YES — rides the resolved waist seam.

13. seamLengths.topEdge
    Meaning: polylineLength(wr.waistSeam) — net length of piece top edge.
    Relative to: piece top. Not a y; a length that changes with finish (scoop, slant, r).

14. isDartedFacingFinish / waistFinish:"facing" on outline
    Meaning: darted + r=0 → facing path; tags waist role with waistFinish facing.
    Relative to: piece top = construction (+scoop).

15. Band piece (draftWaistband) — separate piece
    Meaning: own coords; bottom edge ("waist" role) attaches to trouser piece top;
      top edge ("band-top") is the finished outer edge of the band.
    Relative to: trouser piece top length (inner/outer from trouserWaistEdges).
    Moves with finish? Only present for band finishes; depth = r.

16. Construction p10.y / p18.y (= 0) vs scooped/lowered wr.cf
    Meaning: "top of the construction block" vs "top of the cut piece".
    Anything reading p10.y as waist is reading construction, not piece top.
`);

// ===========================================================================
console.log("=== B. Per-finish y relative to hipline D ===\n");
console.log(
  "Convention: yRel = y − D. Negative = above hip (toward waist). D is finish-invariant at fixed waistDrop.\n",
);
console.log(
  "body | finish | D | constrCF(yRel) | constrSide(yRel) | constrCB(yRel) | pieceTopCF(yRel) | pieceTopSide(yRel) | pieceTopCB(yRel) | fold(yRel) | bandTop(yRel) | bandBot(yRel) | waistEdge→P0y | midWaist(yRel)",
);

type Row = {
  body: string;
  kind: FinishKind;
  D: number;
  constrCF: number;
  constrSide: number;
  constrCB: number;
  pieceCF: number;
  pieceSide: number;
  pieceCB: number;
  fold: number | null;
  bandTop: number | null;
  bandBot: number | null;
  waistEdgeP0: number;
  midY: number;
};

const rows: Row[] = [];

for (const bod of bodies) {
  for (const fin of FINISHES) {
    const eased = applyEase(bod.body, fin.settings.ease);
    const style = resolveDraftStyle(fin, eased);
    const m = trouserDraftMeasures(eased, style);
    const D = m.D;
    const f = trouserFrontPoints(eased, style);
    const b = trouserBackPoints(eased, style);
    const front = draftTrouserFront(eased, style);
    const back = draftTrouserBack(eased, style);

    const pieceCF = roleY(front, "waist", "first");
    const pieceSide = roleY(front, "waist", "last");
    const pieceCB = roleY(back, "waist", "first");
    const r = style.waistReduction ?? 0;
    const waistEdgeP0 = resolveCrotchP0Y(
      { crotchDeparture: "waistEdge" },
      D,
      pieceCF,
    );

    let fold: number | null = null;
    if (fin.elastic) {
      fold = pieceCF + CASING_TURNDOWN; // level model from CF
    }

    let bandTop: number | null = null;
    let bandBot: number | null = null;
    if (!fin.elastic && r > 0) {
      // Band bottom = piece top (attach). Band top = piece top − depth along CF
      // (toward smaller y / construction waist), i.e. approximately constr CF.
      bandBot = pieceCF;
      bandTop = pieceCF - r; // level approximation along CF
      // Cross-check with band piece local coords (own frame, not pattern y):
      const edges = trouserWaistEdges(eased, style);
      const { piece: bandPiece } = draftWaistband({
        innerLen: edges.front.inner,
        outerLen: edges.front.outer,
        depth: r,
        foldSide: "CF",
        label: "Front waistband",
      });
      void bandPiece; // confirms band drafts; pattern-space y above is the attach model
    }

    const row: Row = {
      body: bod.name,
      kind: fin.kind,
      D,
      constrCF: f.p10.y,
      constrSide: f.p11.y,
      constrCB: b.p21.y,
      pieceCF,
      pieceSide,
      pieceCB,
      fold,
      bandTop,
      bandBot,
      waistEdgeP0,
      midY: midWaistY(front),
    };
    rows.push(row);

    const fr = (y: number) => f1(rel(y, D));
    console.log(
      `${bod.name} | ${fin.kind} | ${f1(D)} | ${fr(row.constrCF)} | ${fr(row.constrSide)} | ${fr(row.constrCB)} | ${fr(row.pieceCF)} | ${fr(row.pieceSide)} | ${fr(row.pieceCB)} | ${fold == null ? "n/a" : fr(fold)} | ${bandTop == null ? "n/a" : fr(bandTop)} | ${bandBot == null ? "n/a" : fr(bandBot)} | ${fr(waistEdgeP0)} | ${fr(row.midY)}`,
    );
  }
}

// Finish-invariant check: construction CF yRel across finishes (same body, same drop)
console.log("\n--- Finish-invariant check (Helen-print) — construction vs piece top ---\n");
{
  const helenRows = rows.filter((r) => r.body === "Helen-print");
  const constrSet = new Set(helenRows.map((r) => f2(rel(r.constrCF, r.D))));
  const pieceSet = new Set(helenRows.map((r) => f2(rel(r.pieceCF, r.D))));
  console.log(
    `  construction CF yRel across finishes: {${[...constrSet].join(", ")}} → ${constrSet.size === 1 ? "INVARIANT" : "VARIES"}`,
  );
  console.log(
    `  piece-top CF yRel across finishes:    {${[...pieceSet].join(", ")}} → ${pieceSet.size === 1 ? "INVARIANT" : "VARIES (entangled with finish)"}`,
  );
  console.log(
    `  construction CB yRel: {${[...new Set(helenRows.map((r) => f2(rel(r.constrCB, r.D))))].join(", ")}} (includes −backCbWaistRise; same rise → invariant)`,
  );
  console.log(
    `\n  Verdict: a finish-invariant body-waist *plane* already exists implicitly as the`,
  );
  console.log(
    `  construction waist corners (front/side y=0 in the dropped frame; CB at −rise).`,
  );
  console.log(
    `  It is NOT exported as a named "body waist line". The piece top (wr.cf) is`,
  );
  console.log(
    `  finish-entangled. Body waist is recoverable as construction corners / r=0`,
  );
  console.log(
    `  undipped chord — not as "piece top minus finish" for every case without care`,
  );
  console.log(
    `  (scoop still dips facing CF below construction even at r=0).`,
  );
}

// ===========================================================================
console.log("\n=== C. Direction of each finish relative to body waist (observed) ===\n");
console.log(`Using construction front/side y=0 as the implicit body-waist plane
(dropped-frame natural/low waist). Piece top and band/fold relative to that:

finish            | body waist (implicit) | piece top           | finish extent
------------------|-----------------------|---------------------|------------------
facing            | at construction       | at / scooped below  | facing at the piece top (no band)
waistband-darted  | at construction       | lowered by r        | band sits ABOVE piece top (toward constr. waist); attach = piece top
waistband-shaped  | at construction       | lowered by r (yoke) | yoke seam = piece top BELOW body waist; band extends UP to ~body waist
elastic-casing    | at construction       | at construction     | raw edge = piece top AT body waist; fold ${CASING_TURNDOWN} mm DOWN into garment; finished top ≈ fold (below body waist in pattern y)

Taxonomy (observed, not designed):
  • facing          — finish AT body waist (piece top ≈ body waist + scoop)
  • darted band     — band ABOVE lowered piece top; body waist ≈ band top
  • shaped / yoke   — piece top BELOW body waist; band fills UP to body waist
  • elastic casing  — piece top AT body waist; finished edge BELOW after fold
`);

// ===========================================================================
console.log("=== D. Consumers that should read a canonical waist line ===\n");
console.log(`Consumer                         | currently reads              | wants body waist or piece top?
----------------------------------|--------------------------------|-------------------------------
resolveCrotchP0Y("waistEdge")     | waistCfY argument (= wr.cf.y)  | PIECE TOP (departure from cut top) — or body waist if model redefines "waistEdge"
frontCrotchCurve waistCfY         | wr.cf.y                        | PIECE TOP (join end of CF)
crotchDepartureAboveHipMax        | D − waistCfY                   | depends: room from piece top to hip
mid-waist notch                   | midpoint of wr.waistSeam       | PIECE TOP (balance on cut edge)
seamLengths.topEdge               | len(wr.waistSeam)              | PIECE TOP (cut-edge length)
TrousersView departure slider max | resolveWaistlineCurveFront(!)  | BUG/trap: uses scoop depth as waistCfY
sideOpening zip from waist        | side-seam run from piece top   | PIECE TOP
future pocket mouth-top           | would use waist edge arc       | BODY WAIST if finish-independent; else piece top for cut
band attach / trouserWaistEdges   | wr seam lengths                | PIECE TOP
isDartedFacingFinish / facing tag | r===0 + darted                 | policy on piece top
back CB rise construction         | p21 vs p22                     | construction body plane, not piece top
waistDrop / trouserWaistGirth     | body frame                     | BODY (girth at dropped waist)
`);

// ===========================================================================
console.log("=== E. Consolidation vs duplication (no model — map only) ===\n");
console.log(`Reference                  | vs canonical body-waist line
----------------------------|------------------------------------------
construction p10/p11/p22    | REPLACE/EXPOSE — these ARE the implicit body waist (front/side); canonical may be renaming/exposing them
p21 / backCbWaistRise       | COEXIST — CB offset from the body-waist plane (slant), not a second waist
waistCfY / wr.cf (piece top)| COEXIST — finish-relative piece top; do NOT duplicate as "the waist"
wr.side                     | COEXIST — piece-top side corner
waistDrop                   | COEXIST — moves the BODY WAIST frame (and thus D,R,F,W); canonical line is drop-inclusive if defined in pattern space after drop
waistReduction r            | COEXIST — offset from body waist down to piece top (yoke/band depth)
yoke seam                   | SUBSUME — = piece top when shaped; not a third line
casing fold                 | COEXIST — offset from piece top (or from body waist once fold is drafted)
"waistEdge" sentinel        | SUBSUME/REDEFINE — today = piece top CF; model must say whether sentinel means body waist or piece top
waistlineCurveFront scoop   | COEXIST — shape of piece top relative to body chord; not a waist line
dartedWaistFinish / modes   | COEXIST — policy selecting offsets
mid-waist notch             | COEXIST — mark on piece top (or on body waist if re-anchored)
seamLengths.topEdge         | COEXIST — length of piece top, not a y-line
band top/bottom             | COEXIST — band extent relative to piece top / body waist

waistDrop acts on: the BODY WAIST frame (construction plane + hipline D), NOT merely the piece top.
  Piece top then derives from that frame via r + scoop + CB rise.

"waistEdge" resolves per finish to piece-top CF y (= wr.cf.y):
`);

for (const fin of FINISHES) {
  const row = rows.find((r) => r.body === "Helen-print" && r.kind === fin.kind)!;
  console.log(
    `  ${fin.kind}: waistEdge → P0.y = ${f1(row.waistEdgeP0)}  (pieceTopCF=${f1(row.pieceCF)}, constrCF=${f1(row.constrCF)}, D=${f1(row.D)})`,
  );
}

console.log(`
Duplicate risk: exporting both "canonicalBodyWaistY" and continuing to treat construction
y=0 / p10.y as a silent second name for the same thing — consolidation target is to
*name* the construction plane once and stop re-deriving "waist" from piece top + finish.
`);

console.log("=== done (no product changes) ===");
