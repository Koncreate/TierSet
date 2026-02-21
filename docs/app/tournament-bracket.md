# Tournament Bracket Implementation Guide

Focus: Tournament logic + React implementation.

---

## Current Project State

Existing files:
- `src/lib/bracket/types.ts` - Types + basic bracket creation (HAS BUGS)
- `src/lib/bracket/useBracketDocument.ts` - Automerge/P2P integration
- `src/components/bracket/` - UI components (BracketView, BracketMatch, BracketRound)

**Issues to fix:**
1. Seeding algorithm pairs sequentially (1v2, 3v4) - WRONG
2. BYE handling is broken
3. Visual connectors need improvement

---

## Core Types

```typescript
// Location: src/lib/bracket/types.ts

export interface BracketParticipant {
  id: string;
  name: string;
  seed?: number;
  isBye?: boolean;  // Add this
}

export interface BracketMatch {
  id: string;
  roundId: string;
  position: number;
  
  participant1Id: string | null;
  participant2Id: string | null;
  winnerId: string | null;
  
  participant1Score?: number;
  participant2Score?: number;
  
  nextMatchId: string | null;
  isFinal: boolean;
}

export interface BracketRound {
  id: string;
  name: string;
  roundNumber: number;
  matchIds: string[];
}
```

---

## Seeding Algorithm (FIX THIS)

**Current (WRONG):**
```typescript
// This creates 1v2, 3v4 - incorrect!
for (let i = 0; i < totalSlots / 2; i++) {
  const p1 = paddedParticipants[i * 2];
  const p2 = paddedParticipants[i * 2 + 1];
}
```

**Correct approach:**

```typescript
/**
 * Generate seed order for single elimination bracket.
 * Ensures seed 1 plays seed 16, seed 2 plays seed 15, etc.
 * 
 * @param n - Total number of slots (power of 2)
 * @returns Array of seed positions (1-indexed)
 * 
 * Examples:
 *   n=4:  [1, 4, 2, 3]     → 1v4, 2v3
 *   n=8:  [1, 8, 4, 5, 2, 7, 3, 6]  → 1v8, 4v5, 2v7, 3v6
 *   n=16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]
 */
export function generateSeedOrder(n: number): number[] {
  if (n === 1) return [1];
  
  const first = generateSeedOrder(n / 2);
  const second = first.slice().reverse().map(x => n + 1 - x);
  
  return first.flatMap((x, i) => [x, second[i]]);
}

// Usage:
const seedOrder = generateSeedOrder(16); // [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]

// Create first round matches:
for (let i = 0; i < matchCount; i++) {
  const seed1 = seedOrder[i * 2];
  const seed2 = seedOrder[i * 2 + 1];
  const p1 = participants[seed1 - 1];  // seed is 1-indexed
  const p2 = participants[seed2 - 1];
  // Create match...
}
```

---

## BYE Handling

```typescript
export function createBracketWithByes(
  participants: BracketParticipant[]
): { rounds: BracketRound[]; matches: Record<string, BracketMatch> } {
  const n = participants.length;
  
  // Find next power of 2
  const size = Math.pow(2, Math.ceil(Math.log2(n)));
  const byes = size - n;
  
  // Add BYEs (they get the lowest seeds: size, size-1, etc.)
  const padded = [...participants];
  for (let i = 0; i < byes; i++) {
    padded.push({
      id: `bye-${i}`,
      name: "BYE",
      seed: size - i,
      isBye: true,
    });
  }
  
  // Generate seed order and create bracket
  const seedOrder = generateSeedOrder(size);
  // ... create matches with proper seeding
  
  // IMPORTANT: Auto-advance BYEs
  for (const match of Object.values(matches)) {
    const p1 = paddedParticipants.find(p => p.id === match.participant1Id);
    const p2 = paddedParticipants.find(p => p.id === match.participant2Id);
    
    if (p1?.isBye) {
      match.winnerId = p2?.id ?? null;
    } else if (p2?.isBye) {
      match.winnerId = p1?.id ?? null;
    }
    
    // Propagate winner to next match
    if (match.winnerId && match.nextMatchId) {
      propagateWinner(matches, match, match.winnerId);
    }
  }
  
  return { rounds, matches };
}

function propagateWinner(
  matches: Record<string, BracketMatch>,
  match: BracketMatch,
  winnerId: string
) {
  const nextMatch = matches[match.nextMatchId];
  if (!nextMatch) return;
  
  // Winner goes to top slot if empty, otherwise bottom
  if (nextMatch.participant1Id === null) {
    nextMatch.participant1Id = winnerId;
  } else if (nextMatch.participant2Id === null) {
    nextMatch.participant2Id = winnerId;
  }
}
```

---

## React Components

### Structure

```
src/components/bracket/
├── BracketView.tsx      # Main container
├── BracketRound.tsx     # Column of matches  
└── BracketMatch.tsx     # Individual match card
```

### BracketView (Main)

```tsx
// src/components/bracket/BracketView.tsx

import { useState, useCallback, useMemo } from "react";
import { createBracketDocument, advanceMatchWinner } from "../../lib/bracket/types";
import { BracketRound } from "./BracketRound";

export function BracketView({ bracketId }: { bracketId?: string }) {
  // Load from storage or create demo
  const bracket = useMemo(() => {
    if (!bracketId) return null;
    return loadBracket(bracketId);
  }, [bracketId]);

  const handleWinnerSelect = useCallback((matchId: string, winnerId: string) => {
    // Update bracket with winner
    const updated = advanceMatchWinner(bracket, matchId, winnerId);
    saveBracket(bracket.id, updated);
    setBracket(updated);
  }, [bracket]);

  if (!bracket) return <CreateBracketForm />;

  return (
    <div className="bracket-container">
      <div className="flex gap-8">
        {bracket.rounds.map((round) => (
          <BracketRound
            key={round.id}
            round={round}
            bracket={bracket}
            onWinnerSelect={handleWinnerSelect}
            isEditable={true}
          />
        ))}
      </div>
    </div>
  );
}
```

### BracketRound (Column)

```tsx
// src/components/bracket/BracketRound.tsx

import { BracketMatch } from "./BracketMatch";
import type { BracketDocument, BracketRound } from "../../lib/bracket/types";

interface BracketRoundProps {
  round: BracketRound;
  bracket: BracketDocument;
  onWinnerSelect?: (matchId: string, winnerId: string) => void;
  isEditable?: boolean;
}

export function BracketRound({ round, bracket, onWinnerSelect, isEditable }: BracketRoundProps) {
  const matches = round.matchIds
    .map(id => bracket.matches[id])
    .filter(Boolean);

  return (
    <div className="flex flex-col">
      {/* Round Header */}
      <div className="text-center mb-4">
        <h3 className="font-bold text-gray-400 uppercase">{round.name}</h3>
      </div>

      {/* Matches */}
      <div className="flex flex-col gap-4">
        {matches.map((match, index) => (
          <div key={match.id} className="relative">
            <BracketMatch
              match={match}
              bracket={bracket}
              onWinnerSelect={onWinnerSelect}
              isEditable={isEditable}
            />
            
            {/* Connector Lines */}
            {match.nextMatchId && index % 2 === 0 && (
              <ConnectorLine />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectorLine() {
  return (
    <div 
      className="absolute -right-8 top-1/2 w-8 h-px bg-slate-600"
      style={{
        clipPath: "polygon(0 50%, 100% 50%, 100% 50%, 0 50%)"
      }}
    />
  );
}
```

### BracketMatch (Card)

```tsx
// src/components/bracket/BracketMatch.tsx

import { useButton } from "@react-aria/button";
import type { BracketDocument, BracketMatch, BracketParticipant } from "../../lib/bracket/types";

interface BracketMatchProps {
  match: BracketMatch;
  bracket: BracketDocument;
  onWinnerSelect?: (matchId: string, winnerId: string) => void;
  isEditable?: boolean;
}

export function BracketMatch({ match, bracket, onWinnerSelect, isEditable }: BracketMatchProps) {
  const p1 = bracket.participants.find(p => p.id === match.participant1Id);
  const p2 = bracket.participants.find(p => p.id === match.participant2Id);
  const winner = bracket.participants.find(p => p.id === match.winnerId);

  const handleClick = (winnerId: string) => {
    if (isEditable && !match.winnerId) {
      onWinnerSelect?.(match.id, winnerId);
    }
  };

  return (
    <div className={`
      bg-slate-800 border border-slate-700 rounded-lg p-3
      min-w-[200px] min-h-[80px]
      ${isEditable ? "hover:border-amber-500 cursor-pointer" : ""}
    `}>
      {/* Winner badge */}
      {match.isFinal && match.winnerId && (
        <div className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs px-2 rounded-full">
          Winner
        </div>
      )}

      {/* Participant 1 */}
      <MatchParticipant
        participant={p1}
        isWinner={winner?.id === p1?.id}
        onClick={() => p1 && handleClick(p1.id)}
        disabled={!isEditable || !!match.winnerId}
      />

      <div className="border-t border-slate-700 my-2" />

      {/* Participant 2 */}
      <MatchParticipant
        participant={p2}
        isWinner={winner?.id === p2?.id}
        onClick={() => p2 && handleClick(p2.id)}
        disabled={!isEditable || !!match.winnerId}
      />
    </div>
  );
}

interface MatchParticipantProps {
  participant?: BracketParticipant;
  isWinner?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

function MatchParticipant({ participant, isWinner, onClick, disabled }: MatchParticipantProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { buttonProps } = useButton({ onClick, isDisabled: disabled }, ref);

  if (!participant) {
    return <div className="text-gray-500 italic text-sm">Waiting...</div>;
  }

  return (
    <div 
      {...buttonProps}
      className={`
        flex items-center justify-between px-2 py-1.5 rounded
        ${isWinner ? "bg-amber-500/20 text-amber-400 font-semibold" : "text-gray-300"}
        ${!disabled ? "hover:bg-slate-700 cursor-pointer" : ""}
      `}
    >
      <span className="truncate text-sm">{participant.name}</span>
      {isWinner && <span>👑</span>}
    </div>
  );
}
```

---

## Visual Connectors (CSS Approach)

Simple CSS connectors between matches:

```css
/* Connector lines using pseudo-elements */
.match-container {
  position: relative;
}

.match-container::after {
  content: '';
  position: absolute;
  right: -20px;
  top: 50%;
  width: 20px;
  height: 2px;
  background: #475569;
}

/* Only show connector for even-indexed matches (top of pair) */
.match-container:nth-child(odd)::after {
  display: block;
}

.match-container:nth-child(even)::after {
  display: none;
}
```

For more advanced connectors (bracket arms), use SVG:

```tsx
function BracketConnector({ fromMatch, toMatch, position }: {
  fromMatch: BracketMatch;
  toMatch: BracketMatch;
  position: "top" | "bottom";
}) {
  return (
    <svg className="absolute pointer-events-none" style={{ width: 40, height: 80 }}>
      <path
        d={position === "top" 
          ? "M 0 40 L 20 40 L 20 0 L 40 0"
          : "M 0 40 L 20 40 L 20 80 L 40 80"
        }
        fill="none"
        stroke="#475569"
        strokeWidth={2}
      />
    </svg>
  );
}
```

---

## Implementation Checklist

- [ ] **Fix seeding** - Replace sequential pairing with `generateSeedOrder()`
- [ ] **Fix BYE handling** - Auto-advance BYEs to next round
- [ ] **Add visual connectors** - SVG bracket arms between matches
- [ ] **Add round names** - Finals, Semifinals, Quarterfinals
- [ ] **Test with 4, 8, 16 participants** - Verify correct seeding

---

## Testing Seeding Algorithm

```typescript
// Test cases
console.log(generateSeedOrder(4));
// Expected: [1, 4, 2, 3]

console.log(generateSeedOrder(8));
// Expected: [1, 8, 4, 5, 2, 7, 3, 6]

console.log(generateSeedOrder(16));
// Expected: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/lib/bracket/types.ts` | Fix `createBracketStructure()` with proper seeding |
| `src/components/bracket/BracketMatch.tsx` | Add visual improvements |
| `src/components/bracket/BracketRound.tsx` | Add connector lines |
| `src/lib/bracket/__tests__/seeding.test.ts` | Add tests for seeding |

---

## References

- [g-loot/react-tournament-brackets](https://github.com/g-loot/react-tournament-brackets) - React bracket UI library
- [Stack Overflow: Tournament bracket placement](https://stackoverflow.com/questions/8355264) - Seeding algorithm
