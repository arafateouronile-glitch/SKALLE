import { redirect } from "next/navigation";

/** Fusionné dans Conversations → Séquences actives (/goskalle/conversations) — cf. réorganisation UX Goskalle. */
export default function GoskalleOutreachRedirect() {
  redirect("/goskalle/conversations?tab=sequences");
}
