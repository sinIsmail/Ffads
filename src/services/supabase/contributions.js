// Ffads — Supabase Contributions (User scan history + OCR contributions)

import { getClient } from './client';
import { logError } from '../telemetry';

// ─── User Scans (History) ────────────────────

export async function recordScan(barcode, userEmail = null) {
  const client = getClient();
  if (!client) {
    console.warn(`📊 [Supabase:Scans] ⚠️ Client not configured — skipping scan log for "${barcode}"`);
    return;
  }

  try {
    const row = { barcode };
    
    // Attach user identity if available
    if (userEmail) {
      row.user_email = userEmail;
    }

    console.log(`📊 [Supabase:Scans] WRITE → Logging scan for "${barcode}" (user: ${userEmail || 'anonymous'})...`);
    await client.from('user_scans').insert(row);
    console.log(`📊 [Supabase:Scans] ✅ Scan logged for "${barcode}"`);
  } catch (e) {
    logError('Supabase Scan Log', e, { barcode, userEmail });
  }
}

/**
 * Fetch scan history for a specific user from Supabase.
 * If no email is provided, fetches all scans.
 * Joins with products table to return full product data.
 */
export async function getUserScanHistory(userEmail = null, limit = 100) {
  const client = getClient();
  if (!client) return [];

  try {
    console.log(`📊 [Supabase:Scans] READ → Fetching scan history (user: ${userEmail || 'all'}, limit: ${limit})...`);
    let query = client
      .from('user_scans')
      .select('barcode, scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(limit);

    if (userEmail) {
      query = query.eq('user_email', userEmail);
    }

    const { data, error } = await query;
    if (error) {
      console.warn(`📊 [Supabase:Scans] ⚠️ Fetch scan history failed: ${error.message}`);
      return [];
    }
    console.log(`📊 [Supabase:Scans] ✅ Retrieved ${data?.length || 0} scan records`);
    return data || [];
  } catch (e) {
    console.error(`📊 [Supabase:Scans] ❌ Fetch scan history error: ${e.message}`);
    return [];
  }
}

// ─── User Contributions ──────────────────────

export async function logUserContribution(payload) {
  const client = getClient();
  if (!client) {
    console.warn(`🤝 [Supabase:Contributions] ⚠️ Client not configured — skipping contribution log`);
    return;
  }

  try {
    // Bug #4: If contributorEmail is empty (race condition on first launch before session
    // restore completes), fall back to the real authenticated email from the JWT.
    // This ensures auth.email() = contributor_email so RLS never blocks the insert.
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

    console.log(`🤝 [Supabase:Contributions] WRITE → Logging OCR contribution for "${payload.barcode}" (email: ${contributorEmail || 'none'})...`);
    const { error } = await client.from('user_contributions').insert([{
      barcode: payload.barcode,
      product_name: payload.productName || null,
      contributor_email: contributorEmail,
      raw_ocr_text: payload.rawOcr || null,
      gemini_filtered_data: payload.filteredData || null,
      front_photo_uploaded: !!payload.frontUploaded,
      back_photo_ocrd: !!payload.backOcrd,
      ingredients: payload.ingredients || null,
      status: 'approved' // auto-approve logic
    }]);
    
    if (error) logError('Supabase Contribution Insert', error, { barcode: payload.barcode });
    else console.log(`🤝 [Supabase:Contributions] ✅ Contribution logged for "${payload.barcode}"`);
  } catch (e) {
    logError('Supabase Contribution Routine', e, { barcode: payload.barcode });
  }
}

// ─── Fetch Contributions ─────────────────────

/**
 * Get all contributions (optionally filtered by email).
 * Returns latest-first.
 */
export async function getUserContributions(email = null, limit = 50) {
  const client = getClient();
  if (!client) return [];

  try {
    console.log(`🤝 [Supabase:Contributions] READ → Fetching contributions (email: ${email || 'all'}, limit: ${limit})...`);
    let query = client
      .from('user_contributions')
      .select('id, barcode, product_name, contributor_email, ingredients, gemini_filtered_data, front_photo_uploaded, back_photo_ocrd, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (email) {
      // Strictly include only contributions matching this email
      query = query.eq('contributor_email', email);
    }

    const { data, error } = await query;
    if (error) {
      console.warn(`🤝 [Supabase:Contributions] ⚠️ Fetch failed: ${error.message}`);
      return [];
    }
    console.log(`🤝 [Supabase:Contributions] ✅ Retrieved ${data?.length || 0} contributions`);
    return data || [];
  } catch (e) {
    console.error(`🤝 [Supabase:Contributions] ❌ Fetch error: ${e.message}`);
    return [];
  }
}

/**
 * Get count of contributions (optionally filtered by email).
 */
export async function getContributionCount(email = null) {
  const client = getClient();
  if (!client) return 0;

  try {
    let query = client
      .from('user_contributions')
      .select('id', { count: 'exact', head: true });

    if (email) {
      query = query.eq('contributor_email', email);
    }

    const { count, error } = await query;
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}
