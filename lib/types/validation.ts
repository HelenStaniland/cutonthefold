export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  severity: ValidationSeverity;
  message: string;
  /** Input keys involved — used to highlight fields in the UI. */
  fields?: string[];
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

export function validationResult(issues: ValidationIssue[]): ValidationResult {
  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}
