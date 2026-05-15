import { getClient } from './client';
import { logError } from '../telemetry';

export async function logProcessingEvent(payload = {}) {
  const client = getClient();
  if (!client) {
    return { success: false, offline: true };
  }

  try {
    const { error } = await client.from('processing_events').insert([{
      job_id: payload.jobId || null,
      event_type: payload.eventType || 'unknown',
      stage: payload.stage || null,
      status: payload.status || 'info',
      barcode: payload.barcode || null,
      personal_product_id: payload.personalProductId || null,
      owner_email: payload.ownerEmail || null,
      provider_id: payload.providerId || null,
      provider_label: payload.providerLabel || null,
      model: payload.model || null,
      masked_key: payload.maskedKey || null,
      route_id: payload.routeId || null,
      attempt_number: payload.attemptNumber ?? null,
      message: payload.message || null,
      payload: payload.payload || null,
    }]);

    if (error) {
      logError('Supabase Processing Event', error, payload);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    logError('Supabase Processing Event', error, payload);
    return { success: false, error: error.message };
  }
}
