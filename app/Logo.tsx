import type { CSSProperties } from "react";
import styles from "./shell.module.css";
import { LOGO_FULL, LOGO_ICON } from "./logoMasks";

type LogoProps = {
  /** Icon only — fold line + bodice — for tight mobile header slots. */
  compact?: boolean;
};

function maskStyle(url: string): CSSProperties {
  return {
    WebkitMaskImage: `url(${url})`,
    maskImage: `url(${url})`,
  };
}

export default function Logo({ compact = false }: LogoProps) {
  const mask = compact ? LOGO_ICON : LOGO_FULL;

  return (
    <span
      className={`${styles.logo} ${compact ? styles.logoMark : styles.logoFull}`}
      style={{ aspectRatio: `${mask.width} / ${mask.height}` }}
      role="img"
      aria-label="Cut on the Fold"
    >
      <span className={styles.logoFoldLayer} style={maskStyle(mask.fold)} />
      <span className={styles.logoInkLayer} style={maskStyle(mask.ink)} />
    </span>
  );
}
