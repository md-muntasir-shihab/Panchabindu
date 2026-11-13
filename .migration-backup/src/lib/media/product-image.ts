import sharp from 'sharp';
import { precheckProductImage } from './product-image-precheck';

export async function processProductImage(bytes: Uint8Array, name: string, mime: string) {
  const precheck = precheckProductImage({ filename: name, declaredMime: mime, sizeBytes: bytes.byteLength, header: bytes.subarray(0, 16) });
  if (!precheck.ok) throw new Error('INVALID_IMAGE');
  const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.width < 32 || metadata.height < 32 || (metadata.pages ?? 1) !== 1) {
    throw new Error('INVALID_IMAGE_DIMENSIONS');
  }
  const { data, info } = await image.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height, mime: 'image/webp' as const };
}

export async function boundedFormData(request: Request, limit = 6 * 1024 * 1024): Promise<FormData> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > limit) throw new Error('UPLOAD_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('EMPTY_UPLOAD');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('UPLOAD_TOO_LARGE');
    }
    chunks.push(chunk.value);
  }
  const buffer = Buffer.concat(chunks);
  return new Response(buffer, { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData();
}
