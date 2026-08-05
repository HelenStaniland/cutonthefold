/**
 * Trouser-local elastic self-casing turn-up (double-fold model).
 *
 * Placement: casing fabric is added *above* the worn waist (`bodyWaistY` /
 * channel stitch = pocket top). Drop and casing are independent —
 * `waistDrop` places the worn waist; this post-pass only extends above that
 * plane.
 *
 * Double-fold strip (from stitch up to raw cut):
 *   stitch (0) → fold-2 / finished top (`channelDepth`) → fold-1 / hem crease
 *   (`2×channelDepth`) → raw (`seamAllowance + 2×channelDepth`).
 * Channel = elasticWidth + 15 (10 ease + 5 foot margin). Stitch sits
 * `channelDepth − 5` below the finished top.
 *
 * Cut: raw top at `totalExtension`; sides and top-outer corners are a constant
 * `seamAllowance` outward offset of the sewing U (sewing corner + up·SA +
 * sideOut·SA). Sewing (net) outline continues up both casing sides and across
 * the hem fold (`2×channelDepth` above stitch) — same style as the body
 * sewing line. Marks: channel stitch only (no fold-2, shading, or casing label).
 *
 * Runs AFTER withSeamAllowance, BEFORE hem turn-back. Rebuilds the waist
 * region of the cutting outline, extends the net sewing outline through the
 * casing, and sets `netToCutIndex`. Not in the shared allowance engine.
 *
 * Front: level fold-flat top. Back: constant-width parallelogram along the
 * slant. Pocket pieces are excluded — their waist catch is a plain seam edge,
 * not folded into the casing channel.
 */
import type {
  Marking,
  Millimetres,
  OutlinePoint,
  PatternPiece,
  Point,
} from "@/lib/types/measurements";
import { DEFAULT_SEAM_ALLOWANCE } from "@/lib/geometry/seamAllowance";
import { polylineLength } from "@/lib/geometry/curves";

const DUP_TOL = 0.01;

/** Pieces that carry a worn-waist edge into the casing. */
const CASING_PIECE_NAMES = new Set([
  "Trouser front",
  "Trouser back",
]);

export type CasingElasticWidth = 25 | 38 | 50;

/**
 * Added to elastic width for the double-wall channel (mm).
 * Helen toile: 25 → 40 ⇒ +15 = 10 ease + 5 presser-foot margin.
 */
export const CASING_CHANNEL_ADD = 15;
/**
 * @deprecated Casing hem fold now tracks `seamAllowance` (see resolveCasingDepths).
 * Kept only so older scripts that imported the literal still resolve.
 */
export const CASING_HEM_DEPTH = 10;
/** Presser-foot margin: stitch sits this far below the fold-2 crease (mm). */
export const CASING_FOOT_MARGIN = 5;
export const DEFAULT_CASING_ELASTIC_WIDTH: CasingElasticWidth = 25;

/** @deprecated Use CASING_CHANNEL_ADD — kept as alias for older scripts. */
export const CASING_CHANNEL_EASE = CASING_CHANNEL_ADD;
/** @deprecated Hem depth tracks seamAllowance; raw→fold2 is channelDepth+hem. */
export const CASING_TURN_UNDER = CASING_HEM_DEPTH;

export type CasingDepths = {
  elasticWidth: CasingElasticWidth;
  /**
   * Stitch → fold-2 (finished top), perpendicular / vertical on front.
   * = elasticWidth + CASING_CHANNEL_ADD.
   */
  channelDepth: Millimetres;
  /**
   * Fold-1 hem tuck from the raw edge. Equals `seamAllowance` for now
   * (may later become its own param).
   */
  hemDepth: Millimetres;
  /**
   * Raw → fold-2 = channelDepth + hemDepth (back wall + hem on the flat).
   * Kept for fold-flat / callers that previously used turnUnder.
   */
  turnUnder: Millimetres;
  /**
   * Stitch / worn waist → raw cut edge = seamAllowance + 2×channelDepth
   * (front wall + back wall + hem). Floats with SA.
   */
  totalExtension: Millimetres;
  /** Fold-2 / finished top → stitch = channelDepth − foot margin. */
  stitchBelowFinishedTop: Millimetres;
};

/**
 * Derive double-fold casing depths from elastic width and seam allowance.
 * channel = width + 15; hem fold = seamAllowance; cut = SA + 2×channel;
 * stitch = channel − 5 below finished top.
 */
export function resolveCasingDepths(
  width: CasingElasticWidth = DEFAULT_CASING_ELASTIC_WIDTH,
  seamAllowance: Millimetres = DEFAULT_SEAM_ALLOWANCE.seam,
): CasingDepths {
  const channelDepth = width + CASING_CHANNEL_ADD;
  const hemDepth = seamAllowance;
  const turnUnder = channelDepth + hemDepth;
  const totalExtension = seamAllowance + 2 * channelDepth;
  const stitchBelowFinishedTop = channelDepth - CASING_FOOT_MARGIN;
  return {
    elasticWidth: width,
    channelDepth,
    hemDepth,
    turnUnder,
    totalExtension,
    stitchBelowFinishedTop,
  };
}

export function parseCasingElasticWidth(
  raw: unknown,
): CasingElasticWidth | null {
  if (raw === 25 || raw === 38 || raw === 50) return raw;
  return null;
}

/** Reference lines emitted on the piece for later pocket wiring / report. */
export type WaistCasingRef = CasingDepths & {
  /** Fold-2 = finished top edge (construction; not drawn as a mark). */
  foldLine: Point[];
  /** Fold-1 = hem crease = sewing line across the casing top. */
  hemLine: Point[];
  /**
   * Channel stitch = worn waist net edge (at bodyWaistY on the legs).
   * Pocket mouth-top wires here. Drawn as the sole casing mark.
   */
  turndownSeam: Point[];
};

function collapseWithMap(outline: OutlinePoint[]): {
  collapsed: OutlinePoint[];
  rawToCollapsed: number[];
} {
  const collapsed: OutlinePoint[] = [];
  const rawToCollapsed: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const point = outline[i]!;
    const last = collapsed[collapsed.length - 1];
    if (
      last &&
      Math.hypot(point.at.x - last.at.x, point.at.y - last.at.y) < DUP_TOL
    ) {
      rawToCollapsed.push(collapsed.length - 1);
      continue;
    }
    rawToCollapsed.push(collapsed.length);
    collapsed.push(point);
  }
  if (collapsed.length > 1) {
    const first = collapsed[0]!;
    const last = collapsed[collapsed.length - 1]!;
    if (Math.hypot(first.at.x - last.at.x, first.at.y - last.at.y) < DUP_TOL) {
      const dropped = collapsed.length - 1;
      collapsed.pop();
      for (let i = 0; i < rawToCollapsed.length; i++) {
        if (rawToCollapsed[i] === dropped) rawToCollapsed[i] = 0;
      }
    }
  }
  return { collapsed, rawToCollapsed };
}

function signedArea(outline: OutlinePoint[]): number {
  let area = 0;
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i]!.at;
    const b = outline[(i + 1) % n]!.at;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function unit(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function outwardNormalForEdge(
  a: Point,
  b: Point,
  clockwise: boolean,
): Point {
  const t = unit(b.x - a.x, b.y - a.y);
  return clockwise ? { x: t.y, y: -t.x } : { x: -t.y, y: t.x };
}

function findWaistRun(
  outline: OutlinePoint[],
): { start: number; end: number } | null {
  const idxs: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    if (outline[i]!.role === "waist") idxs.push(i);
  }
  if (idxs.length === 0) return null;
  return { start: idxs[0]!, end: idxs[idxs.length - 1]! };
}

function waistOutwardNormal(waist: Point[], clockwise: boolean): Point {
  if (waist.length < 2) return { x: 0, y: -1 };
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < waist.length - 1; i++) {
    const n = outwardNormalForEdge(waist[i]!, waist[i + 1]!, clockwise);
    nx += n.x;
    ny += n.y;
  }
  return unit(nx, ny);
}

function offsetAlong(p: Point, n: Point, d: Millimetres): Point {
  return { x: p.x + n.x * d, y: p.y + n.y * d };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Constant-`seamAllowance` outward offset of a sewing-U corner.
 * Sewing turns a square L (up the casing side, across the hem fold); the cut
 * corner sits `seamAllowance` out along both outward normals so the allowance
 * does not pinch at the tip.
 */
function offsetSewingCornerBySa(
  sewCorner: Point,
  topOutNormal: Point,
  sideOutNormal: Point,
  seamAllowance: Millimetres,
): Point {
  return offsetAlong(
    offsetAlong(sewCorner, topOutNormal, seamAllowance),
    sideOutNormal,
    seamAllowance,
  );
}

/**
 * Apply casing turn-up to one piece. No-ops if not a casing piece or no waist.
 * Must run before hem turn-back (input cut is 1:1 with collapsed net).
 *
 * Cut shape of the casing band (double-fold):
 * - **Top** (raw cut edge): sewing hem fold offset up by `seamAllowance`
 *   (= `totalExtension` above stitch).
 * - **Sides**: sewing U sides offset outward by `seamAllowance` (parallel to
 *   the sewing climb, which follows `up`).
 * - **Corners**: sewing corner offset by `seamAllowance` on both normals —
 *   full allowance on top and side, no convergence.
 *
 * Sewing (net) outline: waist chord replaced by CF/side up → hem fold across
 * → down, so the stitch line is continuous around the piece (like the hem).
 */
export function applyTrouserWaistCasingTurnup(
  piece: PatternPiece,
  depths: CasingDepths,
  seamAllowance: Millimetres = DEFAULT_SEAM_ALLOWANCE.seam,
): PatternPiece {
  if (!CASING_PIECE_NAMES.has(piece.name) || !piece.cuttingOutline) {
    return piece;
  }
  if (piece.netToCutIndex) {
    console.warn(
      `trouserWaistCasing: ${piece.name} already has netToCutIndex; skip (run before hem)`,
    );
    return piece;
  }

  const { collapsed, rawToCollapsed } = collapseWithMap(piece.outline);
  const oldCut = piece.cuttingOutline;
  if (oldCut.length !== collapsed.length) {
    console.warn(
      `trouserWaistCasing: ${piece.name} cutting (${oldCut.length}) ≠ collapsed net (${collapsed.length}); skipping`,
    );
    return piece;
  }

  const run = findWaistRun(collapsed);
  if (!run) return piece;

  const clockwise = signedArea(collapsed) > 0;
  const waistNet: Point[] = [];
  for (let i = run.start; i <= run.end; i++) {
    waistNet.push({ ...collapsed[i]!.at });
  }
  if (waistNet.length < 2) return piece;

  // Depths that float with the seam-allowance parameter (do not use a literal).
  // Sewing hem crease stays at 2×channel above stitch; cut raw = that + SA.
  const hemDepthAlong = 2 * depths.channelDepth;
  const totalExtension = seamAllowance + hemDepthAlong;
  const hemDepth = seamAllowance;

  const nUp = waistOutwardNormal(waistNet, clockwise);
  const mid = waistNet[Math.floor(waistNet.length / 2)]!;
  const probe = offsetAlong(mid, nUp, totalExtension);
  // y-down: larger y = into the leg — flip if the normal points into the garment.
  const intoGarment = probe.y > mid.y + 0.5;
  const up = intoGarment ? { x: -nUp.x, y: -nUp.y } : nUp;

  // Fold-2 = finished top (channelDepth above stitch / worn waist).
  const foldLine = waistNet.map((p) =>
    offsetAlong(p, up, depths.channelDepth),
  );
  // Fold-1 = hem crease (2×channel above stitch) = sewing across top.
  const hemLine = waistNet.map((p) => offsetAlong(p, up, hemDepthAlong));
  // Stitch = worn waist / pocket top.
  const turndownSeam = waistNet.map((p) => ({ ...p }));

  // Interior top samples: sewing hem offset outward by seamAllowance.
  const cutTopInterior = hemLine.map((p) =>
    offsetAlong(p, up, seamAllowance),
  );

  const n = collapsed.length;
  const at = (i: number) => collapsed[((i % n) + n) % n]!.at;

  // --- CF/CB: sewing corner → cut corner (constant SA offset) ------------
  const startVertex = waistNet[0]!;
  const sewStartCorner = offsetAlong(startVertex, up, hemDepthAlong);
  const cfSideOut = outwardNormalForEdge(
    startVertex,
    sewStartCorner,
    clockwise,
  );
  const startCorner = offsetSewingCornerBySa(
    sewStartCorner,
    up,
    cfSideOut,
    seamAllowance,
  );
  const cfWaistCutPt = offsetAlong(startVertex, cfSideOut, seamAllowance);

  // --- Side / opening ---------------------------------------------------
  // Waist-role run often stops a few mm before the side-seam (or pocket-mouth)
  // vertex that sits on the same waist plane.
  const lastWaistIdx = run.end;
  const lastWaist = waistNet[waistNet.length - 1]!;
  let sideCornerIdx = lastWaistIdx;
  {
    const nextIdx = ((lastWaistIdx + 1) % n + n) % n;
    const next = collapsed[nextIdx]!;
    const role = next.role;
    const samePlane = Math.abs(next.at.y - lastWaist.y) < 2.5;
    if (
      samePlane &&
      (role === "side-seam" || role === "pocket-mouth")
    ) {
      sideCornerIdx = nextIdx;
    }
  }

  // When the waist plane ends on a pocket-mouth, the true outer casing wall is
  // still the side seam (further along the outline). Using the mouth as the
  // top-outer corner makes the slash mitre run to the top and slices off the
  // upright side wall. Front-only: find the side seam and build the wall there.
  let sideSeamIdx = sideCornerIdx;
  let mouthIdxForCut = -1;
  if (collapsed[sideCornerIdx]!.role === "pocket-mouth") {
    for (let i = sideCornerIdx + 1; i < n; i++) {
      if (collapsed[i]!.role === "side-seam") {
        sideSeamIdx = i;
        mouthIdxForCut = sideCornerIdx;
        break;
      }
    }
  }

  // Wall foot at waist: side-seam ∩ waist plane (slash) or the side/mouth vert.
  const wallCornerIdx = sideSeamIdx;
  let wallVertex: Point;
  if (mouthIdxForCut >= 0) {
    const sideAt = collapsed[sideSeamIdx]!.at;
    const sideNext = at(sideSeamIdx + 1);
    const waistY = lastWaist.y;
    if (Math.abs(sideNext.y - sideAt.y) < 1e-9) {
      wallVertex = { x: sideAt.x, y: waistY };
    } else {
      const t = (waistY - sideAt.y) / (sideNext.y - sideAt.y);
      if (t <= 1 && t >= -2) {
        wallVertex = {
          x: sideAt.x + t * (sideNext.x - sideAt.x),
          y: waistY,
        };
      } else {
        const sdir = unit(sideAt.x - sideNext.x, sideAt.y - sideNext.y);
        const upAlong =
          Math.abs(sdir.y) > 1e-9 ? (waistY - sideAt.y) / sdir.y : 0;
        wallVertex = {
          x: sideAt.x + sdir.x * upAlong,
          y: waistY,
        };
      }
    }
  } else {
    wallVertex = collapsed[wallCornerIdx]!.at;
  }

  // Cut top-outer = SA offset of the sewing corner above the wall foot.
  // Sewing U sides follow `up`; the outline traverses the outer side from the
  // hem fold *down* to the waist, so the outward normal uses that direction.
  const sewWallCorner = offsetAlong(wallVertex, up, hemDepthAlong);
  const sideOut = outwardNormalForEdge(sewWallCorner, wallVertex, clockwise);
  const endCorner = offsetSewingCornerBySa(
    sewWallCorner,
    up,
    sideOut,
    seamAllowance,
  );
  const sideWaistCutPt = offsetAlong(wallVertex, sideOut, seamAllowance);

  // endVertex still names the sewing U's side end (mouth or side).
  const endVertex = collapsed[sideCornerIdx]!.at;

  // Top cut: CF corner + waist samples + outer side corner (at the side seam
  // when a slash mouth had been the waist-plane end).
  const cutTop: Point[] = [{ ...startCorner }];
  for (let i = 1; i < cutTopInterior.length; i++) {
    cutTop.push(cutTopInterior[i]!);
  }
  if (dist(cutTop[cutTop.length - 1]!, endCorner) > 0.5) {
    cutTop.push({ ...endCorner });
  } else {
    cutTop[cutTop.length - 1] = { ...endCorner };
  }

  const newCut: Point[] = [];
  const topBase = 0;
  for (let i = 0; i < cutTop.length; i++) {
    newCut.push(cutTop[i]!);
  }
  const endCornerCutIdx = newCut.length - 1;

  // Casing side wall: top-outer → waist-level SA (parallel to sewing climb).
  let sideWaistSaIdx = -1;
  if (dist(endCorner, sideWaistCutPt) > 0.5) {
    sideWaistSaIdx = newCut.length;
    newCut.push({ ...sideWaistCutPt });
  } else {
    sideWaistSaIdx = endCornerCutIdx;
  }

  // Slash front: after the side wall, keep the mouth SA then jump to the
  // side-seam (slash edge mouth→side), then the rest of the leg.
  let mouthCutIdx = -1;
  if (mouthIdxForCut >= 0) {
    const mouthSa = oldCut[mouthIdxForCut]!;
    if (dist(sideWaistCutPt, mouthSa) > 0.5) {
      mouthCutIdx = newCut.length;
      newCut.push({ ...mouthSa });
    } else {
      mouthCutIdx = sideWaistSaIdx;
    }
    for (let i = sideSeamIdx; i < collapsed.length; i++) {
      newCut.push(oldCut[i]!);
    }
  } else {
    // Plain side: wall bottom then the rest of the piece from the side corner.
    for (let i = wallCornerIdx + 1; i < collapsed.length; i++) {
      newCut.push(oldCut[i]!);
    }
  }
  for (let i = 0; i < run.start; i++) {
    newCut.push(oldCut[i]!);
  }
  // CF/CB: waist-level SA on the sewing-U side (parallel climb to startCorner).
  let cfWaistSaIdx = -1;
  if (dist(startCorner, cfWaistCutPt) > 0.5) {
    cfWaistSaIdx = newCut.length;
    newCut.push({ ...cfWaistCutPt });
  } else {
    cfWaistSaIdx = topBase;
  }

  // --- Sewing outline: replace waist chord with casing U ----------------
  // Path: … → start (waist CF) → up → hem fold across → down → end (side) → …
  // Hem fold = 2×channel above stitch (= raw − seamAllowance).
  const sewingHem: Point[] = [];
  sewingHem.push(offsetAlong(startVertex, up, hemDepthAlong));
  for (let i = 1; i < waistNet.length - 1; i++) {
    sewingHem.push(offsetAlong(waistNet[i]!, up, hemDepthAlong));
  }
  sewingHem.push(offsetAlong(endVertex, up, hemDepthAlong));

  // Map old collapsed index → cut index for body verts that we keep.
  const oldCollapsedToCut = new Array<number>(collapsed.length);
  oldCollapsedToCut[run.start] = cfWaistSaIdx >= 0 ? cfWaistSaIdx : topBase;
  // Mouth (sewing U end) maps to mouth cut; side seam maps into the side run.
  if (mouthIdxForCut >= 0) {
    oldCollapsedToCut[mouthIdxForCut] =
      mouthCutIdx >= 0 ? mouthCutIdx : sideWaistSaIdx;
    oldCollapsedToCut[sideSeamIdx] =
      (mouthCutIdx >= 0 ? mouthCutIdx : sideWaistSaIdx) + 1;
    let bodyCut = oldCollapsedToCut[sideSeamIdx]! + 1;
    for (let i = sideSeamIdx + 1; i < collapsed.length; i++) {
      oldCollapsedToCut[i] = bodyCut++;
    }
  } else {
    oldCollapsedToCut[sideCornerIdx] = sideWaistSaIdx;
    const bodyStartCut =
      cutTop.length + (sideWaistSaIdx > endCornerCutIdx ? 1 : 0);
    for (let i = sideCornerIdx + 1; i < collapsed.length; i++) {
      oldCollapsedToCut[i] = bodyStartCut + (i - (sideCornerIdx + 1));
    }
  }
  {
    const afterWrapBase = (() => {
      if (mouthIdxForCut >= 0) {
        return (
          oldCollapsedToCut[collapsed.length - 1]! + 1
        );
      }
      const bodyStartCut =
        cutTop.length + (sideWaistSaIdx > endCornerCutIdx ? 1 : 0);
      return bodyStartCut + (collapsed.length - (sideCornerIdx + 1));
    })();
    for (let i = 0; i < run.start; i++) {
      oldCollapsedToCut[i] = afterWrapBase + i;
    }
  }
  // Waist interiors (replaced by sewing U) inherit nearest cut on the top.
  for (let i = run.start + 1; i <= run.end; i++) {
    if (oldCollapsedToCut[i] === undefined) {
      oldCollapsedToCut[i] = Math.min(
        topBase + (i - run.start),
        endCornerCutIdx,
      );
    }
  }

  const newOutline: OutlinePoint[] = [];
  const netToCut: number[] = [];

  const pushNet = (op: OutlinePoint, cutIdx: number) => {
    newOutline.push(op);
    netToCut.push(cutIdx);
  };

  // Raw outline: keep verts before first waist; replace waist→sideCorner with U;
  // keep verts after sideCorner.
  const rawRun = findWaistRun(piece.outline);
  if (!rawRun) return piece;

  // First raw index that collapses to sideCornerIdx (inclusive end of replaced span).
  let rawSideCorner = -1;
  for (let r = 0; r < piece.outline.length; r++) {
    if (rawToCollapsed[r] === sideCornerIdx) {
      rawSideCorner = r;
      break;
    }
  }
  if (rawSideCorner < 0) rawSideCorner = rawRun.end;

  for (let r = 0; r < rawRun.start; r++) {
    const c = rawToCollapsed[r]!;
    pushNet({ ...piece.outline[r]! }, oldCollapsedToCut[c]!);
  }

  // Waist CF / start — sewing climbs from here.
  pushNet(
    { ...piece.outline[rawRun.start]! },
    cfWaistSaIdx >= 0 ? cfWaistSaIdx : topBase,
  );

  // Hem-fold sewing across the casing top (seamAllowance in from raw cut).
  // Last hem vert sits above the mouth/side sewing end — map to the cut near
  // that end (mouth SA when slash, else side-wall waist SA), not the far
  // side-seam top corner.
  const sewingEndCutIdx =
    mouthCutIdx >= 0
      ? mouthCutIdx
      : sideWaistSaIdx >= 0
        ? sideWaistSaIdx
        : endCornerCutIdx;
  for (let i = 0; i < sewingHem.length; i++) {
    const cutIdx =
      i === 0
        ? topBase
        : i === sewingHem.length - 1
          ? sewingEndCutIdx
          : Math.min(topBase + i, endCornerCutIdx);
    pushNet(
      { at: { ...sewingHem[i]! }, edge: "seam", role: "waist" },
      cutIdx,
    );
  }

  // Side / pocket-mouth at waist — sewing comes back down here.
  const endRaw =
    rawSideCorner > rawRun.start ? rawSideCorner : rawRun.end;
  if (endRaw !== rawRun.start) {
    pushNet(
      { ...piece.outline[endRaw]! },
      mouthCutIdx >= 0 ? mouthCutIdx : sideWaistSaIdx,
    );
  }

  for (let r = endRaw + 1; r < piece.outline.length; r++) {
    const c = rawToCollapsed[r]!;
    // Skip any remaining waist-plane verts between old waist end and side corner
    // that were part of the replaced span (already handled).
    if (c > run.start && c < sideCornerIdx) continue;
    if (c === sideCornerIdx || c === run.start) continue;
    pushNet({ ...piece.outline[r]! }, oldCollapsedToCut[c]!);
  }

  const stitchMark: Marking = {
    kind: "casingTurndown",
    points: turndownSeam.map((p) => ({ ...p })),
    label: "Stitch",
  };

  const waistCasing: WaistCasingRef = {
    ...depths,
    // Re-assert SA-dependent depths so a stale resolveCasingDepths call cannot
    // desync the stored ref from the geometry built with `seamAllowance`.
    hemDepth,
    turnUnder: depths.channelDepth + hemDepth,
    totalExtension,
    foldLine,
    // Waist-aligned hem crease (fold-flat / channel maths). Sewing path may
    // end above the pocket-mouth corner when that sits past the last waist role.
    hemLine,
    turndownSeam,
  };

  return {
    ...piece,
    outline: newOutline,
    cuttingOutline: newCut,
    netToCutIndex: netToCut,
    markings: [...piece.markings, stitchMark],
    waistCasing,
  };
}

export function applyTrouserWaistCasingToPattern(
  pattern: { pieces: PatternPiece[] },
  depths: CasingDepths,
  seamAllowance: Millimetres = DEFAULT_SEAM_ALLOWANCE.seam,
): { pieces: PatternPiece[] } {
  return {
    pieces: pattern.pieces.map((p) =>
      applyTrouserWaistCasingTurnup(p, depths, seamAllowance),
    ),
  };
}

/** Perpendicular width of channel between fold and turndown at t∈[0,1]. */
export function channelWidthAt(
  ref: WaistCasingRef,
  t: number,
): Millimetres {
  const u = Math.max(0, Math.min(1, t));
  const fold = pointOnPoly(ref.foldLine, u);
  const turn = pointOnPoly(ref.turndownSeam, u);
  return Math.hypot(fold.x - turn.x, fold.y - turn.y);
}

function pointOnPoly(poly: Point[], t: number): Point {
  const len = polylineLength(poly);
  let rem = t * len;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]!;
    const b = poly[i + 1]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg >= rem) {
      const s = seg > 0 ? rem / seg : 0;
      return { x: a.x + s * (b.x - a.x), y: a.y + s * (b.y - a.y) };
    }
    rem -= seg;
  }
  return { ...poly[poly.length - 1]! };
}

/**
 * Front fold-flat residual at fold-2 (finished top): the hem crease (fold-1)
 * reflects across fold-2 onto the stitch / worn-waist line. Level front → ~0.
 */
export function frontCasingFoldTestResidual(
  piece: PatternPiece,
): Millimetres | null {
  const ref = piece.waistCasing;
  if (!ref || !piece.cuttingOutline) return null;
  if (
    ref.foldLine.length < 2 ||
    ref.turndownSeam.length < 2 ||
    ref.hemLine.length < 2
  ) {
    return null;
  }

  const tMid = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
  const fMid = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
  const up = unit(fMid.x - tMid.x, fMid.y - tMid.y);

  const n = Math.min(
    ref.foldLine.length,
    ref.hemLine.length,
    ref.turndownSeam.length,
  );
  let max = 0;
  for (let i = 1; i < n - 1; i++) {
    const hem = ref.hemLine[i]!;
    const fold = ref.foldLine[i]!;
    const stitch = ref.turndownSeam[i]!;
    // hemLine may be longer than foldLine when side corner ≠ last waist —
    // sample shared interior by fold/turndown indices.
    const d = (hem.x - fold.x) * up.x + (hem.y - fold.y) * up.y;
    const reflected = {
      x: hem.x - 2 * d * up.x,
      y: hem.y - 2 * d * up.y,
    };
    max = Math.max(
      max,
      Math.hypot(reflected.x - stitch.x, reflected.y - stitch.y),
    );
  }
  return max;
}
