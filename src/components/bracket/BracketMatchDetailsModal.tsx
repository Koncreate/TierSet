import { Button, Modal, ModalOverlay, Dialog } from "react-aria-components";
import type { BracketMatch, BracketParticipant } from "../../lib/bracket/types";

interface BracketMatchDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: BracketMatch;
  participant: BracketParticipant;
}

export function BracketMatchDetailsModal({
  isOpen,
  onClose,
  match,
  participant,
}: BracketMatchDetailsModalProps) {
  if (!isOpen) return null;

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <Modal className="w-full max-w-md outline-none">
        <Dialog className="bg-slate-800 rounded-xl p-6 shadow-2xl outline-none">
          {({ close }) => (
            <>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Match Details</h2>
                <Button
                  onPress={close}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-white cursor-pointer"
                >
                  ✕
                </Button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <p className="text-sm text-gray-400 mb-1">Participant</p>
                  <p className="text-lg font-semibold text-white">{participant.name}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <p className="text-sm text-gray-400 mb-1">Score</p>
                    <p className="text-2xl font-bold text-white">
                      {participant.id === match.participant1Id
                        ? match.participant1Score ?? "-"
                        : match.participant2Score ?? "-"}
                    </p>
                  </div>

                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <p className="text-sm text-gray-400 mb-1">Status</p>
                    <p className="text-lg font-semibold text-white">
                      {match.winnerId ? (
                        match.winnerId === participant.id ? (
                          <span className="text-amber-400">Winner</span>
                        ) : (
                          <span className="text-gray-400">Eliminated</span>
                        )
                      ) : match.isFinal ? (
                        <span className="text-gray-400">Final</span>
                      ) : (
                        <span className="text-cyan-400">In Progress</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4">
                  <p className="text-sm text-gray-400 mb-1">Match ID</p>
                  <p className="text-sm text-gray-300 font-mono">{match.id}</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button
                  onPress={close}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors cursor-pointer"
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
