/**
 * Run: npx tsx scripts/verify-crotch-extension-scale.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEase, type Point } from "../lib/types/measurements";
import { bodyForSizeCode } from "../lib/data/standardSizes";
import {
  backCrotchTouch,
  draftTrouserBack,
  draftTrouserFront,
  frontCrotchExtension,
  frontCrotchTouch,
  resolveCrotchExtensionScale,
  trouserBackPoints,
  trouserFrontPoints,
  type TrouserFrontStyle,
} from "../lib/patterns/trouserBlock";

function cm(mm: number) {
  return (mm / 10).toFixed(2);
}

function svgPath(pts: Point[]): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

function crotchRole(piece: ReturnType<typeof draftTrouserFront>): Point[] {
  return piece.outline.filter((o) => o.role === "crotch").map((o) => o.at);
}

const chart = bodyForSizeCode("12")!;
// Owner body from brief: hip 1100 + 50 mm ease → drafted 1150.
const body = applyEase(
  { ...chart, hip: 1100 },
  { waist: 10, hip: 50 },
);
const H = body.hip;
console.log(`Drafted hip H = ${H} mm (${cm(H)} cm) — owner hip 1100 + 50 ease`);

const base: TrouserFrontStyle = { bottomWidth: 220, block: "classic", waistDrop: 0 };

// Byte-identical: omitted scale vs explicit 1.0
const fOmit = trouserFrontPoints(body, base);
const bOmit = trouserBackPoints(body, base);
const fOne = trouserFrontPoints(body, { ...base, crotchExtensionScale: 1.0 });
const bOne = trouserBackPoints(body, { ...base, crotchExtensionScale: 1.0 });
const frontPieceOmit = draftTrouserFront(body, base);
const frontPieceOne = draftTrouserFront(body, {
  ...base,
  crotchExtensionScale: 1.0,
});
const backPieceOmit = draftTrouserBack(body, base);
const backPieceOne = draftTrouserBack(body, {
  ...base,
  crotchExtensionScale: 1.0,
});

function ptsEqual(
  a: Record<string, Point>,
  b: Record<string, Point>,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

console.log("\n=== scale 1.0 byte-identical to omitted (Aldrich default) ===");
console.log("front points", ptsEqual(fOmit, fOne));
console.log("back points", ptsEqual(bOmit, bOne));
console.log(
  "front outline",
  JSON.stringify(frontPieceOmit.outline) === JSON.stringify(frontPieceOne.outline),
);
console.log(
  "back outline",
  JSON.stringify(backPieceOmit.outline) === JSON.stringify(backPieceOne.outline),
);

console.log("\n=== Extension + touch at owner body ===");
console.log(
  "scale | front ext | back (p16→p23) | front touch | back touch",
);
for (const scale of [1.0, 0.7, 0.5]) {
  const style = { ...base, crotchExtensionScale: scale };
  const s = resolveCrotchExtensionScale(style);
  const ext = frontCrotchExtension(H, s);
  const f = trouserFrontPoints(body, style);
  const b = trouserBackPoints(body, style);
  const frontExt = Math.abs(f.p9.x - f.p5.x);
  const backExt = Math.abs(b.p23.x - b.p16.x);
  const ft = frontCrotchTouch(H) * s;
  const bt = backCrotchTouch(H) * s;
  console.log(
    `${s.toFixed(1)}   | ${cm(frontExt)} cm   | ${cm(backExt)} cm        | ${cm(ft)} cm     | ${cm(bt)} cm`,
  );
  console.log(
    `       (helper ext ${cm(ext)} cm; Δp9−p23 add ${cm(Math.abs(f.p9.x - b.p23.x))} cm)`,
  );
}

console.log("\n=== vs Cleo (same drafted hip) ===");
console.log("Cleo front 4.5 / back 14.0 / touch 2.0 / 3.5");
const s05 = 0.5;
const f05 = trouserFrontPoints(body, { ...base, crotchExtensionScale: s05 });
const b05 = trouserBackPoints(body, { ...base, crotchExtensionScale: s05 });
const ourF = Math.abs(f05.p9.x - f05.p5.x) / 10;
const ourB = Math.abs(b05.p23.x - b05.p16.x) / 10;
const ourFt = (frontCrotchTouch(H) * s05) / 10;
const ourBt = (backCrotchTouch(H) * s05) / 10;
console.log(
  `Ours@0.5 front ${ourF.toFixed(2)} (gap ${ (ourF - 4.5).toFixed(2) })  back ${ourB.toFixed(2)} (gap ${(ourB - 14.0).toFixed(2)})`,
);
console.log(
  `Ours@0.5 touch F ${ourFt.toFixed(2)} (gap ${(ourFt - 2.0).toFixed(2)})  B ${ourBt.toFixed(2)} (gap ${(ourBt - 3.5).toFixed(2)})`,
);
if (Math.abs(ourBt - 3.5) > 0.8) {
  console.log(
    "FLAG: back touch at 0.5 diverges from Cleo's 3.5 cm — scaled Aldrich offset, not hand-tuned.",
  );
}

// Renders at 0.5 — crotch region front + back
const front05 = draftTrouserFront(body, { ...base, crotchExtensionScale: 0.5 });
const back05 = draftTrouserBack(body, { ...base, crotchExtensionScale: 0.5 });
const front10 = draftTrouserFront(body, { ...base, crotchExtensionScale: 1.0 });
const front07 = draftTrouserFront(body, { ...base, crotchExtensionScale: 0.7 });

function crotchSvg(
  pieces: { label: string; crotch: Point[]; color: string }[],
  filename: string,
) {
  const all = pieces.flatMap((p) => p.crotch);
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(...xs) - 20;
  const maxX = Math.max(...xs) + 20;
  const minY = Math.min(...ys) - 20;
  const maxY = Math.max(...ys) + 40;
  const w = maxX - minX;
  const h = maxY - minY;
  const paths = pieces
    .map(
      (p) =>
        `<path d="${svgPath(p.crotch.map((q) => ({ x: q.x - minX, y: q.y - minY })))}" fill="none" stroke="${p.color}" stroke-width="2"/>
    <text x="8" y="${8 + pieces.indexOf(p) * 16}" font-size="12" fill="${p.color}">${p.label}</text>`,
    )
    .join("\n    ");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">
  <rect width="100%" height="100%" fill="#faf8f5"/>
  ${paths}
</svg>
`;
  const out = join(process.cwd(), "scripts", filename);
  writeFileSync(out, svg);
  console.log(`Wrote ${out}`);
}

crotchSvg(
  [
    { label: "front scale 1.0", crotch: crotchRole(front10), color: "#888" },
    { label: "front scale 0.7", crotch: crotchRole(front07), color: "#4a7" },
    { label: "front scale 0.5", crotch: crotchRole(front05), color: "#c44" },
  ],
  "crotch-extension-front-scales.svg",
);

crotchSvg(
  [
    {
      label: "front @0.5",
      crotch: crotchRole(front05),
      color: "#c44",
    },
    {
      label: "back @0.5",
      crotch: crotchRole(back05),
      color: "#48a",
    },
  ],
  "crotch-extension-scale05.svg",
);
