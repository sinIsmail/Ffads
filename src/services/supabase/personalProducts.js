import { getClient } from './client';
import { logError } from '../telemetry';
import { uploadFileUriToCloudinary } from '../cloudinary';

const PERSONAL_PRODUCT_BUCKET = 'cloudinary';

async function getAuthUser(client) {
  const { data: { user } } = await client.auth.getUser();
  return user || null;
}

function normalizePersonalProduct(row, images = []) {
  return {
    id: row.id,
    ffadzCode: row.ffadz_code,
    name: row.product_name,
    brand: row.brand || '',
    description: row.description || '',
    ingredients: row.ingredients || [],
    ingredientsRaw: row.ingredients_raw || '',
    nutrition: row.nutrition || {},
    qrValue: row.ffadz_code,
    qrStatus: row.qr_status || 'active',
    ownerId: row.owner_id,
    ownerEmail: row.owner_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images: {
      front: images.find((image) => image.image_type === 'front')?.public_url || null,
      ingredients: images.find((image) => image.image_type === 'ingredients')?.public_url || null,
      nutrition: images.find((image) => image.image_type === 'nutrition')?.public_url || null,
    },
    imageRows: images,
  };
}

async function uploadImageToStorage(client, ownerId, personalProductId, slot, uri) {
  const uploaded = await uploadFileUriToCloudinary(uri, {
    folder: `ffadz/personal-products/${ownerId}`,
    tags: ['ffadz', 'personal-qr', slot],
    context: {
      personal_product_id: personalProductId,
      slot,
      owner_id: ownerId,
    },
    fileName: `${personalProductId}-${slot}.jpg`,
  });

  if (!uploaded.success || !uploaded.url) {
    throw new Error(uploaded.error || `Cloudinary upload failed for ${slot}.`);
  }

  return {
    storageProvider: 'cloudinary',
    storagePath: `${PERSONAL_PRODUCT_BUCKET}:${uploaded.publicId || slot}`,
    publicUrl: uploaded.url,
    publicId: uploaded.publicId || null,
    assetId: uploaded.assetId || null,
    version: uploaded.version || null,
    width: uploaded.width || null,
    height: uploaded.height || null,
    bytes: uploaded.bytes || null,
    format: uploaded.format || null,
    uploadMode: uploaded.mode || 'unsigned',
  };
}

export async function createPersonalProduct(payload = {}) {
  const client = getClient();
  if (!client) {
    return { success: false, offline: true, error: 'Supabase is not configured.' };
  }

  try {
    const user = await getAuthUser(client);
    if (!user?.id || !user?.email) {
      return { success: false, error: 'Sign in before creating a QR product.' };
    }

    const insertPayload = {
      owner_id: user.id,
      owner_email: user.email,
      product_name: payload.productName?.trim() || 'Untitled Product',
      brand: payload.brand?.trim() || '',
      description: payload.description?.trim() || '',
      ingredients: payload.ingredients || [],
      ingredients_raw: payload.ingredientsRaw || '',
      nutrition: payload.nutrition || {},
      qr_status: 'active',
    };

    const { data: productRow, error: productError } = await client
      .from('personal_products')
      .insert([insertPayload])
      .select('*')
      .single();

    if (productError || !productRow) {
      return { success: false, error: productError?.message || 'Could not create the QR product row.' };
    }

    const imageRows = [];
    for (const slot of ['front', 'ingredients', 'nutrition']) {
      const photo = payload.images?.[slot];
      if (!photo?.uri) continue;

      const uploaded = await uploadImageToStorage(client, user.id, productRow.id, slot, photo.uri);
      const { data: imageRow, error: imageError } = await client
        .from('personal_product_images')
        .insert([{
          personal_product_id: productRow.id,
          image_type: slot,
          storage_provider: uploaded.storageProvider,
          storage_path: uploaded.storagePath,
          public_url: uploaded.publicUrl,
          provider_public_id: uploaded.publicId,
          provider_asset_id: uploaded.assetId,
          provider_version: uploaded.version,
          width: uploaded.width,
          height: uploaded.height,
          bytes: uploaded.bytes,
          format: uploaded.format,
          upload_mode: uploaded.uploadMode,
        }])
        .select('*')
        .single();

      if (imageError) {
        throw imageError;
      }

      imageRows.push(imageRow);
    }

    const savedProduct = await getPersonalProductById(productRow.id);

    return {
      success: true,
      product: savedProduct || normalizePersonalProduct(productRow, imageRows),
    };
  } catch (error) {
    logError('Supabase Personal Product Create', error, { productName: payload.productName });
    return { success: false, error: error.message || 'Failed to create the personal QR product.' };
  }
}

export async function listPersonalProducts(ownerEmail = null) {
  const client = getClient();
  if (!client) return [];

  try {
    const user = await getAuthUser(client).catch(() => null);
    const targetEmail = ownerEmail || user?.email || null;
    if (!targetEmail) return [];

    const { data, error } = await client
      .from('personal_products')
      .select('*')
      .eq('owner_email', targetEmail)
      .order('created_at', { ascending: false });

    if (error || !data?.length) {
      return [];
    }

    const ids = data.map((row) => row.id);
    const { data: images } = await client
      .from('personal_product_images')
      .select('*')
      .in('personal_product_id', ids);

    return data.map((row) => normalizePersonalProduct(
      row,
      (images || []).filter((image) => image.personal_product_id === row.id)
    ));
  } catch (error) {
    logError('Supabase Personal Product List', error);
    return [];
  }
}

export async function getPersonalProductByCode(code) {
  const client = getClient();
  if (!client || !code) return null;

  try {
    const { data: row, error } = await client
      .from('personal_products')
      .select('*')
      .eq('ffadz_code', code)
      .single();

    if (error || !row) return null;

    const { data: images } = await client
      .from('personal_product_images')
      .select('*')
      .eq('personal_product_id', row.id);

    return normalizePersonalProduct(row, images || []);
  } catch (error) {
    logError('Supabase Personal Product Lookup', error, { code });
    return null;
  }
}

export async function getPersonalProductById(id) {
  const client = getClient();
  if (!client || !id) return null;

  try {
    const { data: row, error } = await client
      .from('personal_products')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !row) return null;

    const { data: images } = await client
      .from('personal_product_images')
      .select('*')
      .eq('personal_product_id', row.id);

    return normalizePersonalProduct(row, images || []);
  } catch (error) {
    logError('Supabase Personal Product Read', error, { id });
    return null;
  }
}

export async function lookupPersonalQr(code) {
  return getPersonalProductByCode(code);
}

export async function recordPersonalProductScan({ personalProductId, ffadzCode, scannedByEmail = null, source = 'qr' }) {
  const client = getClient();
  if (!client || !personalProductId) return { success: false };

  try {
    const user = await getAuthUser(client).catch(() => null);
    const { error } = await client
      .from('personal_product_scans')
      .insert([{
        personal_product_id: personalProductId,
        ffadz_code: ffadzCode,
        scanned_by_user_id: user?.id || null,
        scanned_by_email: scannedByEmail || user?.email || null,
        source,
      }]);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    logError('Supabase Personal Product Scan', error, { personalProductId, ffadzCode });
    return { success: false, error: error.message };
  }
}

export async function deletePersonalProduct(id) {
  const client = getClient();
  if (!client || !id) return { success: false, error: 'Missing client or id.' };

  try {
    const { error } = await client
      .from('personal_products')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    logError('Supabase Personal Product Delete', error, { id });
    return { success: false, error: error.message };
  }
}

