// Ffads — Offline Queue Manager (Production v2)
// Storage: AsyncStorage under key @ffads_offline_queue
//
// Production Fixes Applied:
//   1. Concurrency lock (_isProcessing flag) — prevents ThunderingHerd on reconnect
//   2. Payload size guard — logs a warning if a single job would bust the 6MB limit
//   3. processQueue() always releases the lock via finally block (crash-safe)
//
// NOTE: We deliberately keep AsyncStorage for simplicity. The 6MB limit is only
// hit if you store raw image base64 in the payload — which we don't.
// The soft-limit warning fires at 512KB per payload so you know early if this changes.

import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY           = '@ffads_offline_queue';
const MAX_PAYLOAD_BYTES   = 512 * 1024; // 512 KB per job — warn if exceeded

// ─── Concurrency Lock ─────────────────────────────────────────────────────────
// Module-level flag: if processQueue() is currently running, a second call bails out.
let _isProcessing = false;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Get all jobs from the queue.
 * Returns empty array on any read/parse error.
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
 * Save the queue array back to AsyncStorage.
 */
async function saveQueue(queue) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Add a job to the offline queue.
 *
 * @param {'product_save'|'analysis_save'|'off_contribution'} type
 * @param {Object} payload — the data to sync when online again
 */
export async function enqueue(type, payload) {
  // Payload size check — warn before AsyncStorage limit becomes a problem
  try {
    const byteSize = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (byteSize > MAX_PAYLOAD_BYTES) {
      console.warn(
        `📋 [Queue] ⚠️ LARGE PAYLOAD — "${type}" job is ${(byteSize / 1024).toFixed(0)}KB. ` +
        `Consider stripping raw base64 images from the payload before queuing.`
      );
    }
  } catch { /* TextEncoder may not be available on all RN versions — skip */ }

  const queue = await getQueue();
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  queue.push({
    id:         jobId,
    type,
    payload,
    status:     'pending',
    createdAt:  new Date().toISOString(),
    retryCount: 0,
  });

  console.log(`📋 [Queue] ENQUEUE → Job "${type}" added (id: ${jobId}) | Queue size: ${queue.length}`);
  await saveQueue(queue);
}

/**
 * Process all pending jobs in the queue.
 *
 * PRODUCTION FIX — Concurrency Lock:
 * If this function is already running (e.g. triggered twice in quick succession
 * when connectivity is restored), the second call returns immediately.
 * This prevents duplicate product saves and duplicate contributions.
 *
 * @param {Object} handlers — { product_save: fn, analysis_save: fn, off_contribution: fn }
 * @returns {{ processed: number, failed: number, skipped?: boolean }}
 */
export async function processQueue(handlers = {}) {
  // ── Concurrency guard ──
  if (_isProcessing) {
    console.log(`📋 [Queue] PROCESS → Already running — skipping duplicate call (ThunderingHerd guard)`);
    return { processed: 0, failed: 0, skipped: true };
  }

  _isProcessing = true;
  console.log(`📋 [Queue] PROCESS → 🔒 Lock acquired`);

  try {
    const queue   = await getQueue();
    const pending = queue.filter((j) => j.status === 'pending');

    if (pending.length === 0) {
      console.log(`📋 [Queue] PROCESS → No pending jobs`);
      return { processed: 0, failed: 0 };
    }

    console.log(`📋 [Queue] PROCESS → Processing ${pending.length} pending job(s)...`);
    let processed = 0;
    let failed    = 0;

    for (const job of pending) {
      try {
        const handler = handlers[job.type];
        if (!handler) {
          console.warn(`📋 [Queue] PROCESS → ⚠️ No handler for job type "${job.type}" — skipping`);
          continue;
        }

        console.log(`📋 [Queue] PROCESS → Running job "${job.type}" (id: ${job.id}, attempt: ${job.retryCount + 1}/3)...`);
        await handler(job.payload);
        job.status = 'done';
        processed++;
        console.log(`📋 [Queue] PROCESS → ✅ Job "${job.id}" completed`);

      } catch (error) {
        job.retryCount++;
        console.warn(`📋 [Queue] PROCESS → ⚠️ Job "${job.id}" failed (retry ${job.retryCount}/3): ${error.message}`);
        if (job.retryCount >= 3) {
          job.status = 'failed';
          job.error  = error.message;
          failed++;
          console.error(`📋 [Queue] PROCESS → ❌ Job "${job.id}" permanently failed after 3 retries`);
        }
      }
    }

    // Persist: drop completed jobs, keep failed for inspection
    const updated = queue.filter((j) => j.status !== 'done');
    await saveQueue(updated);

    console.log(`📋 [Queue] PROCESS → Done: ${processed} processed, ${failed} failed, ${updated.length} remaining`);
    return { processed, failed };

  } finally {
    // Always release the lock — even if an unexpected error is thrown above
    _isProcessing = false;
    console.log(`📋 [Queue] PROCESS → 🔓 Lock released`);
  }
}

/**
 * Get queue status summary (for Profile screen / developer panel).
 */
export async function getQueueStatus() {
  const queue = await getQueue();
  return {
    total:   queue.length,
    pending: queue.filter((j) => j.status === 'pending').length,
    failed:  queue.filter((j) => j.status === 'failed').length,
  };
}

/**
 * Clear entire queue (including failed jobs).
 * Use in developer tools / profile reset.
 */
export async function clearQueue() {
  console.log(`📋 [Queue] CLEAR → Removing all queued jobs`);
  await AsyncStorage.removeItem(QUEUE_KEY);
}

/**
 * Check if the queue processor is currently running.
 * Useful for showing a "Syncing..." indicator in the UI.
 */
export function isQueueProcessing() {
  return _isProcessing;
}
