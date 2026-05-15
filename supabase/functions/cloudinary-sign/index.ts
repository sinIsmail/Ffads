import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function sanitizeString(value: unknown, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeContext(input: unknown) {
  if (!input || typeof input !== 'object') return {};

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => value !== undefined && value !== null && sanitizeString(value) !== '')
      .map(([key, value]) => [key, sanitizeString(value).replace(/[|=]/g, '-')])
  );
}

function buildContextString(context: Record<string, string>) {
  return Object.entries(context)
    .map(([key, value]) => `${key}=${value}`)
    .join('|');
}

function normalizeTags(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => sanitizeString(value))
    .filter(Boolean);
}

function normalizePublicId(value: unknown) {
  return sanitizeString(value)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9/_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '');
}

async function sha1Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const cloudName = sanitizeString(Deno.env.get('CLOUDINARY_CLOUD_NAME'));
  const apiKey = sanitizeString(Deno.env.get('CLOUDINARY_API_KEY'));
  const apiSecret = sanitizeString(Deno.env.get('CLOUDINARY_API_SECRET'));
  const defaultFolder = sanitizeString(Deno.env.get('CLOUDINARY_FOLDER'), 'ffadz');

  if (!cloudName || !apiKey || !apiSecret) {
    return new Response(JSON.stringify({
      error: 'Cloudinary signing secrets are missing.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = sanitizeString(body.folder, defaultFolder) || defaultFolder;
    const tags = normalizeTags(body.tags);
    const context = normalizeContext(body.context);
    const publicId = normalizePublicId(body.publicId);
    const uploadPreset = sanitizeString(body.uploadPreset);

    const signatureParams: Record<string, string> = {
      folder,
      timestamp: String(timestamp),
    };

    if (tags.length) {
      signatureParams.tags = tags.join(',');
    }

    const contextString = buildContextString(context);
    if (contextString) {
      signatureParams.context = contextString;
    }

    if (publicId) {
      signatureParams.public_id = publicId;
    }

    if (uploadPreset) {
      signatureParams.upload_preset = uploadPreset;
    }

    const payloadToSign = Object.entries(signatureParams)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    const signature = await sha1Hex(`${payloadToSign}${apiSecret}`);

    return new Response(JSON.stringify({
      cloudName,
      apiKey,
      timestamp,
      signature,
      folder,
      tags,
      context,
      publicId,
      uploadPreset,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Cloudinary signing failed.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
