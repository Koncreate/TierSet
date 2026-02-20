/**
 * Bracket Round Component
 * Displays a column/round of matches in the tournament bracket
 */

import type { BracketDocument, BracketRound } from "../../lib/bracket/types";
import { BracketMatch } from "./BracketMatch";

interface BracketRoundProps {
  round: BracketRound;
  bracket: BracketDocument;
  onWinnerSelect?: (matchId: string, winnerId: string) => void;
  isEditable?: boolean;
}

export function BracketRound({ round, bracket, onWinnerSelect, isEditable = false }: BracketRoundProps) {
  const matches = round.matchIds.map((matchId) => bracket.matches[matchId]).filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      {/* Round header */}
      <div className="text-center mb-2">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{round.name}</h3>
        <p className="text-xs text-gray-500">Round {round.roundNumber}</p>
      </div>

      {/* Matches container */}
      <div className="flex flex-col gap-4 relative">
        {matches.map((match, index) => (
          <div key={match.id} className="relative">
            <BracketMatch
              match={match}
              bracket={bracket}
              onWinnerSelect={onWinnerSelect}
              isEditable={isEditable}
            />

            {/* Connection line to next round */}
            {match.nextMatchId && index % 2 === 0 && (
              <div className="absolute -right-4 top-1/2 w-4 h-px bg-slate-600" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
