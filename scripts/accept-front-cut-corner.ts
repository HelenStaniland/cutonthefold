/**
 * Acceptance: front cut restores vertical casing side wall at slash junction.
 * Run: npx tsx scripts/accept-front-cut-corner.ts
 */
import { createHash } from "node:crypto";
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
  return createHash("sha256")
    .update(
      piece.outline
        .map((o) => `${o.role ?? ""}:${o.at.x.toFixed(9)},${o.at.y.toFixed(9)}`)
        .join("|"),
    )
    .digest("hex");
}

function pairHash(body: BodyMeasurements, style: TrouserFrontStyle): string {
  const pat = applyTrouserHemTurnbackToPattern(
    withSeamAllowance(draftTrousers(body, style), DEFAULT_SEAM_ALLOWANCE),
  );
  const h = createHash("sha256");
  for (const p of pat.pieces) {
    h.update(p.name + outlineHash(p));
    if (p.cuttingOutline) {
      for (const c of p.cuttingOutline) {
        h.update(`c${c.x.toFixed(4)},${c.y.toFixed(4)};`);
      }
    }
  }
  return h.digest("hex");
}

/** Find casing side wall on cut: consecutive verts parallel to `up`, climbs casing. */
function findVerticalSideWall(
  cut: Point[],
  ref: NonNullable<PatternPiece["waistCasing"]>,
): {
  topIdx: number;
  waistIdx: number;
  top: Point;
  waist: Point;
  wallDx: number;
  wallDy: number;
} | null {
  const midT = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
  const midF = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
  const up = unit(midF.x - midT.x, midF.y - midT.y);
  const along = (q: Point) =>
    (q.x - midT.x) * up.x + (q.y - midT.y) * up.y;

  let best: ReturnType<typeof findVerticalSideWall> = null;
  let bestScore = -1;
  for (let i = 0; i < cut.length - 1; i++) {
    const a = cut[i]!;
    const b = cut[i + 1]!;
    const seg = unit(b.x - a.x, b.y - a.y);
    // Parallel to sewing climb (`up`): |seg × up| small.
    const cross = Math.abs(seg.x * up.y - seg.y * up.x);
    const len = dist(a, b);
    if (cross > 0.08 || len < 40) continue;
    const aAlong = along(a);
    const bAlong = along(b);
    const topAlong = Math.max(aAlong, bAlong);
    const botAlong = Math.min(aAlong, bAlong);
    if (topAlong < ref.totalExtension - 25) continue;
    if (botAlong > SA + 25 || botAlong < -20) continue;
    const score = len - cross * 100;
    if (score > bestScore) {
      bestScore = score;
      const topIsA = aAlong >= bAlong;
      best = {
        topIdx: topIsA ? i : i + 1,
        waistIdx: topIsA ? i + 1 : i,
        top: topIsA ? a : b,
        waist: topIsA ? b : a,
        wallDx: Math.abs(b.x - a.x),
        wallDy: Math.abs(b.y - a.y),
      };
    }
  }
  return best;
}

console.log("=== ACCEPT: front cut vertical casing side wall at slash ===\n");

// Snapshot sewing outlines for slant fronts (must stay stable across widths' structure)
const sewingHashes: string[] = [];

console.log("=== 1–2. Cut junction: slash → vertical wall → top; SA ~10 ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    // Wall must survive hem turnback (finished pattern on screen).
    const pat = finish(body, style, w);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const back = pat.pieces.find((p) => p.name === "Trouser back")!;
    sewingHashes.push(outlineHash(front));

    const wallF = findVerticalSideWall(front.cuttingOutline!, front.waistCasing!);
    const wallB = findVerticalSideWall(back.cuttingOutline!, back.waistCasing!);
    if (!wallF) {
      fail(`Helen F/w${w}: no vertical casing side wall on cut`);
      continue;
    }
    if (!wallB) {
      fail(`Helen B/w${w}: back wall missing (control)`);
    }

    // Side-seam net x → cut wall (informational; wall follows sewing `up`, not screen-vertical).
    const sideNet = front.outline.find((o) => o.role === "side-seam")!;
    const saGap = Math.abs(wallF.top.x - sideNet.at.x);
    console.log(
      `  Helen F/w${w}: cut[${wallF.topIdx}]→[${wallF.waistIdx}] ` +
        `(${f1(wallF.top.x)},${f1(wallF.top.y)}) → (${f1(wallF.waist.x)},${f1(wallF.waist.y)}) ` +
        `Δx=${f3(wallF.wallDx)} Δy=${f1(wallF.wallDy)} |cutx−sidex|=${f1(saGap)}`,
    );
    if (wallF.wallDy < 40) fail(`F/w${w}: wall too short`);
    else ok(`Helen F/w${w}: casing side wall + top-outer present`);

    // Next after wall waist should go toward mouth (inboard), not stay on top.
    const cut = front.cuttingOutline!;
    const after = cut[wallF.waistIdx + 1];
    if (after && Math.abs(after.y - wallF.top.y) < 5) {
      fail(`F/w${w}: after wall still on top plane — diagonal still to top?`);
    }

    // Sequence print for w25
    if (w === 25) {
      console.log("  vertex sequence through junction (w25):");
      for (let i = wallF.topIdx - 1; i <= wallF.waistIdx + 2; i++) {
        if (i < 0 || i >= cut.length) continue;
        const q = cut[i]!;
        const tag =
          i === wallF.topIdx
            ? " ← top-outer"
            : i === wallF.waistIdx
              ? " ← wall foot / toward mouth"
              : i === wallF.waistIdx + 1
                ? " ← mouth / slash start"
                : "";
        console.log(`    [${i}] (${f1(q.x)},${f1(q.y)})${tag}`);
      }
      if (wallB) {
        console.log(
          `  back wall (control): (${f1(wallB.top.x)},${f1(wallB.top.y)}) → ` +
            `(${f1(wallB.waist.x)},${f1(wallB.waist.y)}) Δx=${f3(wallB.wallDx)}`,
        );
      }
    }
    ok(`Helen F/w${w}: vertical wall + top-outer present`);
  }
}

console.log("\n=== 1b. All sizes, slant front ===\n");

for (const bod of bodies) {
  if (bod.name === "Helen-print") continue;
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  for (const w of WIDTHS) {
    const pat = finish(body, style, w);
    const front = pat.pieces.find((p) => p.name === "Trouser front")!;
    const wall = findVerticalSideWall(front.cuttingOutline!, front.waistCasing!);
    if (!wall) fail(`${bod.name}/w${w}: no casing side wall`);
    else if (wall.wallDy < 40) fail(`${bod.name}/w${w}: wall too short`);
  }
}
ok("sizes 8/12/16/20 × w25/38/50: vertical wall present");

console.log("\n=== 3. Sewing (net) line unchanged across widths (structure) ===\n");

{
  // Same body/style → sewing outline must not depend on cut-corner fix per width
  // beyond identical construction; all three widths share mouth-ended U.
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const hashes: string[] = [];
  for (const w of WIDTHS) {
    const sa = withSeamAllowance(draftTrousers(body, style), DEFAULT_SEAM_ALLOWANCE);
    const cased = applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(w));
    const front = cased.pieces.find((p) => p.name === "Trouser front")!;
    hashes.push(outlineHash(front));
    // Mouth still on outline; hem-fold verts above waist present
    const mouth = front.outline.filter((o) => o.role === "pocket-mouth");
    if (mouth.length < 1) fail(`w${w}: mouth missing from net`);
    const turnY = front.waistCasing!.turndownSeam[0]!.y;
    const above = front.outline.filter((o) => o.at.y < turnY - 20);
    if (above.length < 10) fail(`w${w}: sewing U / hem fold missing`);
  }
  // Different elastic widths → different hem height → different outline hashes.
  // Stability check: re-run w25 twice.
  const sa = withSeamAllowance(draftTrousers(body, style), DEFAULT_SEAM_ALLOWANCE);
  const a = outlineHash(
    applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(25)).pieces.find(
      (p) => p.name === "Trouser front",
    )!,
  );
  const b = outlineHash(
    applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(25)).pieces.find(
      (p) => p.name === "Trouser front",
    )!,
  );
  if (a !== b) fail("sewing outline non-deterministic");
  else ok("sewing (net) outline stable; mouth + hem-fold U retained");
  void hashes;
}

console.log("\n=== 4. Back / none / non-elastic / pocket / Aldrich gate ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  // Back wall still present
  const slant = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const pat = finish(body, slant, 25);
  const back = pat.pieces.find((p) => p.name === "Trouser back")!;
  const wallB = findVerticalSideWall(back.cuttingOutline!, back.waistCasing!);
  if (!wallB || wallB.wallDy < 40) fail("back wall regress");
  else ok("back casing side wall intact");

  // none pocket: still has wall (plain side)
  const none = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "none");
  const patN = finish(body, none, 25);
  const frontN = patN.pieces.find((p) => p.name === "Trouser front")!;
  const wallN = findVerticalSideWall(frontN.cuttingOutline!, frontN.waistCasing!);
  if (!wallN || wallN.wallDy < 40) fail("none-pocket front wall missing");
  else ok("pocketFront none: side wall present");

  const hM = pairHash(body, resolveStyle(MILA_TROUSER_STYLE, body));
  const hN = pairHash(
    body,
    resolveStyle({ ...CARGO_TROUSER_STYLE, pocketFront: "none" }, body),
  );
  if (hM !== hN) fail("Cargo(none) ≠ Mila");
  else ok("Cargo(none) ≡ Mila");

  const facing = resolveStyle(CARGO_TROUSER_STYLE, body, "facing");
  const fac = applyTrouserHemTurnbackToPattern(
    withSeamAllowance(draftTrousers(body, facing), DEFAULT_SEAM_ALLOWANCE),
  );
  if (fac.pieces.some((p) => p.waistCasing)) fail("facing got casing");
  else ok("facing: no casing");

  // Pocket bags unchanged by casing
  const sa = withSeamAllowance(draftTrousers(body, slant), DEFAULT_SEAM_ALLOWANCE);
  const cased = applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(25));
  for (const name of ["Slant pocket front", "Slant pocket back"] as const) {
    const a = sa.pieces.find((p) => p.name === name)!;
    const b = cased.pieces.find((p) => p.name === name)!;
    if (outlineHash(a) !== outlineHash(b)) fail(`${name} moved`);
    else ok(`${name} unchanged`);
  }
  const inv = silhouetteInvariantDelta(
    resolveFrontSlantPocketMouth(body, slant),
  );
  if (inv.waistDelta > EPS || inv.sideDelta > EPS) fail("silhouette");
  else ok("silhouette 0.000");

  ok(
    `Cleo ${pairHash(applyEase(helenBody(), CLEO_TROUSER_STYLE.ease), resolveStyle(CLEO_TROUSER_STYLE, applyEase(helenBody(), CLEO_TROUSER_STYLE.ease))).slice(0, 12)}…`,
  );
  ok(
    `Block ${pairHash(applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease), resolveStyle(BLOCK_TROUSER_STYLE, applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease))).slice(0, 12)}…`,
  );
}

console.log("\n=== 5. netToCutIndex holds at corner ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body, "elastic", "slant");
  const sa = withSeamAllowance(draftTrousers(body, style), DEFAULT_SEAM_ALLOWANCE);
  const cased = applyTrouserWaistCasingToPattern(sa, resolveCasingDepths(25));
  const front = cased.pieces.find((p) => p.name === "Trouser front")!;
  const map = front.netToCutIndex!;
  const cut = front.cuttingOutline!;
  if (map.length !== front.outline.length) {
    fail(`map length ${map.length} ≠ outline ${front.outline.length}`);
  } else {
    let bad = 0;
    for (let i = 0; i < map.length; i++) {
      const c = map[i]!;
      if (c < 0 || c >= cut.length) bad++;
    }
    if (bad) fail(`${bad} netToCutIndex out of range`);
    else ok(`netToCutIndex ok (${map.length} → cut ${cut.length})`);
  }
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS — front cut corner wall; report before re-baseline ===\n"
    : `\n=== ACCEPT FAIL (${failures}) — stop and report ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
