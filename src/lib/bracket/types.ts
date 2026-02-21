/**
 * Tournament Bracket Types and Data Structures
 */

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
  isBye?: boolean;
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
 * Generate seed order for single elimination bracket.
 * Ensures seed 1 plays seed 16, seed 2 plays seed 15, etc.
 * This is the standard tournament seeding pattern.
 *
 * @param n - Total number of slots (must be power of 2)
 * @returns Array of seed positions (1-indexed)
 *
 * Examples:
 *   n=4:  [1, 4, 2, 3]     → 1v4, 2v3
 *   n=8:  [1, 8, 4, 5, 2, 7, 3, 6]  → 1v8, 4v5, 2v7, 3v6
 *   n=16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]
 */
export function generateSeedOrder(n: number): number[] {
  if (n === 1) return [1];

  let seeds: number[] = [1, 2];
  let size = 2;

  while (size < n) {
    const newSeeds: number[] = [];
    for (const s of seeds) {
      newSeeds.push(s);
      newSeeds.push(size * 2 + 1 - s);
    }
    seeds = newSeeds;
    size *= 2;
  }

  return seeds;
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

  // Generate seed order for proper bracket placement
  const seedOrder = generateSeedOrder(totalSlots);

  // Pad participants if needed with BYEs
  const paddedParticipants = [...participants];
  const byesNeeded = totalSlots - numParticipants;
  for (let i = 0; i < byesNeeded; i++) {
    paddedParticipants.push({
      id: `bye-${i}`,
      name: "BYE",
      seed: totalSlots - i,
      isBye: true,
    });
  }

  const rounds: BracketRound[] = [];
  const matches: Record<string, BracketMatch> = {};

  // Create first round matches using seed order
  const firstRoundMatches: BracketMatch[] = [];
  for (let i = 0; i < totalSlots / 2; i++) {
    const matchId = `match-r1-${i}`;
    const seed1 = seedOrder[i * 2];
    const seed2 = seedOrder[i * 2 + 1];
    const p1 = paddedParticipants[seed1 - 1]; // seeds are 1-indexed
    const p2 = paddedParticipants[seed2 - 1];

    // Auto-advance if one participant is a BYE
    let winnerId: string | null = null;
    if (p1?.isBye && p2) {
      winnerId = p2.id;
    } else if (p2?.isBye && p1) {
      winnerId = p1.id;
    }

    firstRoundMatches.push({
      id: matchId,
      roundId: "round-1",
      position: i,
      participant1Id: p1?.id ?? null,
      participant2Id: p2?.id ?? null,
      winnerId,
      nextMatchId: null,
      isFinal: false,
    });
    matches[matchId] = firstRoundMatches[firstRoundMatches.length - 1];
  }

  // Propagate BYE winners to next round
  for (const match of firstRoundMatches) {
    if (match.winnerId && match.nextMatchId) {
      propagateWinner(matches, match, match.winnerId);
    }
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

      // Link previous matches to this one
      if (prevMatch1) prevMatch1.nextMatchId = matchId;
      if (prevMatch2) prevMatch2.nextMatchId = matchId;

      // If both previous matches have winners (BYEs), auto-propagate
      let participant1Id: string | null = null;
      let participant2Id: string | null = null;
      let winnerId: string | null = null;

      if (prevMatch1?.winnerId) {
        participant1Id = prevMatch1.winnerId;
      }
      if (prevMatch2?.winnerId) {
        participant2Id = prevMatch2.winnerId;
      }
      // Auto-advance if one slot is empty and other has BYE winner
      if (participant1Id && !participant2Id) {
        const p1 = paddedParticipants.find((p) => p.id === participant1Id);
        if (p1?.isBye) {
          winnerId = participant1Id;
        }
      }
      if (participant2Id && !participant1Id) {
        const p2 = paddedParticipants.find((p) => p.id === participant2Id);
        if (p2?.isBye) {
          winnerId = participant2Id;
        }
      }

      const newMatch: BracketMatch = {
        id: matchId,
        roundId: `round-${roundNum}`,
        position: i,
        participant1Id,
        participant2Id,
        winnerId,
        nextMatchId: null,
        isFinal: roundNum === numRounds,
      };

      roundMatches.push(newMatch);
      matches[matchId] = newMatch;

      // Propagate BYE winner
      if (winnerId && newMatch.nextMatchId) {
        propagateWinner(matches, newMatch, winnerId);
      }
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
 * Propagate a winner to the next match
 */
function propagateWinner(
  matches: Record<string, BracketMatch>,
  match: BracketMatch,
  winnerId: string,
) {
  const nextMatch = matches[match.nextMatchId ?? ""];
  if (!nextMatch) return;

  if (nextMatch.participant1Id === null) {
    nextMatch.participant1Id = winnerId;
  } else if (nextMatch.participant2Id === null) {
    nextMatch.participant2Id = winnerId;
  }
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
