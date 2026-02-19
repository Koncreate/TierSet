import React, { useRef, useState, useCallback } from "react";
import { ImageCropModal } from "./ImageCropModal";
import { Image as ImageIcon, Upload as UploadIcon, X } from "@phosphor-icons/react";

interface ImageUploaderProps {
  onImageSelected: (file: File, croppedBlob: Blob) => void;
  accept?: string;
  maxSizeMB?: number;
}

export function ImageUploader({
  onImageSelected,
  accept = "image/*",
  maxSizeMB = 5,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    (file: File) => {
      setError(null);

      // Validate file type
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file");
        return;
      }

      // Validate file size
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > maxSizeMB) {
        setError(`Image must be smaller than ${maxSizeMB}MB`);
        return;
      }

      setSelectedFile(file);

      // Create preview URL
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setShowCropper(true);
    },
    [maxSizeMB],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  const handleCropComplete = useCallback(
    (croppedBlob: Blob) => {
      if (selectedFile) {
        onImageSelected(selectedFile, croppedBlob);
      }
      handleClose();
    },
    [selectedFile, onImageSelected],
  );

  const handleClose = useCallback(() => {
    setShowCropper(false);
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setError(null);
  }, [previewUrl]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  return (
    <>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => inputRef.current?.click()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          border: "2px dashed #ccc",
          borderRadius: "12px",
          cursor: "pointer",
          transition: "all 0.2s ease",
          background: "#fafafa",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#999";
          e.currentTarget.style.background = "#f0f0f0";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "#ccc";
          e.currentTarget.style.background = "#fafafa";
        }}
      >
        <UploadIcon size={48} weight="light" color="#666" />
        <p
          style={{
            marginTop: "16px",
            fontSize: "16px",
            color: "#666",
            textAlign: "center",
          }}
        >
          Drop an image here or click to upload
        </p>
        <p
          style={{
            marginTop: "8px",
            fontSize: "14px",
            color: "#999",
          }}
        >
          Max size: {maxSizeMB}MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          style={{ display: "none" }}
        />
      </div>

      {error && (
        <div
          style={{
            marginTop: "12px",
            padding: "8px 12px",
            background: "#fee",
            color: "#c00",
            borderRadius: "4px",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      {showCropper && previewUrl && (
        <ImageCropModal
          imageSrc={previewUrl}
          aspectRatio={1}
          onCropComplete={handleCropComplete}
          onClose={handleClose}
        />
      )}
    </>
  );
}
