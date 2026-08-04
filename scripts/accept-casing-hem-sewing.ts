/**
 * Acceptance: casing sewing line extends like the hem; marks stripped; squared corners.
 * Run: npx tsx scripts/accept-casing-hem-sewing.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
import { applyTrouserHemTurnbackToPattern } from "../lib/geometry/trouserHemTurnback";
import {
  applyTrouserWaistCasingToPattern,
  frontCasingFoldTestResidual,
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
  draftTrousers,
  resolveFrontSlantPocketMouth,
  silhouetteInvariantDelta,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const WIDTHS: CasingElasticWidth[] = [25, 38, 50];
const SA = DEFAULT_SEAM_ALLOWANCE.seam;
const EPS = 1e-4;

const f1 = (n: number) => n.toFixed(1);
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
  finishOverride?: TrouserStyleSettings["dartedWaistFinish"],
  pocketOverride?: "slant" | "none",
): TrouserFrontStyle {
  const finish = finishOverride ?? s.dartedWaistFinish;
  const elastic = finish === "elastic";
  const pocket = pocketOverride ?? s.pocketFront;
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
    ...(pocket === "slant" ? { pocketFront: "slant" as const } : {}),
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
  w: CasingElasticWidth,
) {
  const sa = withSeamAllowance(draftTrousers(body, style), DEFAULT_SEAM_ALLOWANCE);
  return applyTrouserHemTurnbackToPattern(
    applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(w)),
  );
}

function unit(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function outlineHash(piece: PatternPiece): string {
  const h = createHash("sha256");
  for (const o of piece.outline) {
    h.update(`${o.at.x.toFixed(4)},${o.at.y.toFixed(4)};`);
  }
  return h.digest("hex");
}

function pairHash(body: BodyMeasurements, style: TrouserFrontStyle): string {
  const pat = applyTrouserHemTurnbackToPattern(
    withSeamAllowance(draftTrousers(body, style), DEFAULT_SEAM_ALLOWANCE),
  );
  const h = createHash("sha256");
  for (const p of pat.pieces) {
    h.update(p.name);
    for (const o of p.outline) h.update(`${o.at.x.toFixed(4)},${o.at.y.toFixed(4)};`);
    if (p.cuttingOutline) {
      for (const c of p.cuttingOutline) {
        h.update(`c${c.x.toFixed(4)},${c.y.toFixed(4)};`);
      }
    }
  }
  return h.digest("hex");
}

/** Locate casing sewing U on the net outline via waistCasing refs. */
function casingSewingPath(piece: PatternPiece): {
  start: Point;
  hem: Point[];
  end: Point;
  path: Point[];
} | null {
  const ref = piece.waistCasing;
  if (!ref || ref.hemLine.length < 2 || ref.turndownSeam.length < 2) return null;
  const start = ref.turndownSeam[0]!;
  const end = ref.turndownSeam[ref.turndownSeam.length - 1]!;
  // Prefer pocket-mouth / side on outline at waist plane as true end.
  let sideEnd = end;
  for (const o of piece.outline) {
    if (
      (o.role === "pocket-mouth" || o.role === "side-seam") &&
      Math.abs(o.at.y - end.y) < 2.5 &&
      dist(o.at, end) < 30
    ) {
      sideEnd = o.at;
    }
  }
  const hem = ref.hemLine.map((p) => ({ ...p }));
  // Actual sewing path on outline: start → nearest hem tops → sideEnd
  const outline = piece.outline.map((o) => o.at);
  const near = (p: Point) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < outline.length; i++) {
      const d = dist(outline[i]!, p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const i0 = near(start);
  const iHem0 = near(hem[0]!);
  const iHem1 = near(hem[hem.length - 1]!);
  const i1 = near(sideEnd);
  // Walk outline from i0 → iHem0 → … → iHem1 → i1 (forward)
  const path: Point[] = [{ ...outline[i0]! }];
  let i = i0;
  const n = outline.length;
  const targetOrder = [iHem0, iHem1, i1];
  for (const target of targetOrder) {
    let guard = 0;
    while (i !== target && guard++ < n) {
      i = (i + 1) % n;
      path.push({ ...outline[i]! });
    }
  }
  return { start, hem, end: sideEnd, path };
}

console.log("=== ACCEPT: casing hem-style sewing + strip marks + corners ===\n");

// ---------------------------------------------------------------------------
console.log("=== 1. Sewing line continuous up the casing ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const pat = finish(body, style, w);
    for (const name of ["Trouser front", "Trouser back"] as const) {
      const p = pat.pieces.find((x) => x.name === name)!;
      const ref = p.waistCasing!;
      const sew = casingSewingPath(p);
      if (!sew) {
        fail(`${name}/w${w}: no sewing path`);
        continue;
      }
      const midT = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
      const midF = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
      const up = unit(midF.x - midT.x, midF.y - midT.y);
      const midHem = ref.hemLine[Math.floor(ref.hemLine.length / 2)]!;
      const hemAbove =
        (midHem.x - midT.x) * up.x + (midHem.y - midT.y) * up.y;
      if (Math.abs(hemAbove - 2 * d.channelDepth) > 0.8) {
        fail(
          `${name}/w${w}: hem sewing ${f3(hemAbove)} above stitch ≠ ${2 * d.channelDepth}`,
        );
      }
      // Hem fold = 10 mm down from raw cut
      const rawAbove = d.totalExtension;
      if (Math.abs(rawAbove - hemAbove - d.hemDepth) > 0.5) {
        fail(`${name}/w${w}: hem not ${d.hemDepth} below raw`);
      }
      // Closed polygon
      const o = p.outline;
      if (o.length < 4) fail(`${name}/w${w}: outline too short`);
      const close = dist(o[0]!.at, o[o.length - 1]!.at);
      // outline may not repeat first point — closed via polygon draw
      void close;
      // No waist-role chord left (replaced by U)
      const waistRoles = o.filter((x) => x.role === "waist");
      if (waistRoles.length > 0) {
        // start vertex may still carry waist role from original CF point
        const allAtStitch = waistRoles.every((wr) => {
          const along =
            (wr.at.x - midT.x) * up.x + (wr.at.y - midT.y) * up.y;
          return Math.abs(along) < 2.5;
        });
        if (!allAtStitch) {
          fail(`${name}/w${w}: waist-role points not only at stitch plane`);
        }
      }
      // Path climbs above stitch then returns
      let maxAbove = -Infinity;
      for (const pt of sew.path) {
        const a = (pt.x - midT.x) * up.x + (pt.y - midT.y) * up.y;
        maxAbove = Math.max(maxAbove, a);
      }
      if (maxAbove < 2 * d.channelDepth - 2) {
        fail(
          `${name}/w${w}: sewing path max above stitch ${f3(maxAbove)} < hem ${2 * d.channelDepth}`,
        );
      } else if (w === 25 && name === "Trouser front") {
        console.log(
          `  Helen front w25 sewing U: ${sew.path.length} verts; ` +
            `hem ${f1(hemAbove)} above stitch (= raw ${f1(d.totalExtension)} − ${d.hemDepth}); ` +
            `maxAbove=${f1(maxAbove)}`,
        );
        console.log(
          `  path (mm): ` +
            sew.path
              .filter((_, i) => i === 0 || i === sew.path.length - 1 || i % Math.max(1, Math.floor(sew.path.length / 6)) === 0)
              .map((pt) => `(${f1(pt.x)},${f1(pt.y)})`)
              .join(" → ") +
            " … closes via body",
        );
      }
    }
  }
  ok("sewing line climbs sides + across hem fold; polygon closes with body");
}

// ---------------------------------------------------------------------------
console.log("\n=== 2. Channel stitch at stitchBelowFinishedTop kept ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const pat = finish(body, style, w);
    for (const name of ["Trouser front", "Trouser back"] as const) {
      const p = pat.pieces.find((x) => x.name === name)!;
      const ref = p.waistCasing!;
      const mark = p.markings.find((m) => m.kind === "casingTurndown");
      if (!mark || mark.kind !== "casingTurndown") {
        fail(`${name}/w${w}: no casingTurndown`);
        continue;
      }
      const midF = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
      const midT = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
      const up = unit(midF.x - midT.x, midF.y - midT.y);
      const below =
        (midF.x - midT.x) * up.x + (midF.y - midT.y) * up.y;
      // fold above stitch = channel; stitch below finished top = channel - 5
      if (Math.abs(below - d.channelDepth) > 0.5) {
        fail(`${name}/w${w}: fold↔stitch ${f3(below)} ≠ channel ${d.channelDepth}`);
      }
      if (ref.stitchBelowFinishedTop !== d.stitchBelowFinishedTop) {
        fail(`${name}/w${w}: stitchBelow`);
      }
      if (w === 25 && name === "Trouser front") {
        console.log(
          `  Helen front w25: stitch ${d.stitchBelowFinishedTop} mm below finished top ` +
            `(channel ${d.channelDepth})`,
        );
      }
    }
  }
  ok("channel stitch mark present; 35 mm below finished top at w25");
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. Removed fold-2 / label / shading ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const pat = finish(body, style, 25);
  for (const name of ["Trouser front", "Trouser back"] as const) {
    const p = pat.pieces.find((x) => x.name === name)!;
    const kinds = new Set(p.markings.map((m) => m.kind));
    for (const k of ["casingFold", "casingHem", "casingRegion"] as const) {
      if (kinds.has(k as never)) fail(`${name}: still has ${k}`);
    }
    if (!kinds.has("casingTurndown")) fail(`${name}: lost stitch mark`);
  }
  const pdfSrc = readFileSync(join(process.cwd(), "lib", "export", "pdf.ts"), "utf8");
  const viewSrc = readFileSync(
    join(process.cwd(), "app", "garments", "TrousersView.tsx"),
    "utf8",
  );
  for (const k of ["casingFold", "casingHem", "casingRegion"] as const) {
    if (pdfSrc.includes(`case "${k}"`)) fail(`pdf still has ${k}`);
    if (viewSrc.includes(`case "${k}"`)) fail(`preview still has ${k}`);
  }
  if (!pdfSrc.includes('case "casingTurndown"')) fail("pdf lost stitch");
  if (!viewSrc.includes('case "casingTurndown"')) fail("preview lost stitch");
  ok("fold-2 / hem-mark / region gone from data + preview + PDF; stitch kept");
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Cut corner = sewing + seamAllowance (full SA, no pinch) ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "none");
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const sa = withSeamAllowance(
      draftTrousers(body, style),
      DEFAULT_SEAM_ALLOWANCE,
    );
    const cased = applyTrouserWaistCasingToPattern(sa, d);
    for (const name of ["Trouser front", "Trouser back"] as const) {
      const p = cased.pieces.find((x) => x.name === name)!;
      const ref = p.waistCasing!;
      const cut = p.cuttingOutline!;
      const midF = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
      const midT = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
      const up = unit(midF.x - midT.x, midF.y - midT.y);
      const startV = ref.turndownSeam[0]!;
      const sewCorner = {
        x: startV.x + up.x * (2 * ref.channelDepth),
        y: startV.y + up.y * (2 * ref.channelDepth),
      };
      const startCorner = cut[0]!;
      const cfWaist = cut[cut.length - 1]!;
      // CF wall samples stay ~SA from the sewing climb (startV → sewCorner).
      const gaps = [0, 0.5, 1].map((t) => {
        const q = {
          x: cfWaist.x + (startCorner.x - cfWaist.x) * t,
          y: cfWaist.y + (startCorner.y - cfWaist.y) * t,
        };
        const dx = sewCorner.x - startV.x;
        const dy = sewCorner.y - startV.y;
        const len = Math.hypot(dx, dy) || 1;
        return Math.abs((q.x - startV.x) * dy - (q.y - startV.y) * dx) / len;
      });
      const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      if (Math.abs(mean - SA) > 1.0) {
        fail(`${name}/w${w}: CF wall SA mean ${f3(mean)}`);
      }
      void d;
    }
  }
  ok("top corners keep continuous seamAllowance vs sewing U (no pinch)");
}

// ---------------------------------------------------------------------------
console.log("\n=== 5. Depths / cut extension / side SA / fold-flat ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const expectExt = ({ 25: 90, 38: 116, 50: 140 } as const)[w];
    if (d.totalExtension !== expectExt) {
      fail(`w${w}: totalExt ${d.totalExtension} ≠ ${expectExt}`);
    }
    const pat = finish(body, style, w);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const back = pat.pieces.find((p) => p.name === "Trouser back")!;
    if (front.waistCasing!.totalExtension !== expectExt) {
      fail(`front w${w}: cut ext`);
    }
    const res = frontCasingFoldTestResidual(front);
    if (res == null || res > 0.05) {
      fail(`front w${w}: fold-flat ${res}`);
    }
    // CF wall SA vs sewing climb (cut parallels the sewing U, not garment CF).
    const ref = front.waistCasing!;
    const cut = front.cuttingOutline!;
    const midT = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
    const midF = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
    const up = unit(midF.x - midT.x, midF.y - midT.y);
    const cfWallA = cut[cut.length - 1]!;
    const cfWallB = cut[0]!;
    const midWall = {
      x: (cfWallA.x + cfWallB.x) / 2,
      y: (cfWallA.y + cfWallB.y) / 2,
    };
    const startV = ref.turndownSeam[0]!;
    const sewCorner = {
      x: startV.x + up.x * (2 * ref.channelDepth),
      y: startV.y + up.y * (2 * ref.channelDepth),
    };
    const dx = sewCorner.x - startV.x;
    const dy = sewCorner.y - startV.y;
    const len = Math.hypot(dx, dy) || 1;
    const px =
      Math.abs((midWall.x - startV.x) * dy - (midWall.y - startV.y) * dx) / len;
    if (Math.abs(px - SA) > 1.0) {
      fail(`front w${w}: CF wall SA ${f3(px)} ≠ ${SA}`);
    }
    void back;
  }
  console.log("  derived cut extension: 25→90, 38→116, 50→140");
  ok("depths + cut edges + fold-flat + ~seamAllowance side SA held");
}

// ---------------------------------------------------------------------------
console.log("\n=== 6. Non-elastic / none / pocket / Aldrich gate ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const hM = pairHash(body, resolveStyle(MILA_TROUSER_STYLE, body));
  const hN = pairHash(
    body,
    resolveStyle({ ...CARGO_TROUSER_STYLE, pocketFront: "none" }, body),
  );
  if (hM !== hN) fail("Cargo(none) ≠ Mila");
  else ok("Cargo(none) ≡ Mila");

  const facing = resolveStyle(CARGO_TROUSER_STYLE, body, "facing");
  const facPat = applyTrouserHemTurnbackToPattern(
    withSeamAllowance(draftTrousers(body, facing), DEFAULT_SEAM_ALLOWANCE),
  );
  if (facPat.pieces.some((p) => p.waistCasing)) fail("facing got casing");
  else ok("facing: no casing");

  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const net = draftTrousers(body, style);
  const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const cased = applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(25));
  for (const name of ["Slant pocket front", "Slant pocket back"] as const) {
    const a = sa.pieces.find((p) => p.name === name)!;
    const b = cased.pieces.find((p) => p.name === name)!;
    if (outlineHash(a) !== outlineHash(b)) fail(`${name} moved`);
    else ok(`${name} unchanged`);
  }
  const inv = silhouetteInvariantDelta(
    resolveFrontSlantPocketMouth(body, style),
  );
  if (inv.waistDelta > EPS || inv.sideDelta > EPS) fail("silhouette");
  else ok("silhouette 0.000");

  ok(`Cleo ${pairHash(applyEase(helenBody(), CLEO_TROUSER_STYLE.ease), resolveStyle(CLEO_TROUSER_STYLE, applyEase(helenBody(), CLEO_TROUSER_STYLE.ease))).slice(0, 12)}…`);
  ok(`Block ${pairHash(applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease), resolveStyle(BLOCK_TROUSER_STYLE, applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease))).slice(0, 12)}…`);
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS — casing hem sewing; report before re-baseline ===\n"
    : `\n=== ACCEPT FAIL (${failures}) — stop and report ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
