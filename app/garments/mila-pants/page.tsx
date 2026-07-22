import TrousersView from "@/app/garments/TrousersView";
import { MILA_TROUSER_STYLE } from "@/lib/pattern/garmentStyles";

export default function MilaPantsPage() {
  return (
    <TrousersView
      title="Mila Pants"
      garmentId="mila-pants"
      defaults={MILA_TROUSER_STYLE}
      showResetToPreset
    />
  );
}
