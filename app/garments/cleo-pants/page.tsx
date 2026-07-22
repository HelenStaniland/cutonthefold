import TrousersView from "@/app/garments/TrousersView";
import { CLEO_TROUSER_STYLE } from "@/lib/pattern/garmentStyles";

export default function CleoPantsPage() {
  return (
    <TrousersView
      title="Cleo Pants"
      garmentId="cleo-pants"
      defaults={CLEO_TROUSER_STYLE}
      showResetToPreset
    />
  );
}
