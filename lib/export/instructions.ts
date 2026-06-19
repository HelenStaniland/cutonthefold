import { jsPDF } from "jspdf";
import { cutLabel } from "@/lib/types/measurements";
import type { ConstructionStep, Pattern } from "@/lib/types/measurements";

const MARGIN = 20;
const LINE = 6;
const TITLE = 18;
const HEADING = 13;
const BODY = 11;

export function downloadInstructions(
  pattern: Pattern,
  steps: ConstructionStep[],
  title = "Cut on the Fold — Trouser block",
): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const textW = pageW - 2 * MARGIN;
  let y = MARGIN;

  const ensure = (needed: number) => {
    if (y + needed > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  doc.setFontSize(TITLE);
  doc.text(title, MARGIN, y);
  y += 11;

  doc.setFontSize(HEADING);
  doc.text("Cut", MARGIN, y);
  y += 7;
  doc.setFontSize(BODY);
  for (const piece of pattern.pieces) {
    ensure(LINE);
    doc.text(`•  ${piece.name} — ${cutLabel(piece)}`, MARGIN, y);
    y += LINE;
  }
  y += 5;

  ensure(10);
  doc.setFontSize(HEADING);
  doc.text("Method", MARGIN, y);
  y += 7;
  doc.setFontSize(BODY);
  steps.forEach((step, i) => {
    const names = step.highlight?.map((h) => h.piece) ?? [];
    const tag = names.length ? `  (${[...new Set(names)].join(", ")})` : "";
    const lines = doc.splitTextToSize(`${i + 1}.  ${step.text}${tag}`, textW);
    ensure(lines.length * LINE + 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * LINE + 2;
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(9);
    doc.text(`${p} / ${pages}`, pageW - MARGIN, pageH - 10, { align: "right" });
  }

  doc.save("cutonthefold-instructions.pdf");
}
