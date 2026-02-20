/**
 * ImageStore Size Limits Unit Tests
 * ====================================
 *
 * Tests for hard size limits enforcement:
 * - Individual file size limit (5MB)
 * - Total storage quota (50MB)
 * - Integration with existing compression
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ImageStore } from "../ImageStore";
import { db } from "../db";

// ============================================================================
// Mocks
// ============================================================================

// Mock Dexie database
vi.mock("../db", () => ({
  db: {
    images: {
      add: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      bulkGet: vi.fn(),
      toArray: vi.fn(),
    },
  },
}));

// Mock OffscreenCanvas and createImageBitmap
const mockCanvas = {
  getContext: vi.fn(() => ({
    drawImage: vi.fn(),
  })),
  convertToBlob: vi.fn().mockResolvedValue(new Blob(["mock"], { type: "image/webp" })),
};

const mockBitmap = {
  width: 1000,
  height: 1000,
  close: vi.fn().mockResolvedValue(undefined),
};

// Mock globals using Object.defineProperty
Object.defineProperty(global, "OffscreenCanvas", {
  value: vi.fn().mockImplementation(() => mockCanvas),
  writable: true,
  configurable: true,
});

Object.defineProperty(global, "createImageBitmap", {
  value: vi.fn().mockResolvedValue(mockBitmap),
  writable: true,
  configurable: true,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock File object with specified size
 */
function createMockFile(sizeInBytes: number, name: string = "test.jpg"): File {
  const array = new Uint8Array(sizeInBytes);
  // Fill with some data
  for (let i = 0; i < sizeInBytes; i++) {
    array[i] = i % 256;
  }
  const blob = new Blob([array], { type: "image/jpeg" });
  const file = new File([blob], name, { type: "image/jpeg" });
  // Ensure size property is correctly set
  Object.defineProperty(file, "size", { value: sizeInBytes, writable: false });
  return file;
}

/**
 * Create a mock Blob with specified size
 */
function createMockBlob(sizeInBytes: number): Blob {
  // Use a small array but mock the size property
  const array = new Uint8Array(1024); // Small fixed size
  const blob = new Blob([array], { type: "image/webp" });
  // Mock the size property to return the desired value
  Object.defineProperty(blob, "size", {
    value: sizeInBytes,
    writable: false,
    configurable: true,
    enumerable: false,
  });
  return blob;
}

// ============================================================================
// Tests
// ============================================================================

describe("ImageStore Size Limits", () => {
  let store: ImageStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new ImageStore();
  });

  describe("Individual File Size Limit (5MB)", () => {
    const FIVE_MB = 5 * 1024 * 1024;

    it("should accept file exactly at 5MB limit", async () => {
      const file = createMockFile(FIVE_MB, "exact-5mb.jpg");
      db.images.toArray.mockResolvedValue([]);
      db.images.add.mockResolvedValue("test-id");

      await expect(store.store(file)).resolves.toBeDefined();
    });

    it("should reject file slightly over 5MB limit", async () => {
      const file = createMockFile(FIVE_MB + 1024, "over-5mb.jpg");
      db.images.toArray.mockResolvedValue([]);

      await expect(store.store(file)).rejects.toThrow(
        "Image size exceeds maximum limit of 5MB",
      );
    });

    it("should reject file significantly over 5MB limit", async () => {
      const file = createMockFile(10 * 1024 * 1024, "10mb.jpg"); // 10MB
      db.images.toArray.mockResolvedValue([]);

      await expect(store.store(file)).rejects.toThrow(
        "Image size exceeds maximum limit of 5MB",
      );
    });

    it("should accept small files", async () => {
      const file = createMockFile(1024 * 1024, "1mb.jpg"); // 1MB
      db.images.toArray.mockResolvedValue([]);
      db.images.add.mockResolvedValue("test-id");

      await expect(store.store(file)).resolves.toBeDefined();
    });

    it("should accept file just under 5MB limit", async () => {
      const file = createMockFile(FIVE_MB - 1, "under-5mb.jpg");
      db.images.toArray.mockResolvedValue([]);
      db.images.add.mockResolvedValue("test-id");

      await expect(store.store(file)).resolves.toBeDefined();
    });

    it("should include correct size in error message", async () => {
      const file = createMockFile(6 * 1024 * 1024, "6mb.jpg");
      db.images.toArray.mockResolvedValue([]);

      try {
        await store.store(file);
        fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("5MB");
      }
    });
  });

  describe("Total Storage Quota (50MB)", () => {
    const FIFTY_MB = 50 * 1024 * 1024;

    it("should accept file when storage is empty", async () => {
      const file = createMockFile(5 * 1024 * 1024); // 5MB
      db.images.toArray.mockResolvedValue([]);
      db.images.add.mockResolvedValue("test-id");

      await expect(store.store(file)).resolves.toBeDefined();
    });

    it("should accept file when total usage is under quota", async () => {
      const existingImages = [
        {
          id: "img1",
          blob: createMockBlob(20 * 1024 * 1024), // 20MB
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];

      db.images.toArray.mockResolvedValue(existingImages);
      db.images.add.mockResolvedValue("test-id");

      const newFile = createMockFile(5 * 1024 * 1024); // 5MB more = 25MB total
      await expect(store.store(newFile)).resolves.toBeDefined();
    });

    it("should reject file that would exceed quota", async () => {
      const existingImages = [
        {
          id: "img1",
          blob: createMockBlob(48 * 1024 * 1024), // 48MB
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];

      db.images.toArray.mockResolvedValue(existingImages);

      const newFile = createMockFile(5 * 1024 * 1024); // 5MB more = 53MB total
      await expect(store.store(newFile)).rejects.toThrow(
        "Storage quota exceeded. Maximum 50MB allowed",
      );
    });

    it("should reject file even if under individual limit but over quota", async () => {
      const existingImages = [
        {
          id: "img1",
          blob: createMockBlob(49 * 1024 * 1024), // 49MB
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];

      db.images.toArray.mockResolvedValue(existingImages);

      const newFile = createMockFile(2 * 1024 * 1024); // 2MB more = 51MB total
      await expect(store.store(newFile)).rejects.toThrow(
        "Storage quota exceeded. Maximum 50MB allowed",
      );
    });

    it("should accept file when usage is exactly at quota boundary", async () => {
      const existingImages = [
        {
          id: "img1",
          blob: createMockBlob(45 * 1024 * 1024), // 45MB
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];

      db.images.toArray.mockResolvedValue(existingImages);
      db.images.add.mockResolvedValue("test-id");

      const newFile = createMockFile(5 * 1024 * 1024); // 5MB more = 50MB exactly
      await expect(store.store(newFile)).resolves.toBeDefined();
    });

    it("should calculate quota with thumbnail sizes", async () => {
      const existingImages = [
        {
          id: "img1",
          blob: createMockBlob(30 * 1024 * 1024), // 30MB
          thumbnailBlob: createMockBlob(5 * 1024 * 1024), // 5MB thumbnail
          mimeType: "image/webp",
          thumbnailMimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];

      db.images.toArray.mockResolvedValue(existingImages);

      // Total existing: 35MB, new file: 4MB (under 5MB limit), total would be 39MB - should pass
      const newFile = createMockFile(4 * 1024 * 1024);
      db.images.add.mockResolvedValue("test-id");
      await expect(store.store(newFile)).resolves.toBeDefined();

      // Now test quota exceeded: existing 35MB + new 20MB would be 55MB
      // But 20MB is over individual limit, so use multiple smaller files
      // Instead, test with existing at 48MB
      const largeExisting = [
        {
          id: "img1",
          blob: createMockBlob(48 * 1024 * 1024), // 48MB
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];
      db.images.toArray.mockResolvedValue(largeExisting);
      
      const quotaExceedFile = createMockFile(4 * 1024 * 1024); // 48MB + 4MB = 52MB
      await expect(store.store(quotaExceedFile)).rejects.toThrow(
        "Storage quota exceeded. Maximum 50MB allowed",
      );
    });

    it("should handle multiple existing images in quota calculation", async () => {
      const existingImages = [
        {
          id: "img1",
          blob: createMockBlob(15 * 1024 * 1024),
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
        {
          id: "img2",
          blob: createMockBlob(20 * 1024 * 1024),
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
        {
          id: "img3",
          blob: createMockBlob(10 * 1024 * 1024),
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];

      db.images.toArray.mockResolvedValue(existingImages);

      // Total: 45MB, new file 4MB = 49MB - should pass
      const smallFile = createMockFile(4 * 1024 * 1024);
      db.images.add.mockResolvedValue("test-id");
      await expect(store.store(smallFile)).resolves.toBeDefined();

      // Now test quota exceeded with 48MB existing
      const largeExisting = [
        {
          id: "img1",
          blob: createMockBlob(48 * 1024 * 1024),
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];
      db.images.toArray.mockResolvedValue(largeExisting);
      
      const quotaExceedFile = createMockFile(4 * 1024 * 1024); // 48MB + 4MB = 52MB
      await expect(store.store(quotaExceedFile)).rejects.toThrow(
        "Storage quota exceeded. Maximum 50MB allowed",
      );
    });
  });

  describe("Combined Size Limits", () => {
    const FIVE_MB = 5 * 1024 * 1024;
    const FIFTY_MB = 50 * 1024 * 1024;

    it("should check file size limit before quota", async () => {
      // File over 5MB should fail even with empty storage
      const file = createMockFile(6 * 1024 * 1024);
      db.images.toArray.mockResolvedValue([]);

      await expect(store.store(file)).rejects.toThrow(
        "Image size exceeds maximum limit of 5MB",
      );
    });

    it("should enforce both limits correctly", async () => {
      // Setup: 40MB existing
      const existingImages = [
        {
          id: "img1",
          blob: createMockBlob(40 * 1024 * 1024),
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];

      db.images.toArray.mockResolvedValue(existingImages);

      // 4MB file should pass (under both limits)
      const smallFile = createMockFile(4 * 1024 * 1024);
      db.images.add.mockResolvedValue("test-id");
      await expect(store.store(smallFile)).resolves.toBeDefined();

      // Reset mocks
      vi.clearAllMocks();

      // 6MB file should fail (over individual limit) - file size checked first
      db.images.toArray.mockResolvedValue(existingImages);
      const largeFile = createMockFile(6 * 1024 * 1024);
      await expect(store.store(largeFile)).rejects.toThrow(
        "Image size exceeds maximum limit of 5MB",
      );

      // Reset mocks
      vi.clearAllMocks();

      // Test quota limit: 48MB existing + 4MB new = 52MB (over quota)
      db.images.toArray.mockResolvedValue([
        {
          id: "img1",
          blob: createMockBlob(48 * 1024 * 1024),
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ]);
      const quotaFile = createMockFile(4 * 1024 * 1024); // 48MB + 4MB = 52MB
      await expect(store.store(quotaFile)).rejects.toThrow(
        "Storage quota exceeded. Maximum 50MB allowed",
      );
    });
  });

  describe("getStorageUsage()", () => {
    it("should return zero usage for empty storage", async () => {
      db.images.toArray.mockResolvedValue([]);

      const usage = await store.getStorageUsage();

      expect(usage.count).toBe(0);
      expect(usage.estimatedSize).toBe(0);
    });

    it("should calculate usage for single image", async () => {
      const blob = createMockBlob(1024 * 1024); // 1MB
      const images = [
        {
          id: "img1",
          blob,
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];

      db.images.toArray.mockResolvedValue(images);

      const usage = await store.getStorageUsage();

      expect(usage.count).toBe(1);
      expect(usage.estimatedSize).toBe(1024 * 1024);
    });

    it("should include thumbnail sizes in usage calculation", async () => {
      const fullBlob = createMockBlob(2 * 1024 * 1024); // 2MB
      const thumbBlob = createMockBlob(512 * 1024); // 512KB
      const images = [
        {
          id: "img1",
          blob: fullBlob,
          thumbnailBlob: thumbBlob,
          mimeType: "image/webp",
          thumbnailMimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];

      db.images.toArray.mockResolvedValue(images);

      const usage = await store.getStorageUsage();

      expect(usage.count).toBe(1);
      expect(usage.estimatedSize).toBe(2 * 1024 * 1024 + 512 * 1024);
    });

    it("should handle multiple images with mixed thumbnails", async () => {
      const images = [
        {
          id: "img1",
          blob: createMockBlob(1024 * 1024),
          thumbnailBlob: createMockBlob(512 * 1024),
          mimeType: "image/webp",
          thumbnailMimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
        {
          id: "img2",
          blob: createMockBlob(2 * 1024 * 1024),
          thumbnailBlob: undefined,
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
        {
          id: "img3",
          blob: createMockBlob(3 * 1024 * 1024),
          thumbnailBlob: createMockBlob(256 * 1024),
          mimeType: "image/webp",
          thumbnailMimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];

      db.images.toArray.mockResolvedValue(images);

      const usage = await store.getStorageUsage();

      expect(usage.count).toBe(3);
      // 1MB + 512KB + 2MB + 3MB + 256KB = 6MB + 768KB
      expect(usage.estimatedSize).toBe(6 * 1024 * 1024 + 768 * 1024);
    });

    it("should handle images without thumbnails", async () => {
      const images = [
        {
          id: "img1",
          blob: createMockBlob(1024 * 1024),
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];

      db.images.toArray.mockResolvedValue(images);

      const usage = await store.getStorageUsage();

      expect(usage.count).toBe(1);
      expect(usage.estimatedSize).toBe(1024 * 1024);
    });
  });

  describe("put() Method (Raw Blob Storage)", () => {
    it("should accept raw blob without size validation", async () => {
      // put() is for P2P received images and doesn't enforce size limits
      const largeBlob = createMockBlob(10 * 1024 * 1024); // 10MB
      db.images.get.mockResolvedValue(undefined);
      db.images.add.mockResolvedValue("test-id");

      await expect(store.put("test-id", largeBlob)).resolves.toBeUndefined();
    });

    it("should update existing record without size validation", async () => {
      const existing = {
        id: "existing-id",
        blob: createMockBlob(1024 * 1024),
        mimeType: "image/webp",
        width: 256,
        height: 256,
        createdAt: Date.now(),
      };

      db.images.get.mockResolvedValue(existing);
      db.images.update.mockResolvedValue("test-id");

      const largeBlob = createMockBlob(8 * 1024 * 1024); // 8MB
      await expect(store.put("existing-id", largeBlob)).resolves.toBeUndefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero-byte file", async () => {
      const file = createMockFile(0, "empty.jpg");
      db.images.toArray.mockResolvedValue([]);
      db.images.add.mockResolvedValue("test-id");

      await expect(store.store(file)).resolves.toBeDefined();
    });

    it("should handle file at exact quota boundary", async () => {
      const fiftyMB = 50 * 1024 * 1024;
      const existingImages = [
        {
          id: "img1",
          blob: createMockBlob(fiftyMB - 1),
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];

      db.images.toArray.mockResolvedValue(existingImages);
      db.images.add.mockResolvedValue("test-id");

      const file = createMockFile(1, "one-byte.jpg");
      await expect(store.store(file)).resolves.toBeDefined();
    });

    it("should handle very large existing storage", async () => {
      const images = Array.from({ length: 100 }, (_, i) => ({
        id: `img${i}`,
        blob: createMockBlob(100 * 1024), // 100KB each
        mimeType: "image/webp",
        width: 256,
        height: 256,
        createdAt: Date.now() - i * 1000,
      }));

      db.images.toArray.mockResolvedValue(images);

      const usage = await store.getStorageUsage();
      expect(usage.count).toBe(100);
      expect(usage.estimatedSize).toBe(100 * 100 * 1024); // ~10MB
    });
  });

  describe("Error Messages", () => {
    it("should provide clear error for file size limit", async () => {
      const file = createMockFile(6 * 1024 * 1024);
      db.images.toArray.mockResolvedValue([]);

      try {
        await store.store(file);
        fail("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toBe("Image size exceeds maximum limit of 5MB");
      }
    });

    it("should provide clear error for storage quota", async () => {
      const existingImages = [
        {
          id: "img1",
          blob: createMockBlob(48 * 1024 * 1024),
          mimeType: "image/webp",
          width: 256,
          height: 256,
          createdAt: Date.now(),
        },
      ];

      db.images.toArray.mockResolvedValue(existingImages);
      const file = createMockFile(5 * 1024 * 1024);

      try {
        await store.store(file);
        fail("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toBe("Storage quota exceeded. Maximum 50MB allowed");
      }
    });
  });
});
