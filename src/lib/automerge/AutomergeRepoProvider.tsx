import { type ReactNode, useEffect, useState, useCallback, useRef } from "react";
import { Repo, RepoContext, useDocument, useRepo as useRepoFromContext } from "@automerge/react";
import type { DocHandle, AutomergeUrl, PeerId } from "@automerge/react";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { WebRTCNetworkAdapter } from "../p2p/WebRTCNetworkAdapter";
import { createId } from "../ids";
import type { BoardDocument, BoardChangeFn } from "../documents";
import type { P2PNetwork } from "../p2p";
import { getBoardStorage } from "../board/board-storage-unstorage";

interface AutomergeRepoProviderProps {
  children: ReactNode;
}

/**
 * Global repo instance - created once and shared across the app
 */
let globalRepo: Repo | null = null;

/**
 * Get or create the global repo instance
 */
export function getRepo(): Repo {
  if (!globalRepo) {
    const peerId = `tierboard-${createId()}` as PeerId;

    globalRepo = new Repo({
      peerId,
      network: [], // Network adapters added dynamically when joining rooms
      storage: new IndexedDBStorageAdapter("tierboard-automerge"),
    });

    console.log("[AutomergeRepo] Created global repo with peerId:", peerId);
  }
  return globalRepo;
}

/**
 * Get or create a board document in the repo
 * Returns the document handle and URL
 * 
 * Uses persistent URL storage (localStorage) so board mappings survive page reloads
 */
export async function getOrCreateBoardDoc(
  repo: Repo,
  boardId: string,
  initialData?: Partial<BoardDocument>
): Promise<{ handle: DocHandle<BoardDocument>; url: AutomergeUrl }> {
  const boardStorage = getBoardStorage();

  // First, check if we already have a URL mapping in persistent storage
  const existingUrl = await boardStorage.getBoardUrl(boardId);
  
  if (existingUrl) {
    console.log("[AutomergeRepo] Found existing URL for board:", boardId, "->", existingUrl);
    // Find the existing document
    const handle = await repo.find<BoardDocument>(existingUrl);
    await handle.whenReady();
    return { handle, url: existingUrl };
  }

  // Create new document with initial data
  const now = Date.now();
  const initialBoard: Partial<BoardDocument> = {
    id: boardId,
    name: initialData?.name || "Untitled Tier List",
    description: initialData?.description || "",
    createdAt: now,
    updatedAt: now,
    createdBy: initialData?.createdBy || createId(),
    tiers: initialData?.tiers || getDefaultTiers(),
    items: initialData?.items || [],
    settings: initialData?.settings || {
      allowPublicJoin: true,
      requirePassword: false,
      maxPeers: 10,
      theme: "auto",
    },
    _peers: initialData?._peers || [],
  };

  const handle = repo.create<BoardDocument>(initialBoard as BoardDocument);
  const url = handle.url;

  // Persist the URL mapping so it survives page reloads
  await boardStorage.storeBoardUrl(boardId, url);

  console.log("[AutomergeRepo] Created board document:", { boardId, url });

  return { handle, url };
}

/**
 * Get default tier structure (S, A, B, C, D, F)
 */
function getDefaultTiers() {
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
 * Provider for Automerge Repo
 * Wraps the app with RepoContext for useDocument hook
 */
export function AutomergeRepoProvider({ children }: AutomergeRepoProviderProps) {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initialize repo on mount
    const r = getRepo();
    setRepo(r);
    setIsReady(true);
  }, []);

  if (!repo || !isReady) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "64px" }}>
        <div>Loading Automerge...</div>
      </div>
    );
  }

  return (
    <RepoContext.Provider value={repo}>
      {children}
    </RepoContext.Provider>
  );
}

/**
 * Connect Automerge Repo to an existing P2PNetwork
 * Call this when joining/creating a room
 */
export async function connectRepoToNetwork(
  repo: Repo,
  network: P2PNetwork
): Promise<{ adapter: WebRTCNetworkAdapter; error?: Error }> {
  const adapter = new WebRTCNetworkAdapter();

  try {
    // Attach the P2PNetwork to the adapter first
    adapter.attachP2PNetwork(network);

    // Add the adapter to the repo's network subsystem
    repo.networkSubsystem.addNetworkAdapter(adapter);

    console.log("[AutomergeRepo] Connected repo to P2PNetwork");
    return { adapter };
  } catch (error) {
    console.error("[AutomergeRepo] Failed to connect to network:", error);
    // Cleanup on failure
    try {
      repo.networkSubsystem.removeNetworkAdapter(adapter);
    } catch {}
    adapter.disconnect();
    return { adapter: null as any, error: error instanceof Error ? error : new Error("Failed to connect") };
  }
}

/**
 * Disconnect Automerge Repo from network
 */
export async function disconnectRepoFromNetwork(
  repo: Repo,
  adapter: WebRTCNetworkAdapter
): Promise<void> {
  repo.networkSubsystem.removeNetworkAdapter(adapter);
  adapter.disconnect();
  console.log("[AutomergeRepo] Disconnected repo from network");
}

/**
 * Hook for managing a board document with automatic Repo integration
 * 
 * @param boardId - The board ID
 * @param initialData - Initial data for creating a new document (host only)
 * @param documentUrl - The Automerge document URL (REQUIRED for clients joining rooms)
 */
export function useBoardDocument(
  boardId: string,
  initialData?: Partial<BoardDocument>,
  documentUrl?: string | null  // Direct document URL - no decoding needed
): {
  doc: BoardDocument | null;
  change: (callback: BoardChangeFn) => void;
  handle: DocHandle<BoardDocument> | null;
  url: AutomergeUrl | null;
  isLoading: boolean;
  error: Error | null;
} {
  const repo = useRepoFromContext();
  const [docUrl, setDocUrl] = useState<AutomergeUrl | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [handle, setHandle] = useState<DocHandle<BoardDocument> | null>(null);
  const previousDocUrl = useRef<string | null | undefined>(undefined);

  // Detect when document URL changes and reset state
  useEffect(() => {
    if (previousDocUrl.current !== documentUrl) {
      // New document URL - reset state to load it
      if (documentUrl && documentUrl !== docUrl) {
        console.log("[useBoardDocument] Document URL changed to:", documentUrl);
        setIsLoading(true);
        setError(null);
        setDocUrl(null);
        setHandle(null);
      }
      previousDocUrl.current = documentUrl;
    }
  }, [documentUrl, docUrl]);

  // Initialize document
  useEffect(() => {
    if (!repo) return;

    // Skip if already loaded the correct document
    if (isLoading === false && docUrl === documentUrl) {
      return;
    }

    // Host mode (no documentUrl): Create new document only once
    if (!documentUrl && docUrl) {
      console.log("[useBoardDocument] Host already has doc, skipping");
      return;
    }

    // Client mode with documentUrl: Skip if already loading/loaded this document
    if (documentUrl && docUrl === documentUrl) {
      console.log("[useBoardDocument] Already have this document, skipping");
      return;
    }

    async function initDoc() {
      try {
        let url: AutomergeUrl;
        let docHandle: DocHandle<BoardDocument>;

        if (documentUrl) {
          // CLIENT: Load existing document from URL
          url = documentUrl as AutomergeUrl;
          console.log("[useBoardDocument] Loading client document:", url);

          docHandle = await repo.find<BoardDocument>(url);
          console.log("[useBoardDocument] Handle created, isReady:", docHandle.isReady?.());

          // Wait for document to be ready (synced from host or storage)
          const MAX_WAIT_TIME = 10000; // 10 seconds
          const readyPromise = docHandle.whenReady();
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Document not ready after ${MAX_WAIT_TIME}ms`));
            }, MAX_WAIT_TIME);
          });

          await Promise.race([readyPromise, timeoutPromise]);
          console.log("[useBoardDocument] Found existing document:", url);
        } else {
          // HOST: Create new document
          const result = await getOrCreateBoardDoc(repo, boardId, initialData);
          url = result.url;
          docHandle = result.handle;
          console.log("[useBoardDocument] Created new document:", url);
        }

        setDocUrl(url);
        setHandle(docHandle);
        setIsLoading(false);
      } catch (err) {
        console.error("[useBoardDocument] Failed to initialize:", err);
        setError(err instanceof Error ? err : new Error("Failed to initialize board"));
        setIsLoading(false);
      }
    }

    initDoc();
  }, [repo, boardId, documentUrl, initialData]);

  // Use Automerge's useDocument hook
  const [doc, changeDoc] = useDocument<BoardDocument>(docUrl!, {
    suspense: false,
  });

  const change = useCallback(
    (callback: BoardChangeFn) => {
      if (!changeDoc) {
        console.error("[useBoardDocument] changeDoc not available");
        return;
      }
      console.log("[useBoardDocument] Applying change to document:", docUrl);
      changeDoc(callback);
      console.log("[useBoardDocument] Change applied successfully");
    },
    [changeDoc, docUrl]
  );

  return {
    doc: doc || null,
    change,
    handle,
    url: docUrl,
    isLoading,
    error,
  };
}

// Re-export useRepo from context
export function useRepo() {
  return useRepoFromContext();
}
