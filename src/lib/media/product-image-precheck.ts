/**
 * Cheap, bounded precheck only. A matching header is NOT proof that a file is a
 * valid or safe image. A trusted server must still decode, enforce dimensions,
 * re-encode, strip metadata and authorize the upload before storing anything.
 */
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export type ProductImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type ProductImagePrecheckResult =
  | { ok: true; mime: ProductImageMime }
  | { ok: false; reason: 'invalid_size' | 'unsupported_type' | 'type_mismatch' };

/** Inspect only the first 12 bytes, plus the declared size, filename and MIME. */
export function precheckProductImage(input: {
  filename: string;
  declaredMime: string;
  sizeBytes: number;
  header: Uint8Array;
}): ProductImagePrecheckResult {
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_PRODUCT_IMAGE_BYTES || input.header.length > input.sizeBytes) {
    return { ok: false, reason: 'invalid_size' };
  }

  const extension = input.filename.includes('.') ? input.filename.split('.').pop()?.toLowerCase() : undefined;
  const mimeByExtension: Record<string, ProductImageMime> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  if (!extension || !Object.hasOwn(mimeByExtension, extension)) {
    return { ok: false, reason: 'unsupported_type' };
  }
  const expected = mimeByExtension[extension];

  const h = input.header;
  const jpeg = h.length >= 3 && h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const png = h.length >= 8 && pngSignature.every((byte, index) => h[index] === byte);
  const webp = h.length >= 12 &&
    h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 &&
    h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50;
  const detected: ProductImageMime | undefined = jpeg ? 'image/jpeg' : png ? 'image/png' : webp ? 'image/webp' : undefined;

  if (input.declaredMime.toLowerCase() !== expected || detected !== expected) {
    return { ok: false, reason: 'type_mismatch' };
  }
  return { ok: true, mime: expected };
}