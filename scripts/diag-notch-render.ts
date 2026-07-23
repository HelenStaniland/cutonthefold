/**
 * DIAGNOSTIC — render notches in place, grouped by seam (visual; no geometry changes).
 * Run: npx tsx scripts/diag-notch-render.ts
 *
 * Writes SVG files under scripts/diag-notch-render/ for Helen to open.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  applyEase,
  notchCount,
  type Marking,
  type OutlinePoint,
  type PatternPiece,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { polylineLength } from "../lib/geometry/curves";
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
  CLEO_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import { draftWaistband } from "../lib/elements/waistband";
import { applySideOpening } from "../lib/elements/sideOpening";

const EDGE_TOL = 1.5;
const ZIP_LEN = 180;
const OUT_DIR = join("scripts", "diag-notch-render");

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

function closestOnPoly(
  p: Point,
  poly: Point[],
): { dist: number; arcFromStart: number; tangent: Point; normal: Point } {
  let bestD = Infinity;
  let bestArc = 0;
  let bestT = { x: 1, y: 0 };
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
      const L = segLen || 1;
      bestT = { x: dx / L, y: dy / L };
    }
    arc += segLen;
  }
  return {
    dist: bestD,
    arcFromStart: bestArc,
    tangent: bestT,
    normal: { x: -bestT.y, y: bestT.x },
  };
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
  tangent: Point;
  normal: Point;
};

function attributeEdge(
  piece: PatternPiece,
  at: Point,
  tip?: Point,
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
    if (role === "inseam" && tip) {
      poly = orderFromTip(poly, tip);
      seamStart = "tip";
    } else if (role === "side-seam") {
      poly = orderFromWaist(poly);
      seamStart = "waist";
    } else if (role === "crotch" || role === "centre-front" || role === "centre-back") {
      if (tip) {
        poly = orderFromTip(poly, tip);
        seamStart = "tip";
      }
    } else if (role === "waist") {
      seamStart = "waist[0]";
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
        tangent: hit.tangent,
        normal: hit.normal,
      };
    }
  }
  return best;
}

/** Stable code id for labelling (matches inventory names). */
function codeId(
  pieceName: string,
  n: NotchMark,
  edge: EdgeHit | null,
  landmarks: {
    knee?: Point;
    sideHip?: Point;
    hipY?: number;
    tip?: Point;
  },
): string {
  if (n.label === "zip") return "zip";
  if (pieceName.includes("waistband")) return "waistband-centre";
  if (landmarks.knee && dist(n.at, landmarks.knee) < 0.5) return "knee (p15/p29)";
  if (landmarks.sideHip && dist(n.at, landmarks.sideHip) < 0.5) {
    return pieceName.includes("back") ? "side-hip (p25)" : "side-hip (p8)";
  }
  if (
    landmarks.hipY != null &&
    Math.abs(n.at.y - landmarks.hipY) < 1 &&
    edge &&
    (edge.role === "crotch" ||
      edge.role === "centre-front" ||
      edge.role === "centre-back")
  ) {
    return "hipline (CF/crotch)";
  }
  if (edge?.role === "waist") return "waist-mid";
  return `notch@${edge?.role ?? "?"}`;
}

function draftCleo() {
  const settings = CLEO_TROUSER_STYLE;
  const base = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
  const body = applyEase(base, settings.ease);
  const style = resolveStyle(settings, body);
  const baseNet = draftTrousers(body, style);
  const opened = applySideOpening(baseNet.pieces, {
    side: "left",
    length: ZIP_LEN,
  });
  const bandDepth = style.waistReduction ?? 0;
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
  return {
    pieces: [...opened.pieces, fb.piece, bb.piece],
    frontPts: trouserFrontPoints(body, style),
    backPts: trouserBackPoints(body, style),
    body,
    style,
  };
}

function outlinePath(outline: OutlinePoint[]): string {
  return (
    outline
      .map(
        (o, i) =>
          `${i === 0 ? "M" : "L"}${o.at.x.toFixed(2)},${o.at.y.toFixed(2)}`,
      )
      .join(" ") + " Z"
  );
}

function notchTicks(
  at: Point,
  normal: Point,
  count: number,
  color: string,
): string {
  const depth = 14;
  const spacing = 5;
  const nx = normal.x;
  const ny = normal.y;
  const tx = -ny;
  const ty = nx;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * spacing;
    const ax = at.x + tx * off;
    const ay = at.y + ty * off;
    const bx = ax + nx * depth;
    const by = ay + ny * depth;
    parts.push(
      `<line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${bx.toFixed(2)}" y2="${by.toFixed(2)}" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`,
    );
  }
  parts.push(
    `<circle cx="${at.x.toFixed(2)}" cy="${at.y.toFixed(2)}" r="2.5" fill="${color}"/>`,
  );
  return parts.join("\n");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Annotated = {
  id: string;
  n: NotchMark;
  count: number;
  edge: EdgeHit | null;
  color: string;
  role: string;
  mate: string;
};

const COLORS = [
  "#b45309",
  "#1d4ed8",
  "#be123c",
  "#047857",
  "#7c3aed",
  "#0f766e",
];

function annotatePiece(
  piece: PatternPiece,
  landmarks: {
    tip?: Point;
    knee?: Point;
    sideHip?: Point;
    hipY?: number;
  },
): Annotated[] {
  return notchesOf(piece).map((n, i) => {
    const edge = attributeEdge(piece, n.at, landmarks.tip);
    const mate =
      n.role === "balance" && n.mates
        ? `${n.mates.piece}/${n.mates.seam}`
        : "—";
    return {
      id: n.label ?? codeId(piece.name, n, edge, landmarks),
      n,
      count: notchCount(n),
      edge,
      color: COLORS[i % COLORS.length]!,
      role: n.role,
      mate,
    };
  });
}

function renderLegSvg(
  piece: PatternPiece,
  landmarks: {
    tip: Point;
    knee: Point;
    sideHip: Point;
    hipY: number;
    forkY: number;
  },
  annotated: Annotated[],
  title: string,
): string {
  const xs = piece.outline.map((o) => o.at.x);
  const ys = piece.outline.map((o) => o.at.y);
  const pad = 80;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad + 120;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  const w = maxX - minX;
  const h = maxY - minY;

  const side = orderFromWaist(rolePolyline(piece.outline, "side-seam"));
  const zipAt =
    annotated.find((a) => a.id === "zip")?.n.at ??
    (() => {
      // reconstruct 180 mm along side if missing
      let rem = ZIP_LEN;
      for (let i = 0; i < side.length - 1; i++) {
        const A = side[i]!;
        const B = side[i + 1]!;
        const L = dist(A, B);
        if (L >= rem) {
          const t = rem / L;
          return { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) };
        }
        rem -= L;
      }
      return side[side.length - 1]!;
    })();

  // Label placement: push labels outward along normal, stagger by index
  const labelEls: string[] = [];
  const tickEls: string[] = [];
  annotated.forEach((a, i) => {
    const nrm = a.edge?.normal ?? { x: 1, y: 0 };
    // Prefer outward (away from piece centroid)
    const cx =
      piece.outline.reduce((s, o) => s + o.at.x, 0) / piece.outline.length;
    const cy =
      piece.outline.reduce((s, o) => s + o.at.y, 0) / piece.outline.length;
    const toOut = { x: a.n.at.x - cx, y: a.n.at.y - cy };
    let nx = nrm.x;
    let ny = nrm.y;
    if (nx * toOut.x + ny * toOut.y < 0) {
      nx = -nx;
      ny = -ny;
    }
    tickEls.push(notchTicks(a.n.at, { x: nx, y: ny }, a.count, a.color));
    const lx = a.n.at.x + nx * (28 + (i % 3) * 8);
    const ly = a.n.at.y + ny * (28 + (i % 3) * 8);
    const countWord = a.count === 1 ? "single" : a.count === 2 ? "DOUBLE" : `${a.count}`;
    const seam = a.edge?.role ?? "?";
    const arc =
      a.edge != null
        ? `arc ${f1(a.edge.arcFromStart)} from ${a.edge.seamStart}`
        : "";
    labelEls.push(`
      <line x1="${a.n.at.x}" y1="${a.n.at.y}" x2="${lx}" y2="${ly}" stroke="${a.color}" stroke-width="0.8" opacity="0.5"/>
      <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="11" font-family="system-ui,sans-serif" fill="${a.color}" font-weight="600">${escapeXml(a.id)}</text>
      <text x="${lx.toFixed(1)}" y="${(ly + 12).toFixed(1)}" font-size="9" font-family="system-ui,sans-serif" fill="#444">role=${escapeXml(a.role)} · ${countWord} · ${escapeXml(seam)}</text>
      <text x="${lx.toFixed(1)}" y="${(ly + 23).toFixed(1)}" font-size="8" font-family="system-ui,sans-serif" fill="#666">mate ${escapeXml(a.mate)} · ${escapeXml(arc)}</text>
    `);
  });

  const refEls = `
    <!-- hipline -->
    <line x1="${minX + 10}" y1="${landmarks.hipY}" x2="${maxX - 10}" y2="${landmarks.hipY}"
      stroke="#64748b" stroke-width="1" stroke-dasharray="8 5"/>
    <text x="${minX + 14}" y="${landmarks.hipY - 4}" font-size="10" fill="#64748b">hipline y=${f1(landmarks.hipY)}</text>
    <!-- crotch / fork level -->
    <line x1="${minX + 10}" y1="${landmarks.forkY}" x2="${maxX - 10}" y2="${landmarks.forkY}"
      stroke="#0ea5e9" stroke-width="1" stroke-dasharray="3 4"/>
    <text x="${minX + 14}" y="${landmarks.forkY - 4}" font-size="10" fill="#0284c7">crotch/fork level y=${f1(landmarks.forkY)}</text>
    <!-- zip endpoint -->
    <circle cx="${zipAt.x}" cy="${zipAt.y}" r="5" fill="none" stroke="#dc2626" stroke-width="1.5"/>
    <circle cx="${zipAt.x}" cy="${zipAt.y}" r="1.5" fill="#dc2626"/>
    <text x="${(zipAt.x + 10).toFixed(1)}" y="${(zipAt.y - 8).toFixed(1)}" font-size="10" fill="#dc2626" font-weight="600">zip endpoint (${ZIP_LEN} mm from waist)</text>
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}"
  width="720" height="${((720 * h) / w).toFixed(0)}">
  <rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#faf8f5"/>
  <text x="${minX + 16}" y="${minY + 28}" font-size="16" font-family="system-ui,sans-serif" fill="#111" font-weight="700">${escapeXml(title)}</text>
  <text x="${minX + 16}" y="${minY + 44}" font-size="10" font-family="system-ui,sans-serif" fill="#555">Cleo · net outline · notches in place (no geometry change)</text>
  <path d="${outlinePath(piece.outline)}" fill="#fff" fill-opacity="0.6" stroke="#1f2937" stroke-width="1.6"/>
  ${refEls}
  ${tickEls.join("\n")}
  ${labelEls.join("\n")}
</svg>`;
}

function renderBandSvg(
  piece: PatternPiece,
  annotated: Annotated[],
  title: string,
): string {
  const xs = piece.outline.map((o) => o.at.x);
  const ys = piece.outline.map((o) => o.at.y);
  const pad = 40;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad + 80;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad + 40;
  const w = maxX - minX;
  const h = maxY - minY;

  const tickEls: string[] = [];
  const labelEls: string[] = [];
  annotated.forEach((a) => {
    const nrm = a.edge?.normal ?? { x: 0, y: -1 };
    tickEls.push(notchTicks(a.n.at, nrm, a.count, a.color));
    const lx = a.n.at.x + 8;
    const ly = a.n.at.y - 18;
    const countWord = a.count === 1 ? "single" : "DOUBLE";
    labelEls.push(`
      <text x="${lx}" y="${ly}" font-size="11" font-family="system-ui,sans-serif" fill="${a.color}" font-weight="600">${escapeXml(a.id)}</text>
      <text x="${lx}" y="${ly + 12}" font-size="9" fill="#444">${countWord} · ${escapeXml(a.edge?.role ?? "?")}</text>
    `);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}"
  width="640" height="${Math.max(160, (640 * h) / w).toFixed(0)}">
  <rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#faf8f5"/>
  <text x="${minX + 12}" y="${minY + 22}" font-size="14" font-family="system-ui,sans-serif" fill="#111" font-weight="700">${escapeXml(title)}</text>
  <path d="${outlinePath(piece.outline)}" fill="#fff" fill-opacity="0.7" stroke="#1f2937" stroke-width="1.4"/>
  ${tickEls.join("\n")}
  ${labelEls.join("\n")}
</svg>`;
}

function printGrouped(
  pieceName: string,
  annotated: Annotated[],
) {
  console.log(`\n--- Grouped by seam: ${pieceName} ---`);
  const bySeam = new Map<string, Annotated[]>();
  for (const a of annotated) {
    const key = a.edge?.role ?? "(unattributed)";
    const list = bySeam.get(key) ?? [];
    list.push(a);
    bySeam.set(key, list);
  }
  for (const [seam, list] of bySeam) {
    list.sort(
      (a, b) => (a.edge?.arcFromStart ?? 0) - (b.edge?.arcFromStart ?? 0),
    );
    console.log(`  [${seam}]  (${list.length})`);
    for (const a of list) {
      const arc = a.edge
        ? `${f1(a.edge.arcFromStart)} mm from ${a.edge.seamStart}`
        : "—";
      console.log(
        `    ${a.id.padEnd(22)} role=${a.role.padEnd(8)} ticks=${a.count}  mate=${a.mate}  ${pt(a.n.at)}  ${arc}`,
      );
    }
    if (list.length >= 2 && seam === "side-seam") {
      const d = Math.abs(
        (list[1]!.edge?.arcFromStart ?? 0) - (list[0]!.edge?.arcFromStart ?? 0),
      );
      console.log(
        `    → two marks on side-seam, arc separation ${f1(d)} mm`,
      );
    }
  }
}

// --- main ---
mkdirSync(OUT_DIR, { recursive: true });
const { pieces, frontPts, backPts } = draftCleo();

const front = pieces.find((p) => p.name === "Trouser front")!;
const back = pieces.find((p) => p.name === "Trouser back")!;
const fBand = pieces.find((p) => p.name === "Front waistband")!;
const bBand = pieces.find((p) => p.name === "Back waistband")!;

const lmF = {
  tip: frontPts.p9,
  knee: frontPts.p15,
  sideHip: frontPts.p8,
  hipY: frontPts.p6.y,
  forkY: frontPts.p9.y,
};
const lmB = {
  tip: backPts.p24,
  knee: backPts.p29,
  sideHip: backPts.p25,
  hipY: backPts.p17.y,
  forkY: backPts.p24.y,
};

const annF = annotatePiece(front, lmF);
const annB = annotatePiece(back, lmB);
const annFB = annotatePiece(fBand, {});
const annBB = annotatePiece(bBand, {});

const files = [
  {
    name: "cleo-front-notches.svg",
    svg: renderLegSvg(front, lmF, annF, "Trouser front — notches"),
  },
  {
    name: "cleo-back-notches.svg",
    svg: renderLegSvg(back, lmB, annB, "Trouser back — notches"),
  },
  {
    name: "cleo-front-waistband-notches.svg",
    svg: renderBandSvg(fBand, annFB, "Front waistband — notch"),
  },
  {
    name: "cleo-back-waistband-notches.svg",
    svg: renderBandSvg(bBand, annBB, "Back waistband — notch"),
  },
];

console.log("=== DIAG: notch render (Cleo) ===");
console.log("visual only — no geometry changes\n");

for (const f of files) {
  const path = join(OUT_DIR, f.name);
  writeFileSync(path, f.svg);
  console.log(`wrote ${path}`);
}

printGrouped("Trouser front", annF);
printGrouped("Trouser back", annB);
printGrouped("Front waistband", annFB);
printGrouped("Back waistband", annBB);

// --- resolve the three picture questions in text ---
const fSideMarks = annF
  .filter((a) => a.edge?.role === "side-seam")
  .sort((a, b) => (a.edge!.arcFromStart) - (b.edge!.arcFromStart));
const bSideMarks = annB
  .filter((a) => a.edge?.role === "side-seam")
  .sort((a, b) => (a.edge!.arcFromStart) - (b.edge!.arcFromStart));
const fHip = annF.find((a) => a.id.includes("hipline"));
const bHip = annB.find((a) => a.id.includes("hipline"));
const fZip = annF.find((a) => a.id === "zip");
const bZip = annB.find((a) => a.id === "zip");
const fSideHip = annF.find((a) => a.id.includes("side-hip"));
const bSideHip = annB.find((a) => a.id.includes("side-hip"));

console.log("\n=== Picture questions (from current Cleo geometry) ===");
console.log("\n1. Is the 'hipline' notch the same as Helen's 'above the zip'?");
console.log(
  "   NO — hipline is NOT on the side seam. Front hipline sits on centre-front;",
);
console.log(
  "   back hipline sits on the crotch edge. Zip is on the side seam.",
);
if (fHip && fZip && fSideHip) {
  console.log(
    `   Front: hipline ${pt(fHip.n.at)} role=${fHip.edge?.role}; zip ${pt(fZip.n.at)} role=side-seam; side-hip ${pt(fSideHip.n.at)} role=side-seam`,
  );
  console.log(
    `   Arc on side-seam: side-hip ${f1(fSideHip.edge!.arcFromStart)} mm from waist; zip ${f1(fZip.edge!.arcFromStart)} mm from waist; separation ${f1(Math.abs(fZip.edge!.arcFromStart - fSideHip.edge!.arcFromStart))} mm`,
  );
}
if (bHip && bZip && bSideHip) {
  console.log(
    `   Back:  hipline ${pt(bHip.n.at)} role=${bHip.edge?.role}; zip ${pt(bZip.n.at)} role=side-seam; side-hip ${pt(bSideHip.n.at)} role=side-seam`,
  );
  console.log(
    `   Arc on side-seam: side-hip ${f1(bSideHip.edge!.arcFromStart)} mm from waist; zip ${f1(bZip.edge!.arcFromStart)} mm from waist; separation ${f1(Math.abs(bZip.edge!.arcFromStart - bSideHip.edge!.arcFromStart))} mm`,
  );
}
console.log(
  "   Candidate for Helen's 'above the zip': the side-hip (p8/p25) mark — same seam as zip, closer to waist.",
);

console.log("\n2. Distinct side-hip separate from zip/hipline? Two side-seam notches near hip?");
console.log(
  `   Front side-seam notches: ${fSideMarks.map((a) => a.id).join(", ") || "(none)"}`,
);
console.log(
  `   Back side-seam notches:  ${bSideMarks.map((a) => a.id).join(", ") || "(none)"}`,
);
console.log(
  "   YES — two marks on the side seam: side-hip (p8/p25) and zip. Hipline is a third mark on a different seam.",
);

console.log("\n3. A 'crotch' notch on crotch/CB?");
console.log(
  `   Back hipline notch is on role=${bHip?.edge?.role ?? "?"} at ${bHip ? pt(bHip.n.at) : "—"} — that is the inventory's crotch-edge hipline mark.`,
);
console.log(
  `   Front hipline is on role=${fHip?.edge?.role ?? "?"} (CF at hip level), not on the curved crotch tip run.`,
);
console.log(
  "   So Helen's 'crotch' mark is almost certainly the back hipline (on crotch), possibly also the front CF hipline as its mate.",
);

console.log(`\nOpen SVGs in: ${OUT_DIR}/`);
console.log("=== end diagnostic ===");
