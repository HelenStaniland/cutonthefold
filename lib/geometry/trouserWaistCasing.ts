/**
 * Trouser-local elastic self-casing turn-up.
 *
 * Placement (settled): casing fabric is added *above* the worn waist
 * (`bodyWaistY` / net waist edge). Drop and casing are independent — `waistDrop`
 * places the worn waist; this post-pass only extends above that plane.
 *
 * Runs AFTER withSeamAllowance, BEFORE hem turn-back. Rebuilds the waist
 * region of the cutting outline and sets `netToCutIndex`. Not in the shared
 * allowance engine.
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

/** Ease added to elastic width for the channel (mm). */
export const CASING_CHANNEL_EASE = 6;
/** Raw-edge turn-under beyond the fold (mm). */
export const CASING_TURN_UNDER = 10;
export const DEFAULT_CASING_ELASTIC_WIDTH: CasingElasticWidth = 25;

export type CasingDepths = {
  elasticWidth: CasingElasticWidth;
  /** Fold → turndown (worn waist), perpendicular / vertical on front. */
  channelDepth: Millimetres;
  /** Fold → raw cut edge. */
  turnUnder: Millimetres;
  /** Worn waist → raw cut edge = channelDepth + turnUnder. */
  totalExtension: Millimetres;
};

/**
 * Derive casing depths from elastic width.
 * channel = width + 6 mm ease; turn-under = 10 mm; total = sum.
 */
export function resolveCasingDepths(
  width: CasingElasticWidth = DEFAULT_CASING_ELASTIC_WIDTH,
): CasingDepths {
  const channelDepth = width + CASING_CHANNEL_EASE;
  const turnUnder = CASING_TURN_UNDER;
  return {
    elasticWidth: width,
    channelDepth,
    turnUnder,
    totalExtension: channelDepth + turnUnder,
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
  /** Finished top (fold), CF/CB → side, garment (or stay-local) coords. */
  foldLine: Point[];
  /**
   * Turndown seam = worn waist net edge (at bodyWaistY on the legs).
   * Pocket mouth-top wires here in a later brief.
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

const PARALLEL_ANGLE = (5 * Math.PI) / 180;
const MITER_LIMIT = 2.5;

function lineIntersection(
  p1: Point,
  d1: Point,
  p2: Point,
  d2: Point,
): Point | null {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-9) return null;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const t = (dx * d2.y - dy * d2.x) / cross;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
}

function normalsNearlyParallel(n1: Point, n2: Point): boolean {
  const dot = Math.max(-1, Math.min(1, n1.x * n2.x + n1.y * n2.y));
  const angle = Math.acos(dot);
  return angle < PARALLEL_ANGLE || Math.PI - angle < PARALLEL_ANGLE;
}

/**
 * Mitre between the casing top (offset along `topNormal` by `topAllowance`)
 * and a side seam continuing through the casing (offset along `sideNormal` by
 * `sideAllowance`). Yields the cut corner where top meets CF/CB or side.
 */
function mitreTopSideCorner(
  vertex: Point,
  topDir: Point,
  sideDir: Point,
  topNormal: Point,
  sideNormal: Point,
  topAllowance: Millimetres,
  sideAllowance: Millimetres,
): Point {
  if (normalsNearlyParallel(topNormal, sideNormal)) {
    const avg = unit(topNormal.x + sideNormal.x, topNormal.y + sideNormal.y);
    return offsetAlong(vertex, avg, (topAllowance + sideAllowance) / 2);
  }
  const topStart = offsetAlong(vertex, topNormal, topAllowance);
  const sideStart = offsetAlong(vertex, sideNormal, sideAllowance);
  const hit = lineIntersection(topStart, topDir, sideStart, sideDir);
  if (!hit) {
    // Parallelogram fallback: both offsets from the vertex.
    return {
      x: vertex.x + topNormal.x * topAllowance + sideNormal.x * sideAllowance,
      y: vertex.y + topNormal.y * topAllowance + sideNormal.y * sideAllowance,
    };
  }
  const miterDist = dist(hit, vertex);
  const maxMiter = Math.max(topAllowance, sideAllowance) * MITER_LIMIT;
  if (miterDist <= maxMiter) return hit;
  // Bevel: parallelogram corner (continuous SA sides + full top).
  return {
    x: vertex.x + topNormal.x * topAllowance + sideNormal.x * sideAllowance,
    y: vertex.y + topNormal.y * topAllowance + sideNormal.y * sideAllowance,
  };
}

/**
 * Apply casing turn-up to one piece. No-ops if not a casing piece or no waist.
 * Must run before hem turn-back (input cut is 1:1 with collapsed net).
 *
 * Cut shape of the casing band:
 * - **Top** (raw fold edge): offset up by `totalExtension` (unchanged depths).
 * - **Sides** (CF/CB and side / opening): offset outward by the normal seam
 *   allowance, so those seams continue straight up through the casing.
 * - **Corners**: ordinary top↔side mitres (no 41→10 step).
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

  const nUp = waistOutwardNormal(waistNet, clockwise);
  const mid = waistNet[Math.floor(waistNet.length / 2)]!;
  const probe = offsetAlong(mid, nUp, depths.totalExtension);
  // y-down: larger y = into the leg — flip if the normal points into the garment.
  const intoGarment = probe.y > mid.y + 0.5;
  const up = intoGarment ? { x: -nUp.x, y: -nUp.y } : nUp;

  const foldLine = waistNet.map((p) =>
    offsetAlong(p, up, depths.channelDepth),
  );
  const turndownSeam = waistNet.map((p) => ({ ...p }));

  // Interior top samples: net waist offset by totalExtension (top edge only).
  const cutTopInterior = waistNet.map((p) =>
    offsetAlong(p, up, depths.totalExtension),
  );

  const n = collapsed.length;
  const at = (i: number) => collapsed[((i % n) + n) % n]!.at;

  // --- CF/CB top corner: seam continues up with SA; top at totalExtension ----
  const startVertex = waistNet[0]!;
  const startPrev = at(run.start - 1); // along CF/CB into the waist
  const startWaistNext = waistNet[1]!;
  const cfDir = unit(
    startVertex.x - startPrev.x,
    startVertex.y - startPrev.y,
  ); // continues past waist into the casing
  const cfNormal = outwardNormalForEdge(startPrev, startVertex, clockwise);
  const waistDirStart = unit(
    startWaistNext.x - startVertex.x,
    startWaistNext.y - startVertex.y,
  );
  const startCorner = mitreTopSideCorner(
    startVertex,
    waistDirStart,
    cfDir,
    up,
    cfNormal,
    depths.totalExtension,
    seamAllowance,
  );

  // --- Side / opening top corner --------------------------------------------
  // Waist-role run often stops a few mm before the side-seam (or pocket-mouth)
  // vertex that sits on the same waist plane. Mitre at that junction so the
  // side-seam SA continues straight up; do not mitre on the last waist-only
  // sample (its SA sits on the waist offset, not the side wall).
  const lastWaistIdx = run.end;
  const lastWaist = waistNet[waistNet.length - 1]!;
  const endWaistPrev = waistNet[waistNet.length - 2]!;
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
  const endVertex = collapsed[sideCornerIdx]!.at;
  const endBelow = at(sideCornerIdx + 1);
  const sideDir = unit(
    endVertex.x - endBelow.x,
    endVertex.y - endBelow.y,
  ); // continues past the waist into the casing
  const sideNormal = outwardNormalForEdge(endVertex, endBelow, clockwise);
  const waistDirEnd = unit(
    endVertex.x - endWaistPrev.x,
    endVertex.y - endWaistPrev.y,
  );
  const endCorner = mitreTopSideCorner(
    endVertex,
    waistDirEnd,
    sideDir,
    up,
    sideNormal,
    depths.totalExtension,
    seamAllowance,
  );

  // Top cut: CF mitre + waist samples (incl. last waist) + side mitre.
  // Keeping the last waist sample matters when the side corner sits past it.
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
  const collapsedToCut: number[] = new Array(collapsed.length);
  const topBase = 0;
  for (let i = 0; i < cutTop.length; i++) {
    newCut.push(cutTop[i]!);
  }
  collapsedToCut[run.start] = topBase;
  for (let i = 1; i < waistNet.length; i++) {
    // waist sample i → cutTop[i] (startCorner at 0; interiors follow)
    collapsedToCut[run.start + i] = topBase + i;
  }
  // Side-corner net maps to the top mitre (last cutTop point).
  collapsedToCut[sideCornerIdx] = topBase + cutTop.length - 1;

  // Side wall: waist-level SA at the side corner, then the rest of the piece.
  // Skip oldCut[lastWaistIdx] when the side corner is past it — that point is
  // the waist-offset mitre and would pull the wall inward (the 41→10 step).
  const sideWallIdx = sideCornerIdx;
  const sideWaistSa = oldCut[sideWallIdx]!;
  if (dist(endCorner, sideWaistSa) > 0.5) {
    collapsedToCut[sideWallIdx] = newCut.length;
    newCut.push({ ...sideWaistSa });
  }
  for (let i = sideWallIdx + 1; i < collapsed.length; i++) {
    collapsedToCut[i] = newCut.length;
    newCut.push(oldCut[i]!);
  }
  for (let i = 0; i < run.start; i++) {
    collapsedToCut[i] = newCut.length;
    newCut.push(oldCut[i]!);
  }
  // CF/CB: keep the waist-level SA mitre so the centre-seam allowance runs
  // continuously up to the top-side mitre (… → oldCut[0] → startCorner).
  if (run.start === 0) {
    const cfWaistSa = oldCut[0]!;
    if (dist(startCorner, cfWaistSa) > 0.5) {
      newCut.push({ ...cfWaistSa });
    }
  }

  // Any collapsed index still unset (e.g. lastWaist when side is past it)
  // inherits the nearest cut already assigned on the waist top.
  for (let i = 0; i < collapsed.length; i++) {
    if (collapsedToCut[i] === undefined) {
      collapsedToCut[i] = collapsedToCut[run.end] ?? topBase;
    }
  }

  const netToCut = rawToCollapsed.map((c) => collapsedToCut[c]!);

  const foldMark: Marking = {
    kind: "casingFold",
    points: foldLine.map((p) => ({ ...p })),
    label: "Casing — fold to inside",
  };
  const turndownMark: Marking = {
    kind: "casingTurndown",
    points: turndownSeam.map((p) => ({ ...p })),
    label: "Turndown",
  };
  const regionOutline: Point[] = [
    ...foldLine.map((p) => ({ ...p })),
    ...[...turndownSeam].reverse().map((p) => ({ ...p })),
  ];
  const regionMark: Marking = {
    kind: "casingRegion",
    outline: regionOutline,
    label: "Casing",
  };

  const waistCasing: WaistCasingRef = {
    ...depths,
    foldLine,
    turndownSeam,
  };

  return {
    ...piece,
    cuttingOutline: newCut,
    netToCutIndex: netToCut,
    markings: [...piece.markings, regionMark, foldMark, turndownMark],
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
 * Front fold-flat residual: reflect cut-top across the fold; compare to the
 * turn-under landing (fold toward turndown by turnUnder). Level front → ~0.
 *
 * Skips the CF/side mitred corners (cut[0] and the point past the last waist
 * sample) — those carry normal SA laterally and are not pure turn-under offsets.
 */
export function frontCasingFoldTestResidual(
  piece: PatternPiece,
): Millimetres | null {
  const ref = piece.waistCasing;
  if (!ref || !piece.cuttingOutline) return null;
  if (ref.foldLine.length < 2 || ref.turndownSeam.length < 2) return null;

  const tMid = ref.turndownSeam[Math.floor(ref.turndownSeam.length / 2)]!;
  const fMid = ref.foldLine[Math.floor(ref.foldLine.length / 2)]!;
  const up = unit(fMid.x - tMid.x, fMid.y - tMid.y);

  const cut = piece.cuttingOutline;
  const nTop = ref.foldLine.length;
  // cut[0] = CF mitre; cut[1..nTop-1] = waist samples at totalExtension;
  // cut[nTop] = side mitre (when present). Fold-test the waist samples only.
  let max = 0;
  for (let i = 1; i < nTop; i++) {
    const c = cut[i]!;
    const f = ref.foldLine[i]!;
    const dist = (c.x - f.x) * up.x + (c.y - f.y) * up.y;
    const reflected = {
      x: c.x - 2 * dist * up.x,
      y: c.y - 2 * dist * up.y,
    };
    const expected = offsetAlong(f, up, -ref.turnUnder);
    max = Math.max(
      max,
      Math.hypot(reflected.x - expected.x, reflected.y - expected.y),
    );
  }
  return max;
}
