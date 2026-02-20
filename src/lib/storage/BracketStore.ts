/**
 * Storage class for bracket document persistence
 */

import { db } from "./db";
import type { BracketDocument, BracketId } from "../bracket/types";

export interface BracketSummary {
  id: BracketId;
  name: string;
  description?: string;
  updatedAt: number;
  participantCount: number;
  roundCount: number;
  status: "draft" | "in_progress" | "completed";
}

/**
 * Storage class for bracket document persistence
 */
export class BracketStorage {
  /**
   * Get a bracket document by ID
   */
  async getBracket(id: BracketId): Promise<BracketDocument | null> {
    const record = await db.brackets.get(id);
    if (!record) return null;

    // Parse from JSON (brackets use JSON storage, not Automerge binary)
    try {
      const doc = JSON.parse(record.doc) as BracketDocument;
      return doc;
    } catch (error) {
      console.error("Failed to parse bracket document:", error);
      return null;
    }
  }

  /**
   * Save a bracket document
   */
  async saveBracket(id: BracketId, doc: BracketDocument): Promise<void> {
    await db.brackets.put({
      id,
      doc: JSON.stringify(doc),
      updatedAt: Date.now(),
    });
  }

  /**
   * Delete a bracket
   */
  async deleteBracket(id: BracketId): Promise<void> {
    await db.brackets.delete(id);
  }

  /**
   * List all brackets
   */
  async listBrackets(): Promise<BracketSummary[]> {
    const brackets = await db.brackets.toArray();
    return brackets
      .map((record) => {
        try {
          const doc = JSON.parse(record.doc) as BracketDocument;
          return {
            id: doc.id,
            name: doc.name,
            description: doc.description,
            updatedAt: record.updatedAt,
            participantCount: doc.participants.length,
            roundCount: doc.rounds.length,
            status: doc.status,
          };
        } catch {
          return null;
        }
      })
      .filter((b): b is BracketSummary => b !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Export a bracket to a downloadable blob
   */
  async exportBracket(id: BracketId): Promise<Blob | null> {
    const bracket = await this.getBracket(id);
    if (!bracket) return null;

    const exportData = {
      version: 1,
      exportedAt: Date.now(),
      bracket,
    };

    return new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
  }

  /**
   * Import a bracket from a file
   */
  async importBracket(file: File): Promise<BracketId> {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.bracket || !data.bracket.id) {
      throw new Error("Invalid bracket export file");
    }

    const bracket: BracketDocument = data.bracket;
    await this.saveBracket(bracket.id, bracket);
    return bracket.id;
  }
}

export const bracketStorage = new BracketStorage();
