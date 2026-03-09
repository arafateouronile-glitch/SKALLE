import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

const ADMIN_EMAIL_KEY = "ADMIN_EMAIL";
const SKALLE_ADMIN_EMAILS_KEY = "SKALLE_ADMIN_EMAILS";

function getAdminEmails(): string[] {
  const single = process.env[ADMIN_EMAIL_KEY];
  if (single) return [single.trim().toLowerCase()];
  const list = process.env[SKALLE_ADMIN_EMAILS_KEY];
  if (!list) return [];
  return list.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/404");
  }

  const adminEmails = getAdminEmails();
  const email = session.user.email.toLowerCase();
  if (adminEmails.length === 0 || !adminEmails.includes(email)) {
    redirect("/404");
  }

  return <>{children}</>;
}
