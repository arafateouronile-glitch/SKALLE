"use client";

import { usePathname } from "next/navigation";

export function GoskalleAccessGate({
  hasGoskalleAccess,
  children,
  fallback,
}: {
  hasGoskalleAccess: boolean;
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const pathname = usePathname();
  const isSettingsPage = pathname.includes("/goskalle/settings");

  if (!hasGoskalleAccess && !isSettingsPage) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
