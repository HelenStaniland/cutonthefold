import type { ReactNode } from "react";
import styles from "@/app/shell.module.css";

type SidebarSectionProps = {
  title: string;
  children: ReactNode;
  /** When true, section is a collapsible panel (default open unless defaultOpen is false). */
  collapsible?: boolean;
  defaultOpen?: boolean;
};

export function SidebarSection({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
}: SidebarSectionProps) {
  if (collapsible) {
    return (
      <details
        className={styles.sidebarSectionCollapsible}
        {...(defaultOpen ? { open: true } : {})}
      >
        <summary className={styles.sectionTitle}>{title}</summary>
        <div className={styles.sidebarSectionBody}>{children}</div>
      </details>
    );
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

type SidebarSubsectionProps = {
  title: string;
  children: ReactNode;
};

export function SidebarSubsection({ title, children }: SidebarSubsectionProps) {
  return (
    <div className={styles.sidebarSubsection}>
      <h3 className={styles.sidebarSubsectionTitle}>{title}</h3>
      {children}
    </div>
  );
}
