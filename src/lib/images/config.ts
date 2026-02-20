export interface ImageConfig {
  maxWidth: number;
  maxHeight: number;
  maxFileSize: number;
  supportedFormats: readonly string[];
  quality: number;
}

export const DEFAULT_IMAGE_CONFIG: ImageConfig = {
  maxWidth: 512,
  maxHeight: 512,
  maxFileSize: 5 * 1024 * 1024,
  supportedFormats: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"] as const,
  quality: 0.8,
};

export const SUPPORTED_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
] as const;

export function isImageMimeType(mimeType: string): boolean {
  return DEFAULT_IMAGE_CONFIG.supportedFormats.includes(mimeType as typeof DEFAULT_IMAGE_CONFIG.supportedFormats[number]);
}

export function isImageExtension(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop();
  return ext ? SUPPORTED_IMAGE_EXTENSIONS.includes(`.${ext}` as typeof SUPPORTED_IMAGE_EXTENSIONS[number]) : false;
}
