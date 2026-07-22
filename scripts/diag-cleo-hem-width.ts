import { CLEO_PRESET } from "../lib/pattern/blockPresets";
import {
  BLOCK_TROUSER_STYLE,
  CLEO_TROUSER_STYLE,
} from "../lib/pattern/garmentStyles";

console.log("Cleo measured leg", {
  bottomWidth: CLEO_PRESET.measured.bottomWidth,
  frontInseamKneeInset: CLEO_PRESET.measured.frontInseamKneeInset,
  backInseamKneeInset: CLEO_PRESET.measured.backInseamKneeInset,
});
console.log("Cleo style", {
  legBottomWidth: CLEO_TROUSER_STYLE.legBottomWidth,
  frontInseamKneeInset: CLEO_TROUSER_STYLE.frontInseamKneeInset,
  backInseamKneeInset: CLEO_TROUSER_STYLE.backInseamKneeInset,
});
console.log("Block style", {
  legBottomWidth: BLOCK_TROUSER_STYLE.legBottomWidth,
  frontInseamKneeInset: BLOCK_TROUSER_STYLE.frontInseamKneeInset,
  backInseamKneeInset: BLOCK_TROUSER_STYLE.backInseamKneeInset,
});
