import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/dist/react-easy-crop.css";

interface Crop {
  x: number;
  y: number;
}

interface ImageCropModalProps {
  imageSrc: string;
  aspectRatio?: number;
  onCropComplete: (croppedBlob: Blob) => void;
  onClose: () => void;
}

export function ImageCropModal({
  imageSrc,
  aspectRatio = 1,
  onCropComplete,
  onClose,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<null | {
    width: number;
    height: number;
    x: number;
    y: number;
  }>(null);

  const handleCropComplete = useCallback(
    (
      _croppedArea: { width: number; height: number },
      croppedAreaPixels: { width: number; height: number; x: number; y: number },
    ) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels) return;

    try {
      // Create canvas for cropping
      const image = new Image();
      image.src = imageSrc;
      await new Promise((resolve) => {
        image.onload = resolve;
      });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;

      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
      );

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            onCropComplete(blob);
          }
        },
        "image/webp",
        0.8,
      );
    } catch (error) {
      console.error("Failed to crop image:", error);
    }
  }, [imageSrc, croppedAreaPixels, onCropComplete]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "relative",
          width: "80%",
          maxWidth: "600px",
          height: "60vh",
          background: "black",
          borderRadius: "8px",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspectRatio}
          cropShape="rect"
          showGrid={true}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={handleCropComplete}
        />

        {/* Controls */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "16px",
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {/* Zoom slider */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "white", fontSize: "14px" }}>Zoom:</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </div>

          {/* Rotation slider */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "white", fontSize: "14px" }}>Rotate:</span>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              onClick={onClose}
              style={{
                padding: "8px 16px",
                background: "transparent",
                border: "1px solid white",
                color: "white",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: "8px 16px",
                background: "#4CAF50",
                border: "none",
                color: "white",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
