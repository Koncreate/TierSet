import { useCallback, useEffect, useRef } from "react";
import { Button, Modal, ModalOverlay, Dialog } from "react-aria-components";
import type { BracketParticipant } from "../../lib/bracket/types";
import { uiActions, appStore } from "../../stores";
import { useStore } from "@tanstack/react-store";

export function MatchDetailsLightbox() {
  const lightbox = useStore(appStore, (state) => state.ui.lightbox);

  const isOpen = lightbox.isOpen && lightbox.mode === "bracket";
  const match = lightbox.match;
  const participants = lightbox.participants;
  const currentIndex = lightbox.currentIndex;

  const currentParticipant = participants[currentIndex] || null;

  const hasMultiple = participants.length > 1;

  const prevIndex = hasMultiple ? (currentIndex <= 0 ? participants.length - 1 : currentIndex - 1) : -1;
  const nextIndex = hasMultiple ? (currentIndex >= participants.length - 1 ? 0 : currentIndex + 1) : -1;

  const prevParticipant = prevIndex >= 0 ? participants[prevIndex] : null;
  const nextParticipant = nextIndex >= 0 ? participants[nextIndex] : null;

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

  const getScore = (participant: BracketParticipant | null) => {
    if (!participant || !match) return "-";
    return participant.id === match.participant1Id
      ? match.participant1Score ?? "-"
      : match.participant2Score ?? "-";
  };

  const getStatus = (participant: BracketParticipant | null) => {
    if (!participant || !match) return null;
    if (match.winnerId) {
      return match.winnerId === participant.id ? "Winner" : "Eliminated";
    }
    return match.isFinal ? "Final" : "In Progress";
  };

  const getStatusColor = (participant: BracketParticipant | null) => {
    const status = getStatus(participant);
    if (status === "Winner") return "text-amber-400";
    if (status === "Eliminated") return "text-gray-400";
    if (status === "In Progress") return "text-cyan-400";
    return "text-gray-400";
  };

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
            {/* Previous peek */}
            {hasMultiple && prevParticipant && (
              <div
                className="absolute left-0 top-0 h-full flex items-center justify-start pl-4 opacity-40 hover:opacity-60 transition-opacity pointer-events-auto"
                onClick={handlePrev}
              >
                <div className="bg-slate-800 rounded-xl p-6 max-w-sm">
                  <div className="text-4xl font-bold text-white mb-2">{prevParticipant.name}</div>
                  <div className="text-2xl text-gray-400">{getScore(prevParticipant)}</div>
                </div>
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
            <div className="z-10 flex flex-col items-center justify-center pointer-events-auto">
              {currentParticipant && (
                <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl max-w-md w-[80vw]">
                  <h2 className="text-2xl font-bold text-white mb-6 text-center">Match Details</h2>
                  
                  <div className="space-y-4">
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      <p className="text-sm text-gray-400 mb-1">Participant</p>
                      <p className="text-xl font-semibold text-white">{currentParticipant.name}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-700/50 rounded-lg p-4">
                        <p className="text-sm text-gray-400 mb-1">Score</p>
                        <p className="text-3xl font-bold text-white">{getScore(currentParticipant)}</p>
                      </div>

                      <div className="bg-slate-700/50 rounded-lg p-4">
                        <p className="text-sm text-gray-400 mb-1">Status</p>
                        <p className={`text-xl font-semibold ${getStatusColor(currentParticipant)}`}>
                          {getStatus(currentParticipant)}
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-700/50 rounded-lg p-4">
                       <p className="text-sm text-gray-400 mb-1">Match ID</p>
                       <p className="text-sm text-gray-300 font-mono">{match?.id ?? "-"}</p>
                     </div>
                  </div>
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
            {hasMultiple && nextParticipant && (
              <div
                className="absolute right-0 top-0 h-full flex items-center justify-end pr-4 opacity-40 hover:opacity-60 transition-opacity pointer-events-auto"
                onClick={handleNext}
              >
                <div className="bg-slate-800 rounded-xl p-6 max-w-sm">
                  <div className="text-4xl font-bold text-white mb-2">{nextParticipant.name}</div>
                  <div className="text-2xl text-gray-400">{getScore(nextParticipant)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom counter */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 pb-6 pt-4 bg-gradient-to-t from-black/60 to-transparent pointer-events-auto">
            <span className="text-white/70" tabIndex={-1}>
              {currentIndex + 1} / {participants.length}
            </span>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
