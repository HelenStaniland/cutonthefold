"use client";

import { useMemo, useState } from "react";
import {
  BodyMeasurements,
  SKIRT_BODY_MEASUREMENTS,
} from "@/lib/types/measurements";
import {
  DEFAULT_SIZE_CODE,
  STANDARD_SIZES,
  bodyForSizeCode,
} from "@/lib/data/standardSizes";
import { draftGatheredSkirt, gatheredSkirtInstructions, GatheredSkirtFit, validateGatheredSkirt } from "@/lib/patterns/gatheredSkirt";
import { previewGatheredSkirt } from "@/lib/previews/gatheredSkirt";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "@/lib/geometry/seamAllowance";
import {
  edgeRunsForRoles,
  findPieceHighlight,
  isWholePieceTarget,
  runToNetPolyline,
  runToPolyline,
} from "@/lib/patternHighlight";
import styles from "./page.module.css";
import { NumericInput } from "./NumericInput";

type UiSkin = "default" | "studio";

const GRID_SPACING_MM = 50;

type GridLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  major: boolean;
};

function referenceGridLines(
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): GridLine[] {
  const lines: GridLine[] = [];
  const gridXMin = Math.floor(xMin / GRID_SPACING_MM) * GRID_SPACING_MM;
  const gridXMax = Math.ceil(xMax / GRID_SPACING_MM) * GRID_SPACING_MM;
  const gridYMin = Math.floor(yMin / GRID_SPACING_MM) * GRID_SPACING_MM;
  const gridYMax = Math.ceil(yMax / GRID_SPACING_MM) * GRID_SPACING_MM;

  for (let x = gridXMin; x <= gridXMax; x += GRID_SPACING_MM) {
    lines.push({
      x1: x,
      y1: yMin,
      x2: x,
      y2: yMax,
      major: x % 100 === 0,
    });
  }
  for (let y = gridYMin; y <= gridYMax; y += GRID_SPACING_MM) {
    lines.push({
      x1: xMin,
      y1: y,
      x2: xMax,
      y2: y,
      major: y % 100 === 0,
    });
  }
  return lines;
}

export default function Home() {
  const defaultBody = bodyForSizeCode(DEFAULT_SIZE_CODE)!;
  const [selectedSize, setSelectedSize] = useState<string>(DEFAULT_SIZE_CODE);
  const [measurements, setMeasurements] = useState<BodyMeasurements>(defaultBody);
  const [length, setLength] = useState(600); // mm, a style choice
  const [fit, setFit] = useState<GatheredSkirtFit>({ fullness: 150 });
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [uiSkin, setUiSkin] = useState<UiSkin>("studio");
  const [showGrid, setShowGrid] = useState(true);
  const pageClass = uiSkin === "studio" ? styles.pageStudio : styles.page;

  function updateMeasurement(key: keyof BodyMeasurements, value: number) {
    setMeasurements((prev) => {
      const next = { ...prev, [key]: value };
      setSelectedSize((current) => {
        if (current === "custom") {
          return current;
        }
        const sizeBody = bodyForSizeCode(current);
        if (!sizeBody) {
          return "custom";
        }
        const matchesPreset =
          next.waist === sizeBody.waist &&
          next.hip === sizeBody.hip &&
          next.hipDepth === sizeBody.hipDepth;
        return matchesPreset ? current : "custom";
      });
      return next;
    });
  }

  function selectStandardSize(code: string) {
    if (code === "custom") {
      setSelectedSize("custom");
      return;
    }
    const body = bodyForSizeCode(code);
    if (body) {
      setSelectedSize(code);
      setMeasurements(body);
    }
  }

  const style = { length };

  // Domain code produces the pattern; this component only draws it.
  const validation = validateGatheredSkirt(measurements, fit, style);
  const flaggedFields = new Set(
    validation.issues.flatMap((issue) => issue.fields ?? []),
  );
  const net = draftGatheredSkirt(measurements, fit, style);
  const pattern = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const preview = previewGatheredSkirt(measurements, fit, style);
  const method = gatheredSkirtInstructions();
  const selectedStep = method.find((step) => step.id === selectedStepId);
  const activeHighlights = selectedStep?.highlight ?? [];
  const stepSelectionActive = selectedStepId !== null;

  const gap = 60;
  const rowGap = 80;
  const labelSpace = 44;

  function pieceBoundary(piece: (typeof pattern.pieces)[number]) {
    return piece.cuttingOutline ?? piece.outline.map((p) => p.at);
  }

  function pieceBounds(piece: (typeof pattern.pieces)[number]) {
    const boundary = pieceBoundary(piece);
    const xs = boundary.map((p) => p.x);
    const ys = boundary.map((p) => p.y);
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
  const sheetInset = 36;
  const sheetX = -sheetInset;
  const sheetY = 0;
  const sheetWidth = layoutWidth + sheetInset * 2;
  const sheetHeight = layoutHeight + sheetInset;
  const patternViewWidth = layoutWidth + pad * 2;
  const patternViewHeight = layoutHeight + pad * 2;
  const patternSvgWidth = 720;
  const patternSvgHeight = Math.round(
    patternSvgWidth * (patternViewHeight / patternViewWidth),
  );
  const referenceGrid = useMemo(
    () =>
      referenceGridLines(
        sheetX,
        sheetX + sheetWidth,
        sheetY,
        sheetY + sheetHeight,
      ),
    [sheetX, sheetY, sheetWidth, sheetHeight],
  );

  const previewPad = 40;
  const previewPoints = preview
    ? [
        ...preview.waistband,
        ...preview.skirt,
        ...preview.gatherLines.flatMap((line) => [line.from, line.to]),
      ]
    : [];
  const previewXs = previewPoints.map((p) => p.x);
  const previewYs = previewPoints.map((p) => p.y);
  const previewMinX = preview && previewPoints.length > 0 ? Math.min(...previewXs) : -200;
  const previewMaxX = preview && previewPoints.length > 0 ? Math.max(...previewXs) : 200;
  const previewMinY = preview && previewPoints.length > 0 ? Math.min(...previewYs) : 0;
  const previewMaxY = preview && previewPoints.length > 0 ? Math.max(...previewYs) : 640;
  const previewWidth = previewMaxX - previewMinX + previewPad * 2;
  const previewHeight = previewMaxY - previewMinY + previewPad * 2;

  const polygonPoints = (pts: { x: number; y: number }[]) =>
    pts.map((p) => `${p.x},${p.y}`).join(" ");

  const pieceCount = pattern.pieces.reduce((n, p) => n + p.cutCount, 0);

  return (
    <div className={pageClass}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo} aria-hidden />
          <div className={styles.brandText}>
            <h1>Cut on the Fold</h1>
            <p>Gathered skirt</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.themeToggle} role="group" aria-label="UI style comparison">
            <button
              type="button"
              className={uiSkin === "default" ? styles.themeToggleActive : undefined}
              onClick={() => setUiSkin("default")}
            >
              Warm
            </button>
            <button
              type="button"
              className={uiSkin === "studio" ? styles.themeToggleActive : undefined}
              onClick={() => setUiSkin("studio")}
            >
              Studio
            </button>
          </div>
          <p className={styles.headerMeta}>
            {validation.valid
              ? `${pieceCount} pieces · updates as you edit`
              : `${validation.issues.length} check${validation.issues.length === 1 ? "" : "s"} need attention`}
          </p>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Your measurements</h2>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="standard-size">
                Standard size
              </label>
              <span className={styles.fieldHint}>
                Aldrich standard sizing — fills the body measurements below.
              </span>
              <select
                id="standard-size"
                className={styles.sizeSelect}
                value={selectedSize}
                onChange={(e) => selectStandardSize(e.target.value)}
              >
                {STANDARD_SIZES.map((size) => (
                  <option key={size.code} value={size.code}>
                    {size.code}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </div>
            {SKIRT_BODY_MEASUREMENTS.map((def) => (
              <div key={def.key} className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={def.key}>
                  {def.label}
                </label>
                <span className={styles.fieldHint}>{def.hint}</span>
                <div
                  className={`${styles.inputWrap} ${flaggedFields.has(def.key) ? styles.inputWrapInvalid : ""}`}
                >
                  <NumericInput
                    id={def.key}
                    min={def.min}
                    max={def.max}
                    value={measurements[def.key]}
                    onChange={(value) => updateMeasurement(def.key, value)}
                  />
                  <span className={styles.inputSuffix}>mm</span>
                </div>
              </div>
            ))}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Fit</h2>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="fullness">
                Fullness allowance
              </label>
              <span className={styles.fieldHint}>
                Extra width beyond quarter-hip — Aldrich&apos;s slightly gathered
                skirt uses 150&nbsp;mm (15&nbsp;cm).
              </span>
              <div className={styles.inputWrap}>
                <NumericInput
                  id="fullness"
                  min={0}
                  max={400}
                  value={fit.fullness}
                  onChange={(fullness) => setFit({ fullness })}
                />
                <span className={styles.inputSuffix}>mm</span>
              </div>
            </div>
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
                <NumericInput
                  id="length"
                  min={200}
                  max={1200}
                  value={length}
                  onChange={setLength}
                />
                <span className={styles.inputSuffix}>mm</span>
              </div>
            </div>
          </section>

          {validation.issues.length > 0 && (
            <section className={styles.section} aria-live="polite">
              <h2 className={styles.sectionTitle}>Checks</h2>
              <ul className={styles.issueList}>
                {validation.issues.map((issue, i) => (
                  <li
                    key={i}
                    className={
                      issue.severity === "error"
                        ? styles.issueError
                        : styles.issueWarning
                    }
                  >
                    {issue.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
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
              Fullness <strong>{fit.fullness}</strong> mm
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
                {preview ? (
                  <svg
                    width={340}
                    height={460}
                    viewBox={`${previewMinX - previewPad} ${previewMinY - previewPad} ${previewWidth} ${previewHeight}`}
                  >
                    <polygon
                      points={polygonPoints(preview.skirt)}
                      className={styles.previewSkirt}
                    />
                    <polygon
                      points={polygonPoints(preview.waistband)}
                      className={styles.previewWaistband}
                    />
                    {preview.gatherLines.map((line, i) => (
                      <line
                        key={i}
                        x1={line.from.x}
                        y1={line.from.y}
                        x2={line.to.x}
                        y2={line.to.y}
                        className={styles.previewLine}
                      />
                    ))}
                  </svg>
                ) : (
                  <div className={styles.canvasUnavailable}>
                    <p className={styles.canvasUnavailableTitle}>Preview unavailable</p>
                    <p className={styles.canvasUnavailableMessage}>
                      {validation.issues[0]?.message ??
                        "Fix the checks in the sidebar to see a preview."}
                    </p>
                  </div>
                )}
              </div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Pattern pieces</h2>
                <div className={styles.cardHeaderActions}>
                  <label className={styles.gridToggle}>
                    <input
                      type="checkbox"
                      checked={showGrid}
                      onChange={(e) => setShowGrid(e.target.checked)}
                    />
                    Show grid (5 cm)
                  </label>
                  <span className={styles.cardSubtitle}>Flat layout</span>
                </div>
              </div>
              <div className={`${styles.cardBody} ${styles.patternCardBody}`}>
                {validation.valid ? (
                <svg
                  width={patternSvgWidth}
                  height={patternSvgHeight}
                  viewBox={`${-pad} ${-pad} ${patternViewWidth} ${patternViewHeight}`}
                >
        <defs>
          <filter id="paperShadow" x="-8%" y="-8%" width="116%" height="116%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#2c2420" floodOpacity="0.1" />
          </filter>
          <marker id="grainArrow" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#2d6a4f" />
          </marker>
          <marker id="instructionArrow" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#4a6741" />
          </marker>
          <clipPath id="paperClip">
            <rect x={sheetX} y={sheetY} width={sheetWidth} height={sheetHeight} />
          </clipPath>
        </defs>

        <rect
          x={sheetX}
          y={sheetY}
          width={sheetWidth}
          height={sheetHeight}
          className={styles.paperSheet}
          filter="url(#paperShadow)"
        />

        {showGrid && (
          <g
            className={styles.referenceGrid}
            clipPath="url(#paperClip)"
            pointerEvents="none"
          >
            {referenceGrid.map((line, i) => (
              <line
                key={i}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                className={
                  line.major ? styles.gridLineMajor : styles.gridLine
                }
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )}

        {placed.map(({ piece, dx, dy, top, labelX }) => {
          const boundary = pieceBoundary(piece);
          const cutPoints = boundary
            .map((p) => `${p.x + dx},${p.y + dy}`)
            .join(" ");
          const netPoints = piece.outline
            .map((p) => `${p.at.x + dx},${p.at.y + dy}`)
            .join(" ");
          const hasCuttingLine = piece.cuttingOutline !== undefined;
          const pieceHighlight = findPieceHighlight(piece.name, activeHighlights);
          const wholePieceHighlighted =
            pieceHighlight !== undefined && isWholePieceTarget(pieceHighlight);
          const edgeRuns =
            pieceHighlight &&
            !wholePieceHighlighted &&
            pieceHighlight.edges &&
            pieceHighlight.edges.length > 0
              ? edgeRunsForRoles(piece.outline, pieceHighlight.edges)
              : [];
          const dimBase =
            stepSelectionActive &&
            (pieceHighlight === undefined || edgeRuns.length > 0);
          const baseOpacity = dimBase ? 0.22 : 1;

          return (
            <g key={piece.name}>
              <g opacity={baseOpacity}>
              <text
                x={labelX}
                y={top - labelSpace / 2}
                className={styles.pieceTitle}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {piece.name}
              </text>

              <polygon
                points={hasCuttingLine ? cutPoints : netPoints}
                className={styles.cutLine}
              />
              {hasCuttingLine && (
                <polygon
                  points={netPoints}
                  className={styles.stitchLine}
                />
              )}

              {piece.markings.map((m, i) => {
                switch (m.kind) {
                  case "grainline":
                    return (
                      <line key={i}
                        x1={m.line.from.x + dx} y1={m.line.from.y + dy}
                        x2={m.line.to.x + dx} y2={m.line.to.y + dy}
                        className={styles.grainline}
                        markerStart="url(#grainArrow)" markerEnd="url(#grainArrow)" />
                    );
                  case "foldLine":
                    return (
                      <line key={i}
                        x1={m.line.from.x + dx} y1={m.line.from.y + dy}
                        x2={m.line.to.x + dx} y2={m.line.to.y + dy}
                        className={styles.foldLine} />
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
                          className={styles.foldMark}
                        />
                        {m.label && (
                          <text
                            x={labelX}
                            y={labelY}
                            className={styles.patternLabel}
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
                          className={styles.instructionLine}
                          markerStart="url(#instructionArrow)"
                          markerEnd="url(#instructionArrow)"
                        />
                        <text
                          x={mx + n.x * 18}
                          y={my + n.y * 18}
                          className={styles.patternLabel}
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
                      const depth = m.depth ?? 14;
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
                          <polygon points={notchPoints} className={styles.notch} />
                          {m.label && (
                            <text
                              x={cx + nx * (depth + 12)}
                              y={cy + ny * (depth + 12)}
                              className={styles.patternLabel}
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
                          className={styles.notch} />
                        {m.label && (
                          <text x={m.at.x + dx} y={m.at.y + dy - 8}
                                className={styles.patternLabel}
                                textAnchor="middle">{m.label}</text>
                        )}
                      </g>
                    );
                  }
                  case "button": {
                    const s = 9, cx = m.at.x + dx, cy = m.at.y + dy;
                    return (
                      <g key={i} className={styles.hardwareMark}>
                        <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} />
                        <line x1={cx - s} y1={cy + s} x2={cx + s} y2={cy - s} />
                      </g>
                    );
                  }
                  case "buttonhole": {
                    const s = 9, cx = m.at.x + dx, cy = m.at.y + dy;
                    return <line key={i} x1={cx - s} y1={cy} x2={cx + s} y2={cy}
                                 className={styles.hardwareMark} />;
                  }
                  case "constructionLine":
                    return (
                      <line key={i}
                        x1={m.line.from.x + dx} y1={m.line.from.y + dy}
                        x2={m.line.to.x + dx} y2={m.line.to.y + dy}
                        className={styles.constructionLine} />
                    );
                  default:
                    return null;
                }
              })}
              </g>

              {stepSelectionActive && wholePieceHighlighted && (
                <polygon
                  points={cutPoints}
                  className={styles.stepHighlight}
                />
              )}

              {stepSelectionActive &&
                edgeRuns.map((run) => {
                  const cutSegment = runToPolyline(boundary, run, dx, dy);
                  const netSegment = runToNetPolyline(piece, run, dx, dy);
                  return (
                    <g key={`${run.role}-${run.startIndex}`}>
                      <polyline
                        points={cutSegment}
                        className={styles.cutLine}
                      />
                      {hasCuttingLine && (
                        <polyline
                          points={netSegment}
                          className={styles.stitchLine}
                        />
                      )}
                      <polyline
                        points={cutSegment}
                        className={styles.stepHighlight}
                      />
                    </g>
                  );
                })}
            </g>
          );
        })}
                </svg>
                ) : (
                  <div className={styles.canvasUnavailable}>
                    <p className={styles.canvasUnavailableTitle}>Pattern unavailable</p>
                    <p className={styles.canvasUnavailableMessage}>
                      {validation.issues[0]?.message ??
                        "Fix the checks in the sidebar to see pattern pieces."}
                    </p>
                  </div>
                )}
              </div>
            </article>
          </div>

          {validation.valid && (
            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Method</h2>
                <span className={styles.cardSubtitle}>Construction order</span>
              </div>
              <div className={styles.methodBody}>
                <ol className={styles.methodList}>
                  {method.map((step) => (
                    <li
                      key={step.id}
                      className={`${styles.methodStep} ${selectedStepId === step.id ? styles.methodStepSelected : ""}`}
                      onClick={() =>
                        setSelectedStepId((id) =>
                          id === step.id ? null : step.id,
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedStepId((id) =>
                            id === step.id ? null : step.id,
                          );
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedStepId === step.id}
                    >
                      {step.text}
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}