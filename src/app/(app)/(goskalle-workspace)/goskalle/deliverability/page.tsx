import { redirect } from "next/navigation";

/** Fusionné dans Réglages (/goskalle/settings) — cf. réorganisation UX Goskalle. */
export default function GoskalleDeliverabilityRedirect() {
  redirect("/goskalle/settings?tab=email");
}
