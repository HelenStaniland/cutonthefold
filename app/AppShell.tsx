"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./shell.module.css";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className={styles.page}>
      <div className={styles.appFrame}>
        <nav className={styles.mainNav} aria-label="Main">
          <div className={styles.navBrand}>
            <div className={styles.logo} aria-hidden />
            <div className={styles.brandText}>
              <span className={styles.brandTitle}>Cut on the Fold</span>
              <span className={styles.brandTagline}>Parametric patterns</span>
            </div>
          </div>

          <ul className={styles.navList}>
            <li>
              <Link
                href="/measurements"
                className={`${styles.navLink} ${pathname === "/measurements" ? styles.navLinkActive : ""}`}
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
                  >
                    Gathered skirt
                  </Link>
                </li>
              </ul>
            </li>
          </ul>
        </nav>

        <main className={styles.mainContent}>{children}</main>
      </div>
    </div>
  );
}
