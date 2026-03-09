import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { IntegrationsClient } from "./IntegrationsClient";

export default async function IntegrationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!workspace) redirect("/marketing-os");

  return <IntegrationsClient workspaceId={workspace.id} />;
}
