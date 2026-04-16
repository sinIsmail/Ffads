// Ffads — Supabase Contributions (Production v2)
// Fixes:
//   - getUserScanHistory() now returns product names via join (no N+1 lookups)
//   - getUserScanHistory() now supports offset pagination
//   - getScanCount() added for efficient server-side COUNT (no full download)
//   - recordScan() documentation updated to reflect device_id gap

import { getClient } from './client';
import { logError } from '../telemetry';

// ─── User Scans (History) ─────────────────────────────────────────────────────

/**
 * Log a barcode scan to the global user_scans table.
 * Attaches user email if the user is signed in.
 *
 * NOTE: device_id is not written here because we don't pass it through.
 * That FK column remains NULL. Safe to ignore unless you add device-level analytics.
 */
export async function recordScan(barcode, userEmail = null) {
  const client = getClient();
  if (!client) {
    console.warn(`📊 [Supabase:Scans] ⚠️ Client not configured — skipping scan log for "${barcode}"`);
    return;
  }

  try {
    const row = { barcode };
    if (userEmail) row.user_email = userEmail;

    // Per-user isolation: also write the auth UUID so admin SQL queries can JOIN auth.users
    // Wrapped in .catch() so guest-mode scans never fail here
    const { data: { user } } = await client.auth.getUser().catch(() => ({ data: { user: null } }));
    if (user?.id) row.user_id = user.id;

    console.log(`📊 [Supabase:Scans] WRITE → Logging scan "${barcode}" (user: ${userEmail || 'anonymous'}, uid: ${user?.id || 'none'})...`);
    await client.from('user_scans').insert(row);
    console.log(`📊 [Supabase:Scans] ✅ Scan logged for "${barcode}"`);
  } catch (e) {
    logError('Supabase Scan Log', e, { barcode, userEmail });
  }
}

/**
 * Fetch paginated scan history for a user.
 *
 * FIXED: Now joins with the products table so callers get product names
 * rather than doing N separate lookups after receiving the barcodes.
 *
 * FIXED: Supports pagination via `offset` parameter to avoid loading all
 * history at once (which slows startup and wastes mobile data).
 *
 * @param {string|null} userEmail
 * @param {number} limit  — rows per page (default 20 for production)
 * @param {number} offset — starting row (0 = first page)
 * @returns {Array<{barcode, scanned_at, products: {name, brand, nutriscore, nova_group}}>}
 */
export async function getUserScanHistory(userEmail = null, limit = 20, offset = 0) {
  const client = getClient();
  if (!client) return [];

  try {
    console.log(`📊 [Supabase:Scans] READ → Scan history (user: ${userEmail || 'all'}, limit: ${limit}, offset: ${offset})...`);

    let query = client
      .from('user_scans')
      .select('barcode, scanned_at, products(name, brand, nutriscore, nova_group)')
      .order('scanned_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userEmail) query = query.eq('user_email', userEmail);

    const { data, error } = await query;

    if (error) {
      console.warn(`📊 [Supabase:Scans] ⚠️ Fetch failed: ${error.message}`);
      return [];
    }

    console.log(`📊 [Supabase:Scans] ✅ Retrieved ${data?.length || 0} scan records (page offset ${offset})`);
    return data || [];
  } catch (e) {
    console.error(`📊 [Supabase:Scans] ❌ Error: ${e.message}`);
    return [];
  }
}

/**
 * Get the total scan count for a user — server-side COUNT, no data downloaded.
 * Use this for displaying "Total Scans: 142" in the Profile screen instead
 * of fetching the full history array and calling .length.
 *
 * @param {string|null} userEmail
 * @returns {number}
 */
export async function getScanCount(userEmail = null) {
  const client = getClient();
  if (!client) return 0;

  try {
    let query = client
      .from('user_scans')
      .select('id', { count: 'exact', head: true });

    if (userEmail) query = query.eq('user_email', userEmail);

    const { count, error } = await query;
    if (error) return 0;

    console.log(`📊 [Supabase:Scans] COUNT → ${count} scans for "${userEmail || 'all'}"`);
    return count || 0;
  } catch {
    return 0;
  }
}

// ─── User Contributions ───────────────────────────────────────────────────────

/**
 * Log an OCR/image contribution to user_contributions.
 *
 * RLS policy requires contributor_email = auth.email().
 * Bug #4 fix: if email is missing on payload (race condition on first launch),
 * we resolve it from the live JWT before the insert.
 */
export async function logUserContribution(payload) {
  const client = getClient();
  if (!client) {
    console.warn(`🤝 [Supabase:Contributions] ⚠️ Client not configured — skipping`);
    return;
  }

  try {
    let contributorEmail = payload.contributorEmail || null;
    if (!contributorEmail) {
      try {
        const { data: { user } } = await client.auth.getUser();
        if (user?.email) {
          contributorEmail = user.email;
          console.log(`🤝 [Supabase:Contributions] 🔑 Resolved email from JWT: "${contributorEmail}"`);
        }
      } catch (authErr) {
        console.warn(`🤝 [Supabase:Contributions] ⚠️ Could not resolve email from JWT: ${authErr.message}`);
      }
    }

    console.log(`🤝 [Supabase:Contributions] WRITE → Logging contribution for "${payload.barcode}" (email: ${contributorEmail || 'none'})...`);
    const { error } = await client.from('user_contributions').insert([{
      barcode:              payload.barcode,
      product_name:         payload.productName        || null,
      contributor_email:    contributorEmail,
      raw_ocr_text:         payload.rawOcr             || null,
      gemini_filtered_data: payload.filteredData       || null,
      front_photo_uploaded: !!payload.frontUploaded,
      back_photo_ocrd:      !!payload.backOcrd,
      ingredients:          payload.ingredients        || null,
      status:               'approved',
    }]);

    if (error) logError('Supabase Contribution Insert', error, { barcode: payload.barcode });
    else console.log(`🤝 [Supabase:Contributions] ✅ Contribution logged for "${payload.barcode}"`);
  } catch (e) {
    logError('Supabase Contribution Routine', e, { barcode: payload.barcode });
  }
}

/**
 * Get all contributions for a user, latest-first.
 * Supports pagination via offset.
 *
 * @param {string|null} email
 * @param {number} limit
 * @param {number} offset
 */
export async function getUserContributions(email = null, limit = 20, offset = 0) {
  const client = getClient();
  if (!client) return [];

  try {
    console.log(`🤝 [Supabase:Contributions] READ → (email: ${email || 'all'}, limit: ${limit}, offset: ${offset})...`);

    let query = client
      .from('user_contributions')
      .select('id, barcode, product_name, contributor_email, ingredients, gemini_filtered_data, front_photo_uploaded, back_photo_ocrd, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (email) query = query.eq('contributor_email', email);

    const { data, error } = await query;
    if (error) {
      console.warn(`🤝 [Supabase:Contributions] ⚠️ Fetch failed: ${error.message}`);
      return [];
    }

    console.log(`🤝 [Supabase:Contributions] ✅ Retrieved ${data?.length || 0} contributions`);
    return data || [];
  } catch (e) {
    console.error(`🤝 [Supabase:Contributions] ❌ Error: ${e.message}`);
    return [];
  }
}

/**
 * Server-side COUNT of contributions — no full download.
 * @param {string|null} email
 * @returns {number}
 */
export async function getContributionCount(email = null) {
  const client = getClient();
  if (!client) return 0;

  try {
    let query = client
      .from('user_contributions')
      .select('id', { count: 'exact', head: true });

    if (email) query = query.eq('contributor_email', email);

    const { count, error } = await query;
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}
