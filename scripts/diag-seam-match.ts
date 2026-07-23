/**
 * Diagnostic only — seam match / notch alignment.
 * Run: npx tsx scripts/diag-seam-match.ts
 * Change no product code.
 */
import {
  applyEase,
  notchCount,
  type Point,
  type PatternPiece,
} from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import { polylineLength, pchipByY, quadBezier } from "../lib/geometry/curves";
import { draftWaistband } from "../lib/elements/waistband";
import { applySideOpening } from "../lib/elements/sideOpening";
import { CLEO_PRESET } from "../lib/pattern/blockPresets";
import {
  draftTrouserFront,
  draftTrouserBack,
  trouserFrontPoints,
  trouserBackPoints,
  trouserWaistEdges,
  withWaistband,
  resolveBackCrotchDrop,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const TOL_MM = 1.0;
const ZIP_LEN = 180;

const chart = bodyForSizeCode("12")!;
const body = applyEase({ ...chart, hip: 1100 }, { waist: 10, hip: 50 });

function ptsAlongRole(piece: PatternPiece, role: string): Point[] {
  const out: Point[] = [];
  for (const o of piece.outline) {
    if (o.role === role) out.push(o.at);
  }
  const cleaned: Point[] = [];
  for (const p of out) {
    const last = cleaned[cleaned.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.01) {
      cleaned.push(p);
    }
  }
  return cleaned;
}

function len(pts: Point[]): number {
  return polylineLength(pts);
}

function distToPolyline(p: Point, poly: Point[]): { d: number; along: number } {
  let bestD = Infinity;
  let bestAlong = 0;
  let acc = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]!;
    const b = poly[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const seg = Math.hypot(dx, dy);
    if (seg < 1e-12) continue;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (seg * seg)),
    );
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < bestD) {
      bestD = d;
      bestAlong = acc + t * seg;
    }
    acc += seg;
  }
  return { d: bestD, along: bestAlong };
}

function orderFromWaist(pts: Point[]): Point[] {
  if (pts.length < 2) return pts;
  return pts[0]!.y <= pts[pts.length - 1]!.y ? pts : [...pts].reverse();
}

function orderFromCrotchTip(pts: Point[]): Point[] {
  if (pts.length < 2) return pts;
  if (pts[0]!.y > pts[pts.length - 1]!.y) return [...pts].reverse();
  return pts;
}

/** Mirror of trouserBlock.insideLegControl (not exported). */
function insideLegControl(a: Point, b: Point, bulge = 7.5): Point {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const d = { x: b.x - a.x, y: b.y - a.y };
  let nx = d.y;
  let ny = -d.x;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  if (nx < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: m.x + 2 * bulge * nx, y: m.y + 2 * bulge * ny };
}

/** Draft inseam length (matches draftTrouserFront/Back curves). */
function frontInseamLen(f: ReturnType<typeof trouserFrontPoints>): number {
  const { p9, p14, p15 } = f;
  const ctrl = insideLegControl(p9, p15);
  // draft: [p14, p15, ...quadBezier(p15, ctrl, p9).slice(1)]
  return polylineLength([p14, p15, ...quadBezier(p15, ctrl, p9).slice(1)]);
}

function backInseamLen(b: ReturnType<typeof trouserBackPoints>): number {
  const { p24, p28, p29 } = b;
  const ctrl = insideLegControl(p24, p29, 12.5);
  // draft: [p28, p29, ...quadBezier(p29, ctrl, p24).slice(1)]
  return polylineLength([p28, p29, ...quadBezier(p29, ctrl, p24).slice(1)]);
}

/** Tip→hem polyline for knee notch distance (same curve as draft). */
function frontInseamOrdered(f: ReturnType<typeof trouserFrontPoints>): Point[] {
  const { p9, p14, p15 } = f;
  const ctrl = insideLegControl(p9, p15);
  const toFork = quadBezier(p15, ctrl, p9).slice(1);
  // tip = last of toFork (=p9), then reverse path to knee, then hem
  return [p9, ...[...toFork].reverse().slice(1), p15, p14];
}

function backInseamOrdered(b: ReturnType<typeof trouserBackPoints>): Point[] {
  const { p24, p28, p29 } = b;
  const ctrl = insideLegControl(p24, p29, 12.5);
  const toFork = quadBezier(p29, ctrl, p24).slice(1);
  return [p24, ...[...toFork].reverse().slice(1), p29, p28];
}

type NotchInfo = {
  label: string;
  count?: number;
  at: Point;
  seam: string;
  alongFromRef: number;
  ref: string;
  distToSeam: number;
};

function classifyNotches(piece: PatternPiece): NotchInfo[] {
  const roles = [
    "waist",
    "side-seam",
    "inseam",
    "hem",
    "crotch",
    "centre-front",
    "centre-back",
  ];
  const seams: Record<string, Point[]> = {};
  for (const r of roles) {
    const p = ptsAlongRole(piece, r);
    if (p.length >= 2) seams[r] = p;
  }

  const out: NotchInfo[] = [];
  for (const m of piece.markings) {
    if (m.kind !== "notch") continue;
    let bestRole = "?";
    let bestD = Infinity;
    let along = 0;
    let ref = "";
    for (const [role, poly] of Object.entries(seams)) {
      let ordered = poly;
      let refName = "start";
      if (role === "side-seam") {
        ordered = orderFromWaist(poly);
        refName = "waist";
      } else if (role === "inseam") {
        ordered = orderFromCrotchTip(poly);
        refName = "crotch-tip";
      } else if (role === "waist") {
        ordered = poly;
        refName = "CF/CB end";
      } else {
        ordered = poly;
        refName = "tip/start";
      }
      const { d, along: a } = distToPolyline(m.at, ordered);
      if (d < bestD) {
        bestD = d;
        bestRole = role;
        along = a;
        ref = refName;
      }
    }
    const label =
      m.label ??
      (notchCount(m) === 2 ? "double" : "single");
    out.push({
      label,
      count: notchCount(m),
      at: m.at,
      seam: bestRole,
      alongFromRef: along,
      ref,
      distToSeam: bestD,
    });
  }
  return out;
}

function fmt(n: number, d = 2): string {
  return n.toFixed(d);
}

function flag(delta: number, tol = TOL_MM): string {
  return Math.abs(delta) > tol ? `  ** FLAG |>${tol}|` : "";
}

function mkAldrichBandOff(): TrouserFrontStyle {
  return withWaistband(
    { bottomWidth: 220, block: "classic", waistDrop: 0 },
    0,
    "darted",
    body,
  );
}

function mkCleoBandOff(): TrouserFrontStyle {
  const m = CLEO_PRESET.measured;
  return withWaistband(
    {
      bottomWidth: 220,
      block: "classic",
      waistDrop: m.waistDrop,
      crotchDeparture: m.crotchDeparture,
      frontWaistInset: m.frontWaistInset,
      crotchArrivalAngle: m.crotchArrivalAngle,
      backCrotchDrop: m.backCrotchDrop,
      frontCrotchFullness: m.frontCrotchFullness,
      backCrotchFullness: m.backCrotchFullness,
      frontCrotchExtensionScale: m.frontCrotchExtensionScale,
      backCrotchExtensionScale: m.backCrotchExtensionScale,
      waistlineCurveFront: CLEO_PRESET.provisional.waistlineCurveFront,
    },
    0,
    "darted",
    body,
  );
}

function mkShaped120(base: TrouserFrontStyle): TrouserFrontStyle {
  return withWaistband(base, 120, "shaped", body);
}

/** Band lower edge = side-seam vertex → fold along bottom. */
function bandLowerEdgeLen(piece: PatternPiece): number {
  const sideIdx = piece.outline.findIndex((o) => o.role === "side-seam");
  if (sideIdx < 0) return 0;
  const pts: Point[] = [];
  for (let i = sideIdx; i < piece.outline.length; i++) {
    pts.push(piece.outline[i]!.at);
    if (
      i > sideIdx &&
      (piece.outline[i]!.role === "centre-front" ||
        piece.outline[i]!.role === "centre-back")
    ) {
      break;
    }
  }
  return polylineLength(pts);
}

function reportSetting(name: string, style: TrouserFrontStyle) {
  console.log("\n" + "=".repeat(72));
  console.log(name);
  console.log("=".repeat(72));

  let front = draftTrouserFront(body, style);
  let back = draftTrouserBack(body, style);
  const opened = applySideOpening([front, back], {
    side: "left",
    length: ZIP_LEN,
  });
  front = opened.pieces[0]!;
  back = opened.pieces[1]!;

  const fPts = trouserFrontPoints(body, style);
  const bPts = trouserBackPoints(body, style);
  const drop = resolveBackCrotchDrop(style);

  const fSide = len(pchipByY([fPts.p11, fPts.p8, fPts.p13, fPts.p12]));
  const bSide = len(pchipByY([bPts.p22, bPts.p25, bPts.p27, bPts.p26]));

  const fInseam = frontInseamLen(fPts);
  const bInseam = backInseamLen(bPts);
  const fInseamNamed = polylineLength([fPts.p9, fPts.p15, fPts.p14]);
  const bInseamNamed = polylineLength([bPts.p24, bPts.p29, bPts.p28]);
  const fInseamPoly = frontInseamOrdered(fPts);
  const bInseamPoly = backInseamOrdered(bPts);

  const fHem = Math.hypot(fPts.p12.x - fPts.p14.x, fPts.p12.y - fPts.p14.y);
  const bHem = polylineLength(
    quadBezier(bPts.p26, { x: 0, y: fPts.p12.y + 20 }, bPts.p28),
  );

  console.log("\n## 1. Seam pair lengths (mm)");
  console.log(
    `tolerance: |${TOL_MM} mm| — flag side/hem if |Δ|>tol; inseam flags residual after attributing drop`,
  );
  console.log(
    "seam          | front      | back       | Δ (B−F)    | note",
  );
  console.log(
    "--------------|------------|------------|------------|------",
  );

  {
    const d = bInseam - fInseam;
    // Aldrich 23–24 drop shortens back: expect Δ ≈ −drop
    const expect = -drop;
    const residual = d - expect;
    let note = `drop=${fmt(drop, 1)}; expect Δ≈${fmt(expect)}; residual ${fmt(residual)}`;
    if (Math.abs(residual) > TOL_MM) note += "  ** FLAG residual";
    console.log(
      `${"inseam".padEnd(14)}| ${fmt(fInseam).padStart(10)} | ${fmt(bInseam).padStart(10)} | ${fmt(d).padStart(10)} | ${note}`,
    );
    console.log(
      `${"  named pts".padEnd(14)}| ${fmt(fInseamNamed).padStart(10)} | ${fmt(bInseamNamed).padStart(10)} | ${fmt(bInseamNamed - fInseamNamed).padStart(10)} | p9→p15→p14 / p24→p29→p28`,
    );
  }
  {
    const d = bSide - fSide;
    console.log(
      `${"side-seam".padEnd(14)}| ${fmt(fSide).padStart(10)} | ${fmt(bSide).padStart(10)} | ${fmt(d).padStart(10)} | ${flag(d)}`,
    );
  }
  {
    const d = bHem - fHem;
    console.log(
      `${"hem".padEnd(14)}| ${fmt(fHem).padStart(10)} | ${fmt(bHem).padStart(10)} | ${fmt(d).padStart(10)} | ${flag(d)}`,
    );
  }

  console.log("\n## 2. Waist / waistband (mm)");
  const waistFOff = len(ptsAlongRole(front, "waist"));
  const waistBOff = len(ptsAlongRole(back, "waist"));
  console.log(`band-off trouser waist front: ${fmt(waistFOff)}`);
  console.log(`band-off trouser waist back:  ${fmt(waistBOff)}`);
  console.log(`  (no waistband pieces when depth=0 — no lower-edge compare)`);

  const styled120 = mkShaped120(style);
  const front120 = draftTrouserFront(body, styled120);
  const back120 = draftTrouserBack(body, styled120);
  const waistF120 = len(ptsAlongRole(front120, "waist"));
  const waistB120 = len(ptsAlongRole(back120, "waist"));
  const edges = trouserWaistEdges(body, styled120);
  const bandDepth = styled120.waistReduction ?? 120;
  const fb = draftWaistband({
    innerLen: edges.front.inner,
    outerLen: edges.front.outer,
    depth: bandDepth,
    foldSide: "CF",
    label: "Front waistband",
  });
  const bb = draftWaistband({
    innerLen: edges.back.inner,
    outerLen: edges.back.outer,
    depth: bandDepth,
    foldSide: "CB",
    label: "Back waistband",
  });
  const fbLower = bandLowerEdgeLen(fb.piece);
  const bbLower = bandLowerEdgeLen(bb.piece);
  console.log(`shaped-120 trouser waist front: ${fmt(waistF120)}`);
  console.log(
    `shaped-120 front band lower:      ${fmt(fbLower)}  | Δ ${fmt(fbLower - waistF120)}${flag(fbLower - waistF120)}`,
  );
  console.log(
    `  designed outerLen ${fmt(edges.front.outer)}; Δ outer−trouser ${fmt(edges.front.outer - waistF120)}${flag(edges.front.outer - waistF120)}`,
  );
  console.log(`shaped-120 trouser waist back:  ${fmt(waistB120)}`);
  console.log(
    `shaped-120 back band lower:       ${fmt(bbLower)}  | Δ ${fmt(bbLower - waistB120)}${flag(bbLower - waistB120)}`,
  );
  console.log(
    `  designed outerLen ${fmt(edges.back.outer)}; Δ outer−trouser ${fmt(edges.back.outer - waistB120)}${flag(edges.back.outer - waistB120)}`,
  );

  console.log("\n## 3. Notches (distance along seam from reference end, mm)");
  const fN = classifyNotches(front);
  const bN = classifyNotches(back);

  // Prefer construction inseam/side for along-distance (outline roles drop junctions)
  const fSidePoly = orderFromWaist(
    pchipByY([fPts.p11, fPts.p8, fPts.p13, fPts.p12]),
  );
  const bSidePoly = orderFromWaist(
    pchipByY([bPts.p22, bPts.p25, bPts.p27, bPts.p26]),
  );
  for (const n of fN) {
    if (n.seam === "inseam") {
      const { along, d } = distToPolyline(n.at, fInseamPoly);
      n.alongFromRef = along;
      n.distToSeam = d;
      n.ref = "crotch-tip";
    } else if (n.seam === "side-seam") {
      const { along, d } = distToPolyline(n.at, fSidePoly);
      n.alongFromRef = along;
      n.distToSeam = d;
      n.ref = "waist";
    }
  }
  for (const n of bN) {
    if (n.seam === "inseam") {
      const { along, d } = distToPolyline(n.at, bInseamPoly);
      n.alongFromRef = along;
      n.distToSeam = d;
      n.ref = "crotch-tip";
    } else if (n.seam === "side-seam") {
      const { along, d } = distToPolyline(n.at, bSidePoly);
      n.alongFromRef = along;
      n.distToSeam = d;
      n.ref = "waist";
    }
  }
  console.log("FRONT:");
  console.log(
    "label/count     | seam          | ref          | along | distToSeam",
  );
  for (const n of fN) {
    console.log(
      `${(n.label + (n.count != null ? `×${n.count}` : "")).padEnd(16)}| ${n.seam.padEnd(14)}| ${n.ref.padEnd(13)}| ${fmt(n.alongFromRef).padStart(5)} | ${fmt(n.distToSeam, 3)}`,
    );
  }
  console.log("BACK:");
  for (const n of bN) {
    console.log(
      `${(n.label + (n.count != null ? `×${n.count}` : "")).padEnd(16)}| ${n.seam.padEnd(14)}| ${n.ref.padEnd(13)}| ${fmt(n.alongFromRef).padStart(5)} | ${fmt(n.distToSeam, 3)}`,
    );
  }

  console.log("\nCorrespondence (same distance from shared ref):");
  const fHip = fN.find((n) => n.seam === "side-seam" && n.label !== "zip");
  const bHip = bN.find((n) => n.seam === "side-seam" && n.label !== "zip");
  const fKnee = fN.find((n) => n.seam === "inseam" && n.label === "single");
  const bKnee = bN.find((n) => n.seam === "inseam" && n.label === "double");
  const fZip = fN.find((n) => n.label === "zip");
  const bZip = bN.find((n) => n.label === "zip");
  const fWaistBal = fN.find((n) => n.seam === "waist");
  const bWaistBal = bN.find((n) => n.seam === "waist");

  const pairs: {
    name: string;
    f?: NotchInfo;
    b?: NotchInfo;
    sewPair: boolean;
  }[] = [
    { name: "knee (inseam from tip)", f: fKnee, b: bKnee, sewPair: true },
    {
      name: "hipline side (side-seam from waist)",
      f: fHip,
      b: bHip,
      sewPair: true,
    },
    {
      name: "zip opening (side-seam from waist)",
      f: fZip,
      b: bZip,
      sewPair: true,
    },
    {
      name: "waist balance (waist from CF/CB)",
      f: fWaistBal,
      b: bWaistBal,
      sewPair: false,
    },
  ];

  for (const p of pairs) {
    if (!p.f || !p.b) {
      console.log(
        `  ${p.name}: MISSING front=${!!p.f} back=${!!p.b}  ** FLAG`,
      );
      continue;
    }
    const d = p.b.alongFromRef - p.f.alongFromRef;
    const note = p.sewPair
      ? flag(d)
      : " (not a F↔B sew pair — report only)";
    console.log(
      `  ${p.name}: F ${fmt(p.f.alongFromRef)}  B ${fmt(p.b.alongFromRef)}  Δ ${fmt(d)}${note}`,
    );
  }

  console.log("\n## 4. Side-seam waist points");
  console.log(`  front p11: (${fmt(fPts.p11.x)}, ${fmt(fPts.p11.y)})`);
  console.log(`  back  p22: (${fmt(bPts.p22.x)}, ${fmt(bPts.p22.y)})`);
  console.log(`  Δx (p11.x − p22.x): ${fmt(fPts.p11.x - bPts.p22.x)}`);
  console.log(`  Δy (p11.y − p22.y): ${fmt(fPts.p11.y - bPts.p22.y)}`);
  console.log(
    `  frontWaistInset style: ${style.frontWaistInset ?? "default(10)"}`,
  );
  const meet =
    Math.abs(fPts.p11.y - bPts.p22.y) <= TOL_MM
      ? "same waist y"
      : `waist y mismatch Δ=${fmt(fPts.p11.y - bPts.p22.y)}  ** FLAG`;
  console.log(`  meet at waist: ${meet}`);
}

console.log(
  "Body: chart size 12, hip 1100 + ease waist 10 / hip 50 → hip",
  body.hip,
);
console.log(`Tolerance: |${TOL_MM} mm|`);

reportSetting("A — Aldrich defaults (classic, band off)", mkAldrichBandOff());
reportSetting(
  "B — Cleo preset params (band off; owner ease 10/50)",
  mkCleoBandOff(),
);
