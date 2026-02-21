import { useCallback, useEffect, useRef } from "react";
import { Button, Modal, ModalOverlay, Dialog } from "react-aria-components";
import type { BoardItem } from "../../lib/documents";
import { uiActions, appStore } from "../../stores";
import { useStore } from "@tanstack/react-store";

interface ItemLightboxProps {
  itemImages: Map<string, string>;
  onEditItem?: (item: BoardItem) => void;
}

export function ItemLightbox({ itemImages, onEditItem }: ItemLightboxProps) {
  const lightbox = useStore(appStore, (state) => state.ui.lightbox);

  const isOpen = lightbox.isOpen && lightbox.mode === "tier";
  const items = lightbox.items;
  const currentIndex = lightbox.currentIndex;

  const currentItem = items[currentIndex] || null;
  const currentImageUrl = currentItem ? itemImages.get(currentItem.id) || null : null;

  const hasMultiple = items.length > 1;

  const prevIndex = hasMultiple ? (currentIndex <= 0 ? items.length - 1 : currentIndex - 1) : -1;
  const nextIndex = hasMultiple ? (currentIndex >= items.length - 1 ? 0 : currentIndex + 1) : -1;

  const prevItem = prevIndex >= 0 ? items[prevIndex] : null;
  const nextItem = nextIndex >= 0 ? items[nextIndex] : null;
  const prevImageUrl = prevItem ? itemImages.get(prevItem.id) || null : null;
  const nextImageUrl = nextItem ? itemImages.get(nextItem.id) || null : null;

  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "ArrowLeft") {
        uiActions.lightboxPrev();
      } else if (e.key === "ArrowRight") {
        uiActions.lightboxNext();
      } else if (e.key === "Escape") {
        uiActions.closeLightbox();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      closeBtnRef.current?.focus();
    }
  }, [isOpen, currentIndex]);

  const handlePrev = useCallback(() => {
    uiActions.lightboxPrev();
  }, []);

  const handleNext = useCallback(() => {
    uiActions.lightboxNext();
  }, []);

  const handleClose = useCallback(() => {
    uiActions.closeLightbox();
  }, []);

  const handleEdit = useCallback(() => {
    if (currentItem && currentImageUrl) {
      uiActions.openImageEditor(currentItem.id, currentImageUrl);
      onEditItem?.(currentItem);
    }
  }, [currentItem, currentImageUrl, onEditItem]);

  if (!isOpen) return null;

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => !open && handleClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <Modal className="w-full h-full outline-none">
        <Dialog className="relative w-full h-full outline-none">
          {/* Backdrop - clicks here close the lightbox */}
          <div
            className="absolute inset-0 z-0"
            onClick={handleClose}
          />

          {/* Close button */}
          <Button
            ref={closeBtnRef}
            onPress={handleClose}
            className="absolute top-4 right-4 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-xl cursor-pointer"
          >
            ✕
          </Button>

          {/* Main content - centered carousel */}
          <div className="w-full h-full flex items-center justify-center pointer-events-none">
            {/* Previous button & peek */}
            {hasMultiple && (
              <div
                className="absolute left-0 top-0 h-full flex items-center justify-start pl-4 opacity-40 hover:opacity-60 transition-opacity pointer-events-auto"
                onClick={handlePrev}
              >
                {prevImageUrl ? (
                  <img
                    src={prevImageUrl}
                    alt=""
                    className="max-h-[70vh] max-w-[30vw] object-contain rounded-lg"
                  />
                ) : prevItem?.emoji ? (
                  <div className="text-7xl">{prevItem.emoji}</div>
                ) : (
                  <div className="w-32 h-32 bg-slate-700 rounded-lg" />
                )}
              </div>
            )}

            {/* Arrow left */}
            {hasMultiple && (
              <Button
                onPress={handlePrev}
                className="absolute left-4 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl cursor-pointer pointer-events-auto"
              >
                ‹
              </Button>
            )}

            {/* Center item */}
            <div className="z-10 flex flex-col items-center justify-center max-w-[80vw] pointer-events-auto">
              {currentImageUrl ? (
                <img
                  src={currentImageUrl}
                  alt={currentItem?.name || ""}
                  className="max-h-[70vh] max-w-[80vw] object-contain rounded-lg"
                />
              ) : currentItem?.emoji ? (
                <div className="text-9xl">{currentItem.emoji}</div>
              ) : (
                <div className="w-64 h-64 bg-slate-700 rounded-lg flex items-center justify-center text-white text-4xl">
                  {currentItem?.name?.charAt(0) || "?"}
                </div>
              )}
              {currentItem && (
                <div className="mt-4 bg-black/60 text-white px-6 py-2 rounded-full">
                  <span className="text-lg font-medium">{currentItem.name}</span>
                </div>
              )}
            </div>

            {/* Arrow right */}
            {hasMultiple && (
              <Button
                onPress={handleNext}
                className="absolute right-4 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl cursor-pointer pointer-events-auto"
              >
                ›
              </Button>
            )}

            {/* Next peek */}
            {hasMultiple && (
              <div
                className="absolute right-0 top-0 h-full flex items-center justify-end pr-4 opacity-40 hover:opacity-60 transition-opacity pointer-events-auto"
                onClick={handleNext}
              >
                {nextImageUrl ? (
                  <img
                    src={nextImageUrl}
                    alt=""
                    className="max-h-[70vh] max-w-[30vw] object-contain rounded-lg"
                  />
                ) : nextItem?.emoji ? (
                  <div className="text-7xl">{nextItem.emoji}</div>
                ) : (
                  <div className="w-32 h-32 bg-slate-700 rounded-lg" />
                )}
              </div>
            )}
          </div>

          {/* Bottom toolbar */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 pb-6 pt-4 bg-gradient-to-t from-black/60 to-transparent pointer-events-auto">
            {currentItem && onEditItem && (
              <Button
                onPress={handleEdit}
                className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors cursor-pointer"
              >
                Edit Photo
              </Button>
            )}
            <span className="text-white/70" tabIndex={-1}>
              {currentIndex + 1} / {items.length}
            </span>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
