import { getClient } from './client';
import { logError } from '../telemetry';

export async function recordScan(barcode, userEmail = null) {
  const client = getClient();
  if (!client) {
    return;
  }

  try {
    const row = { barcode };
    if (userEmail) row.user_email = userEmail;

    const { data: { user } } = await client.auth.getUser().catch(() => ({ data: { user: null } }));
    if (user?.id) row.user_id = user.id;

    await client.from('user_scans').insert(row);
  } catch (error) {
    logError('Supabase Scan Log', error, { barcode, userEmail });
  }
}

export async function getUserScanHistory(userEmail = null, limit = 20, offset = 0) {
  const client = getClient();
  if (!client) return [];

  try {
    let query = client
      .from('user_scans')
      .select('barcode, scanned_at, products(name, brand, nutriscore, nova_group)')
      .order('scanned_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userEmail) {
      query = query.eq('user_email', userEmail);
    }

    const { data, error } = await query;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export async function getScanCount(userEmail = null) {
  const client = getClient();
  if (!client) return 0;

  try {
    let query = client
      .from('user_scans')
      .select('id', { count: 'exact', head: true });

    if (userEmail) {
      query = query.eq('user_email', userEmail);
    }

    const { count, error } = await query;
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

export async function logUserContribution(payload) {
  const client = getClient();
  if (!client) {
    return {
      success: false,
      offline: true,
      error: 'Supabase client is not configured.',
    };
  }

  try {
    let contributorEmail = payload.contributorEmail || null;
    if (!contributorEmail) {
      try {
        const { data: { user } } = await client.auth.getUser();
        if (user?.email) {
          contributorEmail = user.email;
        }
      } catch {
        contributorEmail = contributorEmail || null;
      }
    }

    const { error } = await client.from('user_contributions').insert([{
      barcode: payload.barcode,
      product_name: payload.productName || null,
      contributor_email: contributorEmail,
      raw_ocr_text: payload.rawOcr || null,
      ai_filtered_data: payload.filteredData || null,
      gemini_filtered_data: payload.filteredData || null,
      front_photo_uploaded: Boolean(payload.frontUploaded),
      back_photo_ocrd: Boolean(payload.backOcrd),
      ingredients: payload.ingredients || null,
      status: payload.status || 'approved',
      cleanup_trace: payload.cleanupTrace || [],
      provider_route: payload.providerRoute || null,
    }]);

    if (error) {
      logError('Supabase Contribution Insert', error, { barcode: payload.barcode });
      return { success: false, error: error.message || 'Contribution insert failed.' };
    }

    return { success: true };
  } catch (error) {
    logError('Supabase Contribution Routine', error, { barcode: payload.barcode });
    return { success: false, error: error.message || 'Contribution logging failed.' };
  }
}

export async function getUserContributions(email = null, limit = 20, offset = 0) {
  const client = getClient();
  if (!client) return [];

  try {
    let query = client
      .from('user_contributions')
      .select('id, barcode, product_name, contributor_email, ingredients, ai_filtered_data, gemini_filtered_data, cleanup_trace, provider_route, front_photo_uploaded, back_photo_ocrd, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (email) {
      query = query.eq('contributor_email', email);
    }

    const { data, error } = await query;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

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
