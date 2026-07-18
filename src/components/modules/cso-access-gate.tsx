"use client";

import { usePathname } from "next/navigation";

export function CsoAccessGate({
  hasCsoAccess,
  children,
  fallback,
}: {
  hasCsoAccess: boolean;
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const pathname = usePathname();
  const isSettingsPage = pathname.includes("/sales-os/settings");

  if (!hasCsoAccess && !isSettingsPage) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
