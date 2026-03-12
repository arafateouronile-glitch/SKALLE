import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getCalendarPostsAction } from "@/actions/social-publish";
import { ContentCalendarClient } from "./ContentCalendarClient";

export default async function ContentCalendarPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!workspace) redirect("/marketing-os");

  const { scheduled, drafts } = await getCalendarPostsAction(workspace.id);

  return (
    <ContentCalendarClient
      workspaceId={workspace.id}
      initialScheduled={scheduled}
      initialDrafts={drafts}
    />
  );
}
