import { DEFAULT_IMAGE_CONFIG } from "./config";

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: string;
}

export interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export async function compressImage(
  blob: Blob,
  options: CompressOptions = {},
): Promise<CompressResult> {
  const {
    maxWidth = DEFAULT_IMAGE_CONFIG.maxWidth,
    maxHeight = DEFAULT_IMAGE_CONFIG.maxHeight,
    quality = DEFAULT_IMAGE_CONFIG.quality,
    mimeType = "image/webp",
  } = options;

  const bitmap = await createImageBitmap(blob);
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;

  const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height, 1);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not get canvas context");
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const compressedBlob = await canvas.convertToBlob({ type: mimeType, quality });

  return {
    blob: compressedBlob,
    width,
    height,
    originalWidth,
    originalHeight,
  };
}

export async function compressImages(
  blobs: Blob[],
  options: CompressOptions = {},
): Promise<CompressResult[]> {
  return Promise.all(blobs.map((blob) => compressImage(blob, options)));
}

export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type || "image/webp" });
}
