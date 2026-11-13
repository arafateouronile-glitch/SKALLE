import { redirect } from "next/navigation";

/** Fusionné dans Conversations → Boîte de réception (/goskalle/conversations) — cf. réorganisation UX Goskalle. */
export default function GoskalleInboxRedirect() {
  redirect("/goskalle/conversations?tab=inbox");
}
