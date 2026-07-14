import { redirect } from "next/navigation";

/** Legacy path — Trouser Block now lives under /blocks. */
export default function LegacyTrouserBlockPage() {
  redirect("/blocks/trouser-block");
}
