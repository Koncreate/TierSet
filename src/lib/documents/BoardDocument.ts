import * as A from "@automerge/automerge";
import type { BoardDocument, BoardChangeFn } from "./types";
import { safeValidateBoardDocument } from "./validation";
import { createId } from "../ids";

/**
 * Create a new board document with default values
 */
export function createBoardDocument(
  partial: Partial<BoardDocument> & { name: string; createdBy: string },
): BoardDocument {
  const now = Date.now();
  const doc: BoardDocument = {
    id: partial.id || createId(),
    name: partial.name,
    description: partial.description,
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

  return result.data;
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

/**
 * Apply a change to a board document using Automerge
 */
export function changeBoardDocument(doc: BoardDocument, callback: BoardChangeFn): BoardDocument {
  return A.change(doc, callback);
}

/**
 * Get binary delta for syncing
 */
export function getDocumentDelta(doc: BoardDocument): Uint8Array {
  return A.save(doc);
}

/**
 * Load document from binary
 */
export function loadDocumentFromBinary(binary: Uint8Array): BoardDocument | null {
  try {
    const doc = A.load<BoardDocument>(binary);
    const result = safeValidateBoardDocument(doc);
    if (!result.success) {
      console.error("Invalid document from binary:", result.error);
      return null;
    }
    return result.data;
  } catch (error) {
    console.error("Failed to load document from binary:", error);
    return null;
  }
}

/**
 * Merge remote changes into local document
 */
export function mergeDocumentChanges(
  local: BoardDocument,
  remoteBinary: Uint8Array,
): BoardDocument | null {
  try {
    // Load remote document
    const remote = A.load<BoardDocument>(remoteBinary);

    // Merge with local
    const merged = A.merge(local, remote);

    // Validate result
    const result = safeValidateBoardDocument(merged);
    if (!result.success) {
      console.error("Merge produced invalid document:", result.error);
      return null;
    }

    return result.data;
  } catch (error) {
    console.error("Failed to merge document:", error);
    return null;
  }
}

/**
 * Validate a binary delta before applying
 */
export function validateDocumentDelta(binary: Uint8Array): boolean {
  try {
    const doc = A.load<BoardDocument>(binary);
    const result = safeValidateBoardDocument(doc);
    return result.success;
  } catch {
    return false;
  }
}
