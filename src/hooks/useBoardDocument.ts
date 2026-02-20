// Re-export useBoardDocument from AutomergeRepoProvider
// This provides a cleaner API that integrates with the Repo
export { useBoardDocument } from "../lib/automerge/AutomergeRepoProvider";
export type { P2PNetwork } from "../lib/p2p";

// Re-export types for compatibility
export interface UseBoardDocumentOptions {
  network?: P2PNetwork | null;
}

export interface UseBoardDocumentReturn {
  doc: import("../lib/documents").BoardDocument | null;
  change: (callback: import("../lib/documents").BoardChangeFn) => void;
  isLoading: boolean;
  error: Error | null;
  save: () => Promise<void>;
  reload: () => Promise<void>;
  syncStatus: "syncing" | "synced" | "error" | "disconnected";
  connectedPeers: number;
  handle: import("@automerge/react").DocHandle<import("../lib/documents").BoardDocument> | null;
  url: import("@automerge/react").AutomergeUrl | null;
}
