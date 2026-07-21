"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMeasurements } from "@/app/measurements-context";
import { useStyle, GarmentStyleProvider, type TrouserStyleSettings } from "@/app/style-context";
import {
  draftTrousers,
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
  DEFAULT_FRONT_CROTCH_EXTENSION_SCALE,
  DEFAULT_BACK_CROTCH_EXTENSION_SCALE,
  CROTCH_ARRIVAL_ANGLE_MIN,
  CROTCH_ARRIVAL_ANGLE_MAX,
  DEFAULT_CROTCH_ARRIVAL_ANGLE,
  CROTCH_STRAIGHT_RUN_MIN,
  resolveCrotchStraightRun,
  resolveWaistlineCurveFront,
  FRONT_WAIST_INSET_MIN,
  FRONT_WAIST_INSET_MAX,
  DEFAULT_FRONT_WAIST_INSET,
  WAISTLINE_CURVE_FRONT,
  WAISTLINE_CURVE_FRONT_MIN,
  WAISTLINE_CURVE_FRONT_MAX,
  BACK_CROTCH_DROP_MIN,
  BACK_CROTCH_DROP_MAX,
  DEFAULT_BACK_CROTCH_DROP,
  CROTCH_FULLNESS_MIN,
  CROTCH_FULLNESS_MAX,
  DEFAULT_FRONT_CROTCH_FULLNESS,
  DEFAULT_BACK_CROTCH_FULLNESS,
  INSEAM_KNEE_INSET_MIN,
  INSEAM_KNEE_INSET_MAX,
  trouserFrontPoints,
  trouserBackPoints,
  blockFromWaistDrop,
  trouserFacingSteps,
} from "@/lib/patterns/trouserBlock";
import { draftWaistband } from "@/lib/elements/waistband";
import { applySideOpening } from "@/lib/elements/sideOpening";
import { downloadPattern } from "@/lib/export/pdf";
import { downloadInstructions } from "@/lib/export/instructions";
import { notchSegments } from "@/lib/pattern/markingGeometry";
import {
  FIT_PRESETS,
  easeForFit,
  fitForEase,
} from "@/lib/pattern/fitPresets";
import { previewTrousers } from "@/lib/previews/trouserBlock";
import {
  DEFAULT_SEAM_ALLOWANCE,
  withSeamAllowance,
} from "@/lib/geometry/seamAllowance";
import { applyTrouserHemTurnbackToPattern } from "@/lib/geometry/trouserHemTurnback";
import {
  edgeRunsForRoles,
  findPieceHighlight,
  isWholePieceTarget,
  runToNetPolyline,
  runToCuttingPolyline,
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
  title: string;
  /** Persistence key prefix: cotf:garment-style:${garmentId}. */
  garmentId: string;
  /** Garment defaults — used on first visit / empty storage / Reset to preset. */
  defaults: TrouserStyleSettings;
  /** Show "Reset to block" (Trouser Block only). */
  showResetToBlock?: boolean;
  /** Show "Reset to preset" (garment views). */
  showResetToPreset?: boolean;
};

function styleMatchesPreset(
  style: TrouserStyleSettings,
  defaults: TrouserStyleSettings,
): boolean {
  return (
    style.legBottomWidth === defaults.legBottomWidth &&
    style.frontInseamKneeInset === defaults.frontInseamKneeInset &&
    style.backInseamKneeInset === defaults.backInseamKneeInset &&
    style.backHemShape === defaults.backHemShape &&
    style.waistDrop === defaults.waistDrop &&
    style.waistbandDepth === defaults.waistbandDepth &&
    style.waistbandMode === defaults.waistbandMode &&
    style.dartedWaistFinish === defaults.dartedWaistFinish &&
    style.dartedBandDepth === defaults.dartedBandDepth &&
    style.zipLength === defaults.zipLength &&
    style.ease.waist === defaults.ease.waist &&
    style.ease.hip === defaults.ease.hip &&
    style.frontCrotchExtensionScale === defaults.frontCrotchExtensionScale &&
    style.backCrotchExtensionScale === defaults.backCrotchExtensionScale &&
    style.crotchStraightRun === defaults.crotchStraightRun &&
    style.crotchArrivalAngle === defaults.crotchArrivalAngle &&
    style.waistlineCurveFront === defaults.waistlineCurveFront &&
    style.frontWaistInset === defaults.frontWaistInset &&
    style.backCrotchDrop === defaults.backCrotchDrop &&
    style.frontCrotchFullness === defaults.frontCrotchFullness &&
    style.backCrotchFullness === defaults.backCrotchFullness
  );
}

function TrousersViewInner({
  title,
  defaults,
  showResetToBlock = false,
  showResetToPreset = false,
}: {
  title: string;
  defaults: TrouserStyleSettings;
  showResetToBlock?: boolean;
  showResetToPreset?: boolean;
}) {
  const { body, sizeCode } = useMeasurements();
  const {
    legBottomWidth,
    setLegBottomWidth,
    frontInseamKneeInset,
    setFrontInseamKneeInset,
    backInseamKneeInset,
    setBackInseamKneeInset,
    backHemShape,
    setBackHemShape,
    waistDrop,
    setWaistDrop,
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
    frontCrotchExtensionScale,
    setFrontCrotchExtensionScale,
    backCrotchExtensionScale,
    setBackCrotchExtensionScale,
    crotchStraightRun,
    setCrotchStraightRun,
    crotchArrivalAngle,
    setCrotchArrivalAngle,
    waistlineCurveFront,
    setWaistlineCurveFront,
    frontWaistInset,
    setFrontWaistInset,
    backCrotchDrop,
    setBackCrotchDrop,
    frontCrotchFullness,
    setFrontCrotchFullness,
    backCrotchFullness,
    setBackCrotchFullness,
    resetToBlock,
    resetToPreset,
  } = useStyle();
  const block = blockFromWaistDrop(waistDrop);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PatternViewMode>("pattern");
  const [showSeamAllowance, setShowSeamAllowance] = useState(true);
  const [includeConstructionOverlay, setIncludeConstructionOverlay] =
    useState(false);

  // Resolved slider display values (null override → module default).
  const frontExtShown =
    frontCrotchExtensionScale ?? DEFAULT_FRONT_CROTCH_EXTENSION_SCALE;
  const backExtShown =
    backCrotchExtensionScale ?? DEFAULT_BACK_CROTCH_EXTENSION_SCALE;
  const arrivalShown = crotchArrivalAngle ?? DEFAULT_CROTCH_ARRIVAL_ANGLE;
  const scoopShown = waistlineCurveFront ?? WAISTLINE_CURVE_FRONT;
  const insetShown = frontWaistInset ?? DEFAULT_FRONT_WAIST_INSET;
  const dropShown = backCrotchDrop ?? DEFAULT_BACK_CROTCH_DROP;
  const frontFullShown =
    frontCrotchFullness ?? DEFAULT_FRONT_CROTCH_FULLNESS;
  const backFullShown = backCrotchFullness ?? DEFAULT_BACK_CROTCH_FULLNESS;

  // Only pass overrides that are set — omitted keys fall through to resolvers.
  const style: TrouserFrontStyle = {
    bottomWidth: legBottomWidth,
    block,
    waistDrop,
    backHemShape,
    ...(frontInseamKneeInset != null
      ? { frontInseamKneeInset }
      : {}),
    ...(backInseamKneeInset != null ? { backInseamKneeInset } : {}),
    ...(frontCrotchExtensionScale != null
      ? { frontCrotchExtensionScale }
      : {}),
    ...(backCrotchExtensionScale != null
      ? { backCrotchExtensionScale }
      : {}),
    ...(crotchStraightRun != null ? { crotchStraightRun } : {}),
    ...(crotchArrivalAngle != null ? { crotchArrivalAngle } : {}),
    ...(waistlineCurveFront != null ? { waistlineCurveFront } : {}),
    ...(frontWaistInset != null ? { frontWaistInset } : {}),
    ...(backCrotchDrop != null ? { backCrotchDrop } : {}),
    ...(frontCrotchFullness != null ? { frontCrotchFullness } : {}),
    ...(backCrotchFullness != null ? { backCrotchFullness } : {}),
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

  /** Restore darted / no-band / clear geometry; keep current waistDrop. */
  const atBlockFoundation =
    frontCrotchExtensionScale === null &&
    backCrotchExtensionScale === null &&
    crotchStraightRun === null &&
    crotchArrivalAngle === null &&
    waistlineCurveFront === null &&
    frontWaistInset === null &&
    backCrotchDrop === null &&
    frontCrotchFullness === null &&
    backCrotchFullness === null &&
    backHemShape === "curved" &&
    waistbandMode === "darted" &&
    dartedWaistFinish === "facing";

  const atPresetDefaults = styleMatchesPreset(
    {
      legBottomWidth,
      frontInseamKneeInset,
      backInseamKneeInset,
      backHemShape,
      waistDrop,
      waistbandDepth,
      waistbandMode,
      dartedWaistFinish,
      dartedBandDepth,
      zipLength,
      ease,
      frontCrotchExtensionScale,
      backCrotchExtensionScale,
      crotchStraightRun,
      crotchArrivalAngle,
      waistlineCurveFront,
      frontWaistInset,
      backCrotchDrop,
      frontCrotchFullness,
      backCrotchFullness,
    },
    defaults,
  );

  const tstyle =
    waistbandMode === "darted"
      ? withWaistband(style, draftWaistDepth, "darted", draftBody)
      : draftWaistDepth > 0
        ? withWaistband(style, draftWaistDepth, "shaped", draftBody)
        : style;

  const resolvedLegWidths = useMemo(() => {
    const f = trouserFrontPoints(draftBody, tstyle);
    const b = trouserBackPoints(draftBody, tstyle);
    return {
      frontHem: Math.abs(f.p12.x - f.p14.x),
      backHem: Math.abs(b.p26.x - b.p28.x),
    };
  }, [draftBody, tstyle]);

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
  const pattern = applyTrouserHemTurnbackToPattern(
    withSeamAllowance(net, DEFAULT_SEAM_ALLOWANCE),
  );
  const patternSpec = useMemo<PatternSpec>(
    () => {
      const baseLabel = "Trouser block";
      const position =
        waistDrop === 0
          ? "classic / natural waist"
          : waistDrop === WAIST_DROP_MAX
            ? "production / low waist"
            : `waist drop ${waistDrop} mm`;
      return {
        blockName: `${baseLabel} (${position})`,
        sizeLabel: sizeCode === "custom" ? "Custom" : `Size ${sizeCode}`,
        fitName: activeFit,
        body,
        ease,
        hemWidth: legBottomWidth,
      };
    },
    [sizeCode, activeFit, body, ease, legBottomWidth, waistDrop],
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
          {showResetToBlock && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Block foundation</h2>
              <p className={styles.fieldHint}>
                The trouser block is a fitting foundation — darted waist, no
                waistband, Aldrich geometry. Garments add modifications on top.
              </p>
              <div
                className={styles.fitPresetList}
                role="group"
                aria-label="Reset to block"
              >
                <button
                  type="button"
                  className={
                    atBlockFoundation
                      ? styles.fitPresetActive
                      : styles.fitPreset
                  }
                  onClick={resetToBlock}
                >
                  Reset to block
                </button>
              </div>
            </section>
          )}

          {showResetToPreset && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Garment preset</h2>
              <p className={styles.fieldHint}>
                Reloads this garment&apos;s named defaults (overrides any saved
                dialled-in values). Measurements are not changed.
              </p>
              <div
                className={styles.fitPresetList}
                role="group"
                aria-label="Reset to preset"
              >
                <button
                  type="button"
                  className={
                    atPresetDefaults
                      ? styles.fitPresetActive
                      : styles.fitPreset
                  }
                  onClick={resetToPreset}
                >
                  Reset to preset
                </button>
              </div>
            </section>
          )}

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
                  max={100}
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
                low waistline (50 mm). Rise, girth and darts follow. Classic and
                production are positions on this axis, not separate blocks.
              </span>
              <div
                className={styles.fitPresetList}
                role="group"
                aria-label="Waist height position"
              >
                <button
                  type="button"
                  className={
                    waistDrop === 0 ? styles.fitPresetActive : styles.fitPreset
                  }
                  onClick={() => setWaistDrop(0)}
                >
                  Classic (natural waist)
                </button>
                <button
                  type="button"
                  className={
                    waistDrop === WAIST_DROP_MAX
                      ? styles.fitPresetActive
                      : styles.fitPreset
                  }
                  onClick={() => setWaistDrop(WAIST_DROP_MAX)}
                >
                  Production (low waist)
                </button>
              </div>
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
              <label
                className={styles.fieldLabel}
                htmlFor="front-crotch-extension"
              >
                Front crotch extension
              </label>
              <span className={styles.fieldHint}>
                How far the front crotch point extends. Aldrich 1.0, Izzy ~0.5.
                Lower = less fabric between the legs.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="front-crotch-extension"
                  type="range"
                  className={styles.rangeInput}
                  min={CROTCH_EXTENSION_SCALE_MIN}
                  max={CROTCH_EXTENSION_SCALE_MAX}
                  step={0.01}
                  value={frontExtShown}
                  onChange={(e) =>
                    setFrontCrotchExtensionScale(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>
                  {frontExtShown.toFixed(2)}
                </span>
              </div>
            </div>
            <div className={styles.field}>
              <label
                className={styles.fieldLabel}
                htmlFor="back-crotch-extension"
              >
                Back crotch extension
              </label>
              <span className={styles.fieldHint}>
                How far the back crotch point extends. Aldrich 1.0, Izzy ~0.875.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="back-crotch-extension"
                  type="range"
                  className={styles.rangeInput}
                  min={CROTCH_EXTENSION_SCALE_MIN}
                  max={CROTCH_EXTENSION_SCALE_MAX}
                  step={0.01}
                  value={backExtShown}
                  onChange={(e) =>
                    setBackCrotchExtensionScale(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>
                  {backExtShown.toFixed(2)}
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
                  value={arrivalShown}
                  onChange={(e) =>
                    setCrotchArrivalAngle(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>
                  {arrivalShown}°
                </span>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="back-crotch-drop">
                Back crotch drop
              </label>
              <span className={styles.fieldHint}>
                Aldrich 23–24: how far below the crotch line the back curve ends
                (5 mm = hook; 0 = flat Izzy-style).
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="back-crotch-drop"
                  type="range"
                  className={styles.rangeInput}
                  min={BACK_CROTCH_DROP_MIN}
                  max={BACK_CROTCH_DROP_MAX}
                  step={1}
                  value={dropShown}
                  onChange={(e) => setBackCrotchDrop(Number(e.target.value))}
                />
                <span className={styles.rangeValue}>{dropShown} mm</span>
              </div>
            </div>
            <div className={styles.field}>
              <label
                className={styles.fieldLabel}
                htmlFor="front-crotch-fullness"
              >
                Front crotch fullness
              </label>
              <span className={styles.fieldHint}>
                How full the front crotch curve is. Lower = flatter/scooped;
                higher = fuller. Aldrich 0.62, Izzy 0.84.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="front-crotch-fullness"
                  type="range"
                  className={styles.rangeInput}
                  min={CROTCH_FULLNESS_MIN}
                  max={CROTCH_FULLNESS_MAX}
                  step={0.01}
                  value={frontFullShown}
                  onChange={(e) =>
                    setFrontCrotchFullness(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>
                  {frontFullShown.toFixed(2)}
                </span>
              </div>
            </div>
            <div className={styles.field}>
              <label
                className={styles.fieldLabel}
                htmlFor="back-crotch-fullness"
              >
                Back crotch fullness
              </label>
              <span className={styles.fieldHint}>
                How full the back crotch curve is. Aldrich 0.87.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="back-crotch-fullness"
                  type="range"
                  className={styles.rangeInput}
                  min={CROTCH_FULLNESS_MIN}
                  max={CROTCH_FULLNESS_MAX}
                  step={0.01}
                  value={backFullShown}
                  onChange={(e) =>
                    setBackCrotchFullness(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>
                  {backFullShown.toFixed(2)}
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
                  value={scoopShown}
                  onChange={(e) =>
                    setWaistlineCurveFront(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>
                  {scoopShown} mm
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
                  value={insetShown}
                  onChange={(e) =>
                    setFrontWaistInset(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>{insetShown} mm</span>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Style</h2>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="leg-bottom-width">
                Hem width (both)
              </label>
              <span className={styles.fieldHint}>
                Aldrich bottomWidth: front hem = this − 10 mm, back hem = this +
                10 mm.
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
              <label className={styles.fieldLabel}>Back hem shape</label>
              <span className={styles.fieldHint}>
                Aldrich uses a curved hem with its control point 20 mm below
                the endpoints; Izzy uses a straight hem.
              </span>
              <div
                className={styles.fitPresetList}
                role="group"
                aria-label="Back hem shape"
              >
                {(["curved", "straight"] as const).map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    className={
                      backHemShape === shape
                        ? styles.fitPresetActive
                        : styles.fitPreset
                    }
                    onClick={() => setBackHemShape(shape)}
                    aria-pressed={backHemShape === shape}
                  >
                    {shape === "curved" ? "Curved" : "Straight"}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label
                className={styles.fieldLabel}
                htmlFor="front-inseam-knee-inset"
              >
                Front inseam knee inset
              </label>
              <span className={styles.fieldHint}>
                Signed inset from the crotch→hem chord. Negative = inboard
                (flare); positive = outboard. Unset = Aldrich block knee.
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="front-inseam-knee-inset"
                  type="range"
                  className={styles.rangeInput}
                  min={INSEAM_KNEE_INSET_MIN}
                  max={INSEAM_KNEE_INSET_MAX}
                  step={1}
                  value={frontInseamKneeInset ?? 0}
                  onChange={(e) =>
                    setFrontInseamKneeInset(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>
                  {frontInseamKneeInset == null
                    ? "Aldrich"
                    : `${frontInseamKneeInset} mm`}
                </span>
              </div>
            </div>
            <div className={styles.field}>
              <label
                className={styles.fieldLabel}
                htmlFor="back-inseam-knee-inset"
              >
                Back inseam knee inset
              </label>
              <span className={styles.fieldHint}>
                Signed inset from the crotch→hem chord. Negative = inboard
                (flare); positive = outboard. Unset = Aldrich block knee
                (front ±10 mm).
              </span>
              <div className={styles.rangeRow}>
                <input
                  id="back-inseam-knee-inset"
                  type="range"
                  className={styles.rangeInput}
                  min={INSEAM_KNEE_INSET_MIN}
                  max={INSEAM_KNEE_INSET_MAX}
                  step={1}
                  value={backInseamKneeInset ?? 0}
                  onChange={(e) =>
                    setBackInseamKneeInset(Number(e.target.value))
                  }
                />
                <span className={styles.rangeValue}>
                  {backInseamKneeInset == null
                    ? "Aldrich"
                    : `${backInseamKneeInset} mm`}
                </span>
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
              Front hem <strong>{Math.round(resolvedLegWidths.frontHem)}</strong> mm
            </span>
            <span className={styles.chip}>
              Back hem <strong>{Math.round(resolvedLegWidths.backHem)}</strong> mm
            </span>
            {frontInseamKneeInset != null && (
              <span className={styles.chip}>
                Front knee inset <strong>{frontInseamKneeInset}</strong> mm
              </span>
            )}
            {backInseamKneeInset != null && (
              <span className={styles.chip}>
                Back knee inset <strong>{backInseamKneeInset}</strong> mm
              </span>
            )}
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
                    // Production: ticks only. Labels stay on Marking for diag-notch-render.
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
                  const cutSegment = runToCuttingPolyline(
                    boundary,
                    run,
                    piece.netToCutIndex,
                    dx,
                    dy,
                  );
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

export default function TrousersView({
  title,
  garmentId,
  defaults,
  showResetToBlock = false,
  showResetToPreset = false,
}: TrousersViewProps) {
  return (
    <GarmentStyleProvider garmentId={garmentId} defaults={defaults}>
      <TrousersViewInner
        title={title}
        defaults={defaults}
        showResetToBlock={showResetToBlock}
        showResetToPreset={showResetToPreset}
      />
    </GarmentStyleProvider>
  );
}
