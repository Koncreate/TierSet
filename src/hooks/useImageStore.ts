import { useState, useEffect, useCallback, useRef } from "react";
import { imageStore } from "../lib/storage";

interface UseImageStoreReturn {
  getImageUrl: (id: string, thumbnail?: boolean) => Promise<string | null>;
  storeImage: (file: File) => Promise<string>;
  deleteImage: (id: string) => Promise<void>;
  images: Array<{
    id: string;
    originalName?: string;
    width: number;
    height: number;
    createdAt: number;
  }>;
  isLoading: boolean;
  revokeUrl: (url: string) => void;
}

/**
 * Hook for managing image storage
 */
export function useImageStore(): UseImageStoreReturn {
  const [images, setImages] = useState<
    Array<{
      id: string;
      originalName?: string;
      width: number;
      height: number;
      createdAt: number;
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const urlCacheRef = useRef<Map<string, string>>(new Map());

  // Load image list on mount
  useEffect(() => {
    let mounted = true;

    async function loadImages() {
      try {
        const list = await imageStore.list();
        if (mounted) {
          setImages(list);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to load images:", error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadImages();

    // Cleanup all URLs on unmount
    return () => {
      urlCacheRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      urlCacheRef.current.clear();
    };
  }, []);

  // Revoke a specific URL
  const revokeUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    // Remove from cache
    for (const [key, cachedUrl] of urlCacheRef.current.entries()) {
      if (cachedUrl === url) {
        urlCacheRef.current.delete(key);
        break;
      }
    }
  }, []);

  // Get image URL
  const getImageUrl = useCallback(
    async (id: string, thumbnail: boolean = false): Promise<string | null> => {
      const cacheKey = `${id}:${thumbnail ? "thumb" : "full"}`;

      // Return cached URL if available
      const cached = urlCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }

      const blob = thumbnail ? await imageStore.getThumbnail(id) : await imageStore.get(id);

      if (!blob) return null;

      const url = URL.createObjectURL(blob);
      urlCacheRef.current.set(cacheKey, url);
      return url;
    },
    [],
  );

  // Store new image
  const storeImage = useCallback(async (file: File): Promise<string> => {
    const id = await imageStore.store(file, { generateThumbnail: true });

    // Update local list
    setImages((prev) => [
      ...prev,
      {
        id,
        originalName: file.name,
        width: 0, // Would need to get from stored image
        height: 0,
        createdAt: Date.now(),
      },
    ]);

    return id;
  }, []);

  // Delete image
  const deleteImage = useCallback(async (id: string): Promise<void> => {
    // Revoke any cached URLs for this image
    for (const [key, url] of urlCacheRef.current.entries()) {
      if (key.startsWith(`${id}:`)) {
        URL.revokeObjectURL(url);
        urlCacheRef.current.delete(key);
      }
    }

    await imageStore.delete(id);
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  return {
    getImageUrl,
    storeImage,
    deleteImage,
    images,
    isLoading,
    revokeUrl,
  };
}
