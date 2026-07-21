/**
 * DIAGNOSTIC — is the cutting path a true parallel offset near the crotch tip?
 * Run: npx tsx scripts/diag-offset-uniformity.ts
 *
 * Trigger: diag-crotch-tip-corner §3 STOP — Izzy back cut−net tip→knee short
 * of a·cot(θ/2) by ~2.18 mm.
 *
 * Print only. No geometry changes.
 */
import {
  applyEase,
  type OutlinePoint,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { pchipByY, polylineLength } from "../lib/geometry/curves";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "../lib/geometry/seamAllowance";
import {
  blockFromWaistDrop,
  draftTrousers,
  trouserBackPoints,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  IZZY_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";

const DUP = 0.01;
const a = DEFAULT_SEAM_ALLOWANCE.seam; // 10
const DEV = 0.1; // mm — report deviations beyond this
const REACH = 80; // mm along each edge from tip
const f3 = (n: number) => n.toFixed(3);
const f1 = (n: number) => n.toFixed(1);
const pt = (p: Point) => `(${f3(p.x)}, ${f3(p.y)})`;

function resolveStyle(
  s: TrouserStyleSettings,
  body: ReturnType<typeof applyEase>,
): TrouserFrontStyle {
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
    ...(s.crotchStraightRun != null ? { crotchStraightRun: s.crotchStraightRun } : {}),
    ...(s.crotchArrivalAngle != null ? { crotchArrivalAngle: s.crotchArrivalAngle } : {}),
    ...(s.waistlineCurveFront != null
      ? { waistlineCurveFront: s.waistlineCurveFront }
      : {}),
    ...(s.frontWaistInset != null ? { frontWaistInset: s.frontWaistInset } : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
  };
  const depth =
    s.waistbandMode === "darted"
      ? s.dartedWaistFinish === "facing"
        ? 0
        : s.dartedBandDepth
      : s.waistbandDepth;
  if (s.waistbandMode === "darted") {
    return withWaistband(base, depth, "darted", body);
  }
  return depth > 0 ? withWaistband(base, depth, "shaped", body) : base;
}

function dist(p: Point, q: Point): number {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

function collapse(outline: OutlinePoint[]): OutlinePoint[] {
  const out: OutlinePoint[] = [];
  for (const p of outline) {
    const last = out[out.length - 1];
    if (last && dist(p.at, last.at) < DUP) continue;
    out.push(p);
  }
  if (out.length > 1 && dist(out[0]!.at, out[out.length - 1]!.at) < DUP) {
    out.pop();
  }
  return out;
}

function findIdx(outline: OutlinePoint[], target: Point, tol = 0.5): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const d = dist(outline[i]!.at, target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD <= tol ? best : -1;
}

/** Closest point on polyline + distance. */
function closestOnPoly(
  p: Point,
  poly: Point[],
): { dist: number; at: Point; seg: number; t: number } {
  let best = { dist: Infinity, at: poly[0]!, seg: 0, t: 0 };
  for (let i = 0; i < poly.length - 1; i++) {
    const A = poly[i]!;
    const B = poly[i + 1]!;
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / lenSq));
    }
    const at = { x: A.x + t * dx, y: A.y + t * dy };
    const d = dist(p, at);
    if (d < best.dist) best = { dist: d, at, seg: i, t };
  }
  return best;
}

function stats(vals: number[]): { min: number; max: number; mean: number; n: number } {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of vals) {
    min = Math.min(min, v);
    max = Math.max(max, v);
    sum += v;
  }
  return { min, max, mean: sum / vals.length, n: vals.length };
}

/** Walk collapsed outline from tipIdx in `dir`, collecting net pts until arc ≥ reach. */
function walkNet(
  collapsed: OutlinePoint[],
  tipIdx: number,
  dir: 1 | -1,
  reach: number,
): { idxs: number[]; pts: Point[]; arcs: number[] } {
  const n = collapsed.length;
  const idxs: number[] = [tipIdx];
  const pts: Point[] = [collapsed[tipIdx]!.at];
  const arcs: number[] = [0];
  let arc = 0;
  let i = tipIdx;
  for (let step = 0; step < n && arc < reach; step++) {
    const j = (i + dir + n) % n;
    arc += dist(collapsed[i]!.at, collapsed[j]!.at);
    idxs.push(j);
    pts.push(collapsed[j]!.at);
    arcs.push(arc);
    i = j;
  }
  return { idxs, pts, arcs };
}

/**
 * Dense samples along the cutting outline from tip along dir, measuring
 * perp distance to the net polyline of the same edge walk.
 */
function sampleCutToNet(
  collapsed: OutlinePoint[],
  cut: Point[],
  tipIdx: number,
  dir: 1 | -1,
  reach: number,
  samplesPerSeg = 8,
): { dists: number[]; arcAt: number[]; cutPts: Point[]; netClosest: Point[] } {
  const n = collapsed.length;
  const netWalk = walkNet(collapsed, tipIdx, dir, reach + 20);
  const netPoly = netWalk.pts;

  const dists: number[] = [];
  const arcAt: number[] = [];
  const cutPts: Point[] = [];
  const netClosest: Point[] = [];

  let arc = 0;
  let i = tipIdx;
  for (let step = 0; step < n && arc < reach; step++) {
    const j = (i + dir + n) % n;
    const A = cut[i]!;
    const B = cut[j]!;
    const segLen = dist(A, B);
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      const p = { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) };
      const sampleArc = arc + t * segLen;
      if (sampleArc > reach && s > 0) break;
      const c = closestOnPoly(p, netPoly);
      dists.push(c.dist);
      arcAt.push(sampleArc);
      cutPts.push(p);
      netClosest.push(c.at);
    }
    arc += segLen;
    i = j;
  }
  // include end of last partial
  return { dists, arcAt, cutPts, netClosest };
}

function angleBetween(d0: Point, d1: Point): number {
  const L0 = Math.hypot(d0.x, d0.y) || 1;
  const L1 = Math.hypot(d1.x, d1.y) || 1;
  const dot = Math.max(
    -1,
    Math.min(1, (d0.x * d1.x + d0.y * d1.y) / (L0 * L1)),
  );
  return (Math.acos(dot) * 180) / Math.PI;
}

function reportEdgeUniformity(
  label: string,
  collapsed: OutlinePoint[],
  cut: Point[],
  tipIdx: number,
  dir: 1 | -1,
  edgeName: string,
) {
  const samp = sampleCutToNet(collapsed, cut, tipIdx, dir, REACH);
  const st = stats(samp.dists);
  console.log(`\n  ${label} — cut→net perp dist along ${edgeName} (0–${REACH} mm from tip)`);
  console.log(
    `    n=${st.n}  min=${f3(st.min)}  max=${f3(st.max)}  mean=${f3(st.mean)} mm  (target ${a})`,
  );
  const bad = samp.dists
    .map((d, i) => ({ d, arc: samp.arcAt[i]!, cut: samp.cutPts[i]! }))
    .filter((x) => Math.abs(x.d - a) > DEV);
  if (bad.length === 0) {
    console.log(`    all samples within ±${DEV} mm of ${a}`);
  } else {
    console.log(`    ${bad.length} samples deviate >${DEV} mm from ${a}:`);
    // cluster by arc buckets of 5 mm
    const buckets = new Map<string, number>();
    for (const b of bad) {
      const key = `${Math.floor(b.arc / 5) * 5}–${Math.floor(b.arc / 5) * 5 + 5}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    for (const [k, c] of [...buckets.entries()].sort()) {
      console.log(`      arc ${k} mm: ${c} samples`);
    }
    const worst = bad.reduce((w, x) =>
      Math.abs(x.d - a) > Math.abs(w.d - a) ? x : w,
    );
    console.log(
      `    worst: d=${f3(worst.d)} at arc ${f3(worst.arc)} mm cut ${pt(worst.cut)}`,
    );
  }
  return st;
}

function draftIzzy() {
  const base = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
  const body = applyEase(base, IZZY_TROUSER_STYLE.ease);
  const style = resolveStyle(IZZY_TROUSER_STYLE, body);
  const net = draftTrousers(body, style);
  const withSA = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const frontPts = trouserFrontPoints(body, style);
  const backPts = trouserBackPoints(body, style);
  return { net, withSA, frontPts, backPts };
}

console.log("=== DIAG: cutting-path offset uniformity near crotch tip ===");
console.log(`Izzy preset; a=${a} mm; reach=${REACH} mm; deviation threshold=${DEV} mm`);

const { net, withSA, frontPts, backPts } = draftIzzy();

for (const side of ["front", "back"] as const) {
  const tip = side === "front" ? frontPts.p9 : backPts.p24;
  const knee = side === "front" ? frontPts.p15 : backPts.p29;
  const pieceNet = net.pieces.find(
    (p) => p.name === (side === "front" ? "Trouser front" : "Trouser back"),
  )!;
  const pieceCut = withSA.pieces.find(
    (p) => p.name === (side === "front" ? "Trouser front" : "Trouser back"),
  )!;
  const collapsed = collapse(pieceNet.outline);
  const cut = pieceCut.cuttingOutline!;
  if (cut.length !== collapsed.length) {
    console.log(`\nSTOP: ${side} cut ${cut.length} ≠ net ${collapsed.length}`);
    continue;
  }
  const tipIdx = findIdx(collapsed, tip);
  const kneeIdx = findIdx(collapsed, knee);
  console.log(`\n========== ${side.toUpperCase()} tip ${pt(tip)} i=${tipIdx} ==========`);
  console.log(
    `  tip role=${collapsed[tipIdx]!.role}; prev=${collapsed[(tipIdx - 1 + collapsed.length) % collapsed.length]!.role}; next=${collapsed[(tipIdx + 1) % collapsed.length]!.role}`,
  );

  // Outline order: … inseam (hem→tip) … tip … crotch …
  // dir −1 = along inseam toward hem/knee; dir +1 = along crotch toward waist
  reportEdgeUniformity(
    side,
    collapsed,
    cut,
    tipIdx,
    -1,
    "inseam (toward hem)",
  );
  reportEdgeUniformity(
    side,
    collapsed,
    cut,
    tipIdx,
    1,
    "crotch (toward waist)",
  );

  if (side === "back") {
    // —— 2. Vertex dump ±10 around tip ——
    console.log("\n--- 2. Vertex dump around BACK tip (±10) ---");
    console.log(
      `  ${"i".padStart(4)} ${"role".padEnd(12)} ${"net".padEnd(22)} ${"cut".padEnd(22)} ${" |c−n|".padStart(8)} ${"perp→net".padStart(10)} ${"Δfrom10".padStart(8)}`,
    );
    const n = collapsed.length;
    // Build local net poly for perp (wider window)
    const windowNet: Point[] = [];
    for (let k = -15; k <= 15; k++) {
      windowNet.push(collapsed[(tipIdx + k + n) % n]!.at);
    }
    for (let k = -10; k <= 10; k++) {
      const i = (tipIdx + k + n) % n;
      const netP = collapsed[i]!.at;
      const cutP = cut[i]!;
      const chord = dist(cutP, netP);
      const perp = closestOnPoly(cutP, windowNet).dist;
      const mark = Math.abs(perp - a) > DEV ? " *" : "";
      console.log(
        `  ${String(i).padStart(4)} ${String(collapsed[i]!.role ?? "?").padEnd(12)} ${pt(netP).padEnd(22)} ${pt(cutP).padEnd(22)} ${f3(chord).padStart(8)} ${f3(perp).padStart(10)} ${f3(perp - a).padStart(8)}${mark}`,
      );
    }

    // —— 3. Horizontal flat run ——
    console.log("\n--- 3. Back crotch horizontal flat run ---");
    // Tip is T=p24; flat run toward K along y=R (287 for Izzy). Walk crotch (+1).
    const flatPts: { i: number; at: Point; cut: Point; perp: number }[] = [];
    let i = tipIdx;
    let prev = collapsed[tipIdx]!.at;
    for (let step = 0; step < 40; step++) {
      const j = (i + 1) % n;
      const p = collapsed[j]!.at;
      const role = collapsed[j]!.role;
      // still on crotch / near-horizontal from tip
      const dy = Math.abs(p.y - tip.y);
      const fromTip = dist(p, tip);
      if (role !== "crotch" && step > 0) break;
      const perp = closestOnPoly(cut[j]!, [
        tip,
        ...flatPts.map((f) => f.at),
        p,
      ]).dist;
      flatPts.push({ i: j, at: p, cut: cut[j]!, perp });
      // leave flat run when y drifts or we hit the curve (significant direction change)
      if (step > 0) {
        const dPrev = {
          x: prev.x - tip.x,
          y: prev.y - tip.y,
        };
        // compare segment direction to horizontal
        const seg = { x: p.x - collapsed[i]!.at.x, y: p.y - collapsed[i]!.at.y };
        const ang = angleBetween(seg, { x: 1, y: 0 });
        if (dy > 0.5 || (fromTip > 1 && ang > 5 && Math.abs(seg.y) > 0.1)) {
          // include this junction vertex then stop
          console.log(
            `    left flat-ish run at i=${j} ${pt(p)} role=${role} dy=${f3(dy)} seg∠horiz=${f1(ang)}°`,
          );
          break;
        }
        void dPrev;
      }
      prev = p;
      i = j;
    }
    // More precise: vertices with |y - tip.y| < 0.05 and role crotch, contiguous from tip
    const flatStrict: number[] = [];
    i = tipIdx;
    for (let step = 0; step < 40; step++) {
      const j = step === 0 ? tipIdx : (i + 1) % n;
      const p = collapsed[j]!.at;
      if (Math.abs(p.y - tip.y) > 0.05) break;
      if (step > 0 && collapsed[j]!.role !== "crotch") break;
      flatStrict.push(j);
      i = j;
      if (step > 0 && j === tipIdx) break;
    }
    console.log(
      `    net vertices on y≈tip.y (contiguous from tip): ${flatStrict.length}`,
    );
    for (const fi of flatStrict) {
      const netP = collapsed[fi]!.at;
      const cutP = cut[fi]!;
      // perp to horizontal net line through tip (the flat run is colinear)
      const flatPoly = flatStrict.map((idx) => collapsed[idx]!.at);
      // if only tip, use tip→next
      const poly =
        flatPoly.length >= 2
          ? flatPoly
          : [tip, collapsed[(tipIdx + 1) % n]!.at];
      const perp = closestOnPoly(cutP, poly).dist;
      const chord = dist(cutP, netP);
      console.log(
        `      i=${fi} net ${pt(netP)} cut ${pt(cutP)} |c−n|=${f3(chord)} perp→flat=${f3(perp)}`,
      );
    }
    // Junction: first vertex after flat with dy
    const afterFlat = (flatStrict[flatStrict.length - 1]! + 1) % n;
    const jNet = collapsed[afterFlat]!;
    const jCut = cut[afterFlat]!;
    const before = collapsed[flatStrict[flatStrict.length - 1]!]!;
    const dIn = {
      x: before.at.x - collapsed[(flatStrict[flatStrict.length - 1]! - 1 + n) % n]!.at.x,
      y: before.at.y - collapsed[(flatStrict[flatStrict.length - 1]! - 1 + n) % n]!.at.y,
    };
    // directions at junction vertex afterFlat: prev edge and curr edge
    const prevV = before.at;
    const currV = jNet.at;
    const nextV = collapsed[(afterFlat + 1) % n]!.at;
    const angTurn = angleBetween(
      { x: currV.x - prevV.x, y: currV.y - prevV.y },
      { x: nextV.x - currV.x, y: nextV.y - currV.y },
    );
    console.log(
      `    junction (first off-flat) i=${afterFlat} ${pt(jNet.at)} role=${jNet.role}`,
    );
    console.log(
      `      turn angle between adjacent net segments: ${f1(angTurn)}°`,
    );
    console.log(
      `      |cut−net| chord=${f3(dist(jCut, jNet.at))}; if turn≫0 → mitred corner, if ~0 → smooth average`,
    );
    // Compare cut junction vs averaged vs mitre-ish
    const tipCut = cut[tipIdx]!;
    console.log(`      tip cut M=${pt(tipCut)}; junction cut=${pt(jCut)}`);

    // —— 4. Where the 2.18 mm goes ——
    console.log("\n--- 4. Localising tip→knee cut shortfall (back) ---");
    const inseamNet = pchipByY([tip, knee, backPts.p28]);
    const kneeOnInseam = findIdx(
      inseamNet.map((p) => ({ at: p, edge: "seam" as const })),
      knee,
      0.5,
    );
    // find knee in pchip samples
    let kneeI = 0;
    let bestKd = Infinity;
    for (let k = 0; k < inseamNet.length; k++) {
      const d = dist(inseamNet[k]!, knee);
      if (d < bestKd) {
        bestKd = d;
        kneeI = k;
      }
    }
    const netTipKnee = polylineLength(inseamNet.slice(0, kneeI + 1));
    // cut walk tip → knee along inseam (dir −1)
    const cutSegs: { i: number; j: number; netLen: number; cutLen: number; cumNet: number; cumCut: number }[] = [];
    let cumNet = 0;
    let cumCut = 0;
    i = tipIdx;
    let guard = 0;
    while (i !== kneeIdx && guard < n) {
      const j = (i - 1 + n) % n;
      const nLen = dist(collapsed[i]!.at, collapsed[j]!.at);
      const cLen = dist(cut[i]!, cut[j]!);
      cumNet += nLen;
      cumCut += cLen;
      cutSegs.push({
        i,
        j,
        netLen: nLen,
        cutLen: cLen,
        cumNet,
        cumCut,
      });
      i = j;
      guard++;
    }
    const predExtra = 12.3; // from prior diag a·cot(θ/2)
    const predicted = netTipKnee + predExtra;
    const actual = cumCut;
    console.log(`    net tip→knee (pchip) = ${f3(netTipKnee)} mm`);
    console.log(`    cut tip→knee (walk)  = ${f3(actual)} mm`);
    console.log(`    predicted (net+${predExtra}) = ${f3(predicted)} mm`);
    console.log(
      `    shortfall actual vs predicted = ${f3(predicted - actual)} mm`,
    );
    console.log(
      `    cut−net total = ${f3(actual - cumNet)} mm (cumNet walk on collapsed=${f3(cumNet)})`,
    );
    console.log("    per-segment cut−net Δ near tip (first 12 segs):");
    let cumDelta = 0;
    for (let s = 0; s < Math.min(12, cutSegs.length); s++) {
      const seg = cutSegs[s]!;
      const dLen = seg.cutLen - seg.netLen;
      cumDelta += dLen;
      console.log(
        `      ${seg.i}→${seg.j}: net ${f3(seg.netLen)} cut ${f3(seg.cutLen)} Δ=${f3(dLen)} cumΔ=${f3(cumDelta)}  roles ${collapsed[seg.i]!.role}→${collapsed[seg.j]!.role}`,
      );
    }
    // Corner-only contribution: first segment from tip
    const first = cutSegs[0]!;
    console.log(
      `    first segment (tip→neighbour): Δ=${f3(first.cutLen - first.netLen)} mm`,
    );
    console.log(
      `    remaining after first: cumΔ_rest=${f3(cumDelta - (first.cutLen - first.netLen))} mm over next segs shown`,
    );

    // —— 5. Sampling / segment lengths ——
    console.log("\n--- 5. Segment lengths near tip (net vs cut) ---");
    console.log("    along inseam (dir −1), 8 segments:");
    i = tipIdx;
    for (let s = 0; s < 8; s++) {
      const j = (i - 1 + n) % n;
      console.log(
        `      net ${f3(dist(collapsed[i]!.at, collapsed[j]!.at))} mm | cut ${f3(dist(cut[i]!, cut[j]!))} mm  (${collapsed[i]!.role}→${collapsed[j]!.role})`,
      );
      i = j;
    }
    console.log("    along crotch (dir +1), 8 segments:");
    i = tipIdx;
    for (let s = 0; s < 8; s++) {
      const j = (i + 1) % n;
      console.log(
        `      net ${f3(dist(collapsed[i]!.at, collapsed[j]!.at))} mm | cut ${f3(dist(cut[i]!, cut[j]!))} mm  (${collapsed[i]!.role}→${collapsed[j]!.role})`,
      );
      i = j;
    }
    console.log(
      "    note: cut and net share 1:1 vertex indices (same sample density);",
    );
    console.log(
      "    offset is per-vertex mitre/average of chord normals — not an analytic parallel curve.",
    );

    void kneeOnInseam;
  }
}

console.log("\n=== VERDICT ===");
console.log(
  "See min/max/mean above. If back inseam/crotch show |d−10|>0.1 near the tip,",
);
console.log(
  "the cutting path is NOT a uniform parallel — error location is in the * buckets / dump.",
);
console.log("=== end diagnostic (no geometry changes) ===");
