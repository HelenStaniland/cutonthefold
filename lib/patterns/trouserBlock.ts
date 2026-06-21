import {
  BodyMeasurements,
  ConstructionStep,
  DraftingLine,
  DraftingLineKind,
  DraftingPoint,
  Millimetres,
  OutlinePoint,
  Pattern,
  PatternPiece,
  PieceConstruction,
  Point,
  Marking,
  EdgeType,
} from "@/lib/types/measurements";
import { validationResult, ValidationResult } from "@/lib/types/validation";
import {
  catmullRom,
  pchipByY,
  quadBezier,
} from "@/lib/geometry/curves";

export type TrouserBlock = "classic" | "production";

type TrouserBlockSpec = {
  waist: "natural" | "low";
  riseDrop: Millimetres;
  hipDepthDrop: Millimetres;
  frontDartLength: Millimetres;
  backWaistStep: Millimetres;
  backCrotchAdd: Millimetres;
  backDartLengths: [Millimetres, Millimetres];
};

const TROUSER_BLOCKS: Record<TrouserBlock, TrouserBlockSpec> = {
  classic: {
    waist: "natural",
    riseDrop: 0,
    hipDepthDrop: 0,
    frontDartLength: 100,
    backWaistStep: 20,
    backCrotchAdd: 8,
    backDartLengths: [120, 100],
  },
  production: {
    waist: "low",
    riseDrop: 50,
    hipDepthDrop: 50,
    frontDartLength: 60,
    backWaistStep: 17.5,
    backCrotchAdd: 5,
    backDartLengths: [80, 60],
  },
};
// NOTE: Aldrich p.46 lowers rise and waist-to-hip by 5cm but leaves 0–3 (waist
// to floor) at the FULL measurement, so the production leg runs to the same
// floor length. If the first toile comes up ~5cm long in the leg, also subtract
// 50 from waistToFloor for the production block (add a waistToFloorDrop here).

export const frontDartLength = (block: TrouserBlock): number =>
  TROUSER_BLOCKS[block].frontDartLength;

// Distance from centre front to the sewn front dart, along the finished waist.
// Dart is centred on point 0; centre front is point 10; the 2 cm dart's take-up
// (10 mm on the CF side) closes up when sewn. Works out to one-twelfth hip.
export function frontDartFromCentreFront(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): number {
  const { p10 } = trouserFrontPoints(body, style);
  return -p10.x - 10;
}

function trouserBlockSpec(style: TrouserFrontStyle): TrouserBlockSpec {
  return TROUSER_BLOCKS[style.block ?? "classic"];
}

export function trouserDraftMeasures(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): { W: Millimetres; H: Millimetres; R: Millimetres; D: Millimetres; F: Millimetres } {
  const spec = trouserBlockSpec(style);
  return {
    W: spec.waist === "low" ? body.lowWaist : body.waist,
    H: body.hip,
    R: body.bodyRise - spec.riseDrop,
    D: body.hipDepth - spec.hipDepthDrop,
    F: body.waistToFloor,
  };
}

export type TrouserFrontStyle = {
  /** Finished hem width of one leg laid flat (= ½ the hem circumference; Aldrich's trouser bottom width). Front piece drafts 10mm narrower, back 10mm wider. */
  bottomWidth: Millimetres;
  block?: TrouserBlock;
};

export type FrontPoints = {
  p5: Point;
  p6: Point;
  p8: Point;
  p9: Point;
  p10: Point;
  p11: Point;
  p12: Point;
  p13: Point;
  p14: Point;
  p15: Point;
};

export type BackPoints = {
  p16: Point;
  p17: Point;
  p18: Point;
  p19: Point;
  p21: Point;
  p22: Point;
  p23: Point;
  p24: Point;
  p25: Point;
  p26: Point;
  p27: Point;
  p28: Point;
  p29: Point;
  guide: Point;
};

export type SizeBand = "6-8" | "10-14" | "16-20" | "22-26";

export function sizeBand(hip: Millimetres): SizeBand {
  if (hip < 875) return "6-8";
  if (hip < 1030) return "10-14";
  if (hip < 1210) return "16-20";
  return "22-26";
}

const FRONT_CROTCH_TOUCH: Record<SizeBand, Millimetres> = {
  "6-8": 27.5,
  "10-14": 30,
  "16-20": 32.5,
  "22-26": 35,
};

const BACK_CROTCH_TOUCH: Record<SizeBand, Millimetres> = {
  "6-8": 40,
  "10-14": 42.5,
  "16-20": 45,
  "22-26": 47.5,
};

const KNEE_ADD: Record<SizeBand, Millimetres> = {
  "6-8": 13,
  "10-14": 13,
  "16-20": 15,
  "22-26": 17,
};

const forkWidth = (H: number) => H / 12 + 20;

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / len, y: v.y / len };
}

/** Inward normal for a crotch notch from two neighbouring curve samples.
 *  Perpendicular to the local tangent, pointed toward +x (side seam). */
function crotchNotchDir(neighbourBefore: Point, neighbourAfter: Point): Point {
  const tangent = normalize({
    x: neighbourAfter.x - neighbourBefore.x,
    y: neighbourAfter.y - neighbourBefore.y,
  });
  let nrm = { x: -tangent.y, y: tangent.x };
  if (nrm.x < 0) {
    nrm = { x: -nrm.x, y: -nrm.y };
  }
  return nrm;
}

/** Point on a polyline at the given y, with chord neighbours for tangent. */
function pointOnPolylineAtY(
  points: Point[],
  y: Millimetres,
): { at: Point; before: Point; after: Point } {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (y < minY - 1e-9 || y > maxY + 1e-9) {
      continue;
    }
    if (Math.abs(b.y - a.y) < 1e-9) {
      continue;
    }
    const t = (y - a.y) / (b.y - a.y);
    return {
      at: { x: a.x + t * (b.x - a.x), y },
      before: a,
      after: b,
    };
  }
  throw new Error(`No polyline segment crosses y=${y}`);
}

function xOnLineAtY(a: Point, b: Point, y: number): number {
  return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
}

function crotchGuide(corner: Point, a: Point, b: Point, touch: Millimetres): Point {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const u = normalize({ x: mid.x - corner.x, y: mid.y - corner.y });
  return { x: corner.x + touch * u.x, y: corner.y + touch * u.y };
}

function insideLegControl(a: Point, b: Point, bulge: Millimetres = 7.5): Point {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const d = { x: b.x - a.x, y: b.y - a.y };
  let n = normalize({ x: d.y, y: -d.x });
  if (n.x < 0) {
    n = { x: -n.x, y: -n.y };
  }
  return { x: m.x + 2 * bulge * n.x, y: m.y + 2 * bulge * n.y };
}

type TaggedSegment = {
  points: Point[];
  edge: EdgeType;
  role: string;
};

function segmentsToOutline(segments: TaggedSegment[]): OutlinePoint[] {
  const outline: OutlinePoint[] = [];

  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s];
    const startIndex = s === 0 ? 0 : 1;

    // The edge leaving a junction point belongs to the new segment, not the old one.
    if (s > 0 && startIndex === 1 && outline.length > 0) {
      outline[outline.length - 1].edge = segment.edge;
      outline[outline.length - 1].role = segment.role;
    }

    for (let i = startIndex; i < segment.points.length; i++) {
      outline.push({
        at: segment.points[i],
        edge: segment.edge,
        role: segment.role,
      });
    }
  }

  return outline;
}

export function trouserFrontPoints(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): FrontPoints {
  const spec = trouserBlockSpec(style);
  const W = spec.waist === "low" ? body.lowWaist : body.waist;
  const H = body.hip;
  const R = body.bodyRise - spec.riseDrop;
  const D = body.hipDepth - spec.hipDepthDrop;
  const F = body.waistToFloor;
  const B = style.bottomWidth;
  const band = sizeBand(H);
  const kneeAdd = KNEE_ADD[band];

  const kneeY = trouserKneeY(body);
  const fork = forkWidth(H);

  const p5 = { x: -fork, y: R };
  const p6 = { x: -fork, y: D };
  const p8 = { x: -fork + H / 4 + 5, y: D };
  const p9 = { x: -(fork + H / 16 + 10), y: R };
  const p10 = { x: -fork + 10, y: 0 };
  const p11 = { x: p10.x + W / 4 + 20, y: 0 };
  const p12 = { x: B / 2 - 5, y: F };
  const p14 = { x: -(B / 2 - 5), y: F };

  const K = B + 2 * kneeAdd;

  const p13 = { x: Math.min(K / 2 - 5, xOnLineAtY(p8, p12, kneeY)), y: kneeY };
  const p15 = { x: Math.max(-(K / 2 - 5), xOnLineAtY(p9, p14, kneeY)), y: kneeY };

  return { p5, p6, p8, p9, p10, p11, p12, p13, p14, p15 };
}

export function trouserBackPoints(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): BackPoints {
  const spec = trouserBlockSpec(style);
  const W = spec.waist === "low" ? body.lowWaist : body.waist;
  const H = body.hip;
  const R = body.bodyRise - spec.riseDrop;
  const D = body.hipDepth - spec.hipDepthDrop;
  const fork = forkWidth(H);
  const band = sizeBand(H);
  const f = trouserFrontPoints(body, style);

  const p16 = { x: -fork + fork / 4, y: R };
  const p17 = { x: p16.x, y: D };
  const p18 = { x: p16.x, y: 0 };
  const p19 = { x: p16.x, y: R / 2 };
  const p21 = { x: p18.x + 20, y: -spec.backWaistStep };
  const L = W / 4 + 40;
  const p22 = { x: p21.x + Math.sqrt(L * L - p21.y * p21.y), y: 0 };
  const p23 = { x: f.p9.x - ((H / 16 + 10) / 2 + spec.backCrotchAdd), y: R };
  const p24 = { x: p23.x, y: R + 5 };
  const p25 = { x: p17.x + H / 4 + 15, y: D };
  const p26 = { x: f.p12.x + 10, y: body.waistToFloor };
  const p28 = { x: f.p14.x - 10, y: body.waistToFloor };
  const kneeY = f.p13.y;

  const p27 = { x: f.p13.x + 10, y: kneeY };
  const p29 = { x: f.p15.x - 10, y: kneeY };
  const guide = crotchGuide(p16, p19, p24, BACK_CROTCH_TOUCH[band]);

  return { p16, p17, p18, p19, p21, p22, p23, p24, p25, p26, p27, p28, p29, guide };
}

function horizLine(
  y: Millimetres,
  xMin: Millimetres,
  xMax: Millimetres,
): DraftingLine {
  return {
    from: { x: xMin, y },
    to: { x: xMax, y },
    kind: "helper",
  };
}

function draftLine(
  from: Point,
  to: Point,
  kind: DraftingLineKind,
): DraftingLine {
  return { from, to, kind };
}

function crotchCurveControls(guide: Point): {
  points: DraftingPoint[];
  lines: DraftingLine[];
} {
  return {
    points: [{ id: "guide", at: guide, kind: "curveControl" }],
    lines: [],
  };
}

function insideLegCurveControls(
  a: Point,
  b: Point,
  bulge: Millimetres,
  id: string,
): { points: DraftingPoint[]; lines: DraftingLine[] } {
  const ctrl = insideLegControl(a, b, bulge);
  return {
    points: [{ id, at: ctrl, kind: "curveControl" }],
    lines: [
      draftLine(a, ctrl, "curveControl"),
      draftLine(ctrl, b, "curveControl"),
    ],
  };
}

export type FramePoints = {
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
  p4: Point;
};

/** Waistline y used to align front and back in the flat layout. */
export const TROUSER_LAYOUT_ANCHOR_Y = 0;

function trouserKneeY(body: BodyMeasurements): Millimetres {
  const R = body.bodyRise;
  const F = body.waistToFloor;
  return R + (F - R) / 2 - 50;
}

export function trouserFramePoints(body: BodyMeasurements): FramePoints {
  const R = body.bodyRise;
  const D = body.hipDepth;
  const F = body.waistToFloor;
  const p0 = { x: 0, y: TROUSER_LAYOUT_ANCHOR_Y };
  const p1 = { x: 0, y: R };
  const p2 = { x: 0, y: D };
  const p3 = { x: 0, y: F };
  const p4 = { x: 0, y: trouserKneeY(body) };
  return { p0, p1, p2, p3, p4 };
}

function frameConstruction(frame: FramePoints): {
  points: DraftingPoint[];
  lines: DraftingLine[];
} {
  const { p0, p1, p2, p3, p4 } = frame;
  return {
    points: [
      { id: "p0", at: p0 },
      { id: "p1", at: p1 },
      { id: "p2", at: p2 },
      { id: "p3", at: p3 },
      { id: "p4", at: p4 },
    ],
    lines: [
      draftLine(p0, p1, "construction"),
      draftLine(p1, p2, "construction"),
      draftLine(p2, p4, "construction"),
      draftLine(p4, p3, "construction"),
    ],
  };
}

function xExtent(points: Point[]): { min: Millimetres; max: Millimetres } {
  const xs = points.map((p) => p.x);
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

export function trouserConstruction(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): PieceConstruction[] {
  const R = body.bodyRise;
  const D = body.hipDepth;
  const F = body.waistToFloor;
  const band = sizeBand(body.hip);
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const frontGuide = crotchGuide(f.p5, f.p6, f.p9, FRONT_CROTCH_TOUCH[band]);
  const frontInsideLegCtrl = insideLegCurveControls(f.p9, f.p15, 7.5, "inseamCtrl");
  const frontCrotchControls = crotchCurveControls(frontGuide);

  const backInsideLegCtrl = insideLegCurveControls(b.p24, b.p29, 12.5, "inseamCtrl");
  const backCrotchControls = crotchCurveControls(b.guide);
  const backHemCtrl = { x: 0, y: F + 20 };
  const backHemControls = {
    points: [{ id: "hemCtrl", at: backHemCtrl, kind: "curveControl" as const }],
    lines: [
      draftLine(b.p26, backHemCtrl, "curveControl"),
      draftLine(backHemCtrl, b.p28, "curveControl"),
    ],
  };
  const frame = frameConstruction(trouserFramePoints(body));
  const framePts = Object.values(trouserFramePoints(body));

  const frontPts = [
    ...framePts,
    f.p5,
    f.p6,
    f.p8,
    f.p9,
    f.p10,
    f.p11,
    f.p12,
    f.p13,
    f.p14,
    f.p15,
  ];
  const frontX = xExtent(frontPts);

  const backPts = [
    ...framePts,
    b.p16,
    b.p17,
    b.p18,
    b.p19,
    b.p21,
    b.p22,
    b.p23,
    b.p24,
    b.p25,
    b.p26,
    b.p27,
    b.p28,
    b.p29,
  ];
  const backX = xExtent(backPts);

  return [
    {
      pieceName: "Trouser front",
      points: [
        ...frame.points,
        { id: "p5", at: f.p5 },
        { id: "p6", at: f.p6 },
        { id: "p8", at: f.p8 },
        { id: "p9", at: f.p9 },
        { id: "p10", at: f.p10 },
        { id: "p11", at: f.p11 },
        { id: "p12", at: f.p12 },
        { id: "p13", at: f.p13 },
        { id: "p14", at: f.p14 },
        { id: "p15", at: f.p15 },
        ...frontCrotchControls.points,
        ...frontInsideLegCtrl.points,
      ],
      lines: [
        ...frame.lines,
        draftLine(f.p5, f.p6, "construction"),
        draftLine(f.p6, f.p8, "construction"),
        draftLine(f.p5, f.p9, "construction"),
        draftLine(f.p10, f.p11, "construction"),
        draftLine(f.p5, frontGuide, "construction"),
        draftLine(f.p6, f.p9, "construction"),
        draftLine(f.p8, f.p13, "helper"),
        draftLine(f.p13, f.p12, "helper"),
        draftLine(f.p9, f.p15, "helper"),
        draftLine(f.p15, f.p14, "helper"),
        draftLine(f.p12, f.p14, "helper"),
        horizLine(0, frontX.min, frontX.max),
        horizLine(R, frontX.min, frontX.max),
        horizLine(D, frontX.min, frontX.max),
        horizLine(f.p13.y, frontX.min, frontX.max),
        horizLine(F, frontX.min, frontX.max),
        ...frontCrotchControls.lines,
        ...frontInsideLegCtrl.lines,
      ],
    },
    {
      pieceName: "Trouser back",
      points: [
        ...frame.points,
        { id: "p16", at: b.p16 },
        { id: "p17", at: b.p17 },
        { id: "p18", at: b.p18 },
        { id: "p19", at: b.p19 },
        { id: "p21", at: b.p21 },
        { id: "p22", at: b.p22 },
        { id: "p23", at: b.p23 },
        { id: "p24", at: b.p24 },
        { id: "p25", at: b.p25 },
        { id: "p26", at: b.p26 },
        { id: "p27", at: b.p27 },
        { id: "p28", at: b.p28 },
        { id: "p29", at: b.p29 },
        ...backCrotchControls.points,
        ...backInsideLegCtrl.points,
        ...backHemControls.points,
      ],
      lines: [
        ...frame.lines,
        draftLine(b.p16, b.p17, "construction"),
        draftLine(b.p17, b.p18, "construction"),
        draftLine(b.p16, b.p19, "construction"),
        draftLine(b.p18, b.p21, "construction"),
        draftLine(b.p21, b.p22, "construction"),
        draftLine(b.p16, b.guide, "construction"),
        draftLine(b.p19, b.p24, "construction"),
        draftLine(b.p23, b.p24, "construction"),
        draftLine(b.p17, b.p25, "construction"),
        draftLine(b.p25, b.p27, "helper"),
        draftLine(b.p27, b.p26, "helper"),
        draftLine(b.p24, b.p29, "helper"),
        draftLine(b.p29, b.p28, "helper"),
        draftLine(b.p26, b.p28, "helper"),
        horizLine(0, backX.min, backX.max),
        horizLine(R, backX.min, backX.max),
        horizLine(D, backX.min, backX.max),
        horizLine(b.p27.y, backX.min, backX.max),
        horizLine(F, backX.min, backX.max),
        ...backCrotchControls.lines,
        ...backInsideLegCtrl.lines,
        ...backHemControls.lines,
      ],
    },
  ];
}

export function draftTrouserFront(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): PatternPiece {
  const H = body.hip;
  const F = body.waistToFloor;
  const band = sizeBand(H);
  const f = trouserFrontPoints(body, style);
  const { p5, p6, p8, p9, p10, p11, p12, p13, p14, p15 } = f;

  const frontGuide = crotchGuide(p5, p6, p9, FRONT_CROTCH_TOUCH[band]);

  const insideLegCtrl = insideLegControl(p9, p15);
  const insideLegToFork = quadBezier(p15, insideLegCtrl, p9).slice(1);

  const segments: TaggedSegment[] = [
    {
      points: [p10, p11],
      edge: "seam",
      role: "waist",
    },
    {
      points: pchipByY([p11, p8, p13, p12]),
      edge: "seam",
      role: "side-seam",
    },
    {
      points: [p12, p14],
      edge: "hem",
      role: "hem",
    },
    {
      points: [p14, p15, ...insideLegToFork],
      edge: "seam",
      role: "inseam",
    },
    {
      points: catmullRom([p9, frontGuide, p6, p10]),
      edge: "seam",
      role: "crotch",
    },
  ];

  const outline = segmentsToOutline(segments);

  const spec = trouserBlockSpec(style);

  const markings: Marking[] = [
    {
      kind: "grainline",
      line: { from: { x: 0, y: 20 }, to: { x: 0, y: F - 20 } },
    },
    {
      kind: "dart",
      apex: { x: 0, y: spec.frontDartLength },
      legs: [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
      ],
    },
    { kind: "notch", at: p8, count: 1 },
    { kind: "notch", at: p15, count: 1 },
    {
      kind: "notch",
      at: p6,
      dir: crotchNotchDir(frontGuide, p10),
      count: 1,
    },
  ];

  return {
    name: "Trouser front",
    cutCount: 2,
    onFold: false,
    outline,
    markings,
  };
}

export function draftTrouserBack(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): PatternPiece {
  const F = body.waistToFloor;
  const b = trouserBackPoints(body, style);
  const spec = trouserBlockSpec(style);
  const {
    p16,
    p18,
    p19,
    p21,
    p22,
    p23,
    p24,
    p25,
    p26,
    p27,
    p28,
    p29,
    guide,
  } = b;
  const insideLegCtrl = insideLegControl(p24, p29, 12.5);
  const backInsideToFork = quadBezier(p29, insideLegCtrl, p24).slice(1);
  const crotch = catmullRom([p24, guide, p19, p21]);
  const hipOnCrotch = pointOnPolylineAtY(crotch, b.p17.y);

  const segments: TaggedSegment[] = [
    { points: [p21, p22], edge: "seam", role: "waist" },
    { points: pchipByY([p22, p25, p27, p26]), edge: "seam", role: "side-seam" },
    {
      points: quadBezier(p26, { x: 0, y: F + 20 }, p28),
      edge: "hem",
      role: "hem",
    },
    {
      points: [p28, p29, ...backInsideToFork],
      edge: "seam",
      role: "inseam",
    },
    { points: crotch, edge: "seam", role: "crotch" },
  ];
  const outline = segmentsToOutline(segments);

  const seam = normalize({ x: p22.x - p21.x, y: p22.y - p21.y });
  const third = (k: number) => ({
    x: p21.x + (k / 3) * (p22.x - p21.x),
    y: p21.y + (k / 3) * (p22.y - p21.y),
  });
  const backDart = (c: Point, length: Millimetres): Marking => ({
    kind: "dart",
    apex: { x: c.x, y: c.y + length },
    legs: [
      { x: c.x - 10 * seam.x, y: c.y - 10 * seam.y },
      { x: c.x + 10 * seam.x, y: c.y + 10 * seam.y },
    ],
  });

  const markings: Marking[] = [
    {
      kind: "grainline",
      line: { from: { x: 0, y: 20 }, to: { x: 0, y: F - 20 } },
    },
    backDart(third(1), spec.backDartLengths[0]),
    backDart(third(2), spec.backDartLengths[1]),
    { kind: "notch", at: p25, count: 2 },
    { kind: "notch", at: p29, count: 2 },
    {
      kind: "notch",
      at: hipOnCrotch.at,
      dir: crotchNotchDir(hipOnCrotch.before, hipOnCrotch.after),
      count: 2,
    },
  ];

  return {
    name: "Trouser back",
    cutCount: 2,
    onFold: false,
    outline,
    markings,
  };
}

export function draftTrousers(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): Pattern {
  return {
    pieces: [draftTrouserFront(body, style), draftTrouserBack(body, style)],
  };
}

export function validateTrousers(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): ValidationResult {
  const issues = [];

  if (body.waist > body.hip) {
    issues.push({
      severity: "error" as const,
      message: "Waist must not be larger than hip.",
      fields: ["waist", "hip"],
    });
  }

  if (body.bodyRise >= body.waistToFloor) {
    issues.push({
      severity: "error" as const,
      message: "Body rise must be less than waist to floor.",
      fields: ["bodyRise", "waistToFloor"],
    });
  }

  if (style.bottomWidth <= 0) {
    issues.push({
      severity: "error" as const,
      message: "Leg hem width must be greater than zero.",
    });
  }

  return validationResult(issues);
}

export function trouserInstructions(): ConstructionStep[] {
  return [
    {
      id: "cut",
      text: "Cut on doubled fabric with each grainline on the straight grain: front and back two each, so each leg comes as a mirrored pair — a left and a right. Transfer the darts and notches to the fabric.",
      highlight: [{ piece: "Trouser front" }, { piece: "Trouser back" }],
    },
    {
      id: "work-front-dart",
      text: "Fold and stitch the waist dart on each front; press toward the centre.",
      highlight: [{ piece: "Trouser front", edges: ["waist"] }],
    },
    {
      id: "work-back-darts",
      text: "Fold and stitch the two waist darts on each back; press toward the centre.",
      highlight: [{ piece: "Trouser back", edges: ["waist"] }],
    },
    {
      id: "side-seam",
      text: "With right sides together, join each front to a back at the side seam.",
      highlight: [
        { piece: "Trouser front", edges: ["side-seam"] },
        { piece: "Trouser back", edges: ["side-seam"] },
      ],
    },
    {
      id: "inseam",
      text: "Stitch the inside leg seam on each leg unit.",
      highlight: [
        { piece: "Trouser front", edges: ["inseam"] },
        { piece: "Trouser back", edges: ["inseam"] },
      ],
    },
    {
      id: "crotch",
      text: "Turn one leg inside the other and stitch the crotch seam in one pass.",
      highlight: [
        { piece: "Trouser front", edges: ["crotch"] },
        { piece: "Trouser back", edges: ["crotch"] },
      ],
    },
    {
      id: "hem",
      text: "Neaten and hem both legs to the marked hem line.",
      highlight: [
        { piece: "Trouser front", edges: ["hem"] },
        { piece: "Trouser back", edges: ["hem"] },
      ],
    },
  ];
}
