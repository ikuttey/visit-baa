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

async function assetIsStillReferenced(client, bucket, path) {
  if (!path) return false;
  const checks = {
    'listing-covers': () => client.from('listings').select('id', { count: 'exact', head: true }).eq('cover_image_path', path),
    'listing-gallery': () => client.from('listing_images').select('id', { count: 'exact', head: true }).eq('storage_path', path),
    'room-gallery': () => client.from('room_images').select('id', { count: 'exact', head: true }).eq('storage_path', path),
    'business-logos': () => client.from('businesses').select('id', { count: 'exact', head: true }).eq('logo_path', path),
    'business-gallery': () => client.from('business_images').select('id', { count: 'exact', head: true }).eq('storage_path', path)
  };
  const check = checks[bucket];
  if (!check) return false;
  const result = await check();
  // If a reference check itself fails, prefer leaving an orphaned object over
  // accidentally deleting media that another live listing/revision still uses.
  if (result.error) return true;
  return Number(result.count || 0) > 0;
}

export async function removeImage(bucket, path) {
  if (!path) return false;
  const client = requireSupabase();
  if (await assetIsStillReferenced(client, bucket, path)) return false;
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) throw error;
  return true;
}
