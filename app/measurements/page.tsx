"use client";

import { BODY_MEASUREMENTS } from "@/lib/types/measurements";
import { STANDARD_SIZES } from "@/lib/data/standardSizes";
import { useMeasurements } from "@/app/measurements-context";
import styles from "@/app/shell.module.css";
import { NumericInput } from "@/app/NumericInput";

export default function MeasurementsPage() {
  const { body, sizeCode, setSize, updateBodyField } = useMeasurements();

  return (
    <div className={styles.pageContent}>
      <h1>Measurements</h1>
      <p className={styles.pageIntro}>
        Body measurements shared across all garments. Pick a standard size or
        edit any field — changes apply everywhere.
      </p>

      <section className={styles.section}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="standard-size">
            Standard size
          </label>
          <span className={styles.fieldHint}>
            Aldrich standard sizing — fills all body measurements below.
          </span>
          <select
            id="standard-size"
            className={styles.sizeSelect}
            value={sizeCode}
            onChange={(e) => setSize(e.target.value)}
          >
            {STANDARD_SIZES.map((size) => (
              <option key={size.code} value={size.code}>
                {size.code}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </div>

        {BODY_MEASUREMENTS.map((def) => (
          <div key={def.key} className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={def.key}>
              {def.label}
            </label>
            <span className={styles.fieldHint}>{def.hint}</span>
            <div className={styles.inputWrap}>
              <NumericInput
                id={def.key}
                min={def.min}
                max={def.max}
                value={body[def.key]}
                onChange={(value) => updateBodyField(def.key, value)}
              />
              <span className={styles.inputSuffix}>mm</span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
