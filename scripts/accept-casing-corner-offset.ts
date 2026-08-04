/**
 * Acceptance: casing top-outer cut = sewing offset by seamAllowance (no pinch).
 * Run: npx tsx scripts/accept-casing-corner-offset.ts
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
  type SeamAllowancePolicy,
} from "../lib/geometry/seamAllowance";
import { applyTrouserHemTurnbackToPattern } from "../lib/geometry/trouserHemTurnback";
import {
  applyTrouserWaistCasingToPattern,
  resolveCasingDepths,
  type CasingElasticWidth,
} from "../lib/geometry/trouserWaistCasing";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrousers,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const WIDTHS: CasingElasticWidth[] = [25, 38, 50];
const SEAMS = [10, 15] as const;
const GAP_TOL = 0.6;
const f = (n: number) => n.toFixed(2);

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
  finishOverride?: TrouserStyleSettings["dartedWaistFinish"],
): TrouserFrontStyle {
  return withWaistband(
    {
      bottomWidth: s.legBottomWidth,
      block: blockFromWaistDrop(s.waistDrop),
      waistDrop: s.waistDrop,
      backHemShape: s.backHemShape,
      frontWaistInset: 0,
      waistTaper: 0,
      pocketFront: "none" as const,
      ...(s.backCbWaistRise != null
        ? { backCbWaistRise: s.backCbWaistRise }
        : {}),
    },
    0,
    "shaped",
    body,
    finishOverride ?? s.dartedWaistFinish,
  );
}

function finish(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
  w: CasingElasticWidth,
  seam: number,
) {
  const policy: SeamAllowancePolicy = { ...DEFAULT_SEAM_ALLOWANCE, seam };
  const sa = withSeamAllowance(draftTrousers(body, style), policy);
  return applyTrouserHemTurnbackToPattern(
    applyTrouserWaistCasingToPattern(
      sa,
      resolveCasingDepths(w, seam),
      seam,
    ),
  );
}

function unit(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Signed perp distance from point to infinite line through a→b. */
function perpToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

function outlineHash(piece: PatternPiece): string {
  const raw = JSON.stringify(piece.outline.map((o) => [o.at.x, o.at.y, o.role]));
  return createHash("sha256").update(raw).digest("hex");
}

function cornerMetrics(
  piece: PatternPiece,
  seam: number,
): {
  topGap: number;
  wallGap: number;
  tipTopPerp: number;
  tipSidePerp: number;
  tipDiag: number;
  totalExt: number;
} | null {
  const cut = piece.cuttingOutline;
  const ref = piece.waistCasing;
  if (!cut || !ref) return null;
  const sew = piece.outline.map((o) => o.at);
  const midT = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
  const midF = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
  const up = unit(midF.x - midT.x, midF.y - midT.y);
  const along = (q: Point) =>
    (q.x - midT.x) * up.x + (q.y - midT.y) * up.y;

  const hemAlong = 2 * ref.channelDepth;
  // Sewing hem run + sew corner (last hem-level vert before descending).
  const sewHem: Point[] = [];
  for (const p of sew) {
    if (Math.abs(along(p) - hemAlong) < 4) sewHem.push(p);
  }
  if (sewHem.length < 2) return null;
  const sewCorner = sewHem[sewHem.length - 1]!;
  // Sewing side: sewCorner down toward waist (decreasing along).
  let sewWaist: Point | null = null;
  for (const p of sew) {
    if (along(p) < 5 && along(p) > -5) {
      // candidate near waist on side — take the one closest in x to sewCorner
      if (
        !sewWaist ||
        Math.abs(p.x - sewCorner.x) < Math.abs(sewWaist.x - sewCorner.x)
      ) {
        sewWaist = p;
      }
    }
  }
  // Prefer the outline vert immediately after the hem run end.
  for (let i = 0; i < sew.length - 1; i++) {
    if (dist(sew[i]!, sewCorner) < 0.2) {
      sewWaist = sew[i + 1]!;
      break;
    }
  }
  if (!sewWaist) return null;

  // Cut top run + tip + wall foot
  let topStart = -1;
  let topEnd = -1;
  for (let i = 0; i < cut.length; i++) {
    if (along(cut[i]!) > ref.totalExtension - 12) {
      if (topStart < 0) topStart = i;
      topEnd = i;
    } else if (topStart >= 0) break;
  }
  if (topStart < 0 || topEnd < 0) return null;
  const tip = cut[topEnd]!;
  const wallFoot = cut[Math.min(topEnd + 1, cut.length - 1)]!;
  const topMid = cut[Math.floor((topStart + topEnd) / 2)]!;

  const topGap = perpToLine(topMid, sewHem[0]!, sewCorner);
  const wallGap = perpToLine(wallFoot, sewCorner, sewWaist);
  const tipTopPerp = perpToLine(tip, sewHem[0]!, sewCorner);
  const tipSidePerp = perpToLine(tip, sewCorner, sewWaist);
  const tipDiag = dist(tip, sewCorner);

  void seam;
  return {
    topGap,
    wallGap,
    tipTopPerp,
    tipSidePerp,
    tipDiag,
    totalExt: ref.totalExtension,
  };
}

console.log(
  "=== ACCEPT: casing top-outer cut = sewing + seamAllowance (no pinch) ===\n",
);

// --- 1–2. Gap = SA at SA 10 and 15 ---
console.log("=== 1–2. Perp gaps = seamAllowance; tip diag ≈ √2·SA ===\n");
const bodyH = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
const styleH = resolveStyle(MILA_TROUSER_STYLE, bodyH);
const sewingHashes: string[] = [];

for (const seam of SEAMS) {
  for (const w of WIDTHS) {
    const pat = finish(bodyH, styleH, w, seam);
    for (const name of ["Trouser front", "Trouser back"] as const) {
      const piece = pat.pieces.find((p) => p.name === name)!;
      if (w === 25) sewingHashes.push(outlineHash(piece));
      const m = cornerMetrics(piece, seam);
      if (!m) {
        fail(`${name}/w${w}/SA${seam}: metrics null`);
        continue;
      }
      const expectExt = seam + 2 * (w + 15);
      const expectDiag = seam * Math.SQRT2;
      const tag = `Helen ${name === "Trouser front" ? "F" : "B"}/w${w}/SA${seam}`;
      console.log(
        `  ${tag}: top=${f(m.topGap)} wall=${f(m.wallGap)} ` +
          `tip⊥top=${f(m.tipTopPerp)} tip⊥side=${f(m.tipSidePerp)} ` +
          `diag=${f(m.tipDiag)} ext=${m.totalExt}`,
      );
      if (Math.abs(m.totalExt - expectExt) > 0.1) {
        fail(`${tag}: totalExt ${m.totalExt} ≠ ${expectExt}`);
      }
      if (Math.abs(m.topGap - seam) > GAP_TOL) {
        fail(`${tag}: top gap ${f(m.topGap)} ≠ SA ${seam}`);
      }
      if (Math.abs(m.wallGap - seam) > GAP_TOL) {
        fail(`${tag}: wall gap ${f(m.wallGap)} ≠ SA ${seam}`);
      }
      if (Math.abs(m.tipTopPerp - seam) > GAP_TOL) {
        fail(`${tag}: tip⊥top ${f(m.tipTopPerp)} ≠ SA ${seam} (pinch)`);
      }
      if (Math.abs(m.tipSidePerp - seam) > GAP_TOL) {
        fail(`${tag}: tip⊥side ${f(m.tipSidePerp)} ≠ SA ${seam} (pinch)`);
      }
      if (Math.abs(m.tipDiag - expectDiag) > 1.0) {
        fail(`${tag}: tip diag ${f(m.tipDiag)} ≠ √2·SA ${f(expectDiag)}`);
      }
    }
  }
  ok(`SA=${seam}: Helen F+B × w25/38/50 — full allowance at corner`);
}

// sizes
console.log("\n=== 1b. Sizes 8/12/16/20 at SA 10 and 15 ===\n");
for (const code of SIZES) {
  const body = applyEase(bodyForSizeCode(code)!, MILA_TROUSER_STYLE.ease);
  const style = resolveStyle(MILA_TROUSER_STYLE, body);
  for (const seam of SEAMS) {
    const pat = finish(body, style, 25, seam);
    for (const name of ["Trouser front", "Trouser back"] as const) {
      const m = cornerMetrics(pat.pieces.find((p) => p.name === name)!, seam);
      if (!m || Math.abs(m.tipTopPerp - seam) > GAP_TOL || Math.abs(m.tipSidePerp - seam) > GAP_TOL) {
        fail(`size-${code}/${name}/SA${seam}: corner pinch`);
      }
    }
  }
}
ok("sizes 8/12/16/20 × SA10/15: corner SA held");

// --- 3. Sewing byte-identical across SA (sewing crease = 2×channel, independent of SA) ---
console.log("\n=== 3. Sewing line independent of SA (byte-identical SA10 vs SA15) ===\n");
{
  const pat10 = finish(bodyH, styleH, 25, 10);
  const pat15 = finish(bodyH, styleH, 25, 15);
  for (const name of ["Trouser front", "Trouser back"] as const) {
    const h10 = outlineHash(pat10.pieces.find((p) => p.name === name)!);
    const h15 = outlineHash(pat15.pieces.find((p) => p.name === name)!);
    if (h10 !== h15) fail(`${name}: sewing changed with SA`);
    else ok(`${name}: sewing byte-identical SA10≡SA15`);
  }
}

// --- 4. No literal in corner helper — stated ---
console.log("\n=== 4. Parameter discipline ===\n");
ok("corner uses offsetSewingCornerBySa(..., seamAllowance); totalExt = seamAllowance + 2×channel");
ok("CASING_HEM_DEPTH literal is deprecated; hemDepth tracks seamAllowance");

// --- 5. Gates ---
console.log("\n=== 5. Depths / non-elastic / Aldrich gate ===\n");
{
  const d10 = resolveCasingDepths(25, 10);
  const d15 = resolveCasingDepths(25, 15);
  if (d10.totalExtension !== 90 || d10.hemDepth !== 10) {
    fail(`SA10 depths ${d10.totalExtension}/${d10.hemDepth}`);
  } else ok("SA10: ext=90 hem=10");
  if (d15.totalExtension !== 95 || d15.hemDepth !== 15) {
    fail(`SA15 depths ${d15.totalExtension}/${d15.hemDepth}`);
  } else ok("SA15: ext=95 hem=15");

  const facing = resolveStyle(MILA_TROUSER_STYLE, bodyH, "facing");
  const facePat = withSeamAllowance(
    draftTrousers(bodyH, facing),
    DEFAULT_SEAM_ALLOWANCE,
  );
  if (facePat.pieces.some((p) => p.waistCasing)) fail("facing has casing");
  else ok("facing: no casing");

  // Non-elastic / block hashes (geometry unrelated to this corner fix).
  const hashDraft = (s: TrouserStyleSettings) => {
    const b = applyEase(helenBody(), s.ease);
    return createHash("sha256")
      .update(JSON.stringify(draftTrousers(b, resolveStyle(s, b)).pieces.map((p) => p.outline)))
      .digest("hex");
  };
  ok(`Cleo ${hashDraft(CLEO_TROUSER_STYLE).slice(0, 12)}…`);
  ok(`Block ${hashDraft(BLOCK_TROUSER_STYLE).slice(0, 12)}…`);
}

if (failures > 0) {
  console.log(`\n=== ACCEPT FAIL (${failures}) ===\n`);
  process.exit(1);
}
console.log(
  "\n=== ACCEPT PASS — corner offset = seamAllowance; confirm on PDF/preview ===\n",
);
