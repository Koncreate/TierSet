/**
 * Bracket Match Component
 * Displays a single match in the tournament bracket
 */

import React, { useRef } from "react";
import { useButton } from "@react-aria/button";
import { useFocusRing } from "@react-aria/focus";
import { mergeProps } from "@react-aria/utils";
import type { RefObject } from "react";
import type { BracketDocument, BracketMatch, BracketParticipant } from "../../lib/bracket/types";

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

  const handleWinnerSelect = (winnerId: string) => {
    if (isEditable && onWinnerSelect) {
      onWinnerSelect(match.id, winnerId);
    }
  };

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
  disabled?: boolean;
}

function MatchParticipant({
  participant,
  score,
  isWinner,
  isSelected,
  onClick,
  disabled,
}: MatchParticipantProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { buttonProps } = useButton(
    {
      onClick,
      isDisabled: disabled,
      "aria-pressed": isSelected,
    },
    ref as RefObject<HTMLElement>,
  );
  const { isFocusVisible, focusProps } = useFocusRing();

  const isPressed = false; // Simplified for now

  const baseClasses = `
    flex items-center justify-between gap-2 px-2 py-1.5 rounded
    transition-all duration-150
    ${disabled ? "cursor-default" : "cursor-pointer"}
    ${isFocusVisible ? "ring-2 ring-amber-500 ring-offset-2 ring-offset-slate-800" : ""}
    ${isPressed ? "scale-[0.98]" : ""}
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
    <div {...mergeProps(buttonProps, focusProps, { className: `${baseClasses} ${stateClasses}` })} ref={ref}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {isWinner && <span className="text-amber-400">👑</span>}
        <span className="truncate text-sm">{participant.name}</span>
      </div>
      {score !== undefined && (
        <span className="text-xs font-mono bg-slate-700 px-2 py-0.5 rounded">{score}</span>
      )}
    </div>
  );
}
