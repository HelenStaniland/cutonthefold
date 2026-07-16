import { IZZY_PRESET } from "../lib/pattern/blockPresets";
import {
  BLOCK_TROUSER_STYLE,
  IZZY_TROUSER_STYLE,
} from "../lib/pattern/garmentStyles";

console.log("Izzy measured leg", {
  bottomWidth: IZZY_PRESET.measured.bottomWidth,
  frontInseamKneeInset: IZZY_PRESET.measured.frontInseamKneeInset,
  backInseamKneeInset: IZZY_PRESET.measured.backInseamKneeInset,
});
console.log("Izzy style", {
  legBottomWidth: IZZY_TROUSER_STYLE.legBottomWidth,
  frontInseamKneeInset: IZZY_TROUSER_STYLE.frontInseamKneeInset,
  backInseamKneeInset: IZZY_TROUSER_STYLE.backInseamKneeInset,
});
console.log("Block style", {
  legBottomWidth: BLOCK_TROUSER_STYLE.legBottomWidth,
  frontInseamKneeInset: BLOCK_TROUSER_STYLE.frontInseamKneeInset,
  backInseamKneeInset: BLOCK_TROUSER_STYLE.backInseamKneeInset,
});
