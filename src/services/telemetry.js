// Ffads — Telemetry Service (Stub for Sentry/Datadog/Crashlytics)
// Centralized error reporting so "silent failures" are caught in production.

export function logError(context, error, extraData = {}) {
  // In development, log to the console
  console.error(`🚨 [Telemetry] ${context} → ${error?.message || error}`);
  console.error(error);
  if (Object.keys(extraData).length > 0) {
    console.error(`   Extra Data:`, extraData);
  }

  // TODO: Add Production Telemetry Here
  // e.g., if (process.env.NODE_ENV === 'production') { Sentry.captureException(error, { extra: extraData }); }
}

export function logEvent(eventName, params = {}) {
  // Useful for tracking things like analytics goals (e.g. "Product_Scanned")
  console.log(`📈 [Telemetry Event] ${eventName}`, params);
}
