import { useState, useEffect, useCallback } from "react";
import Uppy from "@uppy/core";
import DashboardModal from "@uppy/react/dashboard-modal";
import XHRUpload from "@uppy/xhr-upload";
import ImageEditor from "@uppy/image-editor";
import "@uppy/core/css/style.css";
import "@uppy/dashboard/css/style.css";
import "@uppy/image-editor/css/style.css";
import { extractImages, filterValidImages, compressImage } from "../../lib/images";
import { imageStore } from "../../lib/storage";

export interface UploadResult {
  id: string;
  url: string;
  filename: string;
  width: number;
  height: number;
}

interface ImageUploaderProps {
  onImagesSelected: (results: UploadResult[]) => void;
  maxDimensions?: { width: number; height: number };
  maxFileSize?: number;
}

export function ImageUploader({
  onImagesSelected,
  maxDimensions = { width: 512, height: 512 },
  maxFileSize = 5 * 1024 * 1024,
}: ImageUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");

  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxFileSize,
        allowedFileTypes: ["image/*"],
      },
      autoProceed: false,
      meta: {
        maxWidth: maxDimensions.width,
        maxHeight: maxDimensions.height,
      },
    })
      .use(ImageEditor, {
        quality: 0.8,
        cropperOptions: {
          aspectRatio: 1,
          viewMode: 1,
          background: false,
          autoCropArea: 1,
          responsive: true,
        },
        actions: {
          revert: true,
          rotate: true,
          granularRotate: true,
          flip: true,
          zoomIn: true,
          zoomOut: true,
          cropSquare: true,
          cropWidescreen: true,
          cropWidescreenVertical: true,
        },
      })
      .use(XHRUpload, {
        endpoint: "/api/image-upload/mock",
        method: "POST",
        fieldName: "files[]",
      }),
  );

  useEffect(() => {
    console.log("[Uppy] Instance created with restrictions:", { maxFileSize, maxDimensions });
  }, []);

  const handleGlobalDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer?.files?.length) return;

    const extracted = await extractImages(e.dataTransfer.files);
    const valid = filterValidImages(extracted);

    if (valid.length === 0) {
      console.warn("No valid images found in dropped content");
      return;
    }

    for (const { file } of valid) {
      uppy.addFile({
        name: file.name,
        type: file.type,
        data: file,
      });
    }

    setIsOpen(true);
  }, [uppy]);

  const handleGlobalDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  useEffect(() => {
    window.addEventListener("drop", handleGlobalDrop);
    window.addEventListener("dragover", handleGlobalDragOver);

    return () => {
      window.removeEventListener("drop", handleGlobalDrop);
      window.removeEventListener("dragover", handleGlobalDragOver);
    };
  }, [handleGlobalDrop, handleGlobalDragOver]);

  useEffect(() => {
    return () => {
      uppy.cancelAll();
    };
  }, [uppy]);

  const processFiles = useCallback(async () => {
    const files = uppy.getFiles();
    if (files.length === 0) {
      console.log("[Uppy] No files to process");
      return;
    }

    console.log("[Uppy] Processing", files.length, "files");
    setIsProcessing(true);
    setProcessingStatus("Processing images...");

    const results: UploadResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProcessingStatus(`Compressing ${file.name}... (${i + 1}/${files.length})`);

      try {
        let blob: Blob;
        if (file.data instanceof Blob) {
          blob = file.data;
        } else if (file.data) {
          blob = new Blob([file.data as BlobPart]);
        } else {
          console.warn("[Uppy] No data for file:", file.name);
          continue;
        }
        console.log("[Uppy] Compressing:", file.name, "original size:", blob.size);
        const compressed = await compressImage(blob, {
          maxWidth: maxDimensions.width,
          maxHeight: maxDimensions.height,
        });
        console.log("[Uppy] Compressed:", file.name, "new size:", compressed.blob.size, "dimensions:", compressed.width, "x", compressed.height);

        const imageId = await imageStore.store(
          new File([compressed.blob], file.name, { type: compressed.blob.type }),
          { generateThumbnail: true },
        );
        console.log("[Uppy] Stored:", file.name, "->", imageId);

        results.push({
          id: imageId,
          url: `local://${imageId}`,
          filename: file.name,
          width: compressed.width,
          height: compressed.height,
        });
      } catch (error) {
        console.error("[Uppy] Failed to process", file.name, ":", error);
      }
    }

    console.log("[Uppy] Processing complete. Results:", results.length);
    uppy.cancelAll();
    setIsProcessing(false);
    setProcessingStatus("");
    setIsOpen(false);
    onImagesSelected(results);
  }, [uppy, maxDimensions, onImagesSelected]);

  useEffect(() => {
    const handleFileAdded = (file: any) => {
      console.log("[Uppy] File added:", file.name, file.type, file.size);
    };
    const handleFileRemoved = (file: any) => {
      console.log("[Uppy] File removed:", file.name);
    };
    const handleUpload = () => {
      console.log("[Uppy] Upload started");
      processFiles();
    };
    const handleUploadError = (file: any, error: any) => {
      console.error("[Uppy] Upload error:", file?.name, error);
    };
    const handleComplete = (result: any) => {
      console.log("[Uppy] Complete:", result.successful?.length ?? 0, "successful,", result.failed?.length ?? 0, "failed");
    };

    uppy.on("file-added", handleFileAdded);
    uppy.on("file-removed", handleFileRemoved);
    uppy.on("upload", handleUpload);
    uppy.on("upload-error", handleUploadError);
    uppy.on("complete", handleComplete);

    return () => {
      uppy.off("file-added", handleFileAdded);
      uppy.off("file-removed", handleFileRemoved);
      uppy.off("upload", handleUpload);
      uppy.off("upload-error", handleUploadError);
      uppy.off("complete", handleComplete);
    };
  }, [uppy, processFiles]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-gray-50 rounded-xl">
        <div
          className="w-12 h-12 border-4 border-gray-200 border-t-green-500 rounded-full mb-4"
          style={{ animation: "spin 1s linear infinite" }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p className="text-gray-500 text-sm">{processingStatus}</p>
      </div>
    );
  }

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer transition-colors bg-gray-50 hover:border-gray-500 hover:bg-gray-100"
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="mt-4 text-base text-gray-500 text-center">
          Drop images anywhere or click to upload
        </p>
        <p className="mt-2 text-sm text-gray-400">
          Supports: JPG, PNG, WebP, GIF, ZIP files, and folders
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Max size: {Math.round(maxFileSize / (1024 * 1024))}MB per file
        </p>
      </div>

      <DashboardModal
        uppy={uppy}
        open={isOpen}
        onRequestClose={handleClose}
        hideProgressDetails={false}
        note="Images will be compressed and stored locally. Click crop icon to edit."
        proudlyDisplayPoweredByUppy={false}
        animateOpenClose
        closeAfterFinish
      />
    </>
  );
}
