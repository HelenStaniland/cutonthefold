import TrousersView from "@/app/garments/TrousersView";
import { CARGO_TROUSER_STYLE } from "@/lib/pattern/garmentStyles";

export default function CargoPantsPage() {
  return (
    <TrousersView
      title="Cargo Pants"
      garmentId="cargo-pants"
      defaults={CARGO_TROUSER_STYLE}
      showResetToPreset
    />
  );
}
