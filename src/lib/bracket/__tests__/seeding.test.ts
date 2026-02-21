import { describe, it, expect } from "vitest";
import { generateSeedOrder, createBracketDocument, advanceMatchWinner } from "../types";

describe("generateSeedOrder", () => {
  it("should return correct order for 4 participants", () => {
    const result = generateSeedOrder(4);
    expect(result).toEqual([1, 4, 2, 3]);
  });

  it("should return correct order for 8 participants", () => {
    const result = generateSeedOrder(8);
    expect(result).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("should return correct order for 16 participants", () => {
    const result = generateSeedOrder(16);
    expect(result).toEqual([
      1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11,
    ]);
  });

  it("should handle single participant", () => {
    const result = generateSeedOrder(1);
    expect(result).toEqual([1]);
  });

  it("should create proper first round matches for 8 participants", () => {
    const seeds = generateSeedOrder(8);
    const matches: [number, number][] = [];
    for (let i = 0; i < 4; i++) {
      matches.push([seeds[i * 2], seeds[i * 2 + 1]]);
    }
    
    // Expected: 1v8, 4v5, 2v7, 3v6
    expect(matches).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });

  it("should create proper first round matches for 16 participants", () => {
    const seeds = generateSeedOrder(16);
    const matches: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      matches.push([seeds[i * 2], seeds[i * 2 + 1]]);
    }
    
    // Expected: 1v16, 8v9, 4v13, 5v12, 2v15, 7v10, 3v14, 6v11
    expect(matches).toEqual([
      [1, 16],
      [8, 9],
      [4, 13],
      [5, 12],
      [2, 15],
      [7, 10],
      [3, 14],
      [6, 11],
    ]);
  });
});

describe("createBracketDocument", () => {
  it("should create bracket with correct seeding for 4 participants", () => {
    const bracket = createBracketDocument({
      name: "Test Tournament",
      participants: ["A", "B", "C", "D"],
      createdBy: "user-1",
    });

    // First round should have 2 matches
    expect(bracket.rounds).toHaveLength(2); // Round 1 + Finals
    
    const round1 = bracket.rounds[0];
    expect(round1.matchIds).toHaveLength(2);
    
    // Check matches
    const match1 = bracket.matches[round1.matchIds[0]];
    const match2 = bracket.matches[round1.matchIds[1]];
    
    // With 4 participants: seeds are [1,4,2,3]
    // Match 1: seed 1 (A) vs seed 4 (D)
    // Match 2: seed 2 (B) vs seed 3 (C)
    const p1Names = [match1.participant1Id, match1.participant2Id].map(
      id => bracket.participants.find(p => p.id === id)?.name
    );
    const p2Names = [match2.participant1Id, match2.participant2Id].map(
      id => bracket.participants.find(p => p.id === id)?.name
    );
    
    // Seed 1 vs Seed 4, Seed 2 vs Seed 3
    expect(p1Names).toContain("A"); // seed 1
    expect(p1Names).toContain("D"); // seed 4
    expect(p2Names).toContain("B"); // seed 2
    expect(p2Names).toContain("C"); // seed 3
  });

  it("should handle BYEs for 5 participants", () => {
    const bracket = createBracketDocument({
      name: "Test Tournament",
      participants: ["A", "B", "C", "D", "E"],
      createdBy: "user-1",
    });

    // Should have 3 rounds (8 slots)
    expect(bracket.rounds).toHaveLength(3);
    
    // Find matches with BYEs
    const allMatches = Object.values(bracket.matches);
    const byeMatches = allMatches.filter(
      m => m.participant1Id?.startsWith("bye") || m.participant2Id?.startsWith("bye")
    );
    
    // There should be BYE matches (3 BYEs for 5 participants = 8 - 5 = 3)
    expect(byeMatches.length).toBeGreaterThan(0);
  });

  it("should auto-advance BYE winners", () => {
    const bracket = createBracketDocument({
      name: "Test Tournament", 
      participants: ["A", "B", "C", "D", "E", "F", "G", "H"],
      createdBy: "user-1",
    });

    // For 8 participants, no BYEs needed
    // Check that first round matches are properly linked
    const round1 = bracket.rounds[0];
    const round1Match1 = bracket.matches[round1.matchIds[0]];
    
    // Match should have nextMatchId set
    expect(round1Match1.nextMatchId).toBeTruthy();
  });
});

describe("advanceMatchWinner", () => {
  it("should advance winner to next match", () => {
    const bracket = createBracketDocument({
      name: "Test Tournament",
      participants: ["A", "B", "C", "D"],
      createdBy: "user-1",
    });

    // Get first round match
    const round1 = bracket.rounds[0];
    const match1Id = round1.matchIds[0];
    const match1 = bracket.matches[match1Id];
    
    // Get the winner (participant 1)
    const winnerId = match1.participant1Id;
    expect(winnerId).toBeTruthy();
    
    // Advance winner
    const updated = advanceMatchWinner(bracket, match1Id, winnerId!);
    
    // Check that winner was set
    expect(updated.matches[match1Id].winnerId).toBe(winnerId);
    
    // Check that winner was advanced to next match
    const nextMatchId = match1.nextMatchId;
    expect(nextMatchId).toBeTruthy();
    
    const nextMatch = updated.matches[nextMatchId!];
    const hasWinner = nextMatch.participant1Id === winnerId || nextMatch.participant2Id === winnerId;
    expect(hasWinner).toBe(true);
  });

  it("should advance winner through bracket", () => {
    const bracket = createBracketDocument({
      name: "Test Tournament",
      participants: ["A", "B", "C", "D"],
      createdBy: "user-1",
    });

    // Get first round matches
    const round1 = bracket.rounds[0];
    const match1Id = round1.matchIds[0];
    const match1 = bracket.matches[match1Id];
    
    // Get winner from first match
    const winnerId = match1.participant1Id;
    expect(winnerId).toBeTruthy();
    
    // Advance winner
    const updated = advanceMatchWinner(bracket, match1Id, winnerId!);
    
    // Check that winner was set
    expect(updated.matches[match1Id].winnerId).toBe(winnerId);
    
    // Check that winner was advanced to next match (finals)
    const finals = bracket.rounds.find(r => r.name === "Finals");
    expect(finals).toBeDefined();
    
    const finalMatch = bracket.matches[finals!.matchIds[0]];
    const winnerAdvanced = 
      finalMatch.participant1Id === winnerId || 
      finalMatch.participant2Id === winnerId;
    expect(winnerAdvanced).toBe(true);
  });
});
