/**
 * Acceptance: slant pocket pieces grainline-vertical in layout (display only).
 * Run: npx tsx scripts/accept-pocket-grain-layout.ts
 *
 * Rigid rotation of piece + grainline together — relative geometry unchanged.
 */
import { createHash } from "node:crypto";
import {
  applyEase,
  type BodyMeasurements,
  type PatternPiece,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { orientPieceGrainVertical } from "../lib/pattern/mirrorPiece";
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
  resolveFrontSlantPocketMouth,
  silhouetteInvariantDelta,
  SLANT_POCKET_BACK_NAME,
  SLANT_POCKET_FRONT_NAME,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const EPS = 1e-6;
const f6 = (n: number) => n.toFixed(6);
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

function resolveStyle(
  s: TrouserStyleSettings,
  body: BodyMeasurements,
): TrouserFrontStyle {
  const finish = s.dartedWaistFinish;
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

/** Rotation-invariant fingerprint: edge lengths + notch↔vertex dists + grain↔edge angles. */
function relativeFingerprint(piece: PatternPiece): {
  edges: number[];
  notchDists: number[];
  grainEdgeAngles: number[];
  grainLen: number;
} {
  const edges: number[] = [];
  const n = piece.outline.length;
  for (let i = 0; i < n; i++) {
    const a = piece.outline[i]!.at;
    const b = piece.outline[(i + 1) % n]!.at;
    edges.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  const notches = piece.markings.filter((m) => m.kind === "notch");
  const notchDists: number[] = [];
  for (const m of notches) {
    if (m.kind !== "notch") continue;
    for (const o of piece.outline) {
      notchDists.push(Math.hypot(m.at.x - o.at.x, m.at.y - o.at.y));
    }
  }
  const grain = piece.markings.find((m) => m.kind === "grainline");
  let grainLen = 0;
  const grainEdgeAngles: number[] = [];
  if (grain && grain.kind === "grainline") {
    const gdx = grain.line.to.x - grain.line.from.x;
    const gdy = grain.line.to.y - grain.line.from.y;
    grainLen = Math.hypot(gdx, gdy);
    const gAng = Math.atan2(gdy, gdx);
    for (let i = 0; i < n; i++) {
      const a = piece.outline[i]!.at;
      const b = piece.outline[(i + 1) % n]!.at;
      const eAng = Math.atan2(b.y - a.y, b.x - a.x);
      let d = eAng - gAng;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d <= -Math.PI) d += 2 * Math.PI;
      grainEdgeAngles.push(d);
    }
  }
  return { edges, notchDists, grainLen, grainEdgeAngles };
}

function maxAbsDiff(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    m = Math.max(m, Math.abs(a[i]! - b[i]!));
  }
  return m;
}

function fingerprintDelta(
  a: ReturnType<typeof relativeFingerprint>,
  b: ReturnType<typeof relativeFingerprint>,
): number {
  return Math.max(
    Math.abs(a.grainLen - b.grainLen),
    maxAbsDiff(a.edges, b.edges),
    maxAbsDiff(a.notchDists, b.notchDists),
    maxAbsDiff(a.grainEdgeAngles, b.grainEdgeAngles),
  );
}

function grainDx(piece: PatternPiece): number {
  const g = piece.markings.find((m) => m.kind === "grainline");
  if (!g || g.kind !== "grainline") return Infinity;
  return Math.abs(g.line.to.x - g.line.from.x);
}

function grainDy(piece: PatternPiece): number {
  const g = piece.markings.find((m) => m.kind === "grainline");
  if (!g || g.kind !== "grainline") return Infinity;
  return g.line.to.y - g.line.from.y;
}

/** Rigid rotate a piece by a fixed angle (test helper — tilt then re-orient). */
function rotatePiece(piece: PatternPiece, theta: number): PatternPiece {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const rot = (p: Point): Point => ({
    x: p.x * c - p.y * s,
    y: p.x * s + p.y * c,
  });
  const rotV = (v: { x: number; y: number }) => ({
    x: v.x * c - v.y * s,
    y: v.x * s + v.y * c,
  });
  return {
    ...piece,
    outline: piece.outline.map((o) => ({ ...o, at: rot(o.at) })),
    markings: piece.markings.map((m) => {
      switch (m.kind) {
        case "grainline":
        case "foldLine":
        case "gather":
        case "constructionLine":
          return {
            ...m,
            line: { from: rot(m.line.from), to: rot(m.line.to) },
          };
        case "notch":
          return {
            ...m,
            at: rot(m.at),
            dir: m.dir ? rotV(m.dir) : undefined,
          };
        default:
          return m;
      }
    }),
  };
}

console.log("=== ACCEPT: pocket grainline-vertical layout ===\n");

// ---------------------------------------------------------------------------
console.log("=== 1. pocketFront none / other garments byte-identical ===\n");

{
  const bodies = [
    ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
    { name: "Helen-print", body: helenBody() },
  ];
  for (const bod of bodies) {
    const body = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
    const hM = pairHash(body, resolveStyle(MILA_TROUSER_STYLE, body));
    const hC = pairHash(
      body,
      resolveStyle({ ...CARGO_TROUSER_STYLE, pocketFront: "none" }, body),
    );
    if (hM !== hC) fail(`${bod.name}: Cargo(none) ≠ Mila`);
    else ok(`${bod.name}: Cargo(none) ≡ Mila`);
  }
  const body = applyEase(helenBody(), BLOCK_TROUSER_STYLE.ease);
  ok(`Block hash ${pairHash(body, resolveStyle(BLOCK_TROUSER_STYLE, body)).slice(0, 12)}…`);
  const cleo = applyEase(helenBody(), CLEO_TROUSER_STYLE.ease);
  ok(`Cleo hash ${pairHash(cleo, resolveStyle(CLEO_TROUSER_STYLE, cleo)).slice(0, 12)}…`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 2. Pocket back + front grainline vertical ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  const pat = draftTrousers(body, style);
  const frontLeg = pat.pieces.find((p) => p.name === "Trouser front")!;
  const pocketBack = pat.pieces.find((p) => p.name === SLANT_POCKET_BACK_NAME)!;
  const pocketFront = pat.pieces.find(
    (p) => p.name === SLANT_POCKET_FRONT_NAME,
  )!;

  const legDx = grainDx(frontLeg);
  console.log(
    `  Trouser front grain |Δx|=${f6(legDx)} (reference vertical)`,
  );
  for (const [label, piece] of [
    ["pocket back", pocketBack],
    ["pocket front", pocketFront],
  ] as const) {
    const dx = grainDx(piece);
    const dy = grainDy(piece);
    console.log(`  ${label}: grain |Δx|=${f6(dx)} Δy=${f3(dy)}`);
    if (dx > 0.05) fail(`${label}: grain not vertical (|Δx|=${f6(dx)})`);
    else ok(`${label}: grainline vertical`);
    if (dy <= 0) fail(`${label}: grain not pointing +y (Δy=${f3(dy)})`);
    else ok(`${label}: grain points +y (matches trousers)`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. Relative geometry unchanged under rigid rotation ===\n");

{
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = resolveStyle(CARGO_TROUSER_STYLE, body);
  const pat = draftTrousers(body, style);
  for (const name of [SLANT_POCKET_BACK_NAME, SLANT_POCKET_FRONT_NAME]) {
    const oriented = pat.pieces.find((p) => p.name === name)!;
    const fp0 = relativeFingerprint(oriented);
    // Tilt 35°, then re-orient — fingerprint must match (0.000)
    const tilted = rotatePiece(oriented, (35 * Math.PI) / 180);
    if (grainDx(tilted) < 1) {
      fail(`${name}: tilt did not move grain (test setup)`);
      continue;
    }
    const restored = orientPieceGrainVertical(tilted);
    const fp1 = relativeFingerprint(restored);
    const delta = fingerprintDelta(fp0, fp1);
    console.log(`  ${name}: before/after relative Δ = ${f6(delta)}`);
    if (delta > EPS) {
      fail(`${name}: relative geometry shifted (${f6(delta)}) — not pure layout`);
    } else {
      ok(`${name}: relative geometry identical (Δ=0.000)`);
    }
    // Idempotent on already-vertical
    const again = orientPieceGrainVertical(oriented);
    const d2 = fingerprintDelta(fp0, relativeFingerprint(again));
    if (d2 > EPS) fail(`${name}: re-orient changed relative geometry`);
    else ok(`${name}: orient is idempotent on vertical grain`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Silhouette invariant still 0.000 ===\n");

{
  const bodies = [
    ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
    { name: "Helen-print", body: helenBody() },
  ];
  for (const bod of bodies) {
    const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
    const style = resolveStyle(CARGO_TROUSER_STYLE, body);
    const mouth = resolveFrontSlantPocketMouth(body, style);
    const inv = silhouetteInvariantDelta(mouth);
    console.log(
      `  ${bod.name}: waistΔ=${f6(inv.waistDelta)} sideΔ=${f6(inv.sideDelta)}`,
    );
    if (inv.waistDelta > EPS || inv.sideDelta > EPS) {
      fail(`${bod.name}: silhouette broken`);
    } else ok(`${bod.name}: silhouette 0.000`);
  }
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS — grain layout only; cut unchanged ===\n"
    : `\n=== ACCEPT FAIL (${failures}) ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
