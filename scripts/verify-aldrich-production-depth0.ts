/**
 * Run: npm run verify:aldrich
 * Fails with exit 1 on critical Aldrich mismatches.
 */
import {
  formatAldrichReport,
  verifyAldrichProductionDepth0,
  verifyCrotchCurveTouchAtDefaults,
  verifyCrotchTouchFormula,
  verifyFrontWaistSeamBow,
} from "../lib/patterns/aldrichProductionVerify";

const touchChecks = verifyCrotchTouchFormula({ assert: true });
const curveTouchChecks = verifyCrotchCurveTouchAtDefaults({ assert: true });
const bowChecks = verifyFrontWaistSeamBow({ assert: true });
const aldrichChecks = verifyAldrichProductionDepth0({ assert: true });
const checks = [
  ...touchChecks,
  ...curveTouchChecks,
  ...bowChecks,
  ...aldrichChecks,
];
console.log(formatAldrichReport(checks));
