/**
 * Bracket View Component
 * Main component for displaying and interacting with tournament brackets
 */

import React, { useState, useCallback, useMemo } from "react";
import { Button } from "react-aria-components";
import { Trophy, Share, Download, Trash, Plus, Users } from "@phosphor-icons/react";
import type { BracketDocument, BracketId } from "../../lib/bracket/types";
import { createBracketDocument } from "../../lib/bracket/types";
import { BracketRound } from "./BracketRound";
import { ConnectionStatusIndicator } from "../p2p/ConnectionStatus";
import { RoomCodeDisplay, PeerList } from "../p2p";
import type { PeerInfo } from "../../lib/p2p";

interface BracketViewProps {
  bracket?: ReturnType<typeof createBracketDocument> | null;
  bracketId?: string;
  onCreateBracket?: (name: string) => void;
}

export function BracketView({ bracket: bracketProp, bracketId, onCreateBracket }: BracketViewProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBracketName, setNewBracketName] = useState("");
  const [participantNames, setParticipantNames] = useState<string[]>(["", ""]);
  const [isEditable, setIsEditable] = useState(true);
  const [roomCode] = useState<string | null>(null);
  const [peers] = useState<PeerInfo[]>([]);

  // Use provided bracket or create sample
  const bracket = useMemo(() => {
    if (bracketProp) return bracketProp;
    
    if (bracketId) {
      // In real implementation, load from storage
      return null;
    }
    
    // Create sample bracket for demo
    try {
      return createBracketDocument({
        name: "Sample Tournament",
        participants: ["Player 1", "Player 2", "Player 3", "Player 4"],
        createdBy: "demo-user",
      });
    } catch {
      return null;
    }
  }, [bracketProp, bracketId]);

  const handleCreateBracket = useCallback(() => {
    if (!newBracketName.trim() || participantNames.filter((n) => n.trim()).length < 2) {
      return;
    }

    onCreateBracket?.(newBracketName);
    setShowCreateModal(false);
    setNewBracketName("");
    setParticipantNames(["", ""]);
  }, [newBracketName, participantNames, onCreateBracket]);

  const handleWinnerSelect = useCallback((matchId: string, winnerId: string) => {
    console.log("Winner selected:", matchId, winnerId);
    // In real implementation, update bracket document
  }, []);

  const handleAddParticipant = () => {
    setParticipantNames([...participantNames, ""]);
  };

  const handleParticipantChange = (index: number, value: string) => {
    const updated = [...participantNames];
    updated[index] = value;
    setParticipantNames(updated);
  };

  const handleRemoveParticipant = (index: number) => {
    if (participantNames.length <= 2) return;
    const updated = participantNames.filter((_, i) => i !== index);
    setParticipantNames(updated);
  };

  // Show create form if no bracket
  if (!bracket) {
    return (
      <div
        className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900"
        style={{ viewTransitionName: "bracket-view" }}
      >
        <div className="max-w-4xl mx-auto py-12 px-6">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Create Tournament Bracket</h1>
            <p className="text-gray-400">Set up a single-elimination tournament</p>
          </div>

          {/* Create Button */}
          <div className="text-center mb-8">
            <CreateButton onClick={() => setShowCreateModal(true)} />
          </div>

          {/* Existing Brackets */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Trophy size={24} className="text-amber-400" weight="fill" />
              Recent Brackets
            </h2>
            <div className="text-center py-8 text-gray-400">
              <Trophy size={48} className="mx-auto mb-4 opacity-50" weight="light" />
              <p>No brackets yet. Create your first tournament above!</p>
            </div>
          </div>

          {/* Create Modal */}
          {showCreateModal && (
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setShowCreateModal(false)}
            >
              <div
                className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-2xl font-bold text-white mb-4">Create Tournament</h2>

                {/* Tournament Name */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Tournament Name
                  </label>
                  <input
                    type="text"
                    value={newBracketName}
                    onChange={(e) => setNewBracketName(e.target.value)}
                    placeholder="Enter tournament name..."
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Participants */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Participants ({participantNames.filter((n) => n.trim()).length})
                  </label>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {participantNames.map((name, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => handleParticipantChange(index, e.target.value)}
                          placeholder={`Participant ${index + 1}`}
                          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        />
                        {participantNames.length > 2 && (
                          <button
                            onClick={() => handleRemoveParticipant(index)}
                            className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Remove participant"
                          >
                            <Trash size={18} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleAddParticipant}
                    className="mt-2 flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    <Plus size={16} />
                    Add Participant
                  </button>
                </div>

                {/* Info */}
                <div className="bg-slate-700/50 rounded-lg p-3 mb-4">
                  <p className="text-xs text-gray-400">
                    💡 Tip: You need at least 2 participants. For best results, use powers of 2
                    (2, 4, 8, 16, 32). BYEs will be auto-assigned if needed.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateBracket}
                    disabled={!newBracketName.trim() || participantNames.filter((n) => n.trim()).length < 2}
                    className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                  >
                    Create Bracket
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render bracket view
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{bracket.name}</h1>
            {bracket.description && (
              <p className="text-gray-400">{bracket.description}</p>
            )}
          </div>

          <div className="flex gap-2">
            <ConnectionStatusIndicator
              status="disconnected"
              peerCount={peers.length}
              syncStatus="disconnected"
              connectedPeers={[]}
            />

            <button
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium"
            >
              <Share size={18} />
              Share
            </button>

            <button
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              <Download size={18} />
              Export
            </button>
          </div>
        </div>

        {/* Room Code */}
        {roomCode && (
          <div className="mb-6">
            <RoomCodeDisplay code={roomCode} roomType="bracket" />
          </div>
        )}

        {/* Connected Peers */}
        {roomCode && peers.length > 0 && (
          <div className="mb-6">
            <PeerList
              peers={peers}
              currentPeerId=""
              isHost={false}
              onKickPeer={async () => {}}
              onCloseRoom={async () => {}}
            />
          </div>
        )}

        {/* Bracket Controls */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setIsEditable(!isEditable)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isEditable
                ? "bg-amber-500 text-white"
                : "bg-slate-700 text-gray-300 hover:bg-slate-600"
            }`}
          >
            {isEditable ? "✓ Editing Enabled" : "Enable Editing"}
          </button>
        </div>

        {/* Bracket */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 overflow-x-auto">
          <div className="flex gap-8 min-w-max">
            {bracket.rounds.map((round) => (
              <BracketRound
                key={round.id}
                round={round}
                bracket={bracket}
                onWinnerSelect={handleWinnerSelect}
                isEditable={isEditable}
              />
            ))}
          </div>
        </div>

        {/* Participants List */}
        <div className="mt-8 bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Users size={24} className="text-amber-400" />
            Participants ({bracket.participants.length})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {bracket.participants.map((participant) => (
              <div
                key={participant.id}
                className="bg-slate-700 rounded-lg px-3 py-2 text-center"
              >
                <div className="text-xs text-gray-400 mb-1">
                  #{participant.seed}
                </div>
                <div className="text-sm font-medium text-white truncate">
                  {participant.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onPress={onClick}
      className="inline-flex items-center gap-3 px-8 py-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-105"
    >
      <Trophy size={24} weight="fill" />
      Create New Tournament
    </Button>
  );
}
