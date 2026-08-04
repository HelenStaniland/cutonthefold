/**
 * Diagnostic: front casing regression from sewing-line U-rebuild (print only).
 * Run: npx tsx scripts/diag-front-casing-regression.ts
 *
 * Pre-brief casing left the net outline byte-identical (git HEAD). The
 * sewing-line brief replaces the waist→sideCorner span with a U. This script
 * compares before/after front top verts through the slash, checks the back,
 * and reports whether the rebuild is slash-aware. Change no product code.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
import { CARGO_TROUSER_STYLE } from "../lib/pattern/garmentStyles";
import {
  blockFromWaistDrop,
  draftTrousers,
  withWaistband,
} from "../lib/patterns/trouserBlock";

const HELEN = { waistToFloor: 1020, hipDepth: 215, bodyRise: 301 } as const;
const WIDTHS: CasingElasticWidth[] = [25, 38, 50];
const f1 = (n: number) => n.toFixed(1);
const f3 = (n: number) => n.toFixed(3);

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN };
}

function cargoElastic(
  body: BodyMeasurements,
  pocket: "slant" | "none",
) {
  const s = CARGO_TROUSER_STYLE;
  return withWaistband(
    {
      bottomWidth: s.legBottomWidth,
      block: blockFromWaistDrop(s.waistDrop),
      waistDrop: s.waistDrop,
      backHemShape: s.backHemShape,
      frontWaistInset: 0,
      waistTaper: 0,
      ...(pocket === "slant" ? { pocketFront: "slant" as const } : {}),
    },
    0,
    "shaped",
    body,
  );
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fmt(p: Point): string {
  return `(${f1(p.x)},${f1(p.y)})`;
}

function roleOf(o: OutlinePoint): string {
  return o.role ?? o.edge ?? "—";
}

/** Collapse near-duplicates for stable indexing. */
function collapse(outline: OutlinePoint[]): OutlinePoint[] {
  const out: OutlinePoint[] = [];
  for (const p of outline) {
    const last = out[out.length - 1];
    if (last && dist(last.at, p.at) < 0.01) continue;
    out.push(p);
  }
  if (out.length > 1 && dist(out[0]!.at, out[out.length - 1]!.at) < 0.01) {
    out.pop();
  }
  return out;
}

/**
 * Top-region walk: from CF/waist start, across waist / casing top / opening,
 * until we have left the waist plane and are clearly on the side or slash down.
 */
function topRegion(
  outline: OutlinePoint[],
  label: string,
): { idxs: number[]; verts: OutlinePoint[] } {
  const col = collapse(outline);
  // Prefer first waist-role; else lowest-y run near CF (casing hem is above).
  let start = col.findIndex((o) => o.role === "waist");
  if (start < 0) {
    // After U-rebuild there is often no waist role — start at min-y among
    // first third (CF side of piece).
    let best = 0;
    let bestY = Infinity;
    const lim = Math.min(col.length, Math.floor(col.length / 3) + 5);
    for (let i = 0; i < lim; i++) {
      if (col[i]!.at.y < bestY) {
        bestY = col[i]!.at.y;
        best = i;
      }
    }
    // Walk back to a point that looks like CF ascending into the top.
    start = best;
    for (let i = best; i >= 0 && i > best - 8; i--) {
      if (col[i]!.role === "waist" || col[i]!.at.y > bestY + 5) {
        start = i;
        break;
      }
      start = i;
    }
  }

  const idxs: number[] = [];
  const verts: OutlinePoint[] = [];
  const y0 = col[start]!.at.y;
  // Collect until we travel well below the start plane along the side/slash
  // for a sustained run (opening diagonal or side seam down).
  let belowCount = 0;
  for (let k = 0; k < col.length; k++) {
    const i = (start + k) % col.length;
    const o = col[i]!;
    idxs.push(i);
    verts.push(o);
    const dy = o.at.y - y0;
    if (dy > 25) belowCount++;
    else belowCount = 0;
    // Stop once we have a clear descent past the opening / side.
    if (
      k > 3 &&
      belowCount >= 3 &&
      (o.role === "side-seam" ||
        o.role === "pocket-mouth" ||
        o.role === "hip" ||
        dy > 40)
    ) {
      break;
    }
    if (k > 80) break;
  }
  void label;
  return { idxs, verts };
}

function printVerts(
  title: string,
  verts: OutlinePoint[],
  idxs?: number[],
): void {
  console.log(`  ${title} (${verts.length} verts):`);
  for (let i = 0; i < verts.length; i++) {
    const o = verts[i]!;
    const ix = idxs ? idxs[i] : i;
    console.log(
      `    [${String(ix).padStart(3)}] ${roleOf(o).padEnd(14)} ${fmt(o.at)}`,
    );
  }
}

function findRoles(outline: OutlinePoint[], role: string): OutlinePoint[] {
  return collapse(outline).filter((o) => o.role === role);
}

function openingEdgeSummary(outline: OutlinePoint[]): {
  count: number;
  first?: Point;
  last?: Point;
  spanY: number;
  spanX: number;
} {
  const mouth = findRoles(outline, "pocket-mouth");
  if (mouth.length === 0) {
    return { count: 0, spanY: 0, spanX: 0 };
  }
  const first = mouth[0]!.at;
  const last = mouth[mouth.length - 1]!.at;
  return {
    count: mouth.length,
    first,
    last,
    spanY: last.y - first.y,
    spanX: last.x - first.x,
  };
}

/** Upright side-wall candidates: verts climbing above waist near side/opening. */
function sideWallClimb(
  outline: OutlinePoint[],
  waistY: number,
): { count: number; minY: number; maxY: number; sample: Point[] } {
  const col = collapse(outline);
  const above = col.filter(
    (o) =>
      o.at.y < waistY - 5 &&
      (o.role === "side-seam" ||
        o.role === "pocket-mouth" ||
        o.role === undefined ||
        o.role === "waist"),
  );
  // Also: any run of points with Δy large negative from a side-ish x
  const samples = above.slice(0, 6).map((o) => o.at);
  const ys = above.map((o) => o.at.y);
  return {
    count: above.length,
    minY: ys.length ? Math.min(...ys) : NaN,
    maxY: ys.length ? Math.max(...ys) : NaN,
    sample: samples,
  };
}

function matchGone(
  before: OutlinePoint[],
  after: OutlinePoint[],
  tol = 1.5,
): OutlinePoint[] {
  return before.filter(
    (b) => !after.some((a) => dist(a.at, b.at) < tol),
  );
}

function matchAdded(
  before: OutlinePoint[],
  after: OutlinePoint[],
  tol = 1.5,
): OutlinePoint[] {
  return after.filter(
    (a) => !before.some((b) => dist(b.at, a.at) < tol),
  );
}

/**
 * Load HEAD applyTrouserWaistCasingToPattern (pre–sewing-U) into a temp module.
 * Falls back to SA-only net if HEAD load fails.
 */
async function loadHeadCasing(): Promise<{
  apply: typeof applyTrouserWaistCasingToPattern;
  sourceNote: string;
} | null> {
  const tmp = join(process.cwd(), "scripts", "_diag_casing_head_tmp.ts");
  try {
    const src = execSync("git show HEAD:lib/geometry/trouserWaistCasing.ts", {
      encoding: "utf8",
      maxBuffer: 2_000_000,
    });
    // Rewrite @/ imports to relative from scripts/
    const rewritten = src
      .replace(/from "@\/lib\//g, 'from "../lib/')
      .replace(
        /\/\*[\s\S]*?\*\//,
        "/* HEAD snapshot for diag — do not commit */",
      );
    writeFileSync(tmp, rewritten, "utf8");
    const mod = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
    return {
      apply: mod.applyTrouserWaistCasingToPattern,
      sourceNote: "git HEAD:lib/geometry/trouserWaistCasing.ts (pre sewing-U)",
    };
  } catch (e) {
    console.log(`  (HEAD module load failed: ${e})`);
    return null;
  } finally {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }
}

function sourceSlashAwareness(): {
  rebuildsOutline: boolean;
  mentionsSlash: boolean;
  replaceSpan: string;
  snippet: string[];
} {
  const src = readFileSync(
    join(process.cwd(), "lib", "geometry", "trouserWaistCasing.ts"),
    "utf8",
  );
  const rebuildsOutline = /outline:\s*newOutline/.test(src);
  const mentionsSlash =
    /slash/i.test(src) ||
    /opening/i.test(src) && /sewingHem|newOutline/.test(src);
  // More precise: does the U-rebuild branch special-case pocket-mouth beyond
  // using it as sideCorner end?
  const uBlock = src.slice(
    src.indexOf("Sewing outline"),
    src.indexOf("stitchMark") > 0
      ? src.indexOf("stitchMark")
      : src.indexOf("const stitchMark"),
  );
  const specialCase =
    /pocket-mouth/.test(uBlock) &&
    (/keep.*slash|slash.*keep|opening.*skip|if.*pocket/i.test(uBlock) ||
      false);
  const snippet: string[] = [];
  for (const line of src.split(/\r?\n/)) {
    if (
      /replace waist|sewingHem|rawSideCorner|sideCornerIdx|newOutline|pocket-mouth/.test(
        line,
      )
    ) {
      snippet.push(line.trim());
    }
  }
  return {
    rebuildsOutline,
    mentionsSlash: specialCase,
    replaceSpan:
      "rawRun.start → sewingHem (waistNet↑hem) → endRaw(=sideCorner, often pocket-mouth); " +
      "skips collapsed indices (run.start, sideCornerIdx) and (run.start, sideCornerIdx) interiors",
    snippet: snippet.slice(0, 24),
  };
}

console.log("=== DIAG: front casing regression from sewing-line U-rebuild ===\n");
console.log(
  "Pre-brief (git HEAD): casing rebuilt CUT only; net outline unchanged.\n" +
    "Current (working tree): also replaces waist→sideCorner net span with sewing U.\n",
);

async function main(): Promise<void> {
const head = await loadHeadCasing();
if (head) {
  console.log(`  Before-casing apply: ${head.sourceNote}\n`);
} else {
  console.log(
    "  Before-casing apply: FALLBACK — SA net (HEAD left outline unchanged).\n",
  );
}

const awareness = sourceSlashAwareness();
console.log("=== 5. Is the U-rebuild slash-aware? (source) ===\n");
console.log(`  rebuilds outline: ${awareness.rebuildsOutline}`);
console.log(
  `  special-cases slash/opening in U block: ${awareness.mentionsSlash}`,
);
console.log(`  replace span: ${awareness.replaceSpan}`);
console.log("  relevant lines:");
for (const s of awareness.snippet) console.log(`    ${s}`);

const bodies: { name: string; body: BodyMeasurements }[] = [
  { name: "Helen-print", body: helenBody() },
  { name: "size-12", body: bodyForSizeCode("12")! },
  { name: "size-16", body: bodyForSizeCode("16")! },
];

type Row = {
  body: string;
  w: number;
  piece: string;
  beforeMouth: number;
  afterMouth: number;
  goneMouth: number;
  goneWaist: number;
  addedHemish: number;
  beforeTopN: number;
  afterTopN: number;
};

const rows: Row[] = [];

for (const bod of bodies) {
  const body = applyEase(bod.body, CARGO_TROUSER_STYLE.ease);
  const style = cargoElastic(body, "slant");
  const net = draftTrousers(body, style);
  const sa = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);

  for (const w of WIDTHS) {
    const d = resolveCasingDepths(w);
    const afterPat = applyTrouserWaistCasingToPattern(sa, d);
    const beforePat = head ? head.apply(sa, d) : sa;

    console.log(
      `\n######## ${bod.name}  elastic ${w}  (channel=${d.channelDepth} ext=${d.totalExtension}) ########\n`,
    );

    for (const name of ["Trouser front", "Trouser back"] as const) {
      const beforeP = beforePat.pieces.find((p) => p.name === name)!;
      const afterP = afterPat.pieces.find((p) => p.name === name)!;
      const saP = sa.pieces.find((p) => p.name === name)!;

      // Pre-brief net ≡ SA net (HEAD casing did not rewrite outline).
      const beforeNet = beforeP.outline;
      const afterNet = afterP.outline;
      // Sanity: HEAD before should match SA on net
      const headMatchesSa =
        collapse(beforeNet).length === collapse(saP.outline).length &&
        collapse(beforeNet).every(
          (o, i) => dist(o.at, collapse(saP.outline)[i]!.at) < 0.05,
        );

      console.log(`--- ${name} ---`);
      if (name === "Trouser front") {
        console.log(
          `  HEAD/before net ≡ SA net: ${headMatchesSa} ` +
            `(expect true — pre-brief left outline alone)`,
        );
      }

      const beforeTop = topRegion(beforeNet, "before");
      const afterTop = topRegion(afterNet, "after");

      printVerts("BEFORE net top (CF → through slash/side)", beforeTop.verts, beforeTop.idxs);
      printVerts("AFTER  net top (CF → through slash/side)", afterTop.verts, afterTop.idxs);

      const gone = matchGone(beforeTop.verts, afterTop.verts);
      const added = matchAdded(beforeTop.verts, afterTop.verts);
      console.log(`\n  Diverging — gone from before (${gone.length}):`);
      for (const o of gone) {
        console.log(`    - ${roleOf(o).padEnd(14)} ${fmt(o.at)}`);
      }
      console.log(`  Diverging — added in after (${added.length}):`);
      for (const o of added) {
        console.log(`    + ${roleOf(o).padEnd(14)} ${fmt(o.at)}`);
      }

      const mouthB = openingEdgeSummary(beforeNet);
      const mouthA = openingEdgeSummary(afterNet);
      console.log("\n  Slash / pocket-mouth edge:");
      console.log(
        `    BEFORE: ${mouthB.count} verts` +
          (mouthB.first
            ? `  ${fmt(mouthB.first)} → ${fmt(mouthB.last!)}  ` +
              `Δx=${f1(mouthB.spanX)} Δy=${f1(mouthB.spanY)}`
            : "  (none)"),
      );
      console.log(
        `    AFTER:  ${mouthA.count} verts` +
          (mouthA.first
            ? `  ${fmt(mouthA.first)} → ${fmt(mouthA.last!)}  ` +
              `Δx=${f1(mouthA.spanX)} Δy=${f1(mouthA.spanY)}`
            : "  (none)"),
      );
      if (mouthB.count > 0 && mouthA.count === 0) {
        console.log(
          "    → OPENING OVERWRITTEN: pocket-mouth role verts absent after U-rebuild",
        );
      } else if (
        mouthB.count > 0 &&
        mouthA.count > 0 &&
        Math.abs(mouthA.spanY) < 5 &&
        Math.abs(mouthB.spanY) > 20
      ) {
        console.log(
          "    → OPENING FLATTENED: mouth edge lost its vertical span (diagonal → flat)",
        );
      } else if (
        mouthB.count > 0 &&
        mouthA.count > 0 &&
        Math.abs(mouthA.spanY - mouthB.spanY) < 2
      ) {
        console.log(
          "    → opening edge still present with similar span (roles retained)",
        );
      }

      // Channel stitch / waist plane Y
      const turn = afterP.waistCasing?.turndownSeam;
      const waistY = turn
        ? turn[Math.floor(turn.length / 2)]!.y
        : beforeTop.verts[0]?.at.y ?? 0;

      const wallB = sideWallClimb(beforeNet, waistY);
      const wallA = sideWallClimb(afterNet, waistY);
      console.log("\n  Casing / top climb above waist plane (net):");
      console.log(
        `    BEFORE above-waist verts: ${wallB.count}  y∈[${f1(wallB.minY)},${f1(wallB.maxY)}]`,
      );
      console.log(
        `    AFTER  above-waist verts: ${wallA.count}  y∈[${f1(wallA.minY)},${f1(wallA.maxY)}]`,
      );

      // Cut outline: raw top run
      const beforeCut = beforeP.cuttingOutline;
      const afterCut = afterP.cuttingOutline;
      if (beforeCut && afterCut) {
        const cutMinYB = Math.min(...beforeCut.map((p) => p.y));
        const cutMinYA = Math.min(...afterCut.map((p) => p.y));
        console.log("\n  Cut outline (raw top ≈ min y):");
        console.log(
          `    BEFORE cut minY=${f1(cutMinYB)}  n=${beforeCut.length}`,
        );
        console.log(
          `    AFTER  cut minY=${f1(cutMinYA)}  n=${afterCut.length}`,
        );
        // Print first ~12 cut verts (top of piece in winding order)
        console.log("    BEFORE cut[0..11]:");
        for (let i = 0; i < Math.min(12, beforeCut.length); i++) {
          console.log(`      [${i}] ${fmt(beforeCut[i]!)}`);
        }
        console.log("    AFTER cut[0..11]:");
        for (let i = 0; i < Math.min(12, afterCut.length); i++) {
          console.log(`      [${i}] ${fmt(afterCut[i]!)}`);
        }
      }

      if (name === "Trouser front") {
        const goneMouth = gone.filter((o) => o.role === "pocket-mouth").length;
        const goneWaist = gone.filter((o) => o.role === "waist").length;
        const addedHemish = added.filter(
          (o) => !o.role || o.role === "waist",
        ).length;
        rows.push({
          body: bod.name,
          w,
          piece: "F",
          beforeMouth: mouthB.count,
          afterMouth: mouthA.count,
          goneMouth,
          goneWaist,
          addedHemish,
          beforeTopN: beforeTop.verts.length,
          afterTopN: afterTop.verts.length,
        });
      }
    }
  }
}

// Front with pocketFront none — control (should look like back)
{
  console.log(
    "\n######## CONTROL: Helen front pocketFront=none (plain waist like back) ########\n",
  );
  const body = applyEase(helenBody(), CARGO_TROUSER_STYLE.ease);
  const style = cargoElastic(body, "none");
  const sa = withSeamAllowance(draftTrousers(body, style), DEFAULT_SEAM_ALLOWANCE);
  const d = resolveCasingDepths(25);
  const after = applyTrouserWaistCasingToPattern(sa, d);
  const before = head ? head.apply(sa, d) : sa;
  const b = before.pieces.find((p) => p.name === "Trouser front")!;
  const a = after.pieces.find((p) => p.name === "Trouser front")!;
  const bt = topRegion(b.outline, "before");
  const at_ = topRegion(a.outline, "after");
  printVerts("BEFORE front (no pocket) top", bt.verts);
  printVerts("AFTER  front (no pocket) top", at_.verts);
  const gone = matchGone(bt.verts, at_.verts);
  const added = matchAdded(bt.verts, at_.verts);
  console.log(
    `  gone=${gone.length} added=${added.length} (expect waist chord → hem U; no slash)`,
  );
}

console.log("\n=== SUMMARY TABLE (slant front) ===\n");
console.log(
  "  body          w  mouthB→A  goneMouth goneWaist addedTop  topN B→A",
);
for (const r of rows) {
  console.log(
    `  ${r.body.padEnd(12)} ${String(r.w).padStart(2)}  ` +
      `${r.beforeMouth}→${r.afterMouth}`.padEnd(8) +
      `  ${String(r.goneMouth).padStart(9)} ${String(r.goneWaist).padStart(9)} ` +
      `${String(r.addedHemish).padStart(8)}  ${r.beforeTopN}→${r.afterTopN}`,
  );
}

console.log("\n=== HEADLINE (fill from numbers above) ===\n");
console.log(
  "  Mechanism: applyTrouserWaistCasingTurnup replaces the net span\n" +
    "  waist-run start → sideCorner (pocket-mouth when present) with sewingHem U\n" +
    "  (offset waist samples to hem depth). It does not walk the slash diagonal\n" +
    "  or preserve an upright side-seam wall as a separate casing side — the U's\n" +
    "  'side' end is the pocket-mouth vertex on the waist plane.\n",
);

const anyMouthGone = rows.some((r) => r.afterMouth === 0 && r.beforeMouth > 0);
const anyMouthKept = rows.some((r) => r.afterMouth > 0);
const anyWaistGone = rows.some((r) => r.goneWaist > 0);

console.log("  Evidence flags:");
console.log(
  `    (a) slash diagonal replaced / roles lost: ${anyMouthGone ? "YES (mouth count→0)" : anyMouthKept ? "mouth roles still present — check span/geometry" : "n/a"}`,
);
console.log(
  `    (b) casing side / top U overwrote waist chord: ${anyWaistGone ? "YES (waist verts gone from top walk)" : "see added hem-fold verts"}`,
);
console.log(
  `    (c) both / plain-chord treatment: U-rebuild is ${awareness.mentionsSlash ? "slash-aware" : "NOT slash-aware"} (treats front like back: waist chord → sideCorner end).\n`,
);
console.log(
  "  Back / no-pocket front: plain waist → clean U expected; confirm in dumps above.\n",
);
console.log("=== END DIAG (no code changed) ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
