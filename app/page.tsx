"use client";

import { useState } from "react";
import {
  BodyMeasurements,
  SKIRT_BODY_MEASUREMENTS,
} from "@/lib/types/measurements";
import { draftGatheredSkirt } from "@/lib/patterns/gatheredSkirt";
import { previewGatheredSkirt } from "@/lib/previews/gatheredSkirt";
import styles from "./page.module.css";

export default function Home() {
  const [measurements, setMeasurements] = useState<BodyMeasurements>({
    waist: 700,
    hip: 980,
    hipDepth: 200,
  });
  const [length, setLength] = useState(600); // mm, a style choice

  function updateMeasurement(key: keyof BodyMeasurements, value: number) {
    setMeasurements({ ...measurements, [key]: value });
  }

  // Domain code produces the pattern; this component only draws it.
  const pattern = draftGatheredSkirt(measurements, { length });
  const preview = previewGatheredSkirt(measurements, { length });

  const gap = 60;
  const rowGap = 80;
  const labelSpace = 44;

  function pieceBounds(piece: (typeof pattern.pieces)[number]) {
    const xs = piece.outline.map((p) => p.x);
    const ys = piece.outline.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  }

  const back = pattern.pieces.find((p) => p.name === "Back")!;
  const front = pattern.pieces.find((p) => p.name === "Front")!;
  const waistband = pattern.pieces.find((p) => p.name === "Waistband")!;

  const placed: {
    piece: (typeof pattern.pieces)[number];
    dx: number;
    dy: number;
    top: number;
    labelX: number;
  }[] = [];

  let row1X = 0;
  const row1Y = labelSpace;
  let row1Height = 0;
  for (const piece of [back, front]) {
    const { minX, minY, w, h } = pieceBounds(piece);
    placed.push({
      piece,
      dx: row1X - minX,
      dy: row1Y - minY,
      top: row1Y,
      labelX: row1X + w / 2,
    });
    row1X += w + gap;
    row1Height = Math.max(row1Height, h);
  }
  const row1Width = row1X - gap;

  const wb = pieceBounds(waistband);
  const row2Y = row1Y + row1Height + rowGap;
  const waistbandX = Math.max(0, (row1Width - wb.w) / 2);
  placed.push({
    piece: waistband,
    dx: waistbandX - wb.minX,
    dy: row2Y - wb.minY,
    top: row2Y,
    labelX: waistbandX + wb.w / 2,
  });

  const layoutWidth = Math.max(row1Width, waistbandX + wb.w);
  const layoutHeight = row2Y + wb.h;
  const pad = 60;
  const patternViewWidth = layoutWidth + pad * 2;
  const patternViewHeight = layoutHeight + pad * 2;
  const patternSvgWidth = 720;
  const patternSvgHeight = Math.round(
    patternSvgWidth * (patternViewHeight / patternViewWidth),
  );

  const previewPad = 40;
  const previewPoints = [
    ...preview.waistband,
    ...preview.skirt,
    ...preview.gatherLines.flatMap((line) => [line.from, line.to]),
  ];
  const previewXs = previewPoints.map((p) => p.x);
  const previewYs = previewPoints.map((p) => p.y);
  const previewMinX = Math.min(...previewXs);
  const previewMaxX = Math.max(...previewXs);
  const previewMinY = Math.min(...previewYs);
  const previewMaxY = Math.max(...previewYs);
  const previewWidth = previewMaxX - previewMinX + previewPad * 2;
  const previewHeight = previewMaxY - previewMinY + previewPad * 2;

  const polygonPoints = (pts: { x: number; y: number }[]) =>
    pts.map((p) => `${p.x},${p.y}`).join(" ");

  const pieceCount = pattern.pieces.reduce((n, p) => n + p.cutCount, 0);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo} aria-hidden />
          <div className={styles.brandText}>
            <h1>Cut on the Fold</h1>
            <p>Gathered skirt · slightly gathered</p>
          </div>
        </div>
        <p className={styles.headerMeta}>
          {pieceCount} pieces · updates as you edit
        </p>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Your measurements</h2>
            {SKIRT_BODY_MEASUREMENTS.map((def) => (
              <div key={def.key} className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={def.key}>
                  {def.label}
                </label>
                <span className={styles.fieldHint}>{def.hint}</span>
                <div className={styles.inputWrap}>
                  <input
                    id={def.key}
                    type="number"
                    min={def.min}
                    max={def.max}
                    value={measurements[def.key]}
                    onChange={(e) =>
                      updateMeasurement(def.key, Number(e.target.value))
                    }
                  />
                  <span className={styles.inputSuffix}>mm</span>
                </div>
              </div>
            ))}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Style</h2>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="length">
                Skirt length
              </label>
              <span className={styles.fieldHint}>
                Waist to hem — adjust to your preferred finished length.
              </span>
              <div className={styles.inputWrap}>
                <input
                  id="length"
                  type="number"
                  min={200}
                  max={1200}
                  value={length}
                  onChange={(e) => setLength(Number(e.target.value))}
                />
                <span className={styles.inputSuffix}>mm</span>
              </div>
            </div>
          </section>
        </aside>

        <div className={styles.canvasArea}>
          <div className={styles.summary}>
            <span className={styles.chip}>
              Waist <strong>{measurements.waist}</strong> mm
            </span>
            <span className={styles.chip}>
              Hip <strong>{measurements.hip}</strong> mm
            </span>
            <span className={styles.chip}>
              Length <strong>{length}</strong> mm
            </span>
          </div>

          <div className={styles.canvasGrid}>
            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Preview</h2>
                <span className={styles.cardSubtitle}>Stylised</span>
              </div>
              <div className={styles.cardBody}>
                <svg
                  width={340}
                  height={460}
                  viewBox={`${previewMinX - previewPad} ${previewMinY - previewPad} ${previewWidth} ${previewHeight}`}
                >
                  <polygon
                    points={polygonPoints(preview.skirt)}
                    fill="#ddd6f3"
                    stroke="#5a3e6b"
                    strokeWidth={4}
                  />
                  <polygon
                    points={polygonPoints(preview.waistband)}
                    fill="#b8a9c9"
                    stroke="#5a3e6b"
                    strokeWidth={4}
                  />
                  {preview.gatherLines.map((line, i) => (
                    <line
                      key={i}
                      x1={line.from.x}
                      y1={line.from.y}
                      x2={line.to.x}
                      y2={line.to.y}
                      stroke="#5a3e6b"
                      strokeWidth={2}
                    />
                  ))}
                </svg>
              </div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Pattern pieces</h2>
                <span className={styles.cardSubtitle}>Flat layout</span>
              </div>
              <div className={styles.cardBody}>
                <svg
                  width={patternSvgWidth}
                  height={patternSvgHeight}
                  viewBox={`${-pad} ${-pad} ${patternViewWidth} ${patternViewHeight}`}
                >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#5a3e6b" />
          </marker>
        </defs>

        {placed.map(({ piece, dx, dy, top, labelX }) => {
          const points = piece.outline.map((p) => `${p.x + dx},${p.y + dy}`).join(" ");
          return (
            <g key={piece.name}>
              <text x={labelX} y={top - 34} fontSize={22} fill="#333" textAnchor="middle">
                {piece.name}
              </text>

              <polygon points={points} fill="#cdb4db" stroke="#5a3e6b" strokeWidth={4} />

              {piece.markings.map((m, i) => {
                switch (m.kind) {
                  case "grainline":
                    return (
                      <line key={i}
                        x1={m.line.from.x + dx} y1={m.line.from.y + dy}
                        x2={m.line.to.x + dx} y2={m.line.to.y + dy}
                        stroke="#5a3e6b" strokeWidth={3}
                        markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                    );
                  case "foldLine":
                    return (
                      <line key={i}
                        x1={m.line.from.x + dx} y1={m.line.from.y + dy}
                        x2={m.line.to.x + dx} y2={m.line.to.y + dy}
                        stroke="#5a3e6b" strokeWidth={3} strokeDasharray="18 12" />
                    );
                  case "placeOnFold": {
                    const A = m.line.from;
                    const B = m.line.to;
                    const n = m.inward;
                    const edgeDx = B.x - A.x;
                    const edgeDy = B.y - A.y;
                    const edgeLen = Math.hypot(edgeDx, edgeDy);
                    const u = { x: edgeDx / edgeLen, y: edgeDy / edgeLen };
                    const p1 = { x: A.x + 30 * u.x, y: A.y + 30 * u.y };
                    const p2 = { x: p1.x + 15 * n.x, y: p1.y + 15 * n.y };
                    const p3 = {
                      x: B.x - 30 * u.x + 15 * n.x,
                      y: B.y - 30 * u.y + 15 * n.y,
                    };
                    const p4 = { x: B.x - 30 * u.x, y: B.y - 30 * u.y };
                    const bracket = [p1, p2, p3, p4]
                      .map((p) => `${p.x + dx},${p.y + dy}`)
                      .join(" ");
                    const midX = (A.x + B.x) / 2 + dx;
                    const midY = (A.y + B.y) / 2 + dy;
                    const labelX = midX + 25 * n.x;
                    const labelY = midY + 25 * n.y;
                    const labelAngle = (Math.atan2(u.y, u.x) * 180) / Math.PI;
                    return (
                      <g key={i}>
                        <polyline
                          points={bracket}
                          fill="none"
                          stroke="#5a3e6b"
                          strokeWidth={3}
                        />
                        {m.label && (
                          <text
                            x={labelX}
                            y={labelY}
                            fontSize={18}
                            fill="#333"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            transform={`rotate(${labelAngle}, ${labelX}, ${labelY})`}
                          >
                            {m.label}
                          </text>
                        )}
                      </g>
                    );
                  }
                  case "gather": {
                    const A = m.line.from;
                    const B = m.line.to;
                    const edgeDx = B.x - A.x;
                    const edgeDy = B.y - A.y;
                    const edgeLen = Math.hypot(edgeDx, edgeDy);
                    const u = { x: edgeDx / edgeLen, y: edgeDy / edgeLen };
                    let n = { x: -edgeDy / edgeLen, y: edgeDx / edgeLen };
                    if (n.y < 0) {
                      n = { x: -n.x, y: -n.y };
                    }
                    const endInset = 30;
                    const belowOffset = 25;
                    const from = {
                      x: A.x + endInset * u.x + belowOffset * n.x,
                      y: A.y + endInset * u.y + belowOffset * n.y,
                    };
                    const to = {
                      x: B.x - endInset * u.x + belowOffset * n.x,
                      y: B.y - endInset * u.y + belowOffset * n.y,
                    };
                    const x1 = from.x + dx;
                    const y1 = from.y + dy;
                    const x2 = to.x + dx;
                    const y2 = to.y + dy;
                    const mx = (x1 + x2) / 2;
                    const my = (y1 + y2) / 2;
                    return (
                      <g key={i}>
                        <line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="#5a3e6b"
                          strokeWidth={3}
                          strokeDasharray="18 12"
                          markerStart="url(#arrow)"
                          markerEnd="url(#arrow)"
                        />
                        <text
                          x={mx + n.x * 18}
                          y={my + n.y * 18}
                          fontSize={16}
                          fill="#333"
                          textAnchor="middle"
                        >
                          gather
                        </text>
                      </g>
                    );
                  }
                  case "notch": {
                    const cx = m.at.x + dx;
                    const cy = m.at.y + dy;
                    if (m.dir) {
                      const depth = 14;
                      const halfWidth = 7;
                      const nx = m.dir.x;
                      const ny = m.dir.y;
                      const px = -ny;
                      const py = nx;
                      const apexX = cx + nx * depth;
                      const apexY = cy + ny * depth;
                      const notchPoints = [
                        `${apexX},${apexY}`,
                        `${cx + px * halfWidth},${cy + py * halfWidth}`,
                        `${cx - px * halfWidth},${cy - py * halfWidth}`,
                      ].join(" ");
                      return (
                        <g key={i}>
                          <polygon points={notchPoints} fill="#5a3e6b" />
                          {m.label && (
                            <text
                              x={cx + nx * (depth + 12)}
                              y={cy + ny * (depth + 12)}
                              fontSize={18}
                              fill="#333"
                              textAnchor="middle"
                            >
                              {m.label}
                            </text>
                          )}
                        </g>
                      );
                    }
                    return (
                      <g key={i}>
                        <polygon
                          points={`${m.at.x + dx - 7},${m.at.y + dy} ${m.at.x + dx + 7},${m.at.y + dy} ${m.at.x + dx},${m.at.y + dy + 14}`}
                          fill="#5a3e6b" />
                        {m.label && (
                          <text x={m.at.x + dx} y={m.at.y + dy - 8} fontSize={18}
                                fill="#333" textAnchor="middle">{m.label}</text>
                        )}
                      </g>
                    );
                  }
                  case "button": {
                    const s = 9, cx = m.at.x + dx, cy = m.at.y + dy;
                    return (
                      <g key={i} stroke="#5a3e6b" strokeWidth={3}>
                        <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} />
                        <line x1={cx - s} y1={cy + s} x2={cx + s} y2={cy - s} />
                      </g>
                    );
                  }
                  case "buttonhole": {
                    const s = 9, cx = m.at.x + dx, cy = m.at.y + dy;
                    return <line key={i} x1={cx - s} y1={cy} x2={cx + s} y2={cy}
                                 stroke="#5a3e6b" strokeWidth={3} />;
                  }
                  case "constructionLine":
                    return (
                      <line key={i}
                        x1={m.line.from.x + dx} y1={m.line.from.y + dy}
                        x2={m.line.to.x + dx} y2={m.line.to.y + dy}
                        stroke="#5a3e6b" strokeWidth={3} />
                    );
                  default:
                    return null;
                }
              })}
            </g>
          );
        })}
                </svg>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}