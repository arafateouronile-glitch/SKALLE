import { redirect } from "next/navigation";

/** Fusionné dans Prospects → Sourcer (/goskalle/prospects) — cf. réorganisation UX Goskalle. */
export default function GoskalleHuntRedirect() {
  redirect("/goskalle/prospects?tab=sourcer");
}
