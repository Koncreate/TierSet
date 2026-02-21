/**
 * Bracket Match Component
 * Displays a single match in the tournament bracket
 */

import { useCallback } from "react";
import { Button } from "react-aria-components";
import type { BracketDocument, BracketMatch, BracketParticipant } from "../../lib/bracket/types";
import { uiActions } from "../../stores";

interface BracketMatchProps {
  match: BracketMatch;
  bracket: BracketDocument;
  onWinnerSelect?: (matchId: string, winnerId: string) => void;
  isEditable?: boolean;
}

export function BracketMatch({ match, bracket, onWinnerSelect, isEditable = false }: BracketMatchProps) {
  const participant1 = bracket.participants.find((p) => p.id === match.participant1Id);
  const participant2 = bracket.participants.find((p) => p.id === match.participant2Id);
  const winner = bracket.participants.find((p) => p.id === match.winnerId);

  const participants = [participant1, participant2].filter((p): p is BracketParticipant => p !== undefined);

  const handleWinnerSelect = useCallback((winnerId: string) => {
    if (isEditable && onWinnerSelect) {
      onWinnerSelect(match.id, winnerId);
    }
  }, [isEditable, onWinnerSelect, match.id]);

  const handleDoubleClick = useCallback((participant: BracketParticipant) => {
    uiActions.openBracketLightbox(match.id, participants, participant.id);
  }, [match.id, participants]);

  return (
    <div
      className={`
        relative bg-slate-800 border border-slate-700 rounded-lg p-3
        transition-all duration-200
        ${isEditable ? "hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10" : ""}
      `}
      style={{ minHeight: "80px" }}
    >
      {/* Match status indicator */}
      {match.isFinal && match.winnerId && (
        <div className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
          🏆 Winner
        </div>
      )}

      {/* Participant 1 */}
      <MatchParticipant
        participant={participant1}
        score={match.participant1Score}
        isWinner={winner?.id === participant1?.id}
        isSelected={match.winnerId === participant1?.id}
        onClick={() => participant1 && handleWinnerSelect(participant1.id)}
        onDoubleClick={() => participant1 && handleDoubleClick(participant1)}
        disabled={!isEditable || !participant1 || match.winnerId !== null}
      />

      {/* Divider */}
      <div className="my-2 border-t border-slate-700" />

      {/* Participant 2 */}
      <MatchParticipant
        participant={participant2}
        score={match.participant2Score}
        isWinner={winner?.id === participant2?.id}
        isSelected={match.winnerId === participant2?.id}
        onClick={() => participant2 && handleWinnerSelect(participant2.id)}
        onDoubleClick={() => participant2 && handleDoubleClick(participant2)}
        disabled={!isEditable || !participant2 || match.winnerId !== null}
      />

      {/* Empty state */}
      {!participant1 && !participant2 && (
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          TBD
        </div>
      )}
    </div>
  );
}

interface MatchParticipantProps {
  participant?: BracketParticipant;
  score?: number;
  isWinner?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  disabled?: boolean;
}

function MatchParticipant({
  participant,
  score,
  isWinner,
  isSelected,
  onClick,
  onDoubleClick,
  disabled,
}: MatchParticipantProps) {
  const baseClasses = `
    flex items-center justify-between gap-2 px-2 py-1.5 rounded
    transition-all duration-150
    ${disabled ? "cursor-default" : "cursor-pointer"}
  `;

  const stateClasses = isWinner
    ? "bg-amber-500/20 text-amber-400 font-semibold"
    : isSelected
    ? "bg-amber-500 text-white font-semibold"
    : disabled
    ? "text-gray-500"
    : "text-gray-300 hover:bg-slate-700 hover:text-white";

  if (!participant) {
    return (
      <div className={`flex items-center justify-between ${stateClasses}`}>
        <span className="text-sm italic">Waiting...</span>
      </div>
    );
  }

  return (
    <Button
      isDisabled={disabled}
      onPress={onClick}
      onDoubleClick={onDoubleClick}
      className={`${baseClasses} ${stateClasses} w-full text-left`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {isWinner && <span className="text-amber-400">👑</span>}
        <span className="truncate text-sm">{participant.name}</span>
      </div>
      {score !== undefined && (
        <span className="text-xs font-mono bg-slate-700 px-2 py-0.5 rounded">{score}</span>
      )}
    </Button>
  );
}
