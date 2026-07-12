"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMeasurements } from "@/app/measurements-context";
import { useStyle } from "@/app/style-context";
import {
  draftTrousers,
  type TrouserBlock,
  type TrouserFrontStyle,
  type WaistbandMode,
  trouserConstruction,
  trouserInstructions,
  trouserHemStep,
  trouserWaistEdges,
  TROUSER_LAYOUT_ANCHOR_Y,
  validateTrousers,
  withWaistband,
  maxYokeDepth,
  maxBackShapedWaistDepth,
  waistbandDepthRange,
  WAIST_DROP_MAX,
  DARTED_DEPTH_MIN,
  DARTED_DEPTH_MAX,
  CROTCH_EXTENSION_SCALE_MIN,
  CROTCH_EXTENSION_SCALE_MAX,
  CROTCH_ARRIVAL_ANGLE_MIN,
  CROTCH_ARRIVAL_ANGLE_MAX,
  CROTCH_STRAIGHT_RUN_MIN,
  resolveCrotchStraightRun,
  resolveWaistlineCurveFront,
  FRONT_WAIST_INSET_MIN,
  FRONT_WAIST_INSET_MAX,
  WAISTLINE_CURVE_FRONT_MIN,
  WAISTLINE_CURVE_FRONT_MAX,
  trouserFacingSteps,
} from "@/lib/patterns/trouserBlock";
import { draftWaistband } from "@/lib/elements/waistband";
import { applySideOpening } from "@/lib/elements/sideOpening";
import { downloadPattern } from "@/lib/export/pdf";
import { downloadInstructions } from "@/lib/export/instructions";
import { notchSegments } from "@/lib/pattern/markingGeometry";
import {
  easeForFit,
  fitForEase,
  FIT_PRESETS,
} from "@/lib/pattern/fitPresets";
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
import { mirrorConstructionX, mirrorPieceX } from "@/lib/pattern/mirrorPiece";
import { referenceGridLines } from "@/lib/render/referenceGrid";
import { svgCoord, svgLineProps, svgPolygonPoints } from "@/lib/render/svgCoords";
import styles from "@/app/shell.module.css";
import type { DraftingLineKind } from "@/lib/types/measurements";
import { applyEase, cutLabel, type ConstructionStep, type PatternSpec } from "@/lib/types/measurements";

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

type TrousersViewProps = {
  block: TrouserBlock;
  title: string;
};

export default function TrousersView({ block, title }: TrousersViewProps) {
  const { body, sizeCode } = useMeasurements();
  const {
    legBottomWidth,
    setLegBottomWidth,
    waistbandDepth,
    setWaistbandDepth,
    waistbandMode,
    setWaistbandMode,
    dartedWaistFinish,
    setDartedWaistFinish,
    dartedBandDepth,
    setDartedBandDepth,
    zipLength,
    setZipLength,
    ease,
    setEase,
    crotchExtensionScale,
    setCrotchExtensionScale,
    crotchStraightRun,
    setCrotchStraightRun,
    crotchArrivalAngle,
    setCrotchArrivalAngle,
    waistlineCurveFront,
    setWaistlineCurveFront,
    frontWaistInset,
    setFrontWaistInset,
  } = useStyle();
  // Per-block default — resets on classic ↔ production switch (intentional).
  const [waistDrop, setWaistDrop] = useState(
    block === "production" ? WAIST_DROP_MAX : 0,
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PatternViewMode>("pattern");
  const [showSeamAllowance, setShowSeamAllowance] = useState(true);
  const [includeConstructionOverlay, setIncludeConstructionOverlay] =
    useState(false);

  const style: TrouserFrontStyle = {
    bottomWidth: legBottomWidth,
    block,
    waistDrop,
    crotchExtensionScale,
    crotchStraightRun: crotchStraightRun ?? undefined,
    crotchArrivalAngle,
    waistlineCurveFront,
    frontWaistInset,
  };
  const activeFit = fitForEase(ease);
  const draftBody = applyEase(body, ease);
  // Match trouserBlockSpec: riseDrop = hipDepthDrop = waistDrop (clamped).
  const riseDrop = Math.max(0, Math.min(WAIST_DROP_MAX, waistDrop));
  const draftR = draftBody.bodyRise - riseDrop;
  const draftD = draftBody.hipDepth - riseDrop;
  // Scooped waist CF y — departure is measured from here, not p10.y (= 0).
  const waistCfY = resolveWaistlineCurveFront(style);
  const straightRun = resolveCrotchStraightRun(
    style,
    draftR,
    draftD,
    waistCfY,
  );
  const straightRunMax = Math.max(CROTCH_STRAIGHT_RUN_MIN, draftD - waistCfY);
  const yokeDepthMax = maxYokeDepth(draftBody, block, waistDrop);
  const backShapedCap = maxBackShapedWaistDepth(
    draftBody,
    block,
    legBottomWidth,
    waistDrop,
  );
  const depthRange = waistbandDepthRange(
    waistbandMode,
    draftBody,
    block,
    legBottomWidth,
    waistDrop,
  );
  const dartedBandRange = waistbandDepthRange(
    "darted",
    draftBody,
    block,
    legBottomWidth,
    waistDrop,
  );
  const shapedLimitedByBack =
    waistbandMode === "shaped" && backShapedCap < yokeDepthMax;

  const draftWaistDepth =
    waistbandMode === "darted"
      ? dartedWaistFinish === "facing"
        ? 0
        : dartedBandDepth
      : waistbandDepth;

  useEffect(() => {
    if (waistbandMode !== "shaped") {
      return;
    }
    setWaistbandDepth((depth) =>
      depth === 0
        ? 0
        : Math.max(depthRange.min, Math.min(depthRange.max, depth)),
    );
  }, [waistbandMode, depthRange.min, depthRange.max]);

  useEffect(() => {
    setDartedBandDepth((depth) =>
      Math.max(dartedBandRange.min, Math.min(dartedBandRange.max, depth)),
    );
  }, [dartedBandRange.min, dartedBandRange.max]);

  const setWaistbandModeAndClamp = (mode: WaistbandMode) => {
    setWaistbandMode(mode);
    if (mode === "shaped") {
      const range = waistbandDepthRange(
        "shaped",
        draftBody,
        block,
        legBottomWidth,
        waistDrop,
      );
      setWaistbandDepth((depth) =>
        depth === 0
          ? range.min
          : Math.max(range.min, Math.min(range.max, depth)),
      );
    }
  };

  const tstyle =
    waistbandMode === "darted"
      ? withWaistband(style, draftWaistDepth, "darted", draftBody)
      : draftWaistDepth > 0
        ? withWaistband(style, draftWaistDepth, "shaped", draftBody)
        : style;

  const validation = validateTrousers(draftBody, tstyle);
  const baseNet = useMemo(
    () => draftTrousers(draftBody, tstyle),
    [draftBody, tstyle],
  );
  const { net, elementSteps } = useMemo((): {
    net: ReturnType<typeof draftTrousers>;
    elementSteps: ConstructionStep[];
  } => {
    if (!validation.valid) {
      return { net: baseNet, elementSteps: [] };
    }
    const opened = applySideOpening(baseNet.pieces, {
      side: "left",
      length: zipLength,
    });
    if (waistbandMode === "darted" && dartedWaistFinish === "facing") {
      // TODO: draft facing pieces here (depth 0 darted branch) — see trouserFacingSteps.
      return {
        net: { pieces: opened.pieces },
        elementSteps: [...opened.steps, ...trouserFacingSteps()],
      };
    }
    if (draftWaistDepth <= 0) {
      return { net: { pieces: opened.pieces }, elementSteps: opened.steps };
    }
    const e = trouserWaistEdges(draftBody, tstyle);
    const bandDepth = tstyle.waistReduction ?? draftWaistDepth;
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
      net: { pieces: [...opened.pieces, fb.piece, bb.piece] },
      elementSteps: [...opened.steps, ...fb.steps, ...bb.steps],
    };
  }, [
    validation.valid,
    baseNet,
    draftBody,
    tstyle,
    zipLength,
    draftWaistDepth,
    waistbandMode,
    dartedWaistFinish,
  ]);
  const construction = validation.valid ? trouserConstruction(draftBody, tstyle) : [];
  const pattern = withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE);
  const patternSpec = useMemo<PatternSpec>(
    () => {
      const baseLabel =
        block === "production"
          ? "Production trouser block"
          : "Classic trouser block";
      const blockDefaultDrop = block === "production" ? WAIST_DROP_MAX : 0;
      return {
        blockName:
          waistDrop !== blockDefaultDrop
            ? `${baseLabel} (waist drop ${waistDrop} mm)`
            : baseLabel,
        sizeLabel: sizeCode === "custom" ? "Custom" : `Size ${sizeCode}`,
        fitName: activeFit,
        body,
        ease,
        hemWidth: legBottomWidth,
      };
    },
    [block, sizeCode, activeFit, body, ease, legBottomWidth, waistDrop],
  );
  const displayPattern =
    viewMode === "pattern" && showSeamAllowance ? pattern : net;
  const preview = previewTrousers(draftBody, tstyle, {
    waistbandDepth: draftWaistDepth,
    zipLength,
    zipSide: "left",
  });
  const method = [...trouserInstructions(tstyle), ...elementSteps, trouserHemStep()];
  const selectedStep = method.find((step) => step.id === selectedStepId);
  const activeHighlights = selectedStep?.highlight ?? [];
  const stepSelectionActive = selectedStepId !== null;

  const gap = 60;
  const rowGap = 80;
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

  const frontRaw = displayPattern.pieces.find((p) => p.name === "Trouser front")!;
  const back = displayPattern.pieces.find((p) => p.name === "Trouser back")!;
  const bandPieces = displayPattern.pieces.filter(
    (p) => p.name === "Front waistband" || p.name === "Back waistband",
  );
  const front = mirrorPieceX(frontRaw);
  const displayConstruction = construction.map((c) =>
    c.pieceName === "Trouser front" ? mirrorConstructionX(c) : c,
  );
  const pdfConstruction = displayConstruction;
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

  const row1Y = labelSpace;
  let row1X = 0;
  const row1Height = layoutMaxY - TROUSER_LAYOUT_ANCHOR_Y;
  for (const piece of [back, front]) {
    const { minX, minY, w } = pieceBounds(piece);
    placed.push({
      piece,
      dx: row1X - minX,
      dy: row1Y - TROUSER_LAYOUT_ANCHOR_Y,
      top: row1Y + minY - TROUSER_LAYOUT_ANCHOR_Y,
      labelX: row1X + w / 2,
    });
    row1X += w + gap;
  }

  const row1Width = row1X - gap;
  let layoutWidth = row1Width;
  let layoutBottom = row1Y + row1Height;

  if (bandPieces.length > 0) {
    const row2Y = row1Y + row1Height + rowGap;
    let bandX = Math.max(0, (row1Width - bandPieces.reduce((w, p) => w + pieceBounds(p).w + gap, -gap)) / 2);
    let row2Height = 0;
    for (const piece of bandPieces) {
      const wb = pieceBounds(piece);
      placed.push({
        piece,
        dx: bandX - wb.minX,
        dy: row2Y - wb.minY,
        top: row2Y,
        labelX: bandX + wb.w / 2,
      });
      bandX += wb.w + gap;
      row2Height = Math.max(row2Height, wb.h);
    }
    layoutWidth = Math.max(row1Width, bandX - gap);
    layoutBottom = row2Y + row2Height;
  }

  const contentBottom = layoutBottom + gap;
  const topLabelY = row1Y + layoutMinY - labelSpace / 2;
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
    ? [
        ...preview.outline,
        ...preview.waistband,
        preview.zipMark.from,
        preview.zipMark.to,
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

  const pieceCount = displayPattern.pieces.reduce((n, p) => n + p.cutCount, 0);

  return (
    <div className={styles.pageContentWide}>
      <div className={styles.garmentHeader}>
        <h1>{title}</h1>
        <p className={styles.headerMeta}>
          {validation.valid
            ? `${pieceCount} pieces · updates as you edit`
            : `${validation.issues.length} check${validation.issues.length === 1 ? "" : "s"} need attention`}
        </p>
      </div>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Fit</h2>
            <div className={styles.fitPresetList} role="group" aria-label="Fit preset">
              {FIT_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className={
                    activeFit === preset.name
                      ? styles.fitPresetActive
                      : styles.fitPreset
                  }
                  onClick={() => setEase(easeForFit(preset.name)!)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {activeFit === "custom" && (
              <p className={styles.fitCustomHint}>Custom ease</p>
            )}
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="hip-ease">
                Hip ease
              </label>
              <span className={styles.fieldHint}>
                Added to body hip before drafting.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="hip-ease"
                  type="range"
                  className={styles.rangeInput}
                  min={0}
                  max={150}
                  step={5}
                  value={ease.hip}
                  onChange={(e) =>
                    setEase({ ...ease, hip: Number(e.target.value) })
                  }
                />
                <span className={styles.rangeValue}>{ease.hip} mm</span>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="waist-ease">
                Waist ease
              </label>
              <span className={styles.fieldHint}>
                Added to body waist before drafting.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="waist-ease"
                  type="range"
                  className={styles.rangeInput}
                  min={0}
                  max={40}
                  step={5}
                  value={ease.waist}
                  onChange={(e) =>
                    setEase({ ...ease, waist: Number(e.target.value) })
                  }
                />
                <span className={styles.rangeValue}>{ease.waist} mm</span>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="waist-drop">
                Waist drop
              </label>
              <span className={styles.fieldHint}>
                Lowers the finished waist from the natural waistline (0) to the
                low waistline (50 mm). Rise, girth and darts follow.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="waist-drop"
                  type="range"
                  className={styles.rangeInput}
                  min={0}
                  max={WAIST_DROP_MAX}
                  step={5}
                  value={waistDrop}
                  onChange={(e) => setWaistDrop(Number(e.target.value))}
                />
                <span className={styles.rangeValue}>{waistDrop} mm</span>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="crotch-extension">
                Crotch extension
              </label>
              <span className={styles.fieldHint}>
                Aldrich (1.0) to a narrower, Izzy-like crotch (0.5). Lower = less
                fabric between the legs.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="crotch-extension"
                  type="range"
                  className={styles.rangeInput}
                  min={CROTCH_EXTENSION_SCALE_MIN}
                  max={CROTCH_EXTENSION_SCALE_MAX}
                  step={0.05}
                  value={crotchExtensionScale}
                  onChange={(e) =>
                    setCrotchExtensionScale(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>
                  {crotchExtensionScale.toFixed(2)}
                </span>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="crotch-straight-run">
                Crotch departure on CF
              </label>
              <span className={styles.fieldHint}>
                How far below the waist the crotch curve leaves the centre front.
                Default = hipline (Aldrich 10–6). 0 = curve from the waist.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="crotch-straight-run"
                  type="range"
                  className={styles.rangeInput}
                  min={CROTCH_STRAIGHT_RUN_MIN}
                  max={straightRunMax}
                  step={5}
                  value={straightRun}
                  onChange={(e) =>
                    setCrotchStraightRun(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>{straightRun} mm</span>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="crotch-arrival">
                Crotch arrival angle
              </label>
              <span className={styles.fieldHint}>
                How steeply the curve meets the crotch point. Higher = smoother
                sweep, less hook.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="crotch-arrival"
                  type="range"
                  className={styles.rangeInput}
                  min={CROTCH_ARRIVAL_ANGLE_MIN}
                  max={CROTCH_ARRIVAL_ANGLE_MAX}
                  step={1}
                  value={crotchArrivalAngle}
                  onChange={(e) =>
                    setCrotchArrivalAngle(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>
                  {crotchArrivalAngle}°
                </span>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="waistline-curve-front">
                Front waist curve
              </label>
              <span className={styles.fieldHint}>
                Aldrich §2a: how far the waistline dips at centre front. 0 =
                straight waist.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="waistline-curve-front"
                  type="range"
                  className={styles.rangeInput}
                  min={WAISTLINE_CURVE_FRONT_MIN}
                  max={WAISTLINE_CURVE_FRONT_MAX}
                  step={1}
                  value={waistlineCurveFront}
                  onChange={(e) =>
                    setWaistlineCurveFront(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>
                  {waistlineCurveFront} mm
                </span>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="front-waist-inset">
                Front waist inset
              </label>
              <span className={styles.fieldHint}>
                Aldrich 7–10: how far the waist is set in from the centre front.
                0 = vertical CF (Izzy-style).
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="front-waist-inset"
                  type="range"
                  className={styles.rangeInput}
                  min={FRONT_WAIST_INSET_MIN}
                  max={FRONT_WAIST_INSET_MAX}
                  step={1}
                  value={frontWaistInset}
                  onChange={(e) =>
                    setFrontWaistInset(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>{frontWaistInset} mm</span>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Style</h2>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="leg-bottom-width">
                Leg hem width
              </label>
              <span className={styles.fieldHint}>
                Finished width at the hem of one leg — inseam to side seam.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="leg-bottom-width"
                  type="range"
                  className={styles.rangeInput}
                  min={100}
                  max={450}
                  step={5}
                  value={legBottomWidth}
                  onChange={(e) => setLegBottomWidth(Number(e.target.value))}
                />
                <span className={styles.rangeValue}>{legBottomWidth} mm</span>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Waistband mode</label>
              <span className={styles.fieldHint}>
                {waistbandMode === "darted"
                  ? dartedWaistFinish === "facing"
                    ? "Darted finish — waist facing, darts kept at drafted length."
                    : "Darted waistband — straight strip, darts kept at drafted length."
                  : waistbandDepth === 0
                    ? "Set waistband depth for a shaped band, or switch to darted for a facing finish."
                    : "Shaped band following the body; dart remainder eased into the side seam."}
              </span>
              <div className={styles.fitPresetList} role="group" aria-label="Waistband mode">
                <button
                  type="button"
                  className={
                    waistbandMode === "darted"
                      ? styles.fitPresetActive
                      : styles.fitPreset
                  }
                  onClick={() => setWaistbandModeAndClamp("darted")}
                >
                  Darted
                </button>
                <button
                  type="button"
                  className={
                    waistbandMode === "shaped"
                      ? styles.fitPresetActive
                      : styles.fitPreset
                  }
                  onClick={() => setWaistbandModeAndClamp("shaped")}
                >
                  Shaped
                </button>
              </div>
            </div>
            {waistbandMode === "darted" ? (
              <>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Waist finish</label>
                  <span className={styles.fieldHint}>
                    Facing finishes at the trouser waist; waistband adds a
                    separate straight strip ({DARTED_DEPTH_MIN}–{DARTED_DEPTH_MAX}{" "}
                    mm).
                  </span>
                  <div
                    className={styles.fitPresetList}
                    role="group"
                    aria-label="Darted waist finish"
                  >
                    <button
                      type="button"
                      className={
                        dartedWaistFinish === "facing"
                          ? styles.fitPresetActive
                          : styles.fitPreset
                      }
                      onClick={() => setDartedWaistFinish("facing")}
                    >
                      Facing
                    </button>
                    <button
                      type="button"
                      className={
                        dartedWaistFinish === "waistband"
                          ? styles.fitPresetActive
                          : styles.fitPreset
                      }
                      onClick={() => setDartedWaistFinish("waistband")}
                    >
                      Waistband
                    </button>
                  </div>
                </div>
                {dartedWaistFinish === "waistband" && (
                  <div className={styles.field}>
                    <label
                      className={styles.fieldLabel}
                      htmlFor="darted-band-depth"
                    >
                      Waistband depth
                    </label>
                    <span className={styles.fieldHint}>
                      Darted band: {dartedBandRange.min}–{dartedBandRange.max}{" "}
                      mm.
                    </span>
                    <div className={styles.rangeRow}>
                      <input
                        id="darted-band-depth"
                        type="range"
                        className={styles.rangeInput}
                        min={dartedBandRange.min}
                        max={dartedBandRange.max}
                        step={5}
                        value={dartedBandDepth}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setDartedBandDepth(
                            Math.max(
                              dartedBandRange.min,
                              Math.min(dartedBandRange.max, v),
                            ),
                          );
                        }}
                      />
                      <span className={styles.rangeValue}>
                        {dartedBandDepth} mm
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="waistband-depth">
                  Waistband depth
                </label>
                <span className={styles.fieldHint}>
                  {waistbandDepth === 0
                    ? "Set to 0 for trousers only (no band)."
                    : `Shaped mode: ${depthRange.min}–${depthRange.max} mm.`}
                </span>
                <div className={styles.rangeRow}>
                  <input
                    id="waistband-depth"
                    type="range"
                    className={styles.rangeInput}
                    min={waistbandDepth === 0 ? 0 : depthRange.min}
                    max={waistbandDepth > 0 ? depthRange.max : yokeDepthMax}
                    step={5}
                    value={waistbandDepth}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v === 0) {
                        setWaistbandDepth(0);
                        return;
                      }
                      const range = waistbandDepthRange(
                        "shaped",
                        draftBody,
                        block,
                        legBottomWidth,
                        waistDrop,
                      );
                      setWaistbandDepth(
                        Math.max(range.min, Math.min(range.max, v)),
                      );
                    }}
                  />
                  <span className={styles.rangeValue}>{waistbandDepth} mm</span>
                </div>
                {waistbandDepth > 0 &&
                  waistbandDepth >= depthRange.max &&
                  depthRange.max > 0 && (
                  <span className={styles.fieldHint}>
                    {shapedLimitedByBack
                      ? "Limited by back waist geometry (centre-back fold)."
                      : "Limited by your hip depth."}
                  </span>
                )}
              </div>
            )}
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="zip-length">
                Side zip length
              </label>
              <span className={styles.fieldHint}>
                Opening height on the left side seam.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="zip-length"
                  type="range"
                  className={styles.rangeInput}
                  min={120}
                  max={240}
                  step={10}
                  value={zipLength}
                  onChange={(e) => setZipLength(Number(e.target.value))}
                />
                <span className={styles.rangeValue}>{zipLength} mm</span>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.inlineToggle} htmlFor="show-seam-allowance">
                <input
                  id="show-seam-allowance"
                  type="checkbox"
                  checked={showSeamAllowance}
                  disabled={viewMode === "construction"}
                  onChange={(e) => setShowSeamAllowance(e.target.checked)}
                />
                Seam allowance
              </label>
              <span className={styles.fieldHint}>
                {viewMode === "construction"
                  ? "Available in Pattern view."
                  : "Show the outer cut line on the pattern pieces."}
              </span>
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
            <Link href="/measurements/edit" className={`${styles.chip} ${styles.chipLink}`}>
              Waist <strong>{body.waist}</strong> mm
            </Link>
            <Link href="/measurements/edit" className={`${styles.chip} ${styles.chipLink}`}>
              Hip <strong>{body.hip}</strong> mm
            </Link>
            <Link href="/measurements/edit" className={`${styles.chip} ${styles.chipLink}`}>
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
                    viewBox={`${svgCoord(previewMinX - previewPad)} ${svgCoord(previewMinY - previewPad)} ${svgCoord(previewWidth)} ${svgCoord(previewHeight)}`}
                  >
                    <polygon
                      points={svgPolygonPoints(preview.outline)}
                      className={styles.previewSkirt}
                    />
                    {preview.waistband.length > 0 && (
                      <polygon
                        points={svgPolygonPoints(preview.waistband)}
                        className={styles.previewWaistband}
                      />
                    )}
                    <line
                      {...svgLineProps(
                        preview.waistline.from.x,
                        preview.waistline.from.y,
                        preview.waistline.to.x,
                        preview.waistline.to.y,
                      )}
                      className={styles.previewLine}
                    />
                    {preview.darts.map((d, i) => (
                      <line
                        key={`dart-${i}`}
                        {...svgLineProps(d.from.x, d.from.y, d.to.x, d.to.y)}
                        className={styles.previewDart}
                      />
                    ))}
                    <line
                      {...svgLineProps(
                        preview.zipMark.from.x,
                        preview.zipMark.from.y,
                        preview.zipMark.to.x,
                        preview.zipMark.to.y,
                      )}
                      className={styles.previewZip}
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
                  <div
                    className={styles.segmentedControl}
                    role="group"
                    aria-label="View mode"
                  >
                    <button
                      type="button"
                      className={`${styles.segmentButton} ${viewMode === "pattern" ? styles.segmentButtonActive : ""}`}
                      aria-pressed={viewMode === "pattern"}
                      onClick={() => setViewMode("pattern")}
                    >
                      Pattern
                    </button>
                    <button
                      type="button"
                      className={`${styles.segmentButton} ${viewMode === "construction" ? styles.segmentButtonActive : ""}`}
                      aria-pressed={viewMode === "construction"}
                      onClick={() => setViewMode("construction")}
                    >
                      Construction
                    </button>
                  </div>
                  {validation.valid && (
                    <>
                      <label
                        className={styles.inlineToggle}
                        htmlFor="pdf-construction-overlay"
                      >
                        <input
                          id="pdf-construction-overlay"
                          type="checkbox"
                          checked={includeConstructionOverlay}
                          onChange={(e) =>
                            setIncludeConstructionOverlay(e.target.checked)
                          }
                        />
                        Construction overlay
                      </label>
                      <button
                        type="button"
                        className={styles.printAction}
                        onClick={() =>
                          downloadPattern(
                            {
                              pieces: pattern.pieces.map((p) =>
                                p.name === "Trouser front"
                                  ? mirrorPieceX(p)
                                  : p,
                              ),
                            },
                            patternSpec,
                            "a4",
                            {
                              includeConstruction: includeConstructionOverlay,
                              construction: pdfConstruction,
                            },
                          )
                        }
                      >
                        Print
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className={`${styles.cardBody} ${styles.patternCardBody}`}>
                {validation.valid ? (
                <svg
                  width={patternSvgWidth}
                  height={patternSvgHeight}
                  viewBox={`${svgCoord(-pad)} ${svgCoord(viewBoxY)} ${svgCoord(patternViewWidth)} ${svgCoord(patternViewHeight)}`}
                >
        <defs>
          <filter id="paperShadow" x="-8%" y="-8%" width="116%" height="116%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#2c2420" floodOpacity="0.1" />
          </filter>
          <marker id="grainArrow" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#047857" />
          </marker>
          <marker id="instructionArrow" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#047857" />
          </marker>
          <clipPath id="paperClip">
            <rect
              x={svgCoord(sheetX)}
              y={svgCoord(sheetY)}
              width={svgCoord(sheetWidth)}
              height={svgCoord(sheetHeight)}
            />
          </clipPath>
        </defs>

        <rect
          x={svgCoord(sheetX)}
          y={svgCoord(sheetY)}
          width={svgCoord(sheetWidth)}
          height={svgCoord(sheetHeight)}
          className={styles.paperSheet}
          filter="url(#paperShadow)"
        />

        <g
          className={styles.referenceGrid}
          clipPath="url(#paperClip)"
          pointerEvents="none"
        >
          {referenceGrid.map((line, i) => (
            <line
              key={i}
              {...svgLineProps(line.x1, line.y1, line.x2, line.y2)}
              className={
                line.major ? styles.gridLineMajor : styles.gridLine
              }
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        {placed.map(({ piece, dx, dy, top, labelX }) => {
          const boundary = pieceBoundary(piece);
          const cutPoints = svgPolygonPoints(
            boundary.map((p) => ({ x: p.x + dx, y: p.y + dy })),
          );
          const netPoints = svgPolygonPoints(
            piece.outline.map((p) => ({
              x: p.at.x + dx,
              y: p.at.y + dy,
            })),
          );
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
          const pieceConstruction = displayConstruction.find(
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
                x={svgCoord(labelX)}
                y={svgCoord(top - labelSpace / 2)}
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
                        {...svgLineProps(
                          m.line.from.x + dx,
                          m.line.from.y + dy,
                          m.line.to.x + dx,
                          m.line.to.y + dy,
                        )}
                        className={styles.grainline}
                        markerStart="url(#grainArrow)" markerEnd="url(#grainArrow)" />
                    );
                  case "foldLine":
                    return (
                      <line key={i}
                        {...svgLineProps(
                          m.line.from.x + dx,
                          m.line.from.y + dy,
                          m.line.to.x + dx,
                          m.line.to.y + dy,
                        )}
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
                    const bracket = svgPolygonPoints(
                      [p1, p2, p3, p4].map((p) => ({
                        x: p.x + dx,
                        y: p.y + dy,
                      })),
                    );
                    const midX = (A.x + B.x) / 2 + dx;
                    const midY = (A.y + B.y) / 2 + dy;
                    const labelXPos = svgCoord(midX + 25 * n.x);
                    const labelYPos = svgCoord(midY + 25 * n.y);
                    const labelAngle = (Math.atan2(u.y, u.x) * 180) / Math.PI;
                    return (
                      <g key={i}>
                        <polyline
                          points={bracket}
                          className={styles.foldMark}
                        />
                        {m.label && (
                          <text
                            x={labelXPos}
                            y={labelYPos}
                            className={styles.patternLabel}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            transform={`rotate(${labelAngle}, ${labelXPos}, ${labelYPos})`}
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
                    const x1 = svgCoord(from.x + dx);
                    const y1 = svgCoord(from.y + dy);
                    const x2 = svgCoord(to.x + dx);
                    const y2 = svgCoord(to.y + dy);
                    const mx = svgCoord((x1 + x2) / 2);
                    const my = svgCoord((y1 + y2) / 2);
                    return (
                      <g key={i}>
                        <line
                          {...svgLineProps(x1, y1, x2, y2)}
                          className={styles.instructionLine}
                          markerStart="url(#instructionArrow)"
                          markerEnd="url(#instructionArrow)"
                        />
                        <text
                          x={svgCoord(mx + n.x * 18)}
                          y={svgCoord(my + n.y * 18)}
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
                            {...svgLineProps(
                              s.from.x + dx,
                              s.from.y + dy,
                              s.to.x + dx,
                              s.to.y + dy,
                            )}
                            className={styles.notch}
                          />
                        ))}
                        {m.label && (
                          <text
                            x={svgCoord(m.at.x + dx)}
                            y={svgCoord(m.at.y + dy - 8)}
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
                    const s = 9;
                    const cx = svgCoord(m.at.x + dx);
                    const cy = svgCoord(m.at.y + dy);
                    return (
                      <g key={i} className={styles.hardwareMark}>
                        <line {...svgLineProps(cx - s, cy - s, cx + s, cy + s)} />
                        <line {...svgLineProps(cx - s, cy + s, cx + s, cy - s)} />
                      </g>
                    );
                  }
                  case "buttonhole": {
                    const s = 9;
                    const cx = svgCoord(m.at.x + dx);
                    const cy = svgCoord(m.at.y + dy);
                    return (
                      <line
                        key={i}
                        {...svgLineProps(cx - s, cy, cx + s, cy)}
                        className={styles.hardwareMark}
                      />
                    );
                  }
                  case "constructionLine":
                    return (
                      <line key={i}
                        {...svgLineProps(
                          m.line.from.x + dx,
                          m.line.from.y + dy,
                          m.line.to.x + dx,
                          m.line.to.y + dy,
                        )}
                        className={styles.constructionLine} />
                    );
                  case "dart": {
                    const ax = svgCoord(m.apex.x + dx);
                    const ay = svgCoord(m.apex.y + dy);
                    return (
                      <g key={i} className={styles.dartMark}>
                        <line
                          {...svgLineProps(
                            m.legs[0].x + dx,
                            m.legs[0].y + dy,
                            ax,
                            ay,
                          )}
                        />
                        <line
                          {...svgLineProps(
                            m.legs[1].x + dx,
                            m.legs[1].y + dy,
                            ax,
                            ay,
                          )}
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
                    x={svgCoord(labelX)}
                    y={svgCoord(top - labelSpace / 2)}
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
                              {...svgLineProps(
                                line.from.x + dx,
                                line.from.y + dy,
                                line.to.x + dx,
                                line.to.y + dy,
                              )}
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
                        const cx = svgCoord(pt.at.x + dx);
                        const cy = svgCoord(pt.at.y + dy);
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
                              x={svgCoord(cx + labelOffsetX)}
                              y={svgCoord(cy + labelOffsetY)}
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
                <div className={styles.cardHeaderActions}>
                  <button
                    type="button"
                    className={styles.printAction}
                    onClick={() => downloadInstructions(pattern, method)}
                  >
                    Print instructions
                  </button>
                </div>
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
