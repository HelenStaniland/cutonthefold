import TrousersView from "@/app/garments/TrousersView";
import { IZZY_TROUSER_STYLE } from "@/lib/pattern/garmentStyles";

export default function IzzyPantsPage() {
  return (
    <TrousersView
      title="Izzy Pants"
      garmentId="izzy-pants"
      defaults={IZZY_TROUSER_STYLE}
      showResetToPreset
    />
  );
}
