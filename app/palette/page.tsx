import styles from "./palette.module.css";

type Swatch = {
  label: string;
  color: string;
};

type Scheme = {
  name: string;
  swatches: Swatch[];
};

const SCHEMES: Scheme[] = [
  {
    name: "Light blueprint",
    swatches: [
      { label: "Sidebar", color: "#EEF4FA" },
      { label: "Workspace", color: "#F9FBFD" },
      { label: "Accent", color: "#3FA9F5" },
      { label: "Preview garment", color: "#D6E7F8" },
      { label: "Grid", color: "#C8D5E3" },
      { label: "Active selection", color: "#D6E7F8" },
    ],
  },
  {
    name: "Blueprint dark nav",
    swatches: [
      { label: "Sidebar", color: "#0B2A4A" },
      { label: "Workspace", color: "#F4F7FA" },
      { label: "Accent", color: "#3FA9F5" },
      { label: "Preview garment", color: "#B8D4F0" },
      { label: "Grid", color: "#C5D3E0" },
      { label: "Active selection", color: "#1A4A7A" },
    ],
  },
  {
    name: "Cool CAD",
    swatches: [
      { label: "Sidebar", color: "#E8ECF0" },
      { label: "Workspace", color: "#F2F4F6" },
      { label: "Accent", color: "#2563EB" },
      { label: "Preview garment", color: "#CBD5E1" },
      { label: "Grid", color: "#D1D9E0" },
      { label: "Active selection", color: "#DBEAFE" },
    ],
  },
  {
    name: "Electric atelier",
    swatches: [
      { label: "Sidebar", color: "#DBEAFE" },
      { label: "Workspace", color: "#F0F7FF" },
      { label: "Accent", color: "#0EA5E9" },
      { label: "Preview garment", color: "#93C5FD" },
      { label: "Grid", color: "#BFDBFE" },
      { label: "Active selection", color: "#BFDBFE" },
    ],
  },
  {
    name: "Drafting studio",
    swatches: [
      { label: "Sidebar", color: "#E4EDF2" },
      { label: "Workspace", color: "#F7FAFB" },
      { label: "Accent", color: "#2B8CBE" },
      { label: "Preview garment", color: "#C2D9E8" },
      { label: "Grid", color: "#B8CCD8" },
      { label: "Active selection", color: "#D0E4EF" },
    ],
  },
  {
    name: "Crisp paper",
    swatches: [
      { label: "Sidebar", color: "#F5F8FA" },
      { label: "Workspace", color: "#FFFFFF" },
      { label: "Accent", color: "#1D6FD8" },
      { label: "Preview garment", color: "#E2EAF2" },
      { label: "Grid", color: "#DDE4EC" },
      { label: "Active selection", color: "#E8F0FA" },
    ],
  },
];

export default function PalettePage() {
  return (
    <main className={styles.page}>
      <p className={styles.title}>Temporary colour comparison</p>
      <p className={styles.subtitle}>
        Six schemes — strips only. Delete when done.
      </p>

      <div className={styles.grid}>
        {SCHEMES.map((scheme) => (
          <section key={scheme.name} className={styles.scheme}>
            <h2 className={styles.schemeName}>{scheme.name}</h2>
            <div className={styles.strip}>
              {scheme.swatches.map((swatch) => (
                <div key={swatch.label}>
                  <div
                    className={styles.swatch}
                    style={{ backgroundColor: swatch.color }}
                    title={swatch.color}
                  />
                  <p className={styles.label}>{swatch.label}</p>
                  <p className={styles.hex}>{swatch.color}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
