import type { BoardDocument, BoardChangeFn } from "./types";
import { safeValidateBoardDocument } from "./validation";
import { createId } from "../ids";

/**
 * Create a new board document with default values
 * Note: All fields must have non-undefined values for Automerge compatibility
 */
export function createBoardDocument(
  partial: Partial<BoardDocument> & { name: string; createdBy: string },
): BoardDocument {
  const now = Date.now();
  const doc: BoardDocument = {
    id: partial.id || createId(),
    name: partial.name,
    description: partial.description || "",
    createdAt: now,
    updatedAt: now,
    createdBy: partial.createdBy,
    tiers: partial.tiers || getDefaultTiers(),
    items: partial.items || [],
    settings: partial.settings || {
      allowPublicJoin: true,
      requirePassword: false,
      maxPeers: 10,
      theme: "auto",
    },
    _peers: partial._peers || [],
  };

  // Validate before returning
  const result = safeValidateBoardDocument(doc);
  if (!result.success) {
    throw new Error(`Invalid board document: ${result.error.message}`);
  }

  return doc;
}

/**
 * Get default tier structure (S, A, B, C, D, F)
 */
export function getDefaultTiers() {
  const now = Date.now();
  const tierColors: Record<string, string> = {
    S: "#ff6b6b",
    A: "#ffa502",
    B: "#ffd93d",
    C: "#6bcb77",
    D: "#4b7bec",
    F: "#a55eea",
  };

  return ["S", "A", "B", "C", "D", "F"].map((label, index) => ({
    id: createId(),
    name: `Tier ${label}`,
    label,
    color: tierColors[label] || "#888888",
    itemIds: [],
    createdAt: now + index,
  }));
}
