import { db } from "./db";
import type { BoardDocument, BoardId } from "../documents";
import { getDocumentDelta, loadDocumentFromBinary } from "../documents";

export interface BoardSummary {
  id: BoardId;
  name: string;
  description?: string;
  updatedAt: number;
  itemCount: number;
  tierCount: number;
}

/**
 * Storage class for board document persistence
 */
export class BoardStorage {
  /**
   * Get a board document by ID
   */
  async getBoard(id: BoardId): Promise<BoardDocument | null> {
    const record = await db.boards.get(id);
    if (!record) return null;

    const doc = loadDocumentFromBinary(record.doc);
    return doc;
  }

  /**
   * Save a board document
   */
  async saveBoard(id: BoardId, doc: BoardDocument): Promise<void> {
    const binary = getDocumentDelta(doc);
    await db.boards.put({
      id,
      doc: binary,
      updatedAt: Date.now(),
    });
  }

  /**
   * Delete a board and its associated images
   */
  async deleteBoard(id: BoardId): Promise<void> {
    await db.boards.delete(id);
  }

  /**
   * List all boards
   */
  async listBoards(): Promise<BoardSummary[]> {
    const boards = await db.boards.toArray();
    return boards
      .map((record) => {
        const doc = loadDocumentFromBinary(record.doc);
        if (!doc) return null;

        return {
          id: doc.id,
          name: doc.name,
          description: doc.description,
          updatedAt: record.updatedAt,
          itemCount: doc.items.length,
          tierCount: doc.tiers.length,
        };
      })
      .filter((b): b is BoardSummary => b !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Export a board to a downloadable blob
   */
  async exportBoard(id: BoardId): Promise<Blob | null> {
    const board = await this.getBoard(id);
    if (!board) return null;

    const exportData = {
      version: 1,
      exportedAt: Date.now(),
      board,
    };

    return new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
  }

  /**
   * Import a board from a file
   */
  async importBoard(file: File): Promise<BoardId> {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.board || !data.board.id) {
      throw new Error("Invalid board export file");
    }

    const board: BoardDocument = data.board;
    await this.saveBoard(board.id, board);
    return board.id;
  }

  /**
   * Clean up old boards (optional maintenance)
   */
  async cleanupOldBoards(daysOld: number = 30): Promise<number> {
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    const oldBoards = await db.boards.filter((b) => b.updatedAt < cutoff).toArray();

    for (const board of oldBoards) {
      await db.boards.delete(board.id);
    }

    return oldBoards.length;
  }
}

export const boardStorage = new BoardStorage();
