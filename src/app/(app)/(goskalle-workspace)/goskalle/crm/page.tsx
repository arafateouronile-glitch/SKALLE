import { redirect } from "next/navigation";

/** Fusionné dans Prospects → Pipeline (/goskalle/prospects?tab=pipeline) — cf. réorganisation UX Goskalle. */
export default function GoskalleCrmRedirect() {
  redirect("/goskalle/prospects?tab=pipeline");
}
