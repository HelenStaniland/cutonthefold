import MeasurementGuide from "@/app/MeasurementGuide";
import styles from "@/app/shell.module.css";

export default function MeasurementsPage() {
  return (
    <div className={`${styles.pageContentWide} ${styles.measurementGuidePage}`}>
      <MeasurementGuide />
    </div>
  );
}