import Dexie, { type Table } from "dexie";
import type { BoardId } from "../documents";

export interface BoardRecord {
  id: BoardId;
  doc: Uint8Array; // Automerge binary
  updatedAt: number;
}

export interface ImageRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  thumbnailBlob?: Blob;
  thumbnailMimeType?: string;
  originalName?: string;
  createdAt: number;
}

export interface PreferenceRecord {
  key: string;
  value: unknown;
}

export interface CacheRecord {
  key: string;
  data: unknown;
  expiresAt: number;
}

export interface TierBoardDB extends Dexie {
  boards: Table<BoardRecord, BoardId>;
  images: Table<ImageRecord, string>;
  preferences: Table<PreferenceRecord, string>;
  cache: Table<CacheRecord, string>;
}

const DB_NAME = "tierboard";
const DB_VERSION = 1;

export const db = new Dexie(DB_NAME) as TierBoardDB;

db.version(DB_VERSION).stores({
  boards: "id, updatedAt",
  images: "id, createdAt",
  preferences: "key",
  cache: "key, expiresAt",
});
