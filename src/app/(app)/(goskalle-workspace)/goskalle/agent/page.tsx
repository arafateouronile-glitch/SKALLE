import { redirect } from "next/navigation";

/** Fusionné dans Aujourd'hui (/goskalle) — cf. réorganisation UX Goskalle. */
export default function GoskalleAgentRedirect() {
  redirect("/goskalle");
}
