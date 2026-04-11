// Ffads — Offline Queue Manager
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@ffads_offline_queue';

/**
 * Get all pending jobs from the queue
 */
export async function getQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Add a job to the offline queue
 * @param {'product_save'|'analysis_save'|'off_contribution'} type
 * @param {Object} payload — the data to sync
 */
export async function enqueue(type, payload) {
  const queue = await getQueue();
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  queue.push({
    id: jobId,
    type,
    payload,
    status: 'pending',
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
  console.log(`📋 [Queue] ENQUEUE → Job "${type}" added (id: ${jobId}) | Queue size: ${queue.length}`);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Process all pending jobs in the queue
 * @param {Object} handlers — { product_save: fn, analysis_save: fn, off_contribution: fn }
 */
export async function processQueue(handlers = {}) {
  const queue = await getQueue();
  const pending = queue.filter((j) => j.status === 'pending');

  if (pending.length === 0) {
    console.log(`📋 [Queue] PROCESS → No pending jobs`);
    return { processed: 0, failed: 0 };
  }

  console.log(`📋 [Queue] PROCESS → Processing ${pending.length} pending job(s)...`);
  let processed = 0;
  let failed = 0;

  for (const job of pending) {
    try {
      const handler = handlers[job.type];
      if (handler) {
        console.log(`📋 [Queue] PROCESS → Running job "${job.type}" (id: ${job.id})...`);
        await handler(job.payload);
        job.status = 'done';
        processed++;
        console.log(`📋 [Queue] PROCESS → ✅ Job "${job.id}" completed`);
      }
    } catch (error) {
      job.retryCount++;
      console.warn(`📋 [Queue] PROCESS → ⚠️ Job "${job.id}" failed (retry ${job.retryCount}/3): ${error.message}`);
      if (job.retryCount >= 3) {
        job.status = 'failed';
        job.error = error.message;
        failed++;
        console.error(`📋 [Queue] PROCESS → ❌ Job "${job.id}" permanently failed after 3 retries`);
      }
    }
  }

  // Save updated queue (keep failed for inspection, remove done)
  const updated = queue.filter((j) => j.status !== 'done');
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));

  console.log(`📋 [Queue] PROCESS → Done: ${processed} processed, ${failed} failed, ${updated.length} remaining`);
  return { processed, failed };
}

/**
 * Get queue status summary
 */
export async function getQueueStatus() {
  const queue = await getQueue();
  return {
    total: queue.length,
    pending: queue.filter((j) => j.status === 'pending').length,
    failed: queue.filter((j) => j.status === 'failed').length,
  };
}

/**
 * Clear entire queue
 */
export async function clearQueue() {
  console.log(`📋 [Queue] CLEAR → Removing all queued jobs`);
  await AsyncStorage.removeItem(QUEUE_KEY);
}
