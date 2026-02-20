import * as A from "@automerge/automerge";
import type { BoardDocument } from "./types";

export {
  createBoardDocument,
  getDefaultTiers,
} from "./BoardDocument";

/**
 * Load document from binary (for import/export)
 */
export function loadDocumentFromBinary(binary: Uint8Array): BoardDocument | null {
  try {
    const doc = A.load<BoardDocument>(binary);
    return doc;
  } catch (error) {
    console.error("Failed to load document from binary:", error);
    return null;
  }
}

/**
 * Get binary representation of document (for export)
 */
export function getDocumentDelta(doc: BoardDocument): Uint8Array {
  return A.save(doc);
}

export {
  validateBoardDocument,
  safeValidateBoardDocument,
  BoardDocumentSchema,
  BoardItemSchema,
  TierSchema,
  BoardSettingsSchema,
} from "./validation";

export type {
  BoardDocument,
  BoardId,
  TierId,
  ItemId,
  Tier,
  BoardItem,
  BoardSettings,
  PeerState,
  BoardChangeFn,
} from "./types";
