import type { CSSProperties } from "react";
import styles from "./shell.module.css";
import { LOGO_FULL, LOGO_ICON } from "./logoMasks";

type LogoProps = {
  /** Icon only — fold line + bodice — for tight mobile header slots. */
  compact?: boolean;
};

function maskStyle(url: string): CSSProperties {
  return {
    WebkitMaskImage: `url("${url}")`,
    maskImage: `url("${url}")`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "left center",
    maskPosition: "left center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
  };
}

export default function Logo({ compact = false }: LogoProps) {
  const mask = compact ? LOGO_ICON : LOGO_FULL;

  return (
    <span
      className={`${styles.logo} ${compact ? styles.logoMark : styles.logoFull}`}
      role="img"
      aria-label="Cut on the Fold"
    >
      <span className={styles.logoFoldLayer} style={maskStyle(mask.fold)} />
      <span className={styles.logoInkLayer} style={maskStyle(mask.ink)} />
    </span>
  );
}
