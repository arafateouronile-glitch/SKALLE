"use client";

import { useState, useEffect } from "react";
import { getUserWorkspace } from "@/actions/leads";

let _cachedWorkspaceId: string | null = null;

export function useWorkspace() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    _cachedWorkspaceId
  );
  const [isLoading, setIsLoading] = useState(!_cachedWorkspaceId);

  useEffect(() => {
    if (_cachedWorkspaceId) {
      setWorkspaceId(_cachedWorkspaceId);
      setIsLoading(false);
      return;
    }
    getUserWorkspace().then((result) => {
      if (result.success && result.workspaceId) {
        _cachedWorkspaceId = result.workspaceId;
        setWorkspaceId(result.workspaceId);
      }
      setIsLoading(false);
    });
  }, []);

  return { workspaceId, isLoading };
}
