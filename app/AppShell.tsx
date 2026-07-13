"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Nav, { NavBrand } from "./Nav";
import styles from "./shell.module.css";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const navWasOpenRef = useRef(false);

  const closeNav = useCallback(() => setNavOpen(false), []);

  useEffect(() => {
    if (navOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeNav();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen, closeNav]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (media.matches) {
        setNavOpen(false);
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (navOpen) {
      navWasOpenRef.current = true;
      drawerCloseRef.current?.focus();
    } else if (navWasOpenRef.current) {
      menuButtonRef.current?.focus();
    }
  }, [navOpen]);

  return (
    <div className={styles.page}>
      <header className={styles.mobileTopBar}>
        <NavBrand compact />
        <button
          ref={menuButtonRef}
          type="button"
          className={styles.menuButton}
          aria-label={navOpen ? "Close menu" : "Open menu"}
          aria-expanded={navOpen}
          aria-controls="mobile-nav-drawer"
          onClick={() => (navOpen ? closeNav() : setNavOpen(true))}
        >
          <span className={styles.menuIcon} aria-hidden />
        </button>
      </header>

      <div className={styles.appFrame}>
        <aside className={styles.desktopNav} aria-label="Main">
          <NavBrand />
          <Nav />
        </aside>

        <main className={styles.mainContent}>{children}</main>
      </div>

      <div
        className={`${styles.navScrim} ${navOpen ? styles.navScrimVisible : ""}`}
        onClick={closeNav}
        aria-hidden={!navOpen}
      />

      <nav
        id="mobile-nav-drawer"
        className={`${styles.mobileDrawer} ${navOpen ? styles.mobileDrawerOpen : ""}`}
        aria-label="Main"
        aria-hidden={!navOpen}
        inert={navOpen ? undefined : true}
      >
        <div className={styles.mobileDrawerHeader}>
          <NavBrand compact />
          <button
            ref={drawerCloseRef}
            type="button"
            className={styles.drawerCloseButton}
            aria-label="Close menu"
            onClick={closeNav}
          >
            <span aria-hidden>×</span>
          </button>
        </div>
        <Nav onNavigate={closeNav} />
      </nav>
    </div>
  );
}
