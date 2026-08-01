/**
 * Acceptance: backCbWaistRise style parameter (fit slider).
 * Run: npx tsx scripts/accept-back-cb-waist-rise.ts
 *
 * Default 20 must keep Aldrich block + Cleo byte-identical to pre-change.
 * Raising CB lengthens back rise ~1:1; side/front stay put; below-hip arc
 * leave-dir reshape must stay within ~1–2 mm.
 */
import { createHash } from "node:crypto";
import {
  applyEase,
  type BodyMeasurements,
  type Point,
} from "../lib/types/measurements";
import { bodyForSizeCode, DEFAULT_SIZE_CODE } from "../lib/data/standardSizes";
import { polylineLength } from "../lib/geometry/curves";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
  MILA_TROUSER_STYLE,
  type TrouserStyleSettings,
} from "../lib/pattern/garmentStyles";
import {
  BACK_CB_WAIST_RISE,
  BACK_CB_WAIST_RISE_MAX,
  BACK_CB_WAIST_RISE_MIN,
  blockFromWaistDrop,
  draftBackCrotch,
  draftTrouserBack,
  draftTrouserFront,
  resolveBackCbWaistRise,
  trouserBackPoints,
  trouserFrontPoints,
  withWaistband,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

const SIZES = ["8", "12", "16", "20"] as const;
const HELEN_VERTICALS = {
  waistToFloor: 1020,
  hipDepth: 215,
  bodyRise: 301,
} as const;

/** Pre-change outline hashes (front+back sha256 concat) — captured before the param landed. */
const PRE_CHANGE_HASHES: Record<string, string> = {
  "size-8×Aldrich":
    "82c67ebbbcc3358a16b3dd8050fe93cc429014e26d76f3e12d49d645592173a20f273db960cd7f9dcab7c37c1d7d03e6b8240ec0502d8cb49d6cbc905d95f6d2",
  "size-12×Aldrich":
    "5fefbd9b70979c7546fe022a00e428466a945f6644d3858837f2996a499b4319be67c4d8c0127445026617ad5d7d34b7f6d0fa4d203e809da3cc8e6d485c7eb8",
  "size-16×Aldrich":
    "74f725647d73aa418ee3643c9dff9e817a8d324b0ef57f27c9b17767f5e71a256dd6f8d7edeb56f410397179b10f82f0c150148c8762e6578ce352f9badcc883",
  "size-20×Aldrich":
    "bb7c100c007769c1ac84a5343c3dd5bbf7343621ab6a8bde6d4c2e239383c253fd7a51242f0dfe0e985bf425db0bed198173c64142f00e00e4937bb10d08f7f7",
  "Helen-print×Aldrich":
    "af1096e7d20f882c2b368125626af178166c3dfe970360d27ce53e6da11463b29174c885312703dfcbb754604adca2ab0d62de7d74096cd4897b37d9baa036cd",
  "size-8×Cleo":
    "2d783744877b2ad69a2fbec86dd8966b80e7b72ad9eb915b8f6bf80b7ba42f46573dd2295b5011a64aeb29af118ff9e815077f730501b793ddcedb08b50d4b32",
  "size-12×Cleo":
    "e4ebe9f19ca6f5abf988963fc3ac817df10cbf5db5732977d1b2d8cbbc7b48f1789608336402530a58f1b2ca0c7c9a3b0adc23f8d1ba8b761d1ab07e73f204b3",
  "size-16×Cleo":
    "61c59055c3cbf3bb11d45825c26aec1640f48cafc6e8eb4f4ffc19ee78f46ff1079ac966a3644c8cb6c38245bb7dd2273ff82f7c8969374815de069ffd2e923e",
  "size-20×Cleo":
    "5a0dfa8eb790408387e6c49b1017cb91e9589199c57a42d9ac9dc75927a830cc56b3b8986650773b2613d8eb1989e1baf53ab051831ea9f68998a1c6396f1d03",
  "Helen-print×Cleo":
    "862adb99f04c723a3255525e652e20109f5bf3a4751cb3da11eb6665df946fd44177652b1e009df2db7e1b5b9a81458aa0464433d847fdb207722f4de3552d45",
};

const RISES = [20, 40, 76] as const;
const BELOW_HIP_MAX_MM = 2;

let failures = 0;
function fail(msg: string) {
  failures++;
  console.log(`  FAIL: ${msg}`);
}
function ok(msg: string) {
  console.log(`  ok: ${msg}`);
}

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const f3 = (n: number) => n.toFixed(3);

function helenBody(): BodyMeasurements {
  return { ...bodyForSizeCode(DEFAULT_SIZE_CODE)!, ...HELEN_VERTICALS };
}

const bodies: { name: string; body: BodyMeasurements }[] = [
  ...SIZES.map((c) => ({ name: `size-${c}`, body: bodyForSizeCode(c)! })),
  { name: "Helen-print", body: helenBody() },
];

function resolveStyle(
  s: TrouserStyleSettings,
  body: BodyMeasurements,
  riseOverride?: number,
): TrouserFrontStyle {
  const elastic = s.dartedWaistFinish === "elastic";
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
    ...(s.crotchArrivalAngle != null
      ? { crotchArrivalAngle: s.crotchArrivalAngle }
      : {}),
    ...(s.waistlineCurveFront != null
      ? { waistlineCurveFront: s.waistlineCurveFront }
      : {}),
    ...(elastic
      ? { frontWaistInset: 0, waistTaper: 0 }
      : {
          ...(s.frontWaistInset != null
            ? { frontWaistInset: s.frontWaistInset }
            : {}),
          ...(s.waistTaper != null ? { waistTaper: s.waistTaper } : {}),
        }),
    ...(riseOverride !== undefined
      ? { backCbWaistRise: riseOverride }
      : s.backCbWaistRise != null
        ? { backCbWaistRise: s.backCbWaistRise }
        : {}),
    ...(s.backCrotchDrop != null ? { backCrotchDrop: s.backCrotchDrop } : {}),
    ...(s.frontCrotchFullness != null
      ? { frontCrotchFullness: s.frontCrotchFullness }
      : {}),
    ...(s.backCrotchFullness != null
      ? { backCrotchFullness: s.backCrotchFullness }
      : {}),
  };
  if (elastic) {
    return withWaistband(base, 0, "shaped", body);
  }
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

function outlineHash(piece: ReturnType<typeof draftTrouserFront>): string {
  const s = piece.outline
    .map((o) => `${o.role ?? ""}:${o.at.x.toFixed(9)},${o.at.y.toFixed(9)}`)
    .join("|");
  const marks = piece.markings
    .map((m) => {
      if (m.kind === "dart") {
        return `dart:${m.apex.x.toFixed(6)},${m.apex.y.toFixed(6)}:${m.legs.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join(";")}`;
      }
      if (m.kind === "notch") {
        return `notch:${m.at.x.toFixed(6)},${m.at.y.toFixed(6)}:${m.label ?? ""}`;
      }
      if (m.kind === "grainline") {
        return `grain:${m.line.from.x.toFixed(6)},${m.line.from.y.toFixed(6)}-${m.line.to.x.toFixed(6)},${m.line.to.y.toFixed(6)}`;
      }
      return m.kind;
    })
    .join("|");
  return createHash("sha256").update(`${s}||${marks}`).digest("hex");
}

function pairHash(body: BodyMeasurements, style: TrouserFrontStyle): string {
  return (
    outlineHash(draftTrouserFront(body, style)) +
    outlineHash(draftTrouserBack(body, style))
  );
}

/** Tip→p19 samples of the back crotch (exclude straight CB join p19→p21). */
function belowHipPoints(
  body: BodyMeasurements,
  style: TrouserFrontStyle,
): Point[] {
  const b = trouserBackPoints(body, style);
  const full = draftBackCrotch(b, style).points;
  let hipIdx = full.length - 1;
  for (let i = 0; i < full.length; i++) {
    if (Math.hypot(full[i]!.x - b.p19.x, full[i]!.y - b.p19.y) < 0.5) {
      hipIdx = i;
      break;
    }
  }
  return full.slice(0, hipIdx + 1);
}

function maxPointDelta(a: Point[], b: Point[]): number {
  const n = Math.min(a.length, b.length);
  let m = 0;
  for (let i = 0; i < n; i++) {
    m = Math.max(m, Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y));
  }
  return m;
}

console.log("=== ACCEPT: backCbWaistRise ===\n");
console.log(
  `Default BACK_CB_WAIST_RISE = ${BACK_CB_WAIST_RISE}; clamp [${BACK_CB_WAIST_RISE_MIN}, ${BACK_CB_WAIST_RISE_MAX}].`,
);
console.log(
  `Resolver at omit: ${resolveBackCbWaistRise({})}; at 20: ${resolveBackCbWaistRise({ backCbWaistRise: 20 })}.`,
);
console.log(
  `Mila/Cleo presets omit → null (default 20). Elastic finish does not touch this field.\n`,
);

// ---------------------------------------------------------------------------
// 1. Default = pre-change byte identity (Aldrich + Cleo)
// ---------------------------------------------------------------------------
console.log("=== 1. Default rise → Aldrich / Cleo byte-identical to pre-change ===\n");

for (const bod of bodies) {
  for (const [name, s] of [
    ["Aldrich", BLOCK_TROUSER_STYLE],
    ["Cleo", CLEO_TROUSER_STYLE],
  ] as const) {
    const body = applyEase(bod.body, s.ease);
    const omitted = resolveStyle(s, body);
    const explicit = resolveStyle(s, body, 20);
    const hOmit = pairHash(body, omitted);
    const hExpl = pairHash(body, explicit);
    const key = `${bod.name}×${name}`;
    const expected = PRE_CHANGE_HASHES[key]!;
    if (hOmit !== hExpl) {
      fail(`${key}: omitted ≠ explicit 20`);
    } else if (hOmit !== expected) {
      fail(`${key}: drifted from pre-change (${hOmit.slice(0, 12)}…)`);
    } else {
      ok(`${key}: matches pre-change (${hOmit.slice(0, 12)}…)`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2–4. Rise sweep on Mila elastic — seam Δ, side/front, below-hip
// ---------------------------------------------------------------------------
console.log(
  "\n=== 2–4. Rise sweep (Mila elastic): CB seam, side/front, below-hip ===\n",
);
console.log(
  "body | rise | crotchLen | Δ vs20 | expect | sideY_b | sideY_f | frontHashΔ | belowHipLen | belowHip maxΔpts | slant | notes",
);

let stopCoupling = false;

for (const bod of bodies) {
  const body = applyEase(bod.body, MILA_TROUSER_STYLE.ease);
  const style20 = resolveStyle(MILA_TROUSER_STYLE, body, 20);
  const front20 = draftTrouserFront(body, style20);
  const frontHash20 = outlineHash(front20);
  const f20 = trouserFrontPoints(body, style20);
  const below20 = belowHipPoints(body, style20);
  const belowLen20 = polylineLength(below20);
  let crotch20 = 0;

  for (const rise of RISES) {
    const style = resolveStyle(MILA_TROUSER_STYLE, body, rise);
    const b = trouserBackPoints(body, style);
    const f = trouserFrontPoints(body, style);
    const back = draftTrouserBack(body, style);
    const front = draftTrouserFront(body, style);
    const crotch = back.seamLengths!.crotch;
    if (rise === 20) crotch20 = crotch;
    const delta = crotch - crotch20;
    const expect = rise - 20;
    const sideYb = b.p22.y;
    const sideYf = f.p11.y;
    const frontΔ = outlineHash(front) === frontHash20 ? 0 : 1;
    const below = belowHipPoints(body, style);
    const belowLen = polylineLength(below);
    const belowΔpts = maxPointDelta(below20, below);
    const slant = b.p21.y - b.p22.y; // CB − side (negative when CB above)
    const notes: string[] = [];

    if (Math.abs(delta - expect) > 0.5) {
      notes.push("SEAM≠1:1");
      fail(`${bod.name}@${rise}: crotch Δ ${f3(delta)} ≠ expect ${expect}`);
    }
    if (Math.abs(sideYb) > 0.05 || Math.abs(sideYf) > 0.05) {
      notes.push("SIDE_MOVED");
      fail(`${bod.name}@${rise}: side y moved (b=${sideYb} f=${sideYf})`);
    }
    if (Math.abs(b.p22.x - trouserBackPoints(body, style20).p22.x) > 0.05) {
      notes.push("p22.x_MOVED");
      fail(`${bod.name}@${rise}: back side x moved`);
    }
    if (frontΔ !== 0) {
      notes.push("FRONT_CHANGED");
      fail(`${bod.name}@${rise}: front outline changed`);
    }
    if (belowΔpts > BELOW_HIP_MAX_MM) {
      notes.push("BELOW_HIP_COUPLING");
      fail(
        `${bod.name}@${rise}: below-hip maxΔpts ${f3(belowΔpts)} > ${BELOW_HIP_MAX_MM} mm`,
      );
      stopCoupling = true;
    }
    if (Math.abs(f.p10.x - f20.p10.x) > 0.05 || Math.abs(f.p10.y - f20.p10.y) > 0.05) {
      notes.push("p10_MOVED");
      fail(`${bod.name}@${rise}: front p10 moved`);
    }

    console.log(
      `${bod.name} | ${rise} | ${f1(crotch)} | ${f1(delta)} | ${expect} | ${f1(sideYb)} | ${f1(sideYf)} | ${frontΔ} | ${f1(belowLen)} | ${f3(belowΔpts)} | ${f1(slant)} | ${notes.join(",") || "ok"}`,
    );
  }
}

if (stopCoupling) {
  console.log(
    "\n*** STOP: below-hip leave-dir coupling exceeds ~1–2 mm — do not proceed. ***\n",
  );
}

// ---------------------------------------------------------------------------
// 5. Clamp + resolver
// ---------------------------------------------------------------------------
console.log("\n=== 5. Clamp / resolver ===\n");
{
  const lo = resolveBackCbWaistRise({ backCbWaistRise: -10 });
  const hi = resolveBackCbWaistRise({ backCbWaistRise: 999 });
  if (lo !== BACK_CB_WAIST_RISE_MIN) fail(`clamp low → ${lo}`);
  else ok(`clamp low (−10) → ${lo}`);
  if (hi !== BACK_CB_WAIST_RISE_MAX) fail(`clamp high → ${hi}`);
  else ok(`clamp high (999) → ${hi}`);
  if (MILA_TROUSER_STYLE.backCbWaistRise !== null) {
    fail(`Mila backCbWaistRise=${MILA_TROUSER_STYLE.backCbWaistRise} (want null)`);
  } else ok("Mila preset leaves backCbWaistRise null (default 20)");
  if (CLEO_TROUSER_STYLE.backCbWaistRise !== null) {
    fail(`Cleo backCbWaistRise=${CLEO_TROUSER_STYLE.backCbWaistRise} (want null)`);
  } else ok("Cleo preset leaves backCbWaistRise null (default 20)");
  if (BLOCK_TROUSER_STYLE.backCbWaistRise !== null) {
    fail("Block style should clear backCbWaistRise");
  } else ok("Block style clears backCbWaistRise");
}

// ---------------------------------------------------------------------------
// 6. Slant at ~76 for casing brief
// ---------------------------------------------------------------------------
console.log("\n=== 6. Back top-edge slant at rise 76 (casing record) ===\n");
{
  const body = applyEase(helenBody(), MILA_TROUSER_STYLE.ease);
  const style = resolveStyle(MILA_TROUSER_STYLE, body, 76);
  const b = trouserBackPoints(body, style);
  const slant = Math.abs(b.p21.y - b.p22.y);
  console.log(
    `  Helen-print / Mila elastic: p21.y=${f1(b.p21.y)} p22.y=${f1(b.p22.y)} slant=|CB−side|=${f1(slant)} mm`,
  );
  console.log(
    "  Casing later: flat 50 mm turndown cannot fold level across this slant.",
  );
}

console.log(
  failures === 0
    ? "\n=== ACCEPT PASS ===\n"
    : `\n=== ACCEPT FAIL (${failures}) ===\n`,
);
process.exit(failures === 0 ? 0 : 1);
