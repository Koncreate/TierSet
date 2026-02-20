/**
 * Tournament Bracket Types and Data Structures
 */

import type { AutomergeValue } from "@automerge/automerge";

/**
 * Unique identifier for bracket documents
 */
export type BracketId = string;

/**
 * Participant in a tournament bracket
 */
export interface BracketParticipant {
  id: string;
  name: string;
  seed?: number;
  metadata?: Record<string, unknown>;
}

/**
 * A single match in the bracket
 */
export interface BracketMatch {
  id: string;
  roundId: string;
  /** Position within the round (0-indexed) */
  position: number;
  /** Participant IDs */
  participant1Id: string | null;
  participant2Id: string | null;
  /** Winner ID (null if not yet decided) */
  winnerId: string | null;
  /** Scores for each participant (optional) */
  participant1Score?: number;
  participant2Score?: number;
  /** ID of the next match this match feeds into */
  nextMatchId: string | null;
  /** Whether this is the final match */
  isFinal: boolean;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A round in the bracket (column of matches)
 */
export interface BracketRound {
  id: string;
  name: string;
  roundNumber: number;
  matchIds: string[];
}

/**
 * Main bracket document structure using Automerge CRDT
 */
export interface BracketDocument {
  id: BracketId;
  name: string;
  description?: string;
  /** All participants */
  participants: BracketParticipant[];
  /** All rounds */
  rounds: BracketRound[];
  /** All matches indexed by ID */
  matches: Record<string, BracketMatch>;
  /** Current state of the bracket */
  status: "draft" | "in_progress" | "completed";
  /** Creator ID */
  createdBy: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Settings */
  settings: {
    /** Third place match enabled */
    thirdPlaceMatch: boolean;
    /** Single or double elimination */
    eliminationType: "single" | "double";
  };
}

/**
 * Create a new bracket document with the given participants
 */
export function createBracketDocument(params: {
  name: string;
  participants: string[];
  createdBy: string;
}): BracketDocument {
  const { name, participants, createdBy } = params;
  const now = Date.now();
  const bracketId = crypto.randomUUID();

  // Create participants
  const participantObjects: BracketParticipant[] = participants.map((name, index) => ({
    id: crypto.randomUUID(),
    name,
    seed: index + 1,
  }));

  // Create bracket structure
  const { rounds, matches } = createBracketStructure(participantObjects);

  return {
    id: bracketId,
    name,
    participants: participantObjects,
    rounds,
    matches,
    status: "draft",
    createdBy,
    createdAt: now,
    updatedAt: now,
    settings: {
      thirdPlaceMatch: false,
      eliminationType: "single",
    },
  };
}

/**
 * Create the bracket structure (rounds and matches) for a given set of participants
 */
function createBracketStructure(participants: BracketParticipant[]): {
  rounds: BracketRound[];
  matches: Record<string, BracketMatch>;
} {
  const numParticipants = participants.length;

  // Calculate number of rounds needed (log2 of participants)
  const numRounds = Math.ceil(Math.log2(numParticipants));
  const totalSlots = Math.pow(2, numRounds);

  // Pad participants if needed
  const paddedParticipants = [...participants];
  while (paddedParticipants.length < totalSlots) {
    paddedParticipants.push({
      id: `bye-${crypto.randomUUID()}`,
      name: "BYE",
      isBye: true,
    } as BracketParticipant & { isBye: boolean });
  }

  const rounds: BracketRound[] = [];
  const matches: Record<string, BracketMatch> = {};

  // Create first round matches
  const firstRoundMatches: BracketMatch[] = [];
  for (let i = 0; i < totalSlots / 2; i++) {
    const matchId = `match-r1-${i}`;
    const p1 = paddedParticipants[i * 2];
    const p2 = paddedParticipants[i * 2 + 1];

    // Auto-advance if one participant is a BYE
    let winnerId: string | null = null;
    if ((p1 as any).isBye && !p2) {
      winnerId = p2.id;
    } else if ((p2 as any).isBye && !p1) {
      winnerId = p1.id;
    }

    firstRoundMatches.push({
      id: matchId,
      roundId: `round-1`,
      position: i,
      participant1Id: p1?.id ?? null,
      participant2Id: p2?.id ?? null,
      winnerId,
      nextMatchId: null,
      isFinal: false,
    });
    matches[matchId] = firstRoundMatches[firstRoundMatches.length - 1];
  }

  // Create first round
  rounds.push({
    id: "round-1",
    name: "Round 1",
    roundNumber: 1,
    matchIds: firstRoundMatches.map((m) => m.id),
  });

  // Create subsequent rounds
  let previousRoundMatches = firstRoundMatches;
  for (let roundNum = 2; roundNum <= numRounds; roundNum++) {
    const roundMatches: BracketMatch[] = [];
    const matchCount = Math.pow(2, numRounds - roundNum);

    for (let i = 0; i < matchCount; i++) {
      const matchId = `match-r${roundNum}-${i}`;
      const prevMatch1 = previousRoundMatches[i * 2];
      const prevMatch2 = previousRoundMatches[i * 2 + 1];

      if (prevMatch1 && prevMatch2) {
        // Link previous matches to this one
        prevMatch1.nextMatchId = matchId;
        prevMatch2.nextMatchId = matchId;
      }

      roundMatches.push({
        id: matchId,
        roundId: `round-${roundNum}`,
        position: i,
        participant1Id: prevMatch1?.winnerId ?? null,
        participant2Id: prevMatch2?.winnerId ?? null,
        winnerId: null,
        nextMatchId: null,
        isFinal: roundNum === numRounds,
      });
      matches[matchId] = roundMatches[roundMatches.length - 1];
    }

    rounds.push({
      id: `round-${roundNum}`,
      name: getRoundName(roundNum, numRounds),
      roundNumber: roundNum,
      matchIds: roundMatches.map((m) => m.id),
    });

    previousRoundMatches = roundMatches;
  }

  return { rounds, matches };
}

/**
 * Get the name for a round based on its position
 */
function getRoundName(roundNum: number, totalRounds: number): string {
  if (roundNum === totalRounds) return "Finals";
  if (roundNum === totalRounds - 1) return "Semifinals";
  if (roundNum === totalRounds - 2) return "Quarterfinals";
  return `Round ${roundNum}`;
}

/**
 * Advance a winner in a match
 */
export function advanceMatchWinner(
  bracket: BracketDocument,
  matchId: string,
  winnerId: string,
): BracketDocument {
  const match = bracket.matches[matchId];
  if (!match) return bracket;

  // Update the match winner
  match.winnerId = winnerId;

  // If there's a next match, advance the winner
  if (match.nextMatchId) {
    const nextMatch = bracket.matches[match.nextMatchId];
    if (nextMatch) {
      // Determine which slot this winner goes into
      if (nextMatch.participant1Id === null || nextMatch.participant1Id === match.winnerId) {
        nextMatch.participant1Id = winnerId;
      } else if (nextMatch.participant2Id === null || nextMatch.participant2Id === match.winnerId) {
        nextMatch.participant2Id = winnerId;
      }
    }
  }

  bracket.updatedAt = Date.now();

  // Check if bracket is complete
  const finalMatch = Object.values(bracket.matches).find((m) => m.isFinal);
  if (finalMatch?.winnerId) {
    bracket.status = "completed";
  } else {
    bracket.status = "in_progress";
  }

  return bracket;
}
