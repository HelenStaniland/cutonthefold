/**
 * DIAGNOSTIC — full notch inventory & classification (print only).
 * Run: npx tsx scripts/diag-notch-inventory.ts
 *
 * Does not change geometry.
 */
import {
  applyEase,
  notchCount,
  type Marking,
  type OutlinePoint,
  type PatternPiece,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { pchipByY, polylineLength } from "../lib/geometry/curves";
import {
  blockFromWaistDrop,
  draftTrousers,
  trouserBackPoints,
  trouserFrontPoints,
  trouserWaistEdges,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  BLOCK_TROUSER_STYLE,
  IZZY_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import { draftWaistband } from "../lib/elements/waistband";
import { applySideOpening } from "../lib/elements/sideOpening";

const EDGE_TOL = 1.5; // mm — nearest-edge attribution
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

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

type NotchMark = Extract<Marking, { kind: "notch" }>;

function notchesOf(piece: PatternPiece): NotchMark[] {
  return piece.markings.filter((m): m is NotchMark => m.kind === "notch");
}

function rolePolyline(outline: OutlinePoint[], role: string): Point[] {
  const pts: Point[] = [];
  for (const o of outline) {
    if (o.role !== role) continue;
    const last = pts[pts.length - 1];
    if (last && dist(last, o.at) < 0.01) continue;
    pts.push(o.at);
  }
  return pts;
}

/** Concatenate roles in outline order into one polyline (for CF/crotch/CB). */
function rolesPolyline(outline: OutlinePoint[], roles: string[]): Point[] {
  const set = new Set(roles);
  const pts: Point[] = [];
  for (const o of outline) {
    if (!o.role || !set.has(o.role)) continue;
    const last = pts[pts.length - 1];
    if (last && dist(last, o.at) < 0.01) continue;
    pts.push(o.at);
  }
  return pts;
}

function closestOnPoly(
  p: Point,
  poly: Point[],
): { dist: number; arcFromStart: number; t: number; i: number } {
  let bestD = Infinity;
  let bestArc = 0;
  let bestT = 0;
  let bestI = 0;
  let arc = 0;
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
    const q = { x: A.x + t * dx, y: A.y + t * dy };
    const d = dist(p, q);
    const segLen = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      bestArc = arc + t * segLen;
      bestT = t;
      bestI = i;
    }
    arc += segLen;
  }
  return { dist: bestD, arcFromStart: bestArc, t: bestT, i: bestI };
}

function orderFromWaist(pts: Point[]): Point[] {
  if (pts.length < 2) return pts;
  return pts[0]!.y <= pts[pts.length - 1]!.y ? pts : [...pts].reverse();
}

function orderFromTip(pts: Point[], tip: Point): Point[] {
  if (pts.length < 2) return pts;
  return dist(pts[0]!, tip) <= dist(pts[pts.length - 1]!, tip)
    ? pts
    : [...pts].reverse();
}

type EdgeHit = {
  role: string;
  dist: number;
  arcFromStart: number;
  seamStart: string;
  polyLen: number;
};

function attributeEdge(
  piece: PatternPiece,
  at: Point,
  landmarks?: { tip?: Point; hem?: Point },
): EdgeHit | null {
  const roles = new Set<string>();
  for (const o of piece.outline) {
    if (o.role) roles.add(o.role);
  }
  let best: EdgeHit | null = null;
  for (const role of roles) {
    let poly = rolePolyline(piece.outline, role);
    if (poly.length < 2) continue;
    let seamStart = `${role}[0]`;
    if (role === "inseam" && landmarks?.tip) {
      poly = orderFromTip(poly, landmarks.tip);
      seamStart = "inseam tip (crotch tip)";
    } else if (role === "side-seam") {
      poly = orderFromWaist(poly);
      seamStart = "side-seam at waist";
    } else if (role === "waist") {
      seamStart = "waist[0] (toward side or CF/CB as drafted)";
    } else if (role === "crotch" || role === "centre-front" || role === "centre-back") {
      seamStart = `${role}[0] as outline-ordered`;
    } else if (role === "hem" && landmarks?.hem) {
      seamStart = "hem";
    }
    const hit = closestOnPoly(at, poly);
    if (hit.dist > EDGE_TOL) continue;
    if (!best || hit.dist < best.dist) {
      best = {
        role,
        dist: hit.dist,
        arcFromStart: hit.arcFromStart,
        seamStart,
        polyLen: polylineLength(poly),
      };
    }
  }
  return best;
}

/** Guess draft source from piece name + geometry landmarks. */
function guessSource(
  pieceName: string,
  n: NotchMark,
  idx: number,
  landmarks: {
    tip?: Point;
    knee?: Point;
    sideHip?: Point;
    hipY?: number;
  },
): { call: string; countRule: string } {
  if (n.label === "zip") {
    return {
      call: `applySideOpening → addOpeningNotch (label:"zip"); count unset → renders as single`,
      countRule: "per-notch (default 1; not doubled)",
    };
  }
  if (pieceName === "Front waistband" || pieceName === "Back waistband") {
    const fold = pieceName.startsWith("Front") ? "CF" : "CB";
    return {
      call: `draftWaistband({foldSide:"${fold}"}) — notch at bottom-edge mid; count: foldSide==="CB" ? 2 : 1`,
      countRule: "per-notch in waistband.ts (CB=2, CF=1)",
    };
  }
  if (pieceName === "Trouser front") {
    if (landmarks.knee && dist(n.at, landmarks.knee) < 0.5) {
      return {
        call: `draftTrouserFront: { kind:"notch", at:p15, count:1 }  // inseam knee`,
        countRule: "per-notch literal count:1",
      };
    }
    if (landmarks.sideHip && dist(n.at, landmarks.sideHip) < 0.5) {
      return {
        call: `draftTrouserFront: { kind:"notch", at:p8, count:1 }  // side-seam hip`,
        countRule: "per-notch literal count:1",
      };
    }
    if (landmarks.hipY != null && Math.abs(n.at.y - landmarks.hipY) < 0.5) {
      return {
        call: `draftTrouserFront markingsHip: { kind:"notch", at:pointOnPolylineAtY(crotchFromWaist,D), count:1 }`,
        countRule: "per-notch literal count:1",
      };
    }
    return {
      call: `draftTrouserFront: { kind:"notch", at:waistMidF, dir:…, count:1 }  // waist mid (index ${idx})`,
      countRule: "per-notch literal count:1",
    };
  }
  if (pieceName === "Trouser back") {
    if (landmarks.knee && dist(n.at, landmarks.knee) < 0.5) {
      return {
        call: `draftTrouserBack: { kind:"notch", at:p29, count:2 }  // inseam knee`,
        countRule: "per-notch literal count:2 (every back notch is written as 2 — not a post-pass)",
      };
    }
    if (landmarks.sideHip && dist(n.at, landmarks.sideHip) < 0.5) {
      return {
        call: `draftTrouserBack: { kind:"notch", at:p25, count:2 }  // side-seam hip`,
        countRule: "per-notch literal count:2",
      };
    }
    if (landmarks.hipY != null && Math.abs(n.at.y - landmarks.hipY) < 0.5) {
      return {
        call: `draftTrouserBack: { kind:"notch", at:hipOnCrotch.at, dir:…, count:2 }  // crotch at hip y`,
        countRule: "per-notch literal count:2",
      };
    }
    return {
      call: `draftTrouserBack: { kind:"notch", at:waistMidB, dir:…, count:2 }  // waist mid`,
      countRule: "per-notch literal count:2",
    };
  }
  return {
    call: `unknown emitter on ${pieceName} (index ${idx})`,
    countRule: "unknown",
  };
}

function confusableNote(pieceName: string): string {
  if (pieceName === "Trouser front" || pieceName === "Trouser back") {
    return "shape-confusable? NO — front/back outlines are unmistakable by crotch/hip; identity doubling on the leg is redundant for hand/face";
  }
  if (pieceName.includes("waistband") || pieceName === "Waistband") {
    return "shape-confusable? YES — long near-symmetric strip; top/bottom and end-to-end easy to reverse";
  }
  return "shape-confusable? ambiguous from code alone";
}

function draftFull(settings: TrouserStyleSettings) {
  const base = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
  const body = applyEase(base, settings.ease);
  const style = resolveStyle(settings, body);
  const baseNet = draftTrousers(body, style);
  const opened = applySideOpening(baseNet.pieces, {
    side: "left",
    length: 180,
  });
  const bandDepth = style.waistReduction ?? 0;
  let pieces = opened.pieces;
  if (bandDepth > 0) {
    const e = trouserWaistEdges(body, style);
    const fb = draftWaistband({
      innerLen: e.front.inner,
      outerLen: e.front.outer,
      depth: bandDepth,
      foldSide: "CF",
      label: "Front waistband",
    });
    const bb = draftWaistband({
      innerLen: e.back.inner,
      outerLen: e.back.outer,
      depth: bandDepth,
      foldSide: "CB",
      label: "Back waistband",
    });
    pieces = [...opened.pieces, fb.piece, bb.piece];
  }
  const frontPts = trouserFrontPoints(body, style);
  const backPts = trouserBackPoints(body, style);
  return { pieces, frontPts, backPts, style, body, bandDepth };
}

function printInventory(label: string, settings: TrouserStyleSettings) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`========== ${label} ==========`);
  console.log("=".repeat(72));

  const { pieces, frontPts, backPts, style, body, bandDepth } =
    draftFull(settings);

  console.log(
    `\nEmitted pieces (${pieces.length}): ${pieces.map((p) => p.name).join(", ")}`,
  );
  console.log(
    `waistband depth used: ${bandDepth} mm; zip opening 180 mm on both legs`,
  );

  // --- §2 code origin summary (once per preset) ---
  console.log("\n--- 2. Where notches come from (code) ---");
  console.log(
    "  Trouser front (draftTrouserFront): each notch written with count:1",
  );
  console.log(
    "    waistMidF; p8 (side hip); p15 (inseam knee); markingsHip at CF/crotch y=D",
  );
  console.log(
    "  Trouser back (draftTrouserBack): each notch written with count:2",
  );
  console.log(
    "    waistMidB; p25 (side hip); p29 (inseam knee); hipOnCrotch at crotch y=p17.y",
  );
  console.log(
    "  CRUX: doubling is NOT a piece-wide post-pass — draftTrouserBack literals set count:2 on every back notch.",
  );
  console.log(
    "  Front literals set count:1. There is no shared 'double all back markings' helper.",
  );
  console.log(
    "  applySideOpening: zip notch on each leg, count unset (single).",
  );
  console.log(
    "  draftWaistband: one balance notch on waist edge; count 2 if foldSide CB, else 1.",
  );

  const front = pieces.find((p) => p.name === "Trouser front")!;
  const back = pieces.find((p) => p.name === "Trouser back")!;

  const landmarksF = {
    tip: frontPts.p9,
    knee: frontPts.p15,
    sideHip: frontPts.p8,
    hem: frontPts.p14,
    hipY: frontPts.p6.y,
  };

  const landmarksB = {
    tip: backPts.p24,
    knee: backPts.p29,
    sideHip: backPts.p25,
    hem: backPts.p28,
    hipY: backPts.p17.y,
  };

  // --- §1 every notch ---
  console.log("\n--- 1. Every notch ---");
  for (const piece of pieces) {
    const ns = notchesOf(piece);
    const lm =
      piece.name === "Trouser front"
        ? landmarksF
        : piece.name === "Trouser back"
          ? landmarksB
          : {};
    console.log(`\n  [${piece.name}]  ${ns.length} notch(es)`);
    ns.forEach((n, i) => {
      const count = notchCount(n);
      const edge = attributeEdge(piece, n.at, {
        tip: "tip" in lm ? lm.tip : undefined,
        hem: "hem" in lm ? lm.hem : undefined,
      });
      const src = guessSource(piece.name, n, i, lm);
      console.log(
        `    #${i} kind=notch count=${count} (${count === 1 ? "single" : count === 2 ? "double" : `${count}-fold`}) at ${pt(n.at)}${n.label ? ` label="${n.label}"` : ""}`,
      );
      if (edge) {
        console.log(
          `       edge role=${edge.role}  |dist to edge|=${f3(edge.dist)} mm`,
        );
        console.log(
          `       arc from ${edge.seamStart}: ${f3(edge.arcFromStart)} / ${f3(edge.polyLen)} mm`,
        );
      } else {
        console.log(`       edge: UNATTRIBUTED within ${EDGE_TOL} mm`);
      }
      console.log(`       source: ${src.call}`);
      console.log(`       count rule: ${src.countRule}`);
    });
  }

  // --- §3 correspondence ---
  console.log("\n--- 3. Front↔back correspondence (intended mates) ---");

  // Knee on inseam: arc from tip along construction pchip
  const fInseam = orderFromTip(
    rolePolyline(front.outline, "inseam").length >= 2
      ? rolePolyline(front.outline, "inseam")
      : pchipByY([frontPts.p9, frontPts.p15, frontPts.p14]).reverse(),
    frontPts.p9,
  );
  // Outline inseam omits tip (retagged crotch) — use construction for knee arc
  const fInseamConst = pchipByY([frontPts.p9, frontPts.p15, frontPts.p14]);
  const bInseamConst = pchipByY([backPts.p24, backPts.p29, backPts.p28]);
  const fKneeArc = closestOnPoly(frontPts.p15, fInseamConst).arcFromStart;
  const bKneeArc = closestOnPoly(backPts.p29, bInseamConst).arcFromStart;
  console.log("\n  Knee (inseam balance)");
  console.log(
    `    front: notch at p15 ${pt(frontPts.p15)} count=1; arc tip→knee (construction)=${f3(fKneeArc)} mm`,
  );
  console.log(
    `    back:  notch at p29 ${pt(backPts.p29)} count=2; arc tip→knee (construction)=${f3(bKneeArc)} mm`,
  );
  console.log(
    `    Δ (back − front) arc tip→knee: ${f3(bKneeArc - fKneeArc)} mm`,
  );
  console.log(
    `    NOTE: same y (${f3(frontPts.p15.y)}); Δ is the inseam path asymmetry (insets), not a notch placement bug.`,
  );

  // Side hip
  const fSide = orderFromWaist(rolePolyline(front.outline, "side-seam"));
  const bSide = orderFromWaist(rolePolyline(back.outline, "side-seam"));
  const fSideArc = closestOnPoly(frontPts.p8, fSide);
  const bSideArc = closestOnPoly(backPts.p25, bSide);
  console.log("\n  Side-seam hip (p8 ↔ p25)");
  console.log(
    `    front p8 ${pt(frontPts.p8)} count=1; arc from waist=${f3(fSideArc.arcFromStart)} mm`,
  );
  console.log(
    `    back  p25 ${pt(backPts.p25)} count=2; arc from waist=${f3(bSideArc.arcFromStart)} mm`,
  );
  console.log(
    `    Δ (back − front) arc from waist: ${f3(bSideArc.arcFromStart - fSideArc.arcFromStart)} mm`,
  );
  console.log(
    `    y: front ${f3(frontPts.p8.y)} back ${f3(backPts.p25.y)} Δy ${f3(backPts.p25.y - frontPts.p8.y)}`,
  );

  // Hipline on centre/crotch
  const fHipNotch = notchesOf(front).find(
    (n) =>
      Math.abs(n.at.y - landmarksF.hipY) < 1 &&
      attributeEdge(front, n.at)?.role !== "inseam" &&
      attributeEdge(front, n.at)?.role !== "side-seam" &&
      attributeEdge(front, n.at)?.role !== "waist",
  );
  const bHipNotch = notchesOf(back).find(
    (n) =>
      Math.abs(n.at.y - landmarksB.hipY) < 1 && dist(n.at, backPts.p25) > 1,
  );

  // Continuous centre seam: front CF+crotch; back CB+crotch — measure from tip and from waist
  const fCentre = rolesPolyline(front.outline, ["crotch", "centre-front"]);
  const bCentre = rolesPolyline(back.outline, ["crotch", "centre-back"]);
  const fCentreFromTip = orderFromTip(fCentre, frontPts.p9);
  const bCentreFromTip = orderFromTip(bCentre, backPts.p24);
  // From waist: reverse so waist end is start
  const fCentreFromWaist = [...fCentreFromTip].reverse();
  const bCentreFromWaist = [...bCentreFromTip].reverse();

  console.log("\n  Hipline (CF/crotch ↔ crotch at hip)");
  if (fHipNotch && bHipNotch) {
    const fFromTip = closestOnPoly(fHipNotch.at, fCentreFromTip);
    const bFromTip = closestOnPoly(bHipNotch.at, bCentreFromTip);
    const fFromWaist = closestOnPoly(fHipNotch.at, fCentreFromWaist);
    const bFromWaist = closestOnPoly(bHipNotch.at, bCentreFromWaist);
    console.log(
      `    front hip notch ${pt(fHipNotch.at)} role=${fHipNotch.role} ticks=${notchCount(fHipNotch)}`,
    );
    console.log(
      `    back  hip notch ${pt(bHipNotch.at)} role=${bHipNotch.role} ticks=${notchCount(bHipNotch)}`,
    );
    console.log(
      `    arc from crotch tip: front ${f3(fFromTip.arcFromStart)}  back ${f3(bFromTip.arcFromStart)}  Δ ${f3(bFromTip.arcFromStart - fFromTip.arcFromStart)} mm`,
    );
    console.log(
      `    arc from waist:      front ${f3(fFromWaist.arcFromStart)}  back ${f3(bFromWaist.arcFromStart)}  Δ ${f3(bFromWaist.arcFromStart - fFromWaist.arcFromStart)} mm`,
    );
    console.log(
      `    |Δy|: ${f3(Math.abs(fHipNotch.at.y - bHipNotch.at.y))} mm (both should sit on hip line)`,
    );
    // §4 flag
    const hipCorr = Math.abs(bFromWaist.arcFromStart - fFromWaist.arcFromStart);
    const hipCorrTip = Math.abs(bFromTip.arcFromStart - fFromTip.arcFromStart);
    console.log("\n--- 4. Hipline correspondence flag ---");
    console.log(
      `    |Δ arc from waist| = ${f3(hipCorr)} mm; |Δ arc from tip| = ${f3(hipCorrTip)} mm`,
    );
    console.log(
      `    Handoff claimed ~6 mm out of correspondence — current geometry: waist-measure ${f1(hipCorr)} mm, tip-measure ${f1(hipCorrTip)} mm.`,
    );
  } else {
    console.log("    STOP: could not locate front and/or back hipline notch");
    console.log(`    front found=${!!fHipNotch} back found=${!!bHipNotch}`);
  }

  // Waist mid
  const fWaistN = notchesOf(front).find((n) => {
    const e = attributeEdge(front, n.at);
    return e?.role === "waist" && n.label !== "zip";
  });
  const bWaistN = notchesOf(back).find((n) => {
    const e = attributeEdge(back, n.at);
    return e?.role === "waist" && n.label !== "zip";
  });
  console.log("\n  Waist mid (mates with waistband balance notch)");
  if (fWaistN && bWaistN) {
    const fW = orderFromWaist(rolePolyline(front.outline, "waist"));
    // waist may not be ordered by y — use outline order
    const fWpoly = rolePolyline(front.outline, "waist");
    const bWpoly = rolePolyline(back.outline, "waist");
    console.log(
      `    front ${pt(fWaistN.at)} role=${fWaistN.role} ticks=${notchCount(fWaistN)}; arc from waist[0]=${f3(closestOnPoly(fWaistN.at, fWpoly).arcFromStart)} / ${f3(polylineLength(fWpoly))}`,
    );
    console.log(
      `    back  ${pt(bWaistN.at)} role=${bWaistN.role} ticks=${notchCount(bWaistN)}; arc from waist[0]=${f3(closestOnPoly(bWaistN.at, bWpoly).arcFromStart)} / ${f3(polylineLength(bWpoly))}`,
    );
    console.log(
      "    PURPOSE ambiguous from code alone: written as waist midpoints — balance for band, or also identity on back (count 2)?",
    );
    void fW;
  }

  // Zip
  const fZip = notchesOf(front).find((n) => n.label === "zip");
  const bZip = notchesOf(back).find((n) => n.label === "zip");
  console.log("\n  Zip opening (side-seam, both pieces)");
  if (fZip && bZip) {
    console.log(
      `    front ${pt(fZip.at)} role=${fZip.role} ticks=${notchCount(fZip)}; arc from waist=${f3(closestOnPoly(fZip.at, fSide).arcFromStart)} mm`,
    );
    console.log(
      `    back  ${pt(bZip.at)} role=${bZip.role} ticks=${notchCount(bZip)}; arc from waist=${f3(closestOnPoly(bZip.at, bSide).arcFromStart)} mm`,
    );
    console.log(
      `    Δ arc: ${f3(closestOnPoly(bZip.at, bSide).arcFromStart - closestOnPoly(fZip.at, fSide).arcFromStart)} mm (both placed at 180 mm from waist)`,
    );
  }

  // --- §5 redundant identity ---
  console.log("\n--- 5. Doubled notches & identity need ---");
  let anyDouble = false;
  for (const piece of pieces) {
    for (const n of notchesOf(piece)) {
      const count = notchCount(n);
      if (count < 2) continue;
      anyDouble = true;
      const edge = attributeEdge(piece, n.at);
      console.log(
        `  DOUBLE on [${piece.name}] at ${pt(n.at)} role=${edge?.role ?? "?"} label=${n.label ?? "—"}`,
      );
      console.log(`    ${confusableNote(piece.name)}`);
    }
  }
  if (!anyDouble) console.log("  (none)");
  console.log(
    "\n  Summary: every Trouser-back notch is doubled in draftTrouserBack.",
  );
  console.log(
    "  Legs are not shape-confusable front↔back; doubling every balance mark collides with matching.",
  );
  console.log(
    "  Back waistband already carries count:2 (CB fold); front waistband count:1 (CF) — that pair is the natural identity channel.",
  );
}

console.log("=== DIAG: full notch inventory & classification ===");
console.log("measure only — no geometry changes");
console.log(`body: size ${DEFAULT_SIZE_CODE} + ease from each preset`);
console.log(
  "Purpose labels below are descriptive of what the code emits; balance vs identity",
);
console.log(
  "classification for ambiguous cases is left open where the code does not state it.",
);

printInventory("Izzy preset", IZZY_TROUSER_STYLE);
printInventory("Aldrich block defaults", BLOCK_TROUSER_STYLE);

console.log("\n=== end diagnostic ===");
