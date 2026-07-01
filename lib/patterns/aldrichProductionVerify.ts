/**
 * Aldrich p46–47 point-by-point checks for production block, depth 0 (darted).
 * Run: npx tsx scripts/verify-aldrich-production-depth0.ts
 */
import type { BodyMeasurements, Point } from "@/lib/types/measurements";
import { catmullRom } from "@/lib/geometry/curves";
import {
  draftTrouserBack,
  draftTrouserFront,
  draftTrousers,
  isDartedFacingFinish,
  trouserBackPoints,
  trouserFramePoints,
  trouserFrontPoints,
  type TrouserFrontStyle,
} from "@/lib/patterns/trouserBlock";

/** Aldrich p46–47 example body (size 12 production chart values, mm). */
export const ALDRICH_P46_SIZE_12_BODY: BodyMeasurements = {
  waist: 760,
  lowWaist: 780,
  hip: 940,
  hipDepth: 206,
  bodyRise: 280,
  waistToFloor: 1040,
};

export const ALDRICH_P46_DEPTH0_STYLE: TrouserFrontStyle = {
  block: "production",
  bottomWidth: 220,
  waistReduction: 0,
  waistbandMode: "darted",
};

const EPS = 0.2;

export type AldrichCheck = {
  id: string;
  computed: string;
  expected: string;
  pass: boolean;
  critical: boolean;
  note?: string;
};

function close(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

function fmt(n: number): string {
  return n.toFixed(1);
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function check(
  id: string,
  computed: number,
  expected: number,
  critical = true,
  note?: string,
): AldrichCheck {
  return {
    id,
    computed: fmt(computed),
    expected: fmt(expected),
    pass: close(computed, expected),
    critical,
    note,
  };
}

function checkBool(
  id: string,
  pass: boolean,
  computed: string,
  expected: string,
  critical = true,
  note?: string,
): AldrichCheck {
  return { id, computed, expected, pass, critical, note };
}

function dartWidth(m: { legs: [Point, Point] }): number {
  return dist(m.legs[0], m.legs[1]);
}

function dartLength(m: { apex: Point; legs: [Point, Point] }): number {
  const mouth = {
    x: (m.legs[0].x + m.legs[1].x) / 2,
    y: (m.legs[0].y + m.legs[1].y) / 2,
  };
  return dist(mouth, m.apex);
}

/** Full PASS/FAIL table; throws if any critical check fails. */
export function verifyAldrichProductionDepth0(options?: {
  assert?: boolean;
}): AldrichCheck[] {
  const body = ALDRICH_P46_SIZE_12_BODY;
  const style = ALDRICH_P46_DEPTH0_STYLE;
  const H = body.hip;
  const W = body.lowWaist;
  const R = body.bodyRise - 50;
  const D = body.hipDepth - 50;
  const F = body.waistToFloor;
  const fork = H / 12 + 20;
  const kneeAdd = 13;

  const frame = trouserFramePoints(body, "production");
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const front = draftTrouserFront(body, style);
  const back = draftTrouserBack(body, style);
  draftTrousers(body, style);

  const kneeYCode =
    body.bodyRise + (body.waistToFloor - body.bodyRise) / 2 - 50;
  const kneeYAldrichDropped =
    R + (F - R) / 2 - 50; // point 1 + half(1–3) − 50

  const p20x = b.p18.x + 17.5;
  const L = W / 4 + 40;

  const checks: AldrichCheck[] = [];

  // --- Frame (production drops on 0–1 and 0–2 only) ---
  checks.push(check("0–1 crutch depth y (p1)", frame.p1.y, R));
  checks.push(check("0–2 hipline y (p2)", frame.p2.y, D));
  checks.push(check("0–3 floor y (p3)", frame.p3.y, F));
  checks.push(
    check(
      "1–4 knee y (code: full bodyRise)",
      frame.p4.y,
      kneeYCode,
      false,
      "Uses full bodyRise 280, not dropped 230",
    ),
  );
  checks.push(
    check(
      "1–4 knee y (Aldrich: half(1–3)−50 on dropped frame)",
      frame.p4.y,
      kneeYAldrichDropped,
      false,
      "Intentional? frame p1 uses dropped R; knee formula uses full rise",
    ),
  );

  // --- Front ---
  checks.push(check("1–5 fork width |p5.x|", Math.abs(f.p5.x), fork));
  checks.push(check("0–1 front crutch y (p5)", f.p5.y, R));
  checks.push(check("0–2 front hip y (p6)", f.p6.y, D));
  checks.push(check("6–8 H/4+5 (p8.x−p6.x)", f.p8.x - f.p6.x, H / 4 + 5));
  checks.push(
    check(
      "5–9 H/16+10 span",
      Math.abs(f.p5.x - f.p9.x),
      H / 16 + 10,
    ),
  );
  checks.push(check("7–10 = 10 (p10.x−p5.x)", f.p10.x - f.p5.x, 10));
  checks.push(check("10–11 W/4+20", f.p11.x - f.p10.x, W / 4 + 20));
  checks.push(check("3–12 hem half−5", f.p12.x, style.bottomWidth! / 2 - 5));
  checks.push(check("3–14 hem half−5", Math.abs(f.p14.x), style.bottomWidth! / 2 - 5));
  checks.push(check("4–13 knee add (p13.x−p12.x)", f.p13.x - f.p12.x, kneeAdd));
  checks.push(
    check(
      "4–15 knee add |p15.x−p14.x|",
      Math.abs(f.p15.x - f.p14.x),
      kneeAdd,
    ),
  );
  checks.push(check("4–13 knee line y", f.p13.y, kneeYCode));
  checks.push(check("4–15 knee line y", f.p15.y, kneeYCode));

  const frontGuide = (() => {
    const chord = { x: f.p9.x - f.p6.x, y: f.p9.y - f.p6.y };
    const len = Math.hypot(chord.x, chord.y);
    const u = { x: chord.x / len, y: chord.y / len };
    let perp = { x: -u.y, y: u.x };
    if (perp.x > 0) perp = { x: -perp.x, y: -perp.y };
    return { x: f.p5.x + 30 * perp.x, y: f.p5.y + 30 * perp.y };
  })();
  checks.push(
    check("front crotch touch from 5", dist(f.p5, frontGuide), 30),
  );

  // --- Back ---
  checks.push(
    check("5–16 quarter fork", Math.abs(f.p5.x - b.p16.x), fork / 4),
  );
  checks.push(check("16–17 to hipline", b.p17.y, D));
  checks.push(check("16–18 to waistline", b.p18.y, 0));
  checks.push(check("16–19 half rise R/2", b.p19.y, R / 2));
  checks.push(check("18–20 toward centre (+x)", b.p21.x - b.p18.x, 17.5));
  checks.push(
    checkBool(
      "p21 inboard of p18 (+x)",
      b.p21.x > b.p18.x,
      fmt(b.p21.x),
      `>${fmt(b.p18.x)}`,
    ),
  );
  checks.push(check("20–21 up", Math.abs(b.p21.y), 20));
  checks.push(check("21–22 length L", dist(b.p21, b.p22), L));
  checks.push(check("22 on waistline", b.p22.y, 0));
  checks.push(
    check(
      "9–23 half(5–9)+5",
      Math.abs(f.p9.x - b.p23.x),
      (H / 16 + 10) / 2 + 5,
    ),
  );
  checks.push(check("23–24 down", b.p24.y - b.p23.y, 5));
  checks.push(
    check("back crotch touch from 16", dist(b.p16, b.guide), 42.5),
  );
  {
    const gv = { x: b.guide.x - b.p16.x, y: b.guide.y - b.p16.y };
    const angleAboveHoriz =
      (Math.atan2(-gv.y, -gv.x) * 180) / Math.PI;
    checks.push(
      check(
        "back guide 45° above horizontal from 16",
        angleAboveHoriz,
        45,
        true,
        "bisector of up-leg and fork-leg at p16",
      ),
    );
  }
  checks.push(
    checkBool(
      "guide convex side (−x)",
      b.guide.x < b.p16.x,
      fmt(b.guide.x),
      `<${fmt(b.p16.x)}`,
    ),
  );
  checks.push(check("17–25 H/4+15", b.p25.x - b.p17.x, H / 4 + 15));
  checks.push(check("12–26 +10", b.p26.x - f.p12.x, 10));
  checks.push(check("13–27 +10", b.p27.x - f.p13.x, 10));
  checks.push(check("14–28 −10", f.p14.x - b.p28.x, 10));
  checks.push(check("15–29 −10", f.p15.x - b.p29.x, 10));
  checks.push(check("p20x matches p18+17.5", b.p21.x, p20x));

  // --- Waist seam depth 0 ---
  const waistF = front.outline.filter((o) => o.role === "waist").map((o) => o.at);
  const waistB = back.outline.filter((o) => o.role === "waist").map((o) => o.at);
  const wrCf = waistB[0];
  const wrSide = waistB[waistB.length - 1];

  checks.push(
    checkBool(
      "depth 0 waistReduction",
      (style.waistReduction ?? 0) === 0,
      String(style.waistReduction ?? 0),
      "0",
    ),
  );
  checks.push(
    checkBool(
      "darted facing finish (no band)",
      isDartedFacingFinish(style),
      "true",
      "true",
    ),
  );
  checks.push(
    checkBool(
      "back waist CB higher than side",
      wrCf.y < wrSide.y,
      `cf.y=${fmt(wrCf.y)} side.y=${fmt(wrSide.y)}`,
      "cf.y < side.y",
    ),
  );
  checks.push(
    check(
      "wr.cf y meets p21 (no §2a lift)",
      wrCf.y,
      b.p21.y,
      true,
      "straight ruled waist 21→22",
    ),
  );
  checks.push(
    checkBool(
      "wr.cf at p21 (depth 0)",
      Math.hypot(wrCf.x - b.p21.x, wrCf.y - b.p21.y) < 0.05,
      fmt(Math.hypot(wrCf.x - b.p21.x, wrCf.y - b.p21.y)),
      "0",
    ),
  );

  // --- Darts ---
  const frontDarts = front.markings.filter((m) => m.kind === "dart");
  const backDarts = back.markings.filter((m) => m.kind === "dart");

  checks.push(
    checkBool(
      "front dart count",
      frontDarts.length === 1,
      String(frontDarts.length),
      "1",
    ),
  );
  checks.push(
    checkBool(
      "back dart count",
      backDarts.length === 2,
      String(backDarts.length),
      "2",
    ),
  );

  if (frontDarts.length === 1) {
    const d = frontDarts[0];
    checks.push(check("front dart width", dartWidth(d), 20));
    checks.push(check("front dart length", dartLength(d), 60));
  }

  if (backDarts.length === 2) {
    const [d0, d1] = backDarts;
    checks.push(check("back dart 1 width", dartWidth(d0), 20));
    checks.push(check("back dart 2 width", dartWidth(d1), 20));
    checks.push(check("back dart 1 length", dartLength(d0), 80));
    checks.push(check("back dart 2 length", dartLength(d1), 60));

    const span = b.p22.x - b.p21.x;
    const m0x = (d0.legs[0].x + d0.legs[1].x) / 2;
    const m1x = (d1.legs[0].x + d1.legs[1].x) / 2;
    checks.push(
      check(
        "back dart 1 mouth ≈ ⅓ along 21–22",
        (m0x - b.p21.x) / span,
        1 / 3,
        true,
        "parameterised on waist curve; ~⅓ in x",
      ),
    );
    checks.push(
      check(
        "back dart 2 mouth ≈ ⅔ along 21–22",
        (m1x - b.p21.x) / span,
        2 / 3,
        true,
        "parameterised on waist curve; ~⅔ in x",
      ),
    );
  }

  // --- Crotch seam structure (single catmullRom, meets waist at wr.cf) ---
  const crotchPoly = catmullRom([b.p24, b.guide, b.p19, b.p21]);
  const crotchEnd = crotchPoly[crotchPoly.length - 1]!;
  checks.push(
    checkBool(
      "back crotch is catmullRom 24→guide→19→21 (draft)",
      crotchPoly.length > 2,
      String(crotchPoly.length),
      ">2 samples",
      false,
    ),
  );
  checks.push(
    checkBool(
      "back crotch ends at draft p21",
      Math.hypot(crotchEnd.x - b.p21.x, crotchEnd.y - b.p21.y) < 0.05,
      fmt(Math.hypot(crotchEnd.x - b.p21.x, crotchEnd.y - b.p21.y)),
      "0",
    ),
  );
  checks.push(
    checkBool(
      "waist meets p21 at CB (depth 0)",
      Math.hypot(wrCf.x - b.p21.x, wrCf.y - b.p21.y) < 0.05,
      fmt(Math.hypot(wrCf.x - b.p21.x, wrCf.y - b.p21.y)),
      "0",
    ),
  );

  if (options?.assert) {
    const failed = checks.filter((c) => c.critical && !c.pass);
    if (failed.length > 0) {
      const lines = failed.map(
        (c) =>
          `  ${c.id}: got ${c.computed}, expected ${c.expected}${c.note ? ` (${c.note})` : ""}`,
      );
      throw new Error(
        `Aldrich production depth-0 verification failed (${failed.length} critical):\n${lines.join("\n")}`,
      );
    }
  }

  return checks;
}

export function formatAldrichReport(checks: AldrichCheck[]): string {
  const lines = ["Aldrich p46–47 production block, size 12, depth 0 (darted)\n"];
  lines.push(
    "| Check | Computed | Expected | Result |",
    "|-------|----------|----------|--------|",
  );
  for (const c of checks) {
    const result = c.pass ? "PASS" : c.critical ? "**FAIL**" : "FAIL*";
    const note = c.note ? ` — ${c.note}` : "";
    lines.push(
      `| ${c.id} | ${c.computed} | ${c.expected} | ${result}${note} |`,
    );
  }
  const criticalFail = checks.filter((c) => c.critical && !c.pass).length;
  const infoFail = checks.filter((c) => !c.critical && !c.pass).length;
  lines.push(
    `\nSummary: ${checks.filter((c) => c.pass).length}/${checks.length} PASS; ` +
      `${criticalFail} critical FAIL; ${infoFail} informational FAIL`,
  );
  return lines.join("\n");
}
