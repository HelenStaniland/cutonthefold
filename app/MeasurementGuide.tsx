"use client";

import React, { useMemo, useState } from "react";
import styles from "./measurementGuide.module.css";

/**
 * Where to measure — a standard-body-measurement reference for Cut on the Fold.
 *
 * The figure is built from named anatomical landmarks (LM) smoothed with
 * Catmull-Rom; every measurement indicator snaps to those same coordinates, so
 * the drawing and the points can never drift apart. Original artwork — the
 * anatomical facts are Aldrich's, the linework is ours.
 *
 * Two modes from one SVG:
 *   - reference / print: all points shown, legend carries the "how to take it" notes
 *   - live: pass `activeId` (and optionally control it via onActiveChange) so a
 *     measurement lights up as the matching form field is focused.
 */

const PAPER = "#ffffff";
const INK = "#1e3a8a";
const RULE = "#64748b";
const ACCENT = "#0ea5e9";
const GRID = "#bfdbfe";

// ---- shared body landmarks (local figure space, CX = 160) ----
const CX = 160;
const LM = {
  headTop: 20, chin: 110, neckBase: 136, shoulderPt: 150, armscye: 214,
  chest: 196, bust: 236, waist: 330, lowWaist: 362, hip: 420, crotch: 448,
  thigh: 470, knee: 566, ankle: 706, floor: 728, elbow: 312,
};

function catmull(points: number[][], closed = true, n = 16) {
  const pts = points.slice();
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  const m = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < m; i++) {
    const [a, b, c, d] = [p[i], p[i + 1], p[i + 2], p[i + 3]];
    for (let t = 0; t < n; t++) {
      const u = t / n, u2 = u * u, u3 = u2 * u;
      const x = 0.5 * (2 * b[0] + (-a[0] + c[0]) * u + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * u2 + (-a[0] + 3 * b[0] - 3 * c[0] + d[0]) * u3);
      const y = 0.5 * (2 * b[1] + (-a[1] + c[1]) * u + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * u2 + (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * u3);
      out.push([x, y]);
    }
  }
  if (!closed) out.push(pts[pts.length - 1]);
  return out;
}
const toPath = (loop: number[][], closed = true) =>
  catmull(loop, closed).map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ") + (closed ? " Z" : "");

function bodyParts() {
  const R = (dx: number, y: number) => [CX + dx, y];
  const mir = (p: number[]) => [2 * CX - p[0], p[1]];
  let torso = [
    [CX, LM.neckBase - 4], R(16, LM.neckBase), R(72, LM.shoulderPt), R(67, LM.armscye),
    R(64, LM.bust), R(47, LM.waist), R(55, LM.lowWaist), R(76, LM.hip), R(44, LM.crotch + 4), [CX, LM.crotch + 12],
  ];
  torso = torso.concat(torso.slice(1, -1).reverse().map(mir));
  const leg = (s: number) => [
    [CX + s * 6, LM.crotch + 12], [CX + s * 46, LM.crotch + 2], [CX + s * 72, LM.hip + 10],
    [CX + s * 64, LM.thigh], [CX + s * 44, LM.knee], [CX + s * 27, LM.ankle],
    [CX + s * 24, LM.floor], [CX + s * 9, LM.floor], [CX + s * 15, LM.ankle], [CX + s * 13, LM.knee],
  ];
  const arm = (s: number) => [
    [CX + s * 58, LM.armscye + 6], [CX + s * 74, LM.shoulderPt + 10], [CX + s * 96, 262],
    [CX + s * 104, LM.elbow], [CX + s * 108, 372], [CX + s * 106, 444], [CX + s * 102, 470],
    [CX + s * 90, 472], [CX + s * 94, 444], [CX + s * 96, 372], [CX + s * 90, LM.elbow], [CX + s * 80, 262],
  ];
  return [arm(1), arm(-1), leg(1), leg(-1), torso].map((l) => toPath(l));
}

// seated profile for body rise (local space, seat surface y≈8)
const SEAT = toPath([
  [40, -96], [12, -100], [-4, -62], [0, -12], [-8, 0], [-8, 10],
  [72, 10], [88, -6], [44, -42],
]);

// ---- measurements: every indicator references LM ----
const M = [
  // girths
  { n: 1, name: "Neck size", group: "Girths", view: "front", kind: "girth", y: LM.neckBase, w: 20, side: 1, how: "Around the base of the neck, over the bone at the back." },
  { n: 4, name: "Chest", group: "Girths", view: "front", kind: "girth", y: LM.chest, w: 58, side: 1, how: "Across the front between the underarm creases, above the bust." },
  { n: 6, name: "Bust", group: "Girths", view: "front", kind: "girth", y: LM.bust, w: 64, side: 1, how: "Around the fullest part, tape level, not pulled tight." },
  { n: 3, name: "Back width", group: "Girths", view: "back", kind: "girth", y: 190, w: 58, side: -1, how: "Across the back between the underarm creases." },
  { n: 7, name: "Top arm", group: "Girths", view: "back", kind: "girth", cx: CX + 96, y: 262, w: 16, side: 1, how: "Around the fullest part of the upper arm." },
  { n: 12, name: "Waist", group: "Girths", view: "back", kind: "girth", y: LM.waist, w: 47, side: 1, how: "Around the natural waist — tie elastic and let it settle, then measure there." },
  { n: 13, name: "Low waist", group: "Girths", view: "back", kind: "girth", y: LM.lowWaist, w: 55, side: 1, how: "Around the body about 4 cm below the natural waist." },
  { n: 14, name: "Hips", group: "Girths", view: "front", kind: "girth", y: LM.hip, w: 76, side: -1, how: "Around the fullest part of the seat, feet together." },
  { n: 11, name: "Wrist", group: "Girths", view: "back", kind: "girth", cx: CX + 106, y: 444, w: 14, side: 1, how: "Around the wrist bone." },
  { n: 19, name: "High ankle", group: "Girths", view: "front", kind: "girth", y: 690, w: 15, side: 1, how: "Around the narrowest part just above the ankle bone." },
  { n: 20, name: "Ankle", group: "Girths", view: "front", kind: "girth", y: LM.ankle, w: 16, side: -1, how: "Around the ankle bone." },
  // lengths & drops
  { n: 2, name: "Shoulder", group: "Lengths & drops", view: "front", kind: "seg", a: [CX - 16, LM.neckBase], b: [CX - 72, LM.shoulderPt], how: "Neck point to shoulder bone, along the top of the shoulder." },
  { n: 10, name: "Sleeve length", group: "Lengths & drops", view: "front", kind: "seg", a: [CX + 74, LM.shoulderPt + 10], b: [CX + 106, 444], how: "Shoulder bone, over a slightly bent elbow, to the wrist bone." },
  { n: 9, name: "Front shoulder to waist", group: "Lengths & drops", view: "front", kind: "vdrop", x: CX - 40, y1: LM.shoulderPt + 6, y2: LM.waist, side: -1, how: "From the shoulder at the neck, over the bust, to the waist." },
  { n: 5, name: "Armscye depth", group: "Lengths & drops", view: "back", kind: "vdrop", x: CX - 48, y1: LM.neckBase, y2: LM.armscye, side: -1, how: "From the nape straight down to the level of the underarms." },
  { n: 8, name: "Nape to waist", group: "Lengths & drops", view: "back", kind: "vdrop", x: CX - 74, y1: LM.neckBase, y2: LM.waist, side: -1, how: "From the nape bone straight down to the waist." },
  { n: 16, name: "Waist to hip", group: "Lengths & drops", view: "back", kind: "vdrop", x: CX + 118, y1: LM.waist, y2: LM.hip, side: 1, how: "Waist straight down to the hip line at the side." },
  { n: 17, name: "Waist to knee", group: "Lengths & drops", view: "back", kind: "vdrop", x: CX + 146, y1: LM.waist, y2: LM.knee, side: 1, how: "Waist down the side to the middle of the knee." },
  { n: 18, name: "Waist to floor", group: "Lengths & drops", view: "back", kind: "vdrop", x: CX + 174, y1: LM.waist, y2: LM.floor, side: 1, how: "Waist down the side to the floor, without shoes." },
  // seated
  { n: 15, name: "Body rise", group: "Taken sitting", view: "seated", kind: "rise", how: "Sit on a flat seat; measure the side from waist down to the seat." },
];

function markerPos(m: Record<string, any>) {
  const cx = m.cx ?? CX;
  if (m.kind === "girth") return [cx + m.side * (m.w + 13), m.y];
  if (m.kind === "vdrop") return [m.x, m.y1 + 14];
  if (m.kind === "seg") return [m.b[0] + (m.b[0] > CX ? 14 : -14), m.b[1]];
  if (m.kind === "rise") return [-20, -52];
  return [cx, m.y];
}

function Indicator({
  m,
  active,
  onEnter,
  onLeave,
}: {
  m: Record<string, any>;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const stroke = active ? ACCENT : RULE;
  const sw = active ? 2.4 : 1.6;
  const cx = m.cx ?? CX;
  const [mx, my] = markerPos(m);
  const tick = (x: number, y: number, horiz: boolean) =>
    horiz ? <line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke={stroke} strokeWidth={sw} />
          : <line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke={stroke} strokeWidth={sw} />;
  return (
    <g
      onMouseEnter={onEnter} onMouseLeave={onLeave}
      onFocus={onEnter} onBlur={onLeave} tabIndex={0}
      style={{ cursor: "pointer", outline: "none" }}
    >
      {m.kind === "girth" && (<>
        <line x1={cx - m.w} y1={m.y} x2={cx + m.w} y2={m.y} stroke={stroke} strokeWidth={sw} />
        {tick(cx - m.w, m.y, true)}{tick(cx + m.w, m.y, true)}
        <line x1={cx + m.side * m.w} y1={m.y} x2={mx} y2={my} stroke={stroke} strokeWidth={1} />
      </>)}
      {m.kind === "vdrop" && (<>
        <line x1={m.x} y1={m.y1} x2={m.x} y2={m.y2} stroke={stroke} strokeWidth={sw} />
        {tick(m.x, m.y1, false)}{tick(m.x, m.y2, false)}
      </>)}
      {m.kind === "seg" && (
        <line x1={m.a[0]} y1={m.a[1]} x2={m.b[0]} y2={m.b[1]} stroke={stroke} strokeWidth={sw + 0.4} strokeLinecap="round" />
      )}
      {m.kind === "rise" && (<>
        <line x1={-20} y1={-96} x2={-20} y2={8} stroke={stroke} strokeWidth={sw} />
        {tick(-20, -96, false)}{tick(-20, 8, false)}
      </>)}
      <circle cx={mx} cy={my} r={10} fill={active ? ACCENT : PAPER} stroke={active ? ACCENT : INK} strokeWidth={1.4} />
      <text x={mx} y={my + 0.5} textAnchor="middle" dominantBaseline="central"
            fontSize={11} fontWeight={700} fill={active ? PAPER : INK}
            style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>{m.n}</text>
    </g>
  );
}

function Figure({
  caption,
  tx,
  ty,
  view,
  activeId,
  set,
  centreLine,
}: {
  caption: string;
  tx: number;
  ty: number;
  view: string;
  activeId: number | null | undefined;
  set: (n: number | null) => void;
  centreLine?: boolean;
}) {
  const parts = useMemo(() => bodyParts(), []);
  return (
    <g transform={`translate(${tx},${ty})`}>
      <ellipse cx={CX} cy={(LM.headTop + LM.chin) / 2} rx={31} ry={(LM.chin - LM.headTop) / 2} fill={PAPER} stroke={INK} strokeWidth={2.6} />
      <line x1={CX - 15} y1={LM.chin - 2} x2={CX - 16} y2={LM.neckBase + 2} stroke={INK} strokeWidth={2.6} />
      <line x1={CX + 15} y1={LM.chin - 2} x2={CX + 16} y2={LM.neckBase + 2} stroke={INK} strokeWidth={2.6} />
      {parts.map((d, i) => <path key={i} d={d} fill={PAPER} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />)}
      {centreLine && <line x1={CX} y1={LM.neckBase + 6} x2={CX} y2={LM.crotch} stroke={RULE} strokeWidth={1} strokeDasharray="2 5" opacity={0.6} />}
      {M.filter((m) => m.view === view).map((m) => (
        <Indicator key={m.n} m={m} active={activeId === m.n}
          onEnter={() => set(m.n)} onLeave={() => set(null)} />
      ))}
      <text x={CX} y={LM.floor + 26} textAnchor="middle" fontSize={15} fill={INK}
            style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic" }}>{caption}</text>
    </g>
  );
}

interface MeasurementGuideProps {
  activeId?: number | null;
  onActiveChange?: (n: number | null) => void;
}

export default function MeasurementGuide({
  activeId: controlled,
  onActiveChange,
}: MeasurementGuideProps) {
  const [internal, setInternal] = useState<number | null>(null);
  const activeId = controlled !== undefined ? controlled : internal;
  const set = (n: number | null) => {
    setInternal(n);
    onActiveChange?.(n);
  };

  const groups = ["Girths", "Lengths & drops", "Taken sitting"];

  return (
    <div className={styles.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;1,9..144,400&display=swap');
      `}</style>

      <div className={styles.header}>
        <h1 className={styles.title}>Where to measure</h1>
        <span className={styles.eyebrow}>Cut on the Fold</span>
        <button
          type="button"
          className={`${styles.printBtn} ${styles.noPrint}`}
          onClick={() => window.print()}
        >
          Print this sheet
        </button>
      </div>
      <p className={styles.intro}>
        Standard body points used across the size charts. Hover or tap a number — on the figure or in the
        list — to see exactly where it&apos;s taken. Measure over light clothing, keep the tape level, and
        record everything in centimetres.
      </p>

      <div className={styles.layout}>
        <div className={styles.figureCard}>
        <svg className={styles.figureSvg} viewBox="0 0 850 800" role="img" aria-label="Body measurement diagram">
          <defs>
            <pattern id="mg-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0H0V20" fill="none" stroke={GRID} strokeWidth="1" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="850" height="800" fill="url(#mg-grid)" />
          <Figure caption="front" tx={0} ty={6} view="front" activeId={activeId} set={set} centreLine />
          <Figure caption="back" tx={310} ty={6} view="back" activeId={activeId} set={set} />
          <g transform="translate(700,360)">
            <rect x={-12} y={10} width={108} height={12} fill={PAPER} stroke={INK} strokeWidth={2} />
            <path d={SEAT} fill={PAPER} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
            {M.filter((m) => m.view === "seated").map((m) => (
              <Indicator key={m.n} m={m} active={activeId === m.n} onEnter={() => set(m.n)} onLeave={() => set(null)} />
            ))}
            <text x={40} y={56} textAnchor="middle" fontSize={15} fill={INK}
                  style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic" }}>taken sitting</text>
          </g>
        </svg>
        </div>

        <div>
          {groups.map((g) => (
            <div key={g} className={styles.group}>
              <div className={styles.groupTitle}>{g}</div>
              {M.filter((m) => m.group === g).sort((a, b) => a.n - b.n).map((m) => {
                const on = activeId === m.n;
                return (
                  <div
                    key={m.n}
                    className={`${styles.row} ${on ? styles.rowActive : ""}`}
                    onMouseEnter={() => set(m.n)}
                    onMouseLeave={() => set(null)}
                  >
                    <span className={`${styles.badge} ${on ? styles.badgeActive : ""}`}>{m.n}</span>
                    <span>
                      <span className={styles.itemName}>{m.name}</span>
                      <span className={styles.itemHow}>{m.how}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}