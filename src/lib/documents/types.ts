import type * as A from "@automerge/automerge";

export type BoardId = string;
export type TierId = string;
export type ItemId = string;

export interface BoardSettings {
  allowPublicJoin: boolean;
  requirePassword: boolean;
  maxPeers: number;
  theme: "light" | "dark" | "auto";
}

export interface Tier {
  id: TierId;
  name: string;
  label: string; // S, A, B, C, D, F
  color: string;
  itemIds: ItemId[]; // Ordered list of items in this tier
  createdAt: number;
}

export interface BoardItem {
  id: ItemId;
  name: string;
  imageId?: string; // Reference to image in IndexedDB
  emoji?: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  createdBy: string;
}

export interface PeerState {
  id: string;
  name: string;
  connectedAt: number;
  isHost: boolean;
}

export interface BoardDocument {
  id: BoardId;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;

  // Tier list structure
  tiers: Tier[];
  items: BoardItem[];

  // Settings
  settings: BoardSettings;

  // P2P metadata
  _peers: PeerState[];
}

export type BoardChangeFn = (doc: A.ChangeFn<BoardDocument>) => void;
