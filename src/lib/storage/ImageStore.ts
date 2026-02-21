import { db } from "./db";

const MAX_WIDTH = 256;
const MAX_HEIGHT = 256;
const THUMB_SIZE = 64;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_STORAGE_QUOTA = 50 * 1024 * 1024; // 50MB total storage

export interface ProcessedImage {
  id: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  thumbnailBlob?: Blob;
  thumbnailMimeType?: string;
}

/**
 * Image storage with compression and thumbnail generation
 */
export class ImageStore {
  private activeUrls: Map<string, Set<string>> = new Map();

  /**
   * Process and store an image file
   */
  async store(file: File, options?: { generateThumbnail?: boolean }): Promise<string> {
    // Enforce file size limit
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`Image size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    // Check storage quota before processing
    const usage = await this.getStorageUsage();
    if (usage.estimatedSize + file.size > MAX_STORAGE_QUOTA) {
      throw new Error(`Storage quota exceeded. Maximum ${MAX_STORAGE_QUOTA / (1024 * 1024)}MB allowed`);
    }

    const id = crypto.randomUUID();
    const { full, thumb } = await this.processImage(file, {
      generateThumbnail: options?.generateThumbnail ?? true,
    });

    await db.images.add({
      id,
      blob: full,
      mimeType: "image/webp",
      width: MAX_WIDTH,
      height: MAX_HEIGHT,
      thumbnailBlob: thumb,
      thumbnailMimeType: thumb ? "image/webp" : undefined,
      originalName: file.name,
      createdAt: Date.now(),
    });

    return id;
  }

  /**
   * Process image file - resize and compress
   */
  private async processImage(
    file: File,
    options: { generateThumbnail: boolean },
  ): Promise<{ full: Blob; thumb?: Blob }> {
    const bitmap = await createImageBitmap(file);

    // Calculate resize dimensions maintaining aspect ratio
    const scale = Math.min(MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height, 1);

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    // Resize via canvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    ctx.drawImage(bitmap, 0, 0, width, height);
    const full = await canvas.convertToBlob({ type: "image/webp", quality: 0.8 });

    let thumb: Blob | undefined;
    if (options.generateThumbnail) {
      const thumbCanvas = new OffscreenCanvas(THUMB_SIZE, THUMB_SIZE);
      const thumbCtx = thumbCanvas.getContext("2d");
      if (thumbCtx) {
        // Draw centered crop for thumbnail
        const size = Math.min(bitmap.width, bitmap.height);
        const offsetX = (bitmap.width - size) / 2;
        const offsetY = (bitmap.height - size) / 2;

        thumbCtx.drawImage(bitmap, offsetX, offsetY, size, size, 0, 0, THUMB_SIZE, THUMB_SIZE);
        thumb = await thumbCanvas.convertToBlob({ type: "image/webp", quality: 0.6 });
      }
    }

    await bitmap.close();
    return { full, thumb };
  }

  /**
   * Get full-size image blob
   */
  async get(id: string): Promise<Blob | null> {
    const record = await db.images.get(id);
    return record?.blob || null;
  }

  /**
   * Store a raw blob directly (for P2P received images)
   * Unlike store(), this accepts a pre-determined ID and raw blob
   */
  async put(id: string, blob: Blob, options?: { mimeType?: string }): Promise<void> {
    // Enforce file size limit (same as store())
    if (blob.size > MAX_FILE_SIZE) {
      throw new Error(`Image size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    // Check storage quota
    const usage = await this.getStorageUsage();
    if (usage.estimatedSize + blob.size > MAX_STORAGE_QUOTA) {
      throw new Error(`Storage quota exceeded. Maximum ${MAX_STORAGE_QUOTA / (1024 * 1024)}MB allowed`);
    }

    const existing = await db.images.get(id);
    const mimeType = options?.mimeType || blob.type || "image/webp";

    if (existing) {
      // Update existing image
      await db.images.update(id, {
        blob,
        mimeType,
      });
    } else {
      // Create new record with raw blob (no processing, dimensions unknown)
      await db.images.add({
        id,
        blob,
        mimeType,
        width: 256, // Default placeholder
        height: 256,
        createdAt: Date.now(),
      });
    }
  }

  /**
   * Get thumbnail blob
   */
  async getThumbnail(id: string): Promise<Blob | null> {
    const record = await db.images.get(id);
    return record?.thumbnailBlob || null;
  }

  /**
   * Get image URL (creates object URL)
   * IMPORTANT: Caller must call revokeUrl() when done to prevent memory leak
   */
  async getUrl(id: string, thumbnail: boolean = false): Promise<string | null> {
    const blob = thumbnail ? await this.getThumbnail(id) : await this.get(id);

    if (!blob) return null;
    
    const url = URL.createObjectURL(blob);
    
    // Track the URL for this image
    const key = thumbnail ? `${id}:thumb` : id;
    if (!this.activeUrls.has(key)) {
      this.activeUrls.set(key, new Set());
    }
    this.activeUrls.get(key)!.add(url);
    
    return url;
  }

  /**
   * Revoke an object URL to free memory
   */
  revokeUrl(id: string, url: string, thumbnail: boolean = false): void {
    const key = thumbnail ? `${id}:thumb` : id;
    const urls = this.activeUrls.get(key);
    if (urls?.has(url)) {
      URL.revokeObjectURL(url);
      urls.delete(url);
      if (urls.size === 0) {
        this.activeUrls.delete(key);
      }
    }
  }

  /**
   * Revoke all URLs for an image
   */
  revokeAllUrls(id: string): void {
    for (const key of [id, `${id}:thumb`]) {
      const urls = this.activeUrls.get(key);
      if (urls) {
        for (const url of urls) {
          URL.revokeObjectURL(url);
        }
        this.activeUrls.delete(key);
      }
    }
  }

  /**
   * Delete an image
   */
  async delete(id: string): Promise<void> {
    // Revoke all active URLs for this image
    this.revokeAllUrls(id);
    await db.images.delete(id);
  }

  /**
   * Get multiple images
   */
  async getMultiple(ids: string[]): Promise<Map<string, Blob>> {
    const records = await db.images.bulkGet(ids);
    const map = new Map<string, Blob>();

    for (const record of records) {
      if (record?.blob) {
        map.set(record.id, record.blob);
      }
    }

    return map;
  }

  /**
   * List all images
   */
  async list(): Promise<
    Array<{
      id: string;
      originalName?: string;
      width: number;
      height: number;
      createdAt: number;
    }>
  > {
    const images = await db.images.toArray();
    return images.map((img) => ({
      id: img.id,
      originalName: img.originalName,
      width: img.width,
      height: img.height,
      createdAt: img.createdAt,
    }));
  }

  /**
   * Export images as ZIP
   */
  async exportImages(ids: string[]): Promise<Blob> {
    const { zipSync, strToU8 } = await import("fflate");
    const files: Record<string, Uint8Array> = {};

    for (const id of ids) {
      const record = await db.images.get(id);
      if (record?.blob) {
        const buffer = await record.blob.arrayBuffer();
        const ext = record.mimeType.split("/")[1] || "webp";
          files[`images/${id}.${ext}`] = new Uint8Array(buffer) as Uint8Array;
      }
    }

    // Add manifest
    const manifest = {
      version: 1,
      exportedAt: Date.now(),
      imageCount: ids.length,
      images: ids,
    };
    files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));

    const zipped = zipSync(files, { level: 6 });
    return new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
  }

  /**
   * Import images from ZIP
   */
  async importImages(zipFile: File): Promise<string[]> {
    const { unzip } = await import("fflate");
    const buffer = await zipFile.arrayBuffer();

    return new Promise((resolve, reject) => {
      unzip(new Uint8Array(buffer), async (err, files) => {
        if (err) return reject(err);

        const imageIds: string[] = [];
        const mimeMap: Record<string, string> = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          webp: "image/webp",
          gif: "image/gif",
        };

        for (const [filename, data] of Object.entries(files)) {
          if (filename.endsWith("/")) continue; // Skip directories

          const ext = filename.split(".").pop()?.toLowerCase();
          const mimeType = mimeMap[ext || ""];
          if (!mimeType) continue;

          try {
             const blob = new Blob([new Uint8Array(data.buffer) as unknown as BlobPart], { type: mimeType });
            const file = new File([blob], filename, { type: mimeType });
            const id = await this.store(file, { generateThumbnail: true });
            imageIds.push(id);
          } catch (e) {
            console.error(`Failed to import ${filename}:`, e);
          }
        }

        resolve(imageIds);
      });
    });
  }

  /**
   * Get storage usage
   */
  async getStorageUsage(): Promise<{
    count: number;
    estimatedSize: number;
  }> {
    const images = await db.images.toArray();
    let estimatedSize = 0;

    for (const img of images) {
      estimatedSize += img.blob.size;
      if (img.thumbnailBlob) {
        estimatedSize += img.thumbnailBlob.size;
      }
    }

    return {
      count: images.length,
      estimatedSize,
    };
  }
}

export const imageStore = new ImageStore();
