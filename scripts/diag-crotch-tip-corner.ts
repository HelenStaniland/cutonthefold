/**
 * DIAGNOSTIC — crotch-tip angles & corner construction (print only).
 * Run: npx tsx scripts/diag-crotch-tip-corner.ts
 *
 * Does not change geometry. Does not implement folded corners.
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
  BLOCK_TROUSER_STYLE,
  IZZY_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";

const DUP = 0.01;
const a = DEFAULT_SEAM_ALLOWANCE.seam; // 10 mm
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

function normalize(v: Point): Point {
  const L = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / L, y: v.y / L };
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

function findPointIdx(pts: Point[], target: Point, tol = 0.5): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = dist(pts[i]!, target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD <= tol ? best : -1;
}

function signedAreaPts(pts: Point[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i]!;
    const B = pts[(i + 1) % pts.length]!;
    area += A.x * B.y - B.x * A.y;
  }
  return area / 2;
}

/** Outward normal for edge direction (from→to), matching seamAllowance. */
function outwardNormal(dx: number, dy: number, clockwise: boolean): Point {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return clockwise ? { x: uy, y: -ux } : { x: -uy, y: ux };
}

function reflectAcrossLine(p: Point, origin: Point, dirUnit: Point): Point {
  const vx = p.x - origin.x;
  const vy = p.y - origin.y;
  const proj = vx * dirUnit.x + vy * dirUnit.y;
  const px = origin.x + proj * dirUnit.x;
  const py = origin.y + proj * dirUnit.y;
  return { x: 2 * px - p.x, y: 2 * py - p.y };
}

function lineIntersection(
  p1: Point,
  d1: Point,
  p2: Point,
  d2: Point,
): Point | null {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-12) return null;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const t = (dx * d2.y - dy * d2.x) / cross;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
}

/**
 * Interior angle at tip between two unit directions that both point AWAY from
 * the tip along the two net edges. The wedge containing the piece centroid is
 * taken as the interior.
 */
function interiorAngleDeg(
  tip: Point,
  awayA: Point,
  awayB: Point,
  centroid: Point,
): { deg: number; note: string } {
  const u = normalize(awayA);
  const v = normalize(awayB);
  const a1 = Math.atan2(u.y, u.x);
  const a2 = Math.atan2(v.y, v.x);
  let delta = a2 - a1;
  while (delta < 0) delta += 2 * Math.PI;
  while (delta >= 2 * Math.PI) delta -= 2 * Math.PI;
  const mid1 = a1 + delta / 2;
  const midDir1 = { x: Math.cos(mid1), y: Math.sin(mid1) };
  const toC = normalize({ x: centroid.x - tip.x, y: centroid.y - tip.y });
  let interior = delta;
  if (midDir1.x * toC.x + midDir1.y * toC.y < 0) {
    interior = 2 * Math.PI - delta;
  }
  const deg = (interior * 180) / Math.PI;
  return {
    deg,
    note:
      "unit dirs from tip along each edge; interior = wedge containing piece centroid",
  };
}

/** Arc length walking cut[] from i0 to i1 in steps of `dir` (±1), inclusive ends. */
function cutArc(cut: Point[], i0: number, i1: number, dir: 1 | -1): number {
  const n = cut.length;
  let len = 0;
  let i = i0;
  let guard = 0;
  while (i !== i1 && guard < n + 2) {
    const j = (i + dir + n) % n;
    len += dist(cut[i]!, cut[j]!);
    i = j;
    guard++;
  }
  return len;
}

/**
 * Endpoint tangent of pchip tip→knee→hem at the tip, via the same end-tangent
 * formula pchipByY uses (not a long chord).
 */
function pchipTipTangent(tip: Point, knee: Point, hem: Point): Point {
  const knots = [tip, knee, hem];
  const ys = knots.map((p) => p.y);
  const xs = knots.map((p) => p.x);
  const h0 = ys[1]! - ys[0]!;
  const h1 = ys[2]! - ys[1]!;
  const d0 = (xs[1]! - xs[0]!) / h0;
  const d1 = (xs[2]! - xs[1]!) / h1;
  // endTangent at knot 0 (dx/dy)
  let t = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
  if (t * d0 <= 0) t = 0;
  else if (d0 * d1 <= 0 && Math.abs(t) > 3 * Math.abs(d0)) t = 3 * d0;
  // Direction in (x,y) with increasing y (tip → knee): dy > 0, dx = t·dy
  return normalize({ x: t, y: 1 });
}

function draft(settings: TrouserStyleSettings) {
  const base = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
  const body = applyEase(base, settings.ease);
  const style = resolveStyle(settings, body);
  const net = draftTrousers(body, style);
  const withSA = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const frontPts = trouserFrontPoints(body, style);
  const backPts = trouserBackPoints(body, style);
  return { net, withSA, frontPts, backPts, style, settings };
}

type TipReport = {
  netTipKnee: number;
  cutTipKneeMitre: number;
  extraMitre: number;
  extraMitreProj: number;
  extraFold: number;
  theta: number;
};

function analyseTip(
  label: string,
  pieceNet: { outline: OutlinePoint[] },
  pieceCut: { outline: OutlinePoint[]; cuttingOutline?: Point[] },
  tip: Point,
  knee: Point,
  hem: Point,
): TipReport | null {
  console.log(`\n--- ${label} ---`);

  const collapsed = collapse(pieceNet.outline);
  const tipIdx = findIdx(collapsed, tip);
  const kneeIdx = findIdx(collapsed, knee);
  if (tipIdx < 0 || kneeIdx < 0) {
    console.log(
      `  STOP: tip/knee not found on collapsed outline (tipIdx=${tipIdx}, kneeIdx=${kneeIdx})`,
    );
    return null;
  }

  const cut = pieceCut.cuttingOutline;
  if (!cut || cut.length !== collapsed.length) {
    console.log(
      `  STOP: cutting length ${cut?.length} ≠ collapsed ${collapsed.length}`,
    );
    return null;
  }

  const n = collapsed.length;
  const prev = collapsed[(tipIdx - 1 + n) % n]!;
  const next = collapsed[(tipIdx + 1) % n]!;
  const tipRole = collapsed[tipIdx]!.role;
  const prevRole = prev.role;
  const nextRole = next.role;

  console.log(
    `  tip vertex i=${tipIdx} role=${tipRole}; prev role=${prevRole} ${pt(prev.at)}; next role=${nextRole} ${pt(next.at)}`,
  );

  // Construction inseam (tip→knee→hem) for net length + pchip tip tangent.
  const inseamNet = pchipByY([tip, knee, hem]);
  const netTipKnee = polylineLength(
    inseamNet.slice(0, findPointIdx(inseamNet, knee) + 1),
  );

  // Tangents away from tip along each edge.
  // Inseam: PCHIP endpoint tangent at tip (analytic, same as draft sampler).
  const uInseam = pchipTipTangent(tip, knee, hem);

  // Crotch: direction of the first outline step leaving the tip along the crotch
  // run. After segmentsToOutline, tip is retagged to crotch, so next walks crotch.
  // Prefer that; if next isn't crotch-ish, try prev.
  let uCrotch: Point;
  let crotchMethod: string;
  if (nextRole === "crotch" || nextRole === "centre-front" || nextRole === "centre-back") {
    uCrotch = normalize({ x: next.at.x - tip.x, y: next.at.y - tip.y });
    crotchMethod = `outline first step tip→next (role ${nextRole}), chord length ${f3(dist(tip, next.at))} mm — short sample, ≈ endpoint tangent of crotch polyline`;
  } else if (prevRole === "crotch") {
    uCrotch = normalize({ x: prev.at.x - tip.x, y: prev.at.y - tip.y });
    crotchMethod = `outline tip→prev (role crotch) — unusual winding`;
  } else {
    // Ambiguous
    uCrotch = normalize({ x: next.at.x - tip.x, y: next.at.y - tip.y });
    crotchMethod = `AMBIGUOUS roles (prev=${prevRole}, next=${nextRole}); using tip→next chord`;
  }

  // Confirm inseam side of outline
  const inseamAwayOutline =
    prevRole === "inseam"
      ? normalize({ x: prev.at.x - tip.x, y: prev.at.y - tip.y })
      : nextRole === "inseam"
        ? normalize({ x: next.at.x - tip.x, y: next.at.y - tip.y })
        : uInseam;

  const centroid = {
    x: collapsed.reduce((s, p) => s + p.at.x, 0) / n,
    y: collapsed.reduce((s, p) => s + p.at.y, 0) / n,
  };

  const ang = interiorAngleDeg(tip, uInseam, uCrotch, centroid);
  const theta = ang.deg;
  const thetaRad = (theta * Math.PI) / 180;

  console.log("\n  1. Interior angle θ");
  console.log(
    `    inseam tangent method: PCHIP end-tangent at tip knot (dx/dy from pchipByY formula), direction tip→knee`,
  );
  console.log(`    inseam û = (${f3(uInseam.x)}, ${f3(uInseam.y)})`);
  console.log(
    `    outline inseam-away check: (${f3(inseamAwayOutline.x)}, ${f3(inseamAwayOutline.y)})  (should ≈ û)`,
  );
  console.log(`    crotch tangent method: ${crotchMethod}`);
  console.log(`    crotch û = (${f3(uCrotch.x)}, ${f3(uCrotch.y)})`);
  console.log(`    θ = ${f1(theta)}°  (${ang.note})`);
  console.log(
    `    theory: a·cot(θ/2) = ${f3(a * (1 / Math.tan(thetaRad / 2)))} mm; a·tan(θ/2) = ${f3(a * Math.tan(thetaRad / 2))} mm`,
  );

  // Mitre vertex = cutting outline at tip index
  const M = cut[tipIdx]!;
  const dMitre = dist(M, tip);

  // Walk cut tip→knee along inseam: outline walks hem→…→knee→…→tip, so
  // from tip backward (−1) goes tip→…→knee.
  const cutTipKnee = cutArc(cut, tipIdx, kneeIdx, -1);
  const extraMitre = cutTipKnee - netTipKnee;

  // Outward normals matching addSeamAllowance at this corner:
  // prev edge = inseam arriving at tip; curr edge = crotch leaving tip.
  const clockwise = signedAreaPts(collapsed.map((p) => p.at)) > 0;
  const prevDir = { x: tip.x - prev.at.x, y: tip.y - prev.at.y }; // toward tip along inseam
  const currDir = { x: next.at.x - tip.x, y: next.at.y - tip.y }; // away along crotch
  const nInseam = outwardNormal(prevDir.x, prevDir.y, clockwise);
  const nCrotch = outwardNormal(currDir.x, currDir.y, clockwise);
  const inseamCut0 = {
    x: tip.x + a * nInseam.x,
    y: tip.y + a * nInseam.y,
  };
  const crotchCut0 = {
    x: tip.x + a * nCrotch.x,
    y: tip.y + a * nCrotch.y,
  };
  // Along tip→knee: positive lengthens the cut inseam. foot = tip+a·n on inseam offset.
  // Use û_i (tip→knee); report signed (M−foot)·û_i and its absolute value vs a·cot(θ/2).
  const extraMitreProj =
    (M.x - inseamCut0.x) * uInseam.x + (M.y - inseamCut0.y) * uInseam.y;

  console.log("\n  2. Current mitre vertex");
  console.log(`    M = ${pt(M)}`);
  console.log(`    projection |M−tip| = ${f3(dMitre)} mm`);
  console.log(`    net tip→knee = ${f3(netTipKnee)} mm`);
  console.log(`    cut tip→knee (along inseam side) = ${f3(cutTipKnee)} mm`);
  console.log(`    along-inseam extra (cut − net) = ${f3(extraMitre)} mm`);
  console.log(
    `    (M−foot)·û_i = ${f3(extraMitreProj)} mm; |·| = ${f3(Math.abs(extraMitreProj))} mm; a·cot(θ/2) = ${f3(a * (1 / Math.tan(thetaRad / 2)))} mm`,
  );
  console.log(
    `    normals: n_inseam=(${f3(nInseam.x)},${f3(nInseam.y)}) n_crotch=(${f3(nCrotch.x)},${f3(nCrotch.y)}) foot=${pt(inseamCut0)}`,
  );

  // Folded constructions (compute only — report which matches a·tan(θ/2)):
  // A (brief i.e.): inseam_cut ∩ reflect(crotch_cut, crotch_net)
  // B (brief first phrase): reflect(inseam_cut, crotch_net) ∩ crotch_cut
  // C (fold along inseam): inseam_cut ∩ reflect(crotch_cut, inseam_net)
  const crotchCut1 = {
    x: crotchCut0.x + uCrotch.x,
    y: crotchCut0.y + uCrotch.y,
  };
  const rc0 = reflectAcrossLine(crotchCut0, tip, uCrotch);
  const rc1 = reflectAcrossLine(crotchCut1, tip, uCrotch);
  const FA = lineIntersection(
    inseamCut0,
    uInseam,
    rc0,
    { x: rc1.x - rc0.x, y: rc1.y - rc0.y },
  );

  const inseamCut1 = {
    x: inseamCut0.x + uInseam.x,
    y: inseamCut0.y + uInseam.y,
  };
  const ri0 = reflectAcrossLine(inseamCut0, tip, uCrotch);
  const ri1 = reflectAcrossLine(inseamCut1, tip, uCrotch);
  const FB = lineIntersection(
    ri0,
    { x: ri1.x - ri0.x, y: ri1.y - ri0.y },
    crotchCut0,
    uCrotch,
  );

  const rcI0 = reflectAcrossLine(crotchCut0, tip, uInseam);
  const rcI1 = reflectAcrossLine(crotchCut1, tip, uInseam);
  const FC = lineIntersection(
    inseamCut0,
    uInseam,
    rcI0,
    { x: rcI1.x - rcI0.x, y: rcI1.y - rcI0.y },
  );

  const predTan = a * Math.tan(thetaRad / 2);
  const alongExtra = (P: Point) =>
    (P.x - inseamCut0.x) * uInseam.x + (P.y - inseamCut0.y) * uInseam.y;

  console.log("\n  4. Hypothetical folded corner (compute only)");
  console.log(`    predicted a·tan(θ/2) = ${f3(predTan)} mm`);
  let extraFold = NaN; // signed (F−foot)·û_i for best |·|≈tan match
  let bestErr = Infinity;
  let chosen = "?";
  for (const [name, F] of [
    ["A inseam_cut∩reflect(crotch_cut,crotch_net)", FA],
    ["B reflect(inseam_cut,crotch_net)∩crotch_cut", FB],
    ["C inseam_cut∩reflect(crotch_cut,inseam_net)", FC],
  ] as const) {
    if (!F) {
      console.log(`    ${name}: no intersection`);
      continue;
    }
    const ex = alongExtra(F);
    const err = Math.abs(Math.abs(ex) - predTan);
    console.log(
      `    ${name}: F=${pt(F)} |F−tip|=${f3(dist(F, tip))} (F−foot)·û_i=${f3(ex)} mm`,
    );
    if (err < bestErr) {
      bestErr = err;
      extraFold = ex;
      chosen = name;
    }
  }
  // Helen's hypothesis: fold *adds* a·tan(θ/2) to tip→knee cut length.
  const foldLengthen = predTan; // use formula; construction match noted separately
  console.log(
    `    closest |extra| to a·tan(θ/2): ${chosen} → signed ${f3(extraFold)} mm (|${f3(Math.abs(extraFold))}|)`,
  );
  console.log(
    `    using +a·tan(θ/2) as lengthening (Helen): cut tip→knee → ${f3(netTipKnee + foldLengthen)} mm`,
  );

  return {
    netTipKnee,
    cutTipKneeMitre: cutTipKnee,
    extraMitre,
    extraMitreProj: Math.abs(extraMitreProj),
    extraFold: foldLengthen,
    theta,
  };
}

function reportCase(label: string, settings: TrouserStyleSettings) {
  console.log(`\n========== ${label} ==========`);
  const { net, withSA, frontPts, backPts } = draft(settings);

  const frontNet = net.pieces.find((p) => p.name === "Trouser front")!;
  const backNet = net.pieces.find((p) => p.name === "Trouser back")!;
  const frontCut = withSA.pieces.find((p) => p.name === "Trouser front")!;
  const backCut = withSA.pieces.find((p) => p.name === "Trouser back")!;

  const f = analyseTip(
    "FRONT",
    frontNet,
    frontCut,
    frontPts.p9,
    frontPts.p15,
    frontPts.p14,
  );
  const b = analyseTip(
    "BACK",
    backNet,
    backCut,
    backPts.p24,
    backPts.p29,
    backPts.p28,
  );

  if (!f || !b) return;

  console.log("\n  3. Cross-check vs Helen's paper (Izzy SA tip→knee extras)");
  if (label.includes("Izzy")) {
    const paperF = 5;
    const paperB = 12.5;
    console.log(`    paper along-inseam extra: front +${paperF} mm, back +${paperB} mm`);
    console.log(
      `    code cut−net:              front +${f3(f.extraMitre)} mm, back +${f3(b.extraMitre)} mm`,
    );
    console.log(
      `    code | (M−foot)·û_i |:     front +${f3(f.extraMitreProj)} mm, back +${f3(b.extraMitreProj)} mm`,
    );
    const dF = Math.abs(f.extraMitre - paperF);
    const dB = Math.abs(b.extraMitre - paperB);
    const dFp = Math.abs(f.extraMitreProj - paperF);
    const dBp = Math.abs(b.extraMitreProj - paperB);
    console.log(
      `    |cut−net − paper|: front ${f3(dF)} mm, back ${f3(dB)} mm`,
    );
    console.log(
      `    |proj − paper|:    front ${f3(dFp)} mm, back ${f3(dBp)} mm`,
    );
    if (dF > 2 || dB > 2) {
      console.log(
        "    STOP on cut−net vs paper (threshold 2 mm).",
      );
      if (dFp <= 2 && dBp <= 2) {
        console.log(
          "    NOTE: | (M−foot)·û_i | matches paper — Helen’s +5/+12.5 is the mitre along-seam formula a·cot(θ/2), not the full cut-polyline Δ (which can differ when the tip→knee cut path isn’t a pure parallel).",
        );
      } else {
        console.log(
          "    Proj also disagrees — investigate further before trusting paper↔code.",
        );
      }
    } else {
      console.log("    ok: cut−net within ~2 mm of paper");
    }
  } else {
    console.log("    (paper comparison is Izzy-only; Aldrich extras for reference)");
    console.log(
      `    cut−net: front +${f3(f.extraMitre)} / back +${f3(b.extraMitre)}; proj: +${f3(f.extraMitreProj)} / +${f3(b.extraMitreProj)}`,
    );
  }

  console.log("\n  5. Cut-edge Δ (back − front), tip→knee");
  const netD = b.netTipKnee - f.netTipKnee;
  const mitreD = b.cutTipKneeMitre - f.cutTipKneeMitre;
  const foldCutF = f.netTipKnee + f.extraFold;
  const foldCutB = b.netTipKnee + b.extraFold;
  const foldD = foldCutB - foldCutF;
  console.log(`    net (stitch):     Δ = ${f3(netD)} mm`);
  console.log(`    current mitred:   Δ = ${f3(mitreD)} mm`);
  console.log(`    hypothetical fold: Δ = ${f3(foldD)} mm`);
  console.log(`    Izzy commercial ref: −3 mm`);
  console.log(
    `    extras F/B mitre ${f3(f.extraMitre)}/${f3(b.extraMitre)}; fold ${f3(f.extraFold)}/${f3(b.extraFold)}`,
  );
}

console.log("=== DIAG: crotch-tip angles & corner construction ===");
console.log(`seam allowance a = ${a} mm; body size ${DEFAULT_SIZE_CODE}`);
console.log("measure only — no geometry changes");

reportCase("Izzy preset", IZZY_TROUSER_STYLE);
reportCase("Aldrich block defaults", BLOCK_TROUSER_STYLE);

console.log("\n=== end diagnostic ===");
