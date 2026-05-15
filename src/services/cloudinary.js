import * as FileSystem from 'expo-file-system/legacy';
import { getClient } from './supabase/client';

const DEFAULT_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dqh0dymco';
const DEFAULT_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'Ffadz_local_image';
const DEFAULT_FOLDER = process.env.EXPO_PUBLIC_CLOUDINARY_FOLDER || 'ffadz';
const DEFAULT_SIGNER = process.env.EXPO_PUBLIC_CLOUDINARY_SIGN_FUNCTION || 'cloudinary-sign';

function buildCloudinaryUrl(cloudName = DEFAULT_CLOUD_NAME) {
  return `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
}

function normalizeCloudinaryConfig(overrides = {}) {
  return {
    cloudName: String(overrides.cloudName || DEFAULT_CLOUD_NAME).trim() || DEFAULT_CLOUD_NAME,
    uploadPreset: String(overrides.uploadPreset || DEFAULT_UPLOAD_PRESET).trim() || DEFAULT_UPLOAD_PRESET,
    folder: String(overrides.folder || DEFAULT_FOLDER).trim() || DEFAULT_FOLDER,
    tags: Array.isArray(overrides.tags) ? overrides.tags.filter(Boolean) : [],
    context: overrides.context || null,
    fileName: String(overrides.fileName || '').trim(),
    publicId: String(overrides.publicId || '').trim(),
    signerName: String(overrides.signerName || DEFAULT_SIGNER).trim() || DEFAULT_SIGNER,
    allowUnsignedFallback: overrides.allowUnsignedFallback !== false,
  };
}

function buildContextString(context = null) {
  if (!context || typeof context !== 'object') return '';
  return Object.entries(context)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => `${key}=${String(value).replace(/[|=]/g, '-')}`)
    .join('|');
}

function guessMimeType(uri = '') {
  if (/\.png$/i.test(uri)) return 'image/png';
  if (/\.webp$/i.test(uri)) return 'image/webp';
  return 'image/jpeg';
}

function normalizePublicId(fileName = '') {
  const base = String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9/_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '');

  return base || '';
}

async function sha1Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function requestCloudinarySignature(options = {}) {
  const client = getClient();
  if (!client) {
    return {
      success: false,
      error: 'Supabase is not configured for Cloudinary signing.',
      blocked: true,
    };
  }

  const config = normalizeCloudinaryConfig(options);

  try {
    const { data, error } = await client.functions.invoke(config.signerName, {
      body: {
        cloudName: config.cloudName,
        uploadPreset: config.uploadPreset,
        folder: config.folder,
        tags: config.tags,
        context: config.context,
        publicId: config.publicId || normalizePublicId(config.fileName),
      },
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Cloudinary signing failed.',
        blocked: true,
      };
    }

    if (!data?.signature || !data?.timestamp || !data?.apiKey || !data?.cloudName) {
      return {
        success: false,
        error: 'Cloudinary signer returned incomplete data.',
        blocked: true,
        details: data || null,
      };
    }

    return {
      success: true,
      mode: 'signed',
      signature: data.signature,
      timestamp: data.timestamp,
      apiKey: data.apiKey,
      cloudName: data.cloudName,
      folder: data.folder || config.folder,
      tags: Array.isArray(data.tags) ? data.tags : config.tags,
      context: data.context || config.context || null,
      publicId: data.publicId || config.publicId || normalizePublicId(config.fileName),
      uploadPreset: data.uploadPreset || '',
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Cloudinary signing failed.',
      blocked: true,
    };
  }
}

export async function uploadToCloudinary({
  uri = '',
  base64 = '',
  fileName = 'ffadz-upload.jpg',
  cloudName,
  uploadPreset,
  folder = '',
  tags = [],
  context = null,
  publicId = '',
  signerName,
  allowUnsignedFallback = true,
} = {}) {
  const config = normalizeCloudinaryConfig({
    cloudName,
    uploadPreset,
    folder,
    tags,
    context,
    publicId,
    fileName,
    signerName,
    allowUnsignedFallback,
  });

  if (!uri && !base64) {
    return { success: false, error: 'No image was provided for Cloudinary upload.' };
  }

  const formData = new FormData();
  const signatureResult = await requestCloudinarySignature(config);

  let uploadMode = 'signed';
  let targetCloudName = config.cloudName;

  if (signatureResult.success) {
    uploadMode = 'signed';
    targetCloudName = signatureResult.cloudName || config.cloudName;
    formData.append('api_key', signatureResult.apiKey);
    formData.append('timestamp', String(signatureResult.timestamp));
    formData.append('signature', signatureResult.signature);

    if (signatureResult.folder) {
      formData.append('folder', signatureResult.folder);
    }

    const contextString = buildContextString(signatureResult.context);
    if (contextString) {
      formData.append('context', contextString);
    }

    const tagList = Array.isArray(signatureResult.tags) ? signatureResult.tags : config.tags;
    if (tagList.length) {
      formData.append('tags', tagList.join(','));
    }

    if (signatureResult.publicId) {
      formData.append('public_id', signatureResult.publicId);
    }

    if (signatureResult.uploadPreset) {
      formData.append('upload_preset', signatureResult.uploadPreset);
    }
  } else if (config.allowUnsignedFallback && config.uploadPreset) {
    uploadMode = 'unsigned';
    formData.append('upload_preset', config.uploadPreset);

    if (config.folder) {
      formData.append('folder', config.folder);
    }

    if (config.tags.length) {
      formData.append('tags', config.tags.join(','));
    }

    const contextString = buildContextString(config.context);
    if (contextString) {
      formData.append('context', contextString);
    }

    const normalizedPublicId = config.publicId || normalizePublicId(config.fileName);
    if (normalizedPublicId) {
      formData.append('public_id', normalizedPublicId);
    }
  } else {
    return {
      success: false,
      error: signatureResult.error || 'Cloudinary signer is not configured.',
      blocked: true,
    };
  }

  if (base64) {
    formData.append('file', `data:${guessMimeType(fileName)};base64,${base64}`);
  } else {
    formData.append('file', {
      uri,
      name: fileName,
      type: guessMimeType(uri || fileName),
    });
  }

  try {
    const response = await fetch(buildCloudinaryUrl(targetCloudName), {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    if (!response.ok || result?.error) {
      return {
        success: false,
        error: result?.error?.message || `Cloudinary upload failed with HTTP ${response.status}.`,
        details: result,
        blocked: response.status >= 400 && response.status < 500,
      };
    }

    return {
      success: true,
      mode: uploadMode,
      url: result.secure_url || result.url || null,
      publicId: result.public_id || null,
      assetId: result.asset_id || null,
      version: result.version ? String(result.version) : null,
      width: result.width || null,
      height: result.height || null,
      bytes: result.bytes || null,
      format: result.format || null,
      originalFilename: result.original_filename || null,
      signerError: signatureResult.success ? null : signatureResult.error,
      raw: result,
    };
  } catch (error) {
    return { success: false, error: error.message || 'Cloudinary upload failed.' };
  }
}

export async function uploadFileUriToCloudinary(uri, options = {}) {
  if (!uri) {
    return { success: false, error: 'Missing file URI for Cloudinary upload.' };
  }

  const resolvedName = options.fileName
    || uri.split('/').pop()
    || `ffadz-${Date.now()}.jpg`;

  return uploadToCloudinary({
    ...options,
    uri,
    fileName: resolvedName,
  });
}

export async function uploadBase64ToCloudinary(base64, options = {}) {
  if (!base64) {
    return { success: false, error: 'Missing base64 image for Cloudinary upload.' };
  }

  return uploadToCloudinary({
    ...options,
    base64,
  });
}

export async function convertUriToBase64(uri) {
  if (!uri) return null;
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function buildCloudinaryLocalSignature(signatureParams = {}, secret = '') {
  const normalizedSecret = String(secret || '').trim();
  if (!normalizedSecret) {
    return null;
  }

  const toSign = Object.entries(signatureParams)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : String(value)}`)
    .join('&');

  return sha1Hex(`${toSign}${normalizedSecret}`);
}

export function getCloudinaryDefaults() {
  return {
    cloudName: DEFAULT_CLOUD_NAME,
    uploadPreset: DEFAULT_UPLOAD_PRESET,
    folder: DEFAULT_FOLDER,
    signerName: DEFAULT_SIGNER,
    uploadMode: 'signed-first',
  };
}
