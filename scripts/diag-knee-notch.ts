/**
 * DIAGNOSTIC — knee notch placement & front/back balance (print only).
 * Run: npx tsx scripts/diag-knee-notch.ts
 *
 * Does not change geometry.
 */
import {
  applyEase,
  notchCount,
  type Marking,
  type OutlinePoint,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { pchipByY, polylineLength } from "../lib/geometry/curves";
import {
  blockFromWaistDrop,
  draftTrousers,
  trouserBackPoints,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";

const VERTEX_TOL = 0.05;
const EDGE_TOL = 1.0; // mm — nearest-edge attribution

const f3 = (n: number) => n.toFixed(3);
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
    ...(s.crotchDeparture != null ? { crotchDeparture: s.crotchDeparture } : {}),
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

function findVertexIndex(poly: Point[], target: Point, tol = VERTEX_TOL): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = dist(poly[i]!, target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD <= tol ? best : -1;
}

/** Arc length from poly[0] to the vertex matching `at` (inclusive). */
function arcFromStart(poly: Point[], at: Point): number | null {
  const i = findVertexIndex(poly, at);
  if (i < 0) return null;
  return polylineLength(poly.slice(0, i + 1));
}

/** Arc length from `at` to poly[end]. */
function arcToEnd(poly: Point[], at: Point): number | null {
  const i = findVertexIndex(poly, at);
  if (i < 0) return null;
  return polylineLength(poly.slice(i));
}

/** Distance from point to polyline (segment projection). */
function distToPolyline(p: Point, poly: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]!;
    const b = poly[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    }
    best = Math.min(best, dist(p, { x: a.x + t * dx, y: a.y + t * dy }));
  }
  return best;
}

type RolePoly = { role: string; poly: Point[] };

function constructionRoles(args: {
  tip: Point;
  inseamKnee: Point;
  inseamHem: Point;
  sideWaist: Point;
  sideHip: Point;
  sideKnee: Point;
  sideHem: Point;
  crotchPoly: Point[];
  waistPoly: Point[];
  cfOrCb?: Point[];
}): RolePoly[] {
  return [
    { role: "inseam", poly: pchipByY([args.tip, args.inseamKnee, args.inseamHem]) },
    {
      role: "side-seam",
      poly: pchipByY([
        args.sideWaist,
        args.sideHip,
        args.sideKnee,
        args.sideHem,
      ]),
    },
    { role: "waist", poly: args.waistPoly },
    { role: "crotch", poly: args.crotchPoly },
    ...(args.cfOrCb && args.cfOrCb.length >= 2
      ? [{ role: "centre", poly: args.cfOrCb }]
      : []),
  ];
}

function nearestEdge(
  at: Point,
  roles: RolePoly[],
): { role: string; d: number } {
  let best = { role: "?", d: Infinity };
  for (const r of roles) {
    if (r.poly.length < 2) continue;
    const d = distToPolyline(at, r.poly);
    if (d < best.d) best = { role: r.role, d };
  }
  return best;
}

/** Outline waist run (role=waist), including endpoints as tagged. */
function roleFromOutline(outline: OutlinePoint[], role: string): Point[] {
  const pts: Point[] = [];
  for (const o of outline) {
    if (o.role !== role) continue;
    const last = pts[pts.length - 1];
    if (last && dist(o.at, last) < 0.01) continue;
    pts.push(o.at);
  }
  return pts;
}

function identifyNotch(
  at: Point,
  count: number | undefined,
  landmarks: { id: string; at: Point }[],
): string {
  let best = { id: "unknown", d: Infinity };
  for (const lm of landmarks) {
    const d = dist(at, lm.at);
    if (d < best.d) best = { id: lm.id, d };
  }
  if (best.d > 0.5) {
    return `unidentified (nearest ${best.id} @ ${f3(best.d)} mm)${count ? ` ×${count}` : ""}`;
  }
  return `${best.id}${count && count > 1 ? ` ×${count}` : ""}`;
}

function draft(settings: TrouserStyleSettings) {
  const base = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
  const body = applyEase(base, settings.ease);
  const style = resolveStyle(settings, body);
  const pattern = draftTrousers(body, style);
  const frontPts = trouserFrontPoints(body, style);
  const backPts = trouserBackPoints(body, style);
  const front = pattern.pieces.find((p) => p.name === "Trouser front")!;
  const back = pattern.pieces.find((p) => p.name === "Trouser back")!;
  return { body, style, front, back, frontPts, backPts, settings };
}

function notchList(piece: { markings: Marking[] }): Extract<
  Marking,
  { kind: "notch" }
>[] {
  return piece.markings.filter(
    (m): m is Extract<Marking, { kind: "notch" }> => m.kind === "notch",
  );
}

function reportPiece(
  label: string,
  piece: { outline: OutlinePoint[]; markings: Marking[] },
  landmarks: { id: string; at: Point }[],
  roles: RolePoly[],
  kneeKnot: Point,
  sideKneeKnot: Point,
  tip: Point,
  inseamHem: Point,
) {
  console.log(`\n--- ${label}: all notches ---`);
  const notches = notchList(piece);
  for (const n of notches) {
    const id = identifyNotch(n.at, notchCount(n), landmarks);
    const edge = nearestEdge(n.at, roles);
    const onEdge =
      edge.d <= EDGE_TOL
        ? `edge=${edge.role} (Δ ${f3(edge.d)} mm)`
        : `NEAREST edge=${edge.role} but Δ ${f3(edge.d)} mm > ${EDGE_TOL} — attribution uncertain`;
    console.log(
      `  ${id.padEnd(28)} ${pt(n.at)}  count=${notchCount(n)}  ${onEdge}`,
    );
  }

  // Knee notch = marking at inseam knee knot (p15 / p29)
  console.log(`\n--- ${label}: knee notch detail ---`);
  const kneeNotch = notches.find((n) => dist(n.at, kneeKnot) < 0.5);
  if (!kneeNotch) {
    console.log("  NO notch within 0.5 mm of inseam knee knot");
  } else {
    const dKnot = dist(kneeNotch.at, kneeKnot);
    console.log(`  notch at ${pt(kneeNotch.at)}  count=${notchCount(kneeNotch)}`);
    console.log(
      `  coincides with inseam knee knot ${pt(kneeKnot)}? ${
        dKnot <= VERTEX_TOL ? "YES" : "NO"
      } (Δ ${f3(dKnot)} mm)`,
    );
  }

  const inseam = roles.find((r) => r.role === "inseam")!.poly;
  const side = roles.find((r) => r.role === "side-seam")!.poly;

  const fromTip = arcFromStart(inseam, kneeKnot);
  const toHem = arcToEnd(inseam, kneeKnot);
  console.log("  along NET inseam (pchip tip→knee→hem):");
  console.log(
    `    arc tip → knee knot:  ${fromTip == null ? "AMBIGUOUS (knot not on poly)" : f3(fromTip) + " mm"}`,
  );
  console.log(
    `    arc knee knot → hem:  ${toHem == null ? "AMBIGUOUS" : f3(toHem) + " mm"}`,
  );
  console.log(`    tip ${pt(tip)}, hem ${pt(inseamHem)}`);

  // Side-seam knee: there is no side knee notch in the draft — report knot only.
  const sideKneeNotch = notches.find((n) => dist(n.at, sideKneeKnot) < 0.5);
  console.log("  side-seam knee:");
  if (sideKneeNotch) {
    console.log(`    notch present at ${pt(sideKneeNotch.at)}`);
  } else {
    console.log(
      `    NO side-seam knee notch in markings (side knee knot exists at ${pt(sideKneeKnot)} for the curve only)`,
    );
  }
  const sideFromWaist = arcFromStart(side, sideKneeKnot);
  const sideToHem = arcToEnd(side, sideKneeKnot);
  console.log("  along NET side-seam (pchip waist→hip→knee→hem), at side knee KNOT:");
  console.log(
    `    arc waist → side-knee knot: ${sideFromWaist == null ? "AMBIGUOUS" : f3(sideFromWaist) + " mm"}`,
  );
  console.log(
    `    arc side-knee knot → hem:   ${sideToHem == null ? "AMBIGUOUS" : f3(sideToHem) + " mm"}`,
  );

  // Other inseam notches
  console.log(`\n--- ${label}: other notches on inseam ---`);
  let otherInseam = 0;
  for (const n of notches) {
    if (dist(n.at, kneeKnot) < 0.5) continue;
    const edge = nearestEdge(n.at, roles);
    if (edge.role === "inseam" && edge.d <= EDGE_TOL) {
      otherInseam++;
      console.log(
        `  ${identifyNotch(n.at, notchCount(n), landmarks)} at ${pt(n.at)}`,
      );
    }
  }
  if (otherInseam === 0) {
    console.log("  none (only the knee notch sits on the inseam)");
  }

  return {
    kneeFromTip: fromTip,
    kneeToHem: toHem,
    sideKneeFromWaist: sideFromWaist,
    sideKneeToHem: sideToHem,
    notches,
  };
}

function reportCase(label: string, settings: TrouserStyleSettings) {
  console.log(`\n========== ${label} ==========`);
  const { front, back, frontPts, backPts, settings: s } = draft(settings);

  const f = frontPts;
  const b = backPts;

  // Side waist from outline (role retag puts waist/side junction on side-seam).
  const fSideOutline = roleFromOutline(front.outline, "side-seam");
  const bSideOutline = roleFromOutline(back.outline, "side-seam");
  const fWaistSide = fSideOutline[0]!;
  const bWaistSide = bSideOutline[0]!;

  const fWaist = roleFromOutline(front.outline, "waist");
  const bWaist = roleFromOutline(back.outline, "waist");
  const fCrotch = roleFromOutline(front.outline, "crotch");
  const bCrotch = roleFromOutline(back.outline, "crotch");
  // Prepend tip onto crotch role if missing (junction retagged onto crotch from inseam).
  // Construction tip is the crotch/inseam join.
  const fCrotchFull =
    fCrotch.length >= 1 && dist(fCrotch[0]!, f.p9) > 0.5
      ? [f.p9, ...fCrotch]
      : fCrotch;
  const bCrotchFull =
    bCrotch.length >= 1 && dist(bCrotch[0]!, b.p24) > 0.5
      ? [b.p24, ...bCrotch]
      : bCrotch;

  const fRoles = constructionRoles({
    tip: f.p9,
    inseamKnee: f.p15,
    inseamHem: f.p14,
    sideWaist: fWaistSide,
    sideHip: f.p8,
    sideKnee: f.p13,
    sideHem: f.p12,
    crotchPoly: fCrotchFull,
    waistPoly: fWaist,
  });
  const bRoles = constructionRoles({
    tip: b.p24,
    inseamKnee: b.p29,
    inseamHem: b.p28,
    sideWaist: bWaistSide,
    sideHip: b.p25,
    sideKnee: b.p27,
    sideHem: b.p26,
    crotchPoly: bCrotchFull,
    waistPoly: bWaist,
  });

  const fLandmarks = [
    { id: "waist-mid", at: notchList(front).find((n) => n.role === "balance" && dist(n.at, f.p8) > 5 && dist(n.at, f.p15) > 5)?.at ?? { x: 0, y: 0 } },
    { id: "hip-side (p8)", at: f.p8 },
    { id: "knee-inseam (p15)", at: f.p15 },
    { id: "side-knee-knot (p13, no notch)", at: f.p13 },
    { id: "crotch-tip (p9)", at: f.p9 },
  ];
  // Fix waist-mid: find notch nearest waist mid by y~waist
  {
    const waistNotches = notchList(front).filter(
      (n) => nearestEdge(n.at, fRoles).role === "waist",
    );
    if (waistNotches[0]) fLandmarks[0] = { id: "waist-mid", at: waistNotches[0].at };
  }
  // Hipline CF notch
  {
    const hipCf = notchList(front).find(
      (n) =>
        nearestEdge(n.at, fRoles).role === "crotch" ||
        nearestEdge(n.at, fRoles).role === "centre",
    );
    if (hipCf) fLandmarks.push({ id: "hipline-cf/crotch", at: hipCf.at });
  }

  const bLandmarks: { id: string; at: Point }[] = [
    { id: "hip-side (p25)", at: b.p25 },
    { id: "knee-inseam (p29)", at: b.p29 },
    { id: "side-knee-knot (p27, no notch)", at: b.p27 },
    { id: "crotch-tip (p24)", at: b.p24 },
  ];
  {
    const waistNotches = notchList(back).filter(
      (n) => nearestEdge(n.at, bRoles).role === "waist",
    );
    if (waistNotches[0])
      bLandmarks.unshift({ id: "waist-mid", at: waistNotches[0].at });
  }
  {
    const hipCb = notchList(back).find(
      (n) => nearestEdge(n.at, bRoles).role === "crotch",
    );
    if (hipCb) bLandmarks.push({ id: "hipline-crotch", at: hipCb.at });
  }

  console.log("\n--- Placement rules (from code, not inferred) ---");
  console.log(
    "  Front knee notch: draftTrouserFront markings → `{ kind:\"notch\", at: p15, count:1 }`",
  );
  console.log(
    "  Back knee notch:  draftTrouserBack markings → `{ kind:\"notch\", at: p29, count:2 }`",
  );
  console.log(
    "  Same rule both sides: notch sits AT the inseam knee construction point",
  );
  console.log(
    "  (the middle knot of pchipByY([tip, knee, hem])). Not a fraction of seam length;",
  );
  console.log(
    "  not a separate retired-widths rule — the notch tracks whatever p15/p29 the",
  );
  console.log("  knee-placement path produced.");
  console.log(
    `  This preset: frontInseamKneeInset=${s.frontInseamKneeInset === null ? "null→BLOCK path" : s.frontInseamKneeInset + "→GARMENT path"}`,
  );
  console.log(
    `               backInseamKneeInset=${s.backInseamKneeInset === null ? "null→BLOCK path" : s.backInseamKneeInset + "→GARMENT path"}`,
  );
  console.log(
    "  BLOCK path (inset absent): p15 from Aldrich KNEE_ADD + crotch→hem clamp at kneeY;",
  );
  console.log(
    "    back p29 = (f.p15.x − 10, kneeY) / p27 = (f.p13.x + 10, kneeY).",
  );
  console.log(
    "  GARMENT path (inset set): kneeFromInseamInset(…, kneeY, inset) — chord ± inset.",
  );
  console.log(
    "  kneeY = trouserKneeY = R + (F−R)/2 − 50  (shared; back copies f.p13.y).",
  );
  console.log(
    "  NO notch is emitted at the side-seam knee knot (p13 / p27).",
  );

  const fRep = reportPiece(
    "FRONT",
    front,
    fLandmarks,
    fRoles,
    f.p15,
    f.p13,
    f.p9,
    f.p14,
  );
  const bRep = reportPiece(
    "BACK",
    back,
    bLandmarks,
    bRoles,
    b.p29,
    b.p27,
    b.p24,
    b.p28,
  );

  console.log("\n--- 4. Front ↔ back corresponding notches (arc from seam start) ---");
  console.log(
    "  (inseam start = crotch tip; side start = waist/side junction; crotch start = tip)",
  );

  type Row = {
    name: string;
    fArc: number | null;
    bArc: number | null;
    seam: string;
  };
  const rows: Row[] = [
    {
      name: "knee-inseam (p15↔p29)",
      fArc: fRep.kneeFromTip,
      bArc: bRep.kneeFromTip,
      seam: "inseam from tip",
    },
    {
      name: "knee-inseam → hem",
      fArc: fRep.kneeToHem,
      bArc: bRep.kneeToHem,
      seam: "inseam to hem",
    },
    {
      name: "side-knee KNOT (no notch) waist→",
      fArc: fRep.sideKneeFromWaist,
      bArc: bRep.sideKneeFromWaist,
      seam: "side from waist",
    },
    {
      name: "side-knee KNOT → hem",
      fArc: fRep.sideKneeToHem,
      bArc: bRep.sideKneeToHem,
      seam: "side to hem",
    },
  ];

  // Hip side notches: arc along side from waist
  const fHipArc = arcFromStart(
    fRoles.find((r) => r.role === "side-seam")!.poly,
    f.p8,
  );
  const bHipArc = arcFromStart(
    bRoles.find((r) => r.role === "side-seam")!.poly,
    b.p25,
  );
  rows.push({
    name: "hip-side (p8↔p25)",
    fArc: fHipArc,
    bArc: bHipArc,
    seam: "side from waist",
  });

  // Hipline on crotch: arc from tip along crotch
  const fHipCf = notchList(front).find((n) => {
    const e = nearestEdge(n.at, fRoles);
    return e.role === "crotch" && e.d <= EDGE_TOL;
  });
  const bHipCb = notchList(back).find((n) => {
    const e = nearestEdge(n.at, bRoles);
    return e.role === "crotch" && e.d <= EDGE_TOL;
  });
  if (fHipCf && bHipCb) {
    const fC = fRoles.find((r) => r.role === "crotch")!.poly;
    const bC = bRoles.find((r) => r.role === "crotch")!.poly;
    // May need interpolate — try vertex match, else report ambiguous
    const fA = arcFromStart(fC, fHipCf.at);
    const bA = arcFromStart(bC, bHipCb.at);
    rows.push({
      name: "hipline on crotch",
      fArc: fA,
      bArc: bA,
      seam: "crotch from tip",
    });
    if (fA == null || bA == null) {
      console.log(
        "  NOTE: hipline crotch notch may not land on a crotch sample vertex;",
      );
      console.log(
        "  code places it via pointOnPolylineAtY(crotch, D) — interpolated, not a knot.",
      );
      console.log(
        `  front hipline ${pt(fHipCf.at)}, back ${pt(bHipCb.at)}`,
      );
    }
  }

  console.log(
    `  ${"pair".padEnd(40)} ${"front".padStart(10)} ${"back".padStart(10)} ${"Δ(b−f)".padStart(10)}  seam`,
  );
  for (const r of rows) {
    const d =
      r.fArc != null && r.bArc != null ? r.bArc - r.fArc : null;
    console.log(
      `  ${r.name.padEnd(40)} ${
        r.fArc == null ? "    ?     " : f3(r.fArc).padStart(10)
      } ${r.bArc == null ? "    ?     " : f3(r.bArc).padStart(10)} ${
        d == null ? "    ?     " : f3(d).padStart(10)
      }  ${r.seam}`,
    );
  }

  return {
    fKnee: f.p15,
    bKnee: b.p29,
    fFromTip: fRep.kneeFromTip,
    bFromTip: bRep.kneeFromTip,
  };
}

console.log("=== DIAG: knee notch placement & front/back balance ===");
console.log(`body: size ${DEFAULT_SIZE_CODE} + each preset's ease`);

reportCase("Aldrich block defaults", BLOCK_TROUSER_STYLE);
reportCase("Cleo preset", CLEO_TROUSER_STYLE);

{
  console.log("\n========== 5. Block vs garment path — knee notch position ==========");
  console.log(
    "  Notch rule is identical (at p15 / p29). Only the knot coords differ.",
  );
  const block = draft(BLOCK_TROUSER_STYLE);
  const garment = draft(CLEO_TROUSER_STYLE);
  // Same body ease? Presets differ in ease — also compare Cleo body with insets cleared
  // to isolate path on identical style family.
  const cleoBlockish: TrouserStyleSettings = {
    ...CLEO_TROUSER_STYLE,
    frontInseamKneeInset: null,
    backInseamKneeInset: null,
  };
  const cleoGarment = draft(CLEO_TROUSER_STYLE);
  const cleoAsBlock = draft(cleoBlockish);

  console.log("  Aldrich preset (block path):");
  console.log(
    `    front p15 ${pt(block.frontPts.p15)}, back p29 ${pt(block.backPts.p29)}`,
  );
  console.log("  Cleo preset (garment path, −8/−33):");
  console.log(
    `    front p15 ${pt(garment.frontPts.p15)}, back p29 ${pt(garment.backPts.p29)}`,
  );
  console.log(
    "  Cleo body/style but insets null (forces BLOCK knee placement on Cleo geometry):",
  );
  console.log(
    `    front p15 ${pt(cleoAsBlock.frontPts.p15)}, back p29 ${pt(cleoAsBlock.backPts.p29)}`,
  );
  console.log("  Same Cleo geometry, garment path:");
  console.log(
    `    front p15 ${pt(cleoGarment.frontPts.p15)}, back p29 ${pt(cleoGarment.backPts.p29)}`,
  );
  console.log(
    `  Δ garment−blockish (same Cleo base): front (${f3(
      cleoGarment.frontPts.p15.x - cleoAsBlock.frontPts.p15.x,
    )}, ${f3(
      cleoGarment.frontPts.p15.y - cleoAsBlock.frontPts.p15.y,
    )}), back (${f3(
      cleoGarment.backPts.p29.x - cleoAsBlock.backPts.p29.x,
    )}, ${f3(
      cleoGarment.backPts.p29.y - cleoAsBlock.backPts.p29.y,
    )})`,
  );
  console.log(
    "  Conclusion: paths differ in HOW the knee knot x is computed; notch always",
  );
  console.log(
    "  follows that knot. y is kneeY in both paths (identical height rule).",
  );
}

console.log("\n=== end diagnostic (no geometry changes) ===");
