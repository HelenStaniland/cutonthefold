"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMeasurements } from "@/app/measurements-context";
import {
  draftTrousers,
  trouserConstruction,
  trouserInstructions,
  TROUSER_LAYOUT_ANCHOR_Y,
  validateTrousers,
} from "@/lib/patterns/trouserBlock";
import { downloadPattern } from "@/lib/export/pdf";
import { notchSegments } from "@/lib/pattern/markingGeometry";
import { previewTrousers } from "@/lib/previews/trouserBlock";
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
import styles from "@/app/shell.module.css";
import { NumericInput } from "@/app/NumericInput";
import type { DraftingLineKind } from "@/lib/types/measurements";
import { cutLabel } from "@/lib/types/measurements";

const GRID_SPACING_MM = 50;

type PatternViewMode = "pattern" | "construction";

const DRAFT_LINE_CLASS: Record<DraftingLineKind, string> = {
  construction: "draftConstructionLine",
  helper: "draftHelperLine",
  curveControl: "draftCurveControlLine",
};

const DRAFT_LINE_ORDER: DraftingLineKind[] = [
  "helper",
  "construction",
  "curveControl",
];

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

export default function TailoredTrousersPage() {
  const { body } = useMeasurements();
  const [legBottomWidth, setLegBottomWidth] = useState(220);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [viewMode, setViewMode] = useState<PatternViewMode>("pattern");
  const [showSeamAllowance, setShowSeamAllowance] = useState(true);

  const style = { bottomWidth: legBottomWidth };

  const validation = validateTrousers(body, style);
  const net = draftTrousers(body, style);
  const construction = validation.valid ? trouserConstruction(body, style) : [];
  const pattern = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const displayPattern = showSeamAllowance ? pattern : net;
  const preview = previewTrousers(body, style);
  const method = trouserInstructions();
  const selectedStep = method.find((step) => step.id === selectedStepId);
  const activeHighlights = selectedStep?.highlight ?? [];
  const stepSelectionActive = selectedStepId !== null;

  const gap = 60;
  const rowGap = 60;
  const labelSpace = 44;
  const sheetInset = 36;
  const sheetTopMargin = 28;
  const pad = 60;

  function pieceBoundary(piece: (typeof displayPattern.pieces)[number]) {
    return piece.cuttingOutline ?? piece.outline.map((p) => p.at);
  }

  function pieceBounds(piece: (typeof displayPattern.pieces)[number]) {
    const boundary = pieceBoundary(piece);
    const xs = boundary.map((p) => p.x);
    const ys = boundary.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return {
      minX,
      minY,
      maxX,
      maxY,
      w: maxX - minX,
      h: maxY - minY,
    };
  }

  const front = displayPattern.pieces.find((p) => p.name === "Trouser front")!;
  const back = displayPattern.pieces.find((p) => p.name === "Trouser back")!;
  const waistband = displayPattern.pieces.find((p) => p.name === "Waistband")!;
  const frontBounds = pieceBounds(front);
  const backBounds = pieceBounds(back);
  const layoutMinY = Math.min(
    TROUSER_LAYOUT_ANCHOR_Y,
    frontBounds.minY,
    backBounds.minY,
  );
  const layoutMaxY = Math.max(frontBounds.maxY, backBounds.maxY);

  const placed: {
    piece: (typeof displayPattern.pieces)[number];
    dx: number;
    dy: number;
    top: number;
    labelX: number;
  }[] = [];

  const rowY = labelSpace;
  let rowX = 0;
  for (const piece of [front, back]) {
    const { minX, minY, w } = pieceBounds(piece);
    placed.push({
      piece,
      dx: rowX - minX,
      dy: rowY - TROUSER_LAYOUT_ANCHOR_Y,
      top: rowY + minY - TROUSER_LAYOUT_ANCHOR_Y,
      labelX: rowX + w / 2,
    });
    rowX += w + gap;
  }

  const row1Width = rowX - gap;
  const row1Bottom = rowY + layoutMaxY;
  const wb = pieceBounds(waistband);
  const row2Y = row1Bottom + rowGap;
  const waistbandX = Math.max(0, (row1Width - wb.w) / 2);
  placed.push({
    piece: waistband,
    dx: waistbandX - wb.minX,
    dy: row2Y - TROUSER_LAYOUT_ANCHOR_Y,
    top: row2Y + wb.minY - TROUSER_LAYOUT_ANCHOR_Y,
    labelX: waistbandX + wb.w / 2,
  });

  const layoutWidth = Math.max(row1Width, waistbandX + wb.w);
  const layoutBottom = row2Y + wb.maxY;
  const contentBottom = layoutBottom + gap;
  const topLabelY = rowY + layoutMinY - labelSpace / 2;
  const sheetY = topLabelY - sheetTopMargin;
  const sheetX = -sheetInset;
  const sheetWidth = layoutWidth + sheetInset * 2;
  const sheetHeight = contentBottom - sheetY + sheetInset;
  const layoutHeight = sheetHeight;
  const patternViewWidth = layoutWidth + pad * 2;
  const patternViewHeight = layoutHeight + pad * 2;
  const viewBoxY = sheetY - pad;
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
    ? [...preview.waistband, ...preview.outline]
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

  const pieceCount = displayPattern.pieces.reduce((n, p) => n + p.cutCount, 0);

  return (
    <div className={styles.pageContentWide}>
      <div className={styles.garmentHeader}>
        <h1>Tailored trousers</h1>
        <p className={styles.headerMeta}>
          {validation.valid
            ? `${pieceCount} pieces · updates as you edit`
            : `${validation.issues.length} check${validation.issues.length === 1 ? "" : "s"} need attention`}
        </p>
      </div>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Style</h2>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="leg-bottom-width">
                Leg hem width
              </label>
              <span className={styles.fieldHint}>
                Finished width at the hem of one leg — inseam to side seam.
              </span>
              <div className={styles.inputWrap}>
                <NumericInput
                  id="leg-bottom-width"
                  min={100}
                  max={450}
                  value={legBottomWidth}
                  onChange={setLegBottomWidth}
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
            <Link href="/measurements" className={`${styles.chip} ${styles.chipLink}`}>
              Waist <strong>{body.waist}</strong> mm
            </Link>
            <Link href="/measurements" className={`${styles.chip} ${styles.chipLink}`}>
              Hip <strong>{body.hip}</strong> mm
            </Link>
            <Link href="/measurements" className={`${styles.chip} ${styles.chipLink}`}>
              Body rise <strong>{body.bodyRise}</strong> mm
            </Link>
            <span className={styles.chip}>
              Leg hem width <strong>{legBottomWidth}</strong> mm
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
                      points={polygonPoints(preview.waistband)}
                      className={styles.previewWaistband}
                    />
                    <polygon
                      points={polygonPoints(preview.outline)}
                      className={styles.previewSkirt}
                      fill="none"
                    />
                    <line
                      x1={preview.waistline.from.x}
                      y1={preview.waistline.from.y}
                      x2={preview.waistline.to.x}
                      y2={preview.waistline.to.y}
                      className={styles.previewLine}
                    />
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
                      type="radio"
                      name="patternView"
                      checked={viewMode === "pattern"}
                      onChange={() => {
                        setViewMode("pattern");
                        setShowSeamAllowance(true);
                      }}
                    />
                    Pattern
                  </label>
                  <label className={styles.gridToggle}>
                    <input
                      type="radio"
                      name="patternView"
                      checked={viewMode === "construction"}
                      onChange={() => {
                        setViewMode("construction");
                        setShowSeamAllowance(false);
                      }}
                    />
                    Construction
                  </label>
                  <label className={styles.gridToggle}>
                    <input
                      type="checkbox"
                      checked={showSeamAllowance}
                      onChange={(e) => setShowSeamAllowance(e.target.checked)}
                    />
                    Seam allowance
                  </label>
                  <label className={styles.gridToggle}>
                    <input
                      type="checkbox"
                      checked={showGrid}
                      onChange={(e) => setShowGrid(e.target.checked)}
                    />
                    Show grid (5 cm)
                  </label>
                  {validation.valid && (
                    <button
                      type="button"
                      className={styles.printAction}
                      onClick={() => downloadPattern(pattern)}
                    >
                      Print pattern
                    </button>
                  )}
                  <span className={styles.cardSubtitle}>Flat layout</span>
                </div>
              </div>
              <div className={`${styles.cardBody} ${styles.patternCardBody}`}>
                {validation.valid ? (
                <svg
                  width={patternSvgWidth}
                  height={patternSvgHeight}
                  viewBox={`${-pad} ${viewBoxY} ${patternViewWidth} ${patternViewHeight}`}
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
          const constructionMode = viewMode === "construction";
          const pieceConstruction = construction.find(
            (c) => c.pieceName === piece.name,
          );
          const baseOpacity = constructionMode
            ? 1
            : dimBase
              ? 0.22
              : 1;

          return (
            <g key={piece.name}>
              {!constructionMode && (
              <g opacity={baseOpacity}>
              <text
                x={labelX}
                y={top - labelSpace / 2}
                className={styles.pieceTitle}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {piece.name} · {cutLabel(piece)}
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
                    const segs = notchSegments(piece, m);
                    return (
                      <g key={i}>
                        {segs.map((s, j) => (
                          <line
                            key={j}
                            x1={s.from.x + dx}
                            y1={s.from.y + dy}
                            x2={s.to.x + dx}
                            y2={s.to.y + dy}
                            className={styles.notch}
                          />
                        ))}
                        {m.label && (
                          <text
                            x={m.at.x + dx}
                            y={m.at.y + dy - 8}
                            className={styles.patternLabel}
                            textAnchor="middle"
                          >
                            {m.label}
                          </text>
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
                  case "dart": {
                    const ax = m.apex.x + dx;
                    const ay = m.apex.y + dy;
                    return (
                      <g key={i} className={styles.dartMark}>
                        <line
                          x1={m.legs[0].x + dx}
                          y1={m.legs[0].y + dy}
                          x2={ax}
                          y2={ay}
                        />
                        <line
                          x1={m.legs[1].x + dx}
                          y1={m.legs[1].y + dy}
                          x2={ax}
                          y2={ay}
                        />
                      </g>
                    );
                  }
                  default:
                    return null;
                }
              })}
              </g>
              )}

              {constructionMode && (
                <>
                  <text
                    x={labelX}
                    y={top - labelSpace / 2}
                    className={styles.pieceTitle}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {piece.name} · {cutLabel(piece)}
                  </text>
                  {pieceConstruction && (
                    <g pointerEvents="none">
                      {DRAFT_LINE_ORDER.flatMap((kind) =>
                        pieceConstruction.lines
                          .map((line, i) => ({ line, i }))
                          .filter(({ line }) => line.kind === kind)
                          .map(({ line, i }) => (
                            <line
                              key={`c-line-${kind}-${i}`}
                              x1={line.from.x + dx}
                              y1={line.from.y + dy}
                              x2={line.to.x + dx}
                              y2={line.to.y + dy}
                              className={styles[DRAFT_LINE_CLASS[kind]]}
                              vectorEffect="non-scaling-stroke"
                            />
                          )),
                      )}
                    </g>
                  )}
                  {hasCuttingLine ? (
                    <>
                      <polygon
                        points={cutPoints}
                        className={styles.cutLine}
                      />
                      <polygon
                        points={netPoints}
                        className={styles.stitchLine}
                      />
                    </>
                  ) : (
                    <polygon
                      points={netPoints}
                      className={styles.draftPatternLine}
                    />
                  )}
                  {pieceConstruction && (
                    <g pointerEvents="none">
                      {pieceConstruction.points.map((pt) => {
                        const cx = pt.at.x + dx;
                        const cy = pt.at.y + dy;
                        const isCurveControl = pt.kind === "curveControl";
                        const labelOffsetX = isCurveControl ? 10 : 8;
                        const labelOffsetY = isCurveControl ? -10 : -8;
                        return (
                          <g key={`c-pt-${pt.id}`}>
                            <circle
                              cx={cx}
                              cy={cy}
                              r={isCurveControl ? 5 : 4}
                              className={
                                isCurveControl
                                  ? styles.draftCurveControlPoint
                                  : styles.draftConstructionPoint
                              }
                            />
                            <text
                              x={cx + labelOffsetX}
                              y={cy + labelOffsetY}
                              className={
                                isCurveControl
                                  ? styles.draftCurveControlPointLabel
                                  : styles.draftConstructionPointLabel
                              }
                            >
                              {pt.id}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  )}
                </>
              )}

              {!constructionMode && stepSelectionActive && wholePieceHighlighted && (
                <polygon
                  points={cutPoints}
                  className={styles.stepHighlight}
                />
              )}

              {!constructionMode &&
                stepSelectionActive &&
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