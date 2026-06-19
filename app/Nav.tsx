"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import styles from "./shell.module.css";

type NavProps = {
  onNavigate?: () => void;
};

export default function Nav({ onNavigate }: NavProps) {
  const pathname = usePathname();

  return (
    <ul className={styles.navList}>
      <li>
        <Link
          href="/measurements"
          className={`${styles.navLink} ${pathname === "/measurements" ? styles.navLinkActive : ""}`}
          onClick={onNavigate}
        >
          Measurements
        </Link>
      </li>
      <li className={styles.navGroup}>
        <span className={styles.navGroupLabel}>Garments</span>
        <ul className={styles.navSubList}>
          <li>
            <Link
              href="/garments/gathered-skirt"
              className={`${styles.navLink} ${pathname === "/garments/gathered-skirt" ? styles.navLinkActive : ""}`}
              onClick={onNavigate}
            >
              Gathered skirt
            </Link>
          </li>
          <li>
            <Link
              href="/garments/tailored-trousers"
              className={`${styles.navLink} ${pathname === "/garments/tailored-trousers" ? styles.navLinkActive : ""}`}
              onClick={onNavigate}
            >
              Tailored trousers
            </Link>
          </li>
        </ul>
      </li>
    </ul>
  );
}

export function NavBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`${styles.navBrand} ${compact ? styles.navBrandCompact : ""}`}
    >
      <Logo compact={compact} />
      {!compact && (
        <span className={styles.brandTagline}>Parametric patterns</span>
      )}
    </div>
  );
}
