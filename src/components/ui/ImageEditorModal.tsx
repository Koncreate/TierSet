import { useState, useCallback, useEffect } from "react";
import { Button, Modal, ModalOverlay, Dialog } from "react-aria-components";
import Cropper from "react-easy-crop";
import type { Point, Area } from "react-easy-crop";
import { uiActions, appStore } from "../../stores";
import { useStore } from "@tanstack/react-store";

interface ImageEditorModalProps {
  onSave?: (editedImageUrl: string) => void;
}

export function ImageEditorModal({ onSave }: ImageEditorModalProps) {
  const imageEditor = useStore(appStore, (state) => state.ui.imageEditor);
  const isOpen = imageEditor.isOpen;
  const imageUrl = imageEditor.originalImageUrl;

  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);

  const [activeTab, setActiveTab] = useState<"crop" | "adjust" | "curves">("adjust");

  const onCropComplete = useCallback((_croppedArea: Area, _croppedAreaPixels: Area) => {
    // Crop data available when saving
  }, []);

  const handleClose = useCallback(() => {
    uiActions.closeImageEditor();
  }, []);

  const handleReset = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    uiActions.resetImageEditor();
  }, []);

  const handleSave = useCallback(async () => {
    if (!imageUrl || !onSave) return;

    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageUrl;

      await new Promise((resolve) => {
        img.onload = resolve;
      });

      // Apply filters
      ctx.filter = `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturation}%)`;
      
      if (flipH) ctx.scale(-1, 1);
      if (flipV) ctx.scale(1, -1);

      // Calculate dimensions with rotation
      const angle = (rotation * Math.PI) / 180;
      const sin = Math.abs(Math.sin(angle));
      const cos = Math.abs(Math.cos(angle));
      const newWidth = img.width * cos + img.height * sin;
      const newHeight = img.width * sin + img.height * cos;

      canvas.width = newWidth;
      canvas.height = newHeight;

      ctx.translate(newWidth / 2, newHeight / 2);
      ctx.rotate(angle);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      const editedUrl = canvas.toDataURL("image/jpeg", 0.9);
      onSave(editedUrl);
      handleClose();
    } catch (error) {
      console.error("Failed to save image:", error);
    }
  }, [imageUrl, onSave, handleClose, rotation, flipH, flipV, brightness, contrast, saturation]);

  // Reset state when modal opens with new image
  useEffect(() => {
    if (isOpen) {
      handleReset();
    }
  }, [isOpen, imageUrl]);

  if (!isOpen || !imageUrl) return null;

  const getFilterStyle = () => ({
    filter: `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturation}%)`,
    transform: `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1}) rotate(${rotation}deg)`,
  });

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => !open && handleClose()}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
    >
      <Modal className="w-full max-w-4xl h-[90vh] outline-none">
        <Dialog className="bg-slate-800 rounded-2xl overflow-hidden outline-none flex flex-col h-full">
          {({ close }) => (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                <h2 className="text-xl font-bold text-white">Edit Photo</h2>
                <Button
                  onPress={close}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-white cursor-pointer"
                >
                  ✕
                </Button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 px-6 py-2 border-b border-slate-700">
                {(["adjust", "crop", "curves"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors ${
                      activeTab === tab
                        ? "bg-amber-500 text-white"
                        : "bg-slate-700 text-gray-300 hover:bg-slate-600"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 flex overflow-hidden">
                {/* Preview area */}
                <div className="flex-1 relative bg-black">
                  <div className="absolute inset-0" style={getFilterStyle()}>
                    {activeTab === "crop" ? (
                      <Cropper
                        image={imageUrl}
                        crop={crop}
                        zoom={zoom}
                        rotation={rotation}
                        aspect={undefined}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                      />
                    ) : (
                      <img
                        src={imageUrl}
                        alt="Preview"
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                </div>

                {/* Controls sidebar */}
                <div className="w-72 bg-slate-900 p-4 overflow-y-auto">
                  {activeTab === "adjust" && (
                    <div className="space-y-6">
                      {/* Brightness */}
                      <div>
                        <div className="flex justify-between text-white mb-2">
                          <span>Brightness</span>
                          <span className="text-gray-400">{brightness}</span>
                        </div>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          value={brightness}
                          onChange={(e) => setBrightness(Number(e.target.value))}
                          className="w-full accent-amber-500"
                        />
                      </div>

                      {/* Contrast */}
                      <div>
                        <div className="flex justify-between text-white mb-2">
                          <span>Contrast</span>
                          <span className="text-gray-400">{contrast}</span>
                        </div>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          value={contrast}
                          onChange={(e) => setContrast(Number(e.target.value))}
                          className="w-full accent-amber-500"
                        />
                      </div>

                      {/* Saturation */}
                      <div>
                        <div className="flex justify-between text-white mb-2">
                          <span>Saturation</span>
                          <span className="text-gray-400">{saturation}</span>
                        </div>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          value={saturation}
                          onChange={(e) => setSaturation(Number(e.target.value))}
                          className="w-full accent-amber-500"
                        />
                      </div>

                      {/* Rotation */}
                      <div>
                        <div className="flex justify-between text-white mb-2">
                          <span>Rotation</span>
                          <span className="text-gray-400">{rotation}°</span>
                        </div>
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          value={rotation}
                          onChange={(e) => setRotation(Number(e.target.value))}
                          className="w-full accent-amber-500"
                        />
                      </div>

                      {/* Flip */}
                      <div className="flex gap-4">
                        <button
                          onClick={() => setFlipH(!flipH)}
                          className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                            flipH ? "bg-amber-500 text-white" : "bg-slate-700 text-gray-300"
                          }`}
                        >
                          Flip H
                        </button>
                        <button
                          onClick={() => setFlipV(!flipV)}
                          className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                            flipV ? "bg-amber-500 text-white" : "bg-slate-700 text-gray-300"
                          }`}
                        >
                          Flip V
                        </button>
                      </div>
                    </div>
                  )}

                  {activeTab === "crop" && (
                    <div className="space-y-6">
                      <div>
                        <div className="text-white mb-2">Zoom</div>
                        <input
                          type="range"
                          min={1}
                          max={3}
                          step={0.1}
                          value={zoom}
                          onChange={(e) => setZoom(Number(e.target.value))}
                          className="w-full accent-amber-500"
                        />
                      </div>
                      <div>
                        <div className="text-white mb-2">Rotation</div>
                        <input
                          type="range"
                          min={0}
                          max={360}
                          step={90}
                          value={rotation}
                          onChange={(e) => setRotation(Number(e.target.value))}
                          className="w-full accent-amber-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[null, 1, 16 / 9, 4 / 3].map((ratio, idx) => (
                          <button
                            key={idx}
                            onClick={() => {}}
                            className="py-2 px-3 bg-slate-700 text-gray-300 rounded-lg text-sm hover:bg-slate-600"
                          >
                            {ratio === null ? "Free" : `${ratio}:1`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === "curves" && (
                    <div className="space-y-4">
                      <p className="text-gray-400 text-sm">
                        Curves editor coming soon. Use the basic adjustments above for now.
                      </p>
                      {/* Basic curves representation */}
                      <div className="bg-slate-800 p-4 rounded-lg">
                        <svg viewBox="0 0 100 100" className="w-full h-32">
                          <path
                            d="M0,100 Q50,100 100,0"
                            fill="none"
                            stroke="white"
                            strokeWidth="2"
                          />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
                <Button
                  onPress={handleReset}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium cursor-pointer"
                >
                  Reset
                </Button>
                <div className="flex gap-3">
                  <Button
                    onPress={close}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    onPress={handleSave}
                    className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium cursor-pointer"
                  >
                    Save
                  </Button>
                </div>
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
