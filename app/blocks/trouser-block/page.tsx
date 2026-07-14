import TrousersView from "@/app/garments/TrousersView";
import { BLOCK_TROUSER_STYLE } from "@/lib/pattern/garmentStyles";

export default function TrouserBlockPage() {
  return (
    <TrousersView
      title="Trouser Block"
      garmentId="trouser-block"
      defaults={BLOCK_TROUSER_STYLE}
      showResetToBlock
    />
  );
}
