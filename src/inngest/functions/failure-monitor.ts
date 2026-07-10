/**
 * Global Inngest failure monitor.
 *
 * Fires on every `inngest/function.failed` event (after all retries are exhausted)
 * and forwards the error to Sentry with structured context.
 *
 * This covers ALL Inngest functions — no need to add per-function onFailure handlers.
 */

import * as Sentry from "@sentry/nextjs";
import { inngest } from "../client";
import { logger } from "@/lib/logger";

// Functions whose failures are expected / handled elsewhere — skip Sentry noise
const EXCLUDED_FUNCTION_IDS = new Set([
  "video-ads-pipeline",  // handled by videoAdPipelineFailure (credit refund)
]);

export const inngestFailureMonitor = inngest.createFunction(
  { id: "inngest-failure-monitor", name: "Global Inngest Failure Monitor" },
  { event: "inngest/function.failed" },
  async ({ event }) => {
    const fnId: string = (event.data?.function_id as string) ?? "unknown";
    const error = event.data?.error as { message?: string; name?: string; stack?: string } | undefined;
    const originalEvent = event.data?.event as { name?: string; data?: unknown } | undefined;

    if (EXCLUDED_FUNCTION_IDS.has(fnId)) return;

    const errorMessage = error?.message ?? "Erreur inconnue";
    const errorName = error?.name ?? "Error";

    logger.error(`[Inngest failure] ${fnId}: ${errorMessage}`, {
      functionId: fnId,
      originalEvent: originalEvent?.name,
      error: errorMessage,
    });

    Sentry.withScope((scope) => {
      scope.setTag("inngest.function_id", fnId);
      scope.setTag("inngest.event", originalEvent?.name ?? "unknown");
      scope.setContext("inngest", {
        function_id: fnId,
        original_event: originalEvent?.name,
        event_data: originalEvent?.data,
      });

      const err = new Error(`[Inngest] ${fnId}: ${errorMessage}`);
      err.name = errorName;
      if (error?.stack) err.stack = error.stack;

      Sentry.captureException(err);
    });
  }
);
