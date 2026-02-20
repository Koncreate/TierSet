import { DEFAULT_IMAGE_CONFIG } from "./config";
import { compressImage } from "./compress";

export interface UploadResult {
  id: string;
  url: string;
  filename: string;
  width: number;
  height: number;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export type ProgressCallback = (progress: UploadProgress) => void;

async function getUploadUrl(filename: string, contentType: string): Promise<{ uploadUrl: string; key: string }> {
  const res = await fetch("/api/image-upload/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  return res.json();
}

async function confirmUpload(key: string): Promise<{ url: string }> {
  const res = await fetch("/api/image-upload/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) throw new Error("Failed to confirm upload");
  return res.json();
}

export async function uploadImage(
  blob: Blob,
  options: {
    filename?: string;
    maxDimensions?: { width: number; height: number };
    onProgress?: ProgressCallback;
  } = {},
): Promise<UploadResult> {
  const { filename = "image.webp", maxDimensions, onProgress } = options;

  const compressed = await compressImage(blob, {
    maxWidth: maxDimensions?.width ?? DEFAULT_IMAGE_CONFIG.maxWidth,
    maxHeight: maxDimensions?.height ?? DEFAULT_IMAGE_CONFIG.maxHeight,
  });

  const { uploadUrl, key } = await getUploadUrl(filename, compressed.blob.type);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", compressed.blob.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percentage: Math.round((e.loaded / e.total) * 100),
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(compressed.blob);
  });

  const { url } = await confirmUpload(key);

  return {
    id: key,
    url,
    filename,
    width: compressed.width,
    height: compressed.height,
  };
}

export async function uploadImages(
  blobs: Array<{ blob: Blob; filename: string }>,
  options: {
    maxDimensions?: { width: number; height: number };
    onProgress?: (fileIndex: number, progress: UploadProgress) => void;
    onFileComplete?: (result: UploadResult, fileIndex: number) => void;
  } = {},
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];

  for (let i = 0; i < blobs.length; i++) {
    const { blob, filename } = blobs[i];
    const result = await uploadImage(blob, {
      filename,
      maxDimensions: options.maxDimensions,
      onProgress: options.onProgress ? (p) => options.onProgress!(i, p) : undefined,
    });
    results.push(result);
    options.onFileComplete?.(result, i);
  }

  return results;
}
