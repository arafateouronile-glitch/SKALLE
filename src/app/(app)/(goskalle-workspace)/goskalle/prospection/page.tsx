import { redirect } from "next/navigation";

/** Fusionné dans Conversations → Créer une séquence (/goskalle/conversations) — cf. réorganisation UX Goskalle. */
export default function GoskalleProspectionRedirect() {
  redirect("/goskalle/conversations?tab=builder");
}
