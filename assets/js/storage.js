import { requirePublicSupabase, requireSupabase } from './supabase-client.js';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateImages(files, { multiple = true } = {}) {
  const list = [...(files || [])];
  if (!multiple && list.length > 1) throw new Error('Select only one image.');
  for (const file of list) {
    if (!IMAGE_TYPES.includes(file.type)) {
      throw new Error(`${file.name}: only JPG, PNG, and WebP images are allowed.`);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`${file.name}: the maximum image size is 5 MB.`);
    }
  }
  return list;
}

function extension(file) {
  const byType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  return byType[file.type] || 'jpg';
}

export async function uploadImage(bucket, file, userId, scopeId) {
  const client = requireSupabase();
  validateImages([file], { multiple: false });
  const path = `${userId}/${scopeId}/${crypto.randomUUID()}.${extension(file)}`;
  const { data, error } = await client.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;
  return data.path;
}

async function createSignedImageUrl(client, bucket, path, expiresIn) {
  if (!path) return '';
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return '';
  return data.signedUrl;
}

export function signedImageUrl(bucket, path, expiresIn = 3600) {
  return createSignedImageUrl(requireSupabase(), bucket, path, expiresIn);
}

export function signedPublicImageUrl(bucket, path, expiresIn = 3600) {
  return createSignedImageUrl(requirePublicSupabase(), bucket, path, expiresIn);
}

export async function removeImage(bucket, path) {
  if (!path) return;
  const client = requireSupabase();
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) throw error;
}
