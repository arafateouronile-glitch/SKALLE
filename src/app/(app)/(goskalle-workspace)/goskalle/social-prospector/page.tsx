import { redirect } from "next/navigation";

/** Fusionné dans Prospects → Sourcer → Warm Leads (/goskalle/prospects) — cf. réorganisation UX Goskalle. */
export default function GoskalleSocialProspectorRedirect() {
  redirect("/goskalle/prospects?tab=sourcer");
}
