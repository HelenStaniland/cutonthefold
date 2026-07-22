"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import styles from "./shell.module.css";

type NavProps = {
  onNavigate?: () => void;
};

function linkClass(pathname: string, href: string, also: string[] = []) {
  const active =
    pathname === href || also.some((p) => pathname === p || pathname.startsWith(p + "/"));
  return `${styles.navLink} ${active ? styles.navLinkActive : ""}`;
}

export default function Nav({ onNavigate }: NavProps) {
  const pathname = usePathname();

  return (
    <ul className={styles.navList}>
      <li className={styles.navGroup}>
        <span className={styles.navGroupLabel}>Reference</span>
        <ul className={styles.navSubList}>
          <li>
            <Link
              href="/measurements"
              className={linkClass(pathname, "/measurements")}
              onClick={onNavigate}
            >
              Measurements
            </Link>
          </li>
          <li>
            <Link
              href="/measurements/edit"
              className={linkClass(pathname, "/measurements/edit")}
              onClick={onNavigate}
            >
              Your sizes
            </Link>
          </li>
        </ul>
      </li>
      <li className={styles.navGroup}>
        <span className={styles.navGroupLabel}>Blocks</span>
        <ul className={styles.navSubList}>
          <li>
            <Link
              href="/blocks/trouser-block"
              className={linkClass(pathname, "/blocks/trouser-block", [
                "/garments/trouser-block",
                "/garments/classic-trousers",
                "/garments/production-trousers",
              ])}
              onClick={onNavigate}
            >
              Trouser Block
            </Link>
          </li>
        </ul>
      </li>
      <li className={styles.navGroup}>
        <span className={styles.navGroupLabel}>Garments</span>
        <ul className={styles.navSubList}>
          <li>
            <Link
              href="/garments/cleo-pants"
              className={linkClass(pathname, "/garments/cleo-pants")}
              onClick={onNavigate}
            >
              Cleo Pants
            </Link>
          </li>
          <li>
            <Link
              href="/garments/mila-pants"
              className={linkClass(pathname, "/garments/mila-pants")}
              onClick={onNavigate}
            >
              Mila Pants
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
      {compact ? (
        <span className={styles.brandTitle}>Cut on the Fold</span>
      ) : (
        <span className={styles.brandTagline}>Parametric patterns</span>
      )}
    </div>
  );
}
