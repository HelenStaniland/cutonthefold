/**
 * Run: npm run verify:aldrich
 * Fails with exit 1 on critical Aldrich mismatches.
 */
import {
  formatAldrichReport,
  verifyAldrichProductionDepth0,
} from "../lib/patterns/aldrichProductionVerify";

const checks = verifyAldrichProductionDepth0({ assert: true });
console.log(formatAldrichReport(checks));
