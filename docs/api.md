# TierBoard API Architecture

## Core Principle: P2P-First Design

**All data synchronization happens peer-to-peer via WebRTC.** No central server, no cloud APIs, no external dependencies after initial load.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TIERBOARD P2P ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐         WebRTC Data Channel         ┌──────────────┐  │
│  │   Peer A     │  ═══════════════════════════════►   │   Peer B     │  │
│  │  (Host)      │  ◄═══════════════════════════════   │  (Client)    │  │
│  │              │         Automerge CRDT Sync         │              │  │
│  └──────┬───────┘                                     └──────┬───────┘  │
│         │                                                     │          │
│         ▼                                                     ▼          │
│  ┌──────────────┐                                     ┌──────────────┐  │
│  │  IndexedDB   │                                     │  IndexedDB   │  │
│  │  (Dexie)     │                                     │  (Dexie)     │  │
│  └──────────────┘                                     └──────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    OPTIONAL: Livestream Integration               │   │
│  │         (Twitch/Kick/YouTube - ONE-WAY data flow ONLY)           │   │
│  │                    Does NOT affect P2P sync                       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Module Boundaries

### 1. Core P2P Layer (`src/lib/p2p/`)

**Purpose:** WebRTC connections, Automerge sync, peer discovery

```typescript
// src/lib/p2p/index.ts
export { P2PNetwork } from './P2PNetwork';
export { PeerManager } from './PeerManager';
export { SyncEngine } from './SyncEngine';

// src/lib/p2p/types.ts
export interface PeerInfo {
  id: string;
  name: string;
  role: 'host' | 'client';
  connectedAt: number;
  capabilities: PeerCapabilities;
}

export interface PeerCapabilities {
  canHost: boolean;
  canRelay: boolean;
  supportsVideo: boolean;
}

// src/lib/p2p/P2PNetwork.ts
export class P2PNetwork {
  // Create new room (become host)
  createRoom(options: RoomOptions): Promise<Room>;

  // Join existing room via code/link
  joinRoom(roomCode: string): Promise<Room>;

  // Leave room and cleanup connections
  leaveRoom(): Promise<void>;

  // Get current peers
  getPeers(): PeerInfo[];

  // Events
  on('peer:joined', handler: (peer: PeerInfo) => void): void;
  on('peer:left', handler: (peer: PeerInfo) => void);
  on('sync:complete', handler: (stats: SyncStats) => void);
}
```

**Key Responsibilities:**

- WebRTC peer connection management
- Automerge document sync over data channels
- Peer discovery via room codes (no signaling server - use QR/link exchange)
- Connection state management
- Bandwidth optimization (compression, delta sync)

**NO External Dependencies:**

- ❌ No signaling server
- ❌ No STUN/TURN (LAN only, or users provide their own TURN config)
- ❌ No cloud sync

---

### 2. Document Layer (`src/lib/documents/`)

**Purpose:** Automerge schema, CRDT operations, document types

```typescript
// src/lib/documents/index.ts
export { BoardDocument } from "./BoardDocument";
export { TierDocument } from "./TierDocument";
export { VoteDocument } from "./VoteDocument";

// src/lib/documents/types.ts
import * as A from "@automerge/automerge";

export type BoardId = string;
export type TierId = string;
export type ItemId = string;

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

// src/lib/documents/BoardDocument.ts
export class BoardDocument {
  // Create new board document
  static create(initial: Partial<BoardDocument>): BoardDocument;

  // Apply local change (automatically syncs to peers)
  change<T>(doc: BoardDocument, callback: (doc: A.ChangeFn<BoardDocument>) => T): BoardDocument;

  // Merge remote changes from peer
  merge(doc: BoardDocument, remote: Uint8Array): BoardDocument;

  // Get binary delta for sync
  getDelta(doc: BoardDocument): Uint8Array;
}
```

**Key Responsibilities:**

- Define Automerge document schema
- Provide type-safe document operations
- Handle CRDT merge conflicts
- Maintain document history (for undo/redo)

**P2P Sync Flow:**

```
User Action → BoardDocument.change() → Automerge generates delta
           → SyncEngine.broadcast() → WebRTC to all peers
           → Peer receives → BoardDocument.merge() → UI updates
```

---

### 3. Storage Layer (`src/lib/storage/`)

**Purpose:** IndexedDB persistence, image/blob storage, local cache

```typescript
// src/lib/storage/index.ts
export { Storage } from "./Storage";
export { ImageStore } from "./ImageStore";
export { BoardStore } from "./BoardStore";

// src/lib/storage/types.ts
export interface StorageSchema {
  // Board documents (Automerge binary)
  boards: {
    id: BoardId;
    doc: Uint8Array;
    updatedAt: number;
  };

  // Images (compressed blobs)
  images: {
    id: string;
    blob: Blob;
    mimeType: string;
    width: number;
    height: number;
    compressedBlob?: Blob; // WebP/AVIF version
    createdAt: number;
  };

  // User preferences
  preferences: {
    key: string;
    value: unknown;
  };

  // P2P cache (recent peers, rooms)
  cache: {
    key: string;
    data: unknown;
    expiresAt: number;
  };
}

// src/lib/storage/Storage.ts
export class Storage {
  // Get board document
  getBoard(id: BoardId): Promise<BoardDocument | null>;

  // Save board document
  saveBoard(id: BoardId, doc: BoardDocument): Promise<void>;

  // Delete board and associated images
  deleteBoard(id: BoardId): Promise<void>;

  // List all boards
  listBoards(): Promise<BoardSummary[]>;

  // Import board from file
  importBoard(file: File): Promise<BoardId>;

  // Export board to file
  exportBoard(id: BoardId): Promise<Blob>;
}

// src/lib/storage/ImageStore.ts
export class ImageStore {
  // Store image (auto-compress)
  store(file: File, options?: ImageOptions): Promise<string>;

  // Get image blob
  get(id: string): Promise<Blob | null>;

  // Get compressed version
  getCompressed(id: string): Promise<Blob | null>;

  // Delete image
  delete(id: string): Promise<void>;

  // Bulk operations for P2P transfer
  exportImages(ids: string[]): Promise<ZIPArchive>;
  importImages(archive: ZIPArchive): Promise<string[]>;
}
```

**Key Responsibilities:**

- Persist Automerge documents to IndexedDB
- Store and compress images
- Handle bulk import/export (ZIP)
- Manage storage quotas (auto-cleanup old boards)

**P2P Considerations:**

- Images synced as binary blobs via WebRTC (chunked for large files)
- Compression before sync to reduce bandwidth
- Lazy loading (only sync images visible in viewport)

---

### 4. UI Layer (`src/components/`)

**Purpose:** React components, user interactions, visual rendering

```typescript
// src/components/tier-list/
TierList.tsx; // Main tier list container
TierRow.tsx; // Individual tier row (S, A, B, etc.)
TierItem.tsx; // Draggable item within tier
ItemGallery.tsx; // Unplaced items gallery

// src/components/dnd/
Draggable.tsx; // DnD wrapper component
DropZone.tsx; // Drop target component
DragPreview.tsx; // Custom drag preview

// src/components/board/
BoardView.tsx; // Board canvas/view container
BoardSettings.tsx; // Board configuration modal
BoardExport.tsx; // Export/share options

// src/components/p2p/
PeerList.tsx; // Show connected peers
RoomCode.tsx; // Display room join code
ConnectionStatus.tsx; // P2P connection indicator
```

**Component Architecture:**

```typescript
// src/components/tier-list/TierList.tsx
import { useBoardDocument } from '#/hooks/useBoardDocument';
import { useP2PNetwork } from '#/hooks/useP2PNetwork';

export function TierList({ boardId }: { boardId: BoardId }) {
  // Subscribe to Automerge document (reactive updates)
  const { doc, change } = useBoardDocument(boardId);

  // Get P2P network status
  const { peers, status } = useP2PNetwork();

  // Handle drag end (move item between tiers)
  const handleDragEnd = (event: DragEndEvent) => {
    const { itemId, targetTierId } = event;

    // Apply change to Automerge document
    change((d) => {
      // Remove from old tier
      const sourceTier = d.tiers.find(t => t.itemIds.includes(itemId));
      if (sourceTier) {
        sourceTier.itemIds = sourceTier.itemIds.filter(id => id !== itemId);
      }

      // Add to new tier
      const targetTier = d.tiers.find(t => t.id === targetTierId);
      if (targetTier) {
        targetTier.itemIds.push(itemId);
      }
    });

    // Change is automatically synced to peers via Automerge
  };

  return (
    <div className="tier-list">
      {doc.tiers.map(tier => (
        <TierRow
          key={tier.id}
          tier={tier}
          items={tier.itemIds.map(id => doc.items.find(i => i.id === id))}
          onDragEnd={handleDragEnd}
        />
      ))}
    </div>
  );
}
```

**Key Principles:**

- Components subscribe to Automerge documents (reactive)
- All mutations go through `change()` (triggers P2P sync)
- No direct API calls in components
- P2P status shown via hooks (not direct network access)

---

### 5. Hooks Layer (`src/hooks/`)

**Purpose:** React hooks for P2P, documents, storage

```typescript
// src/hooks/index.ts
export { useBoardDocument } from "./useBoardDocument";
export { useP2PNetwork } from "./useP2PNetwork";
export { useImageStore } from "./useImageStore";
export { usePeerPresence } from "./usePeerPresence";

// src/hooks/useBoardDocument.ts
export function useBoardDocument(boardId: BoardId) {
  const [doc, setDoc] = useState<BoardDocument | null>(null);
  const network = useP2PNetwork();

  // Load from storage on mount
  useEffect(() => {
    Storage.getBoard(boardId).then(setDoc);
  }, [boardId]);

  // Subscribe to P2P sync updates
  useEffect(() => {
    if (!network) return;

    const unsubscribe = network.onSync((delta) => {
      const updated = BoardDocument.merge(doc, delta);
      setDoc(updated);
      Storage.saveBoard(boardId, updated);
    });

    return unsubscribe;
  }, [network, doc]);

  // Change function (auto-syncs to peers)
  const change = useCallback(
    (callback: ChangeFn) => {
      const updated = BoardDocument.change(doc, callback);
      setDoc(updated);
      Storage.saveBoard(boardId, updated);
      network?.broadcast(updated);
    },
    [doc, network, boardId],
  );

  return { doc, change, isLoading: !doc };
}

// src/hooks/useP2PNetwork.ts
export function useP2PNetwork() {
  const [network, setNetwork] = useState<P2PNetwork | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  // Initialize on mount
  useEffect(() => {
    const n = new P2PNetwork();
    setNetwork(n);

    n.on("peer:joined", (peer) => {
      setPeers((prev) => [...prev, peer]);
      setStatus("connected");
    });

    n.on("peer:left", (peer) => {
      setPeers((prev) => prev.filter((p) => p.id !== peer.id));
    });

    return () => n.leaveRoom();
  }, []);

  return { network, peers, status, createRoom: n.createRoom, joinRoom: n.joinRoom };
}
```

**Key Responsibilities:**

- Bridge between P2P/document layers and React
- Manage subscription lifecycles
- Provide reactive updates to components
- Handle loading/error states

---

### 6. Livestream Integration Layer (`src/integrations/livestream/`)

**⚠️ CRITICAL: This layer is ONE-WAY. It reads from external APIs but NEVER writes P2P data based on them without user confirmation.**

```typescript
// src/integrations/livestream/index.ts
export { TwitchIntegration } from "./TwitchIntegration";
export { KickIntegration } from "./KickIntegration";
export { YouTubeIntegration } from "./YouTubeIntegration";
export { ChatVotingService } from "./ChatVotingService";

// src/integrations/livestream/types.ts
export interface LivestreamPlatform {
  id: "twitch" | "kick" | "youtube";
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Read-only events (DO NOT auto-sync to P2P)
  onChatMessage(handler: (msg: ChatMessage) => void): void;
  onSubscribe(handler: (sub: Subscription) => void): void;
  onCheer(handler: (cheer: Cheer) => void): void;

  // Optional: Send message back to chat (user-initiated only)
  sendChatMessage(message: string): Promise<void>;
}

export interface ChatMessage {
  platform: LivestreamPlatform["id"];
  userId: string;
  userName: string;
  content: string;
  timestamp: number;
  badges: Badge[];
  isSubscriber: boolean;
  isModerator: boolean;
}

// src/integrations/livestream/TwitchIntegration.ts
export class TwitchIntegration implements LivestreamPlatform {
  readonly id = "twitch";
  readonly name = "Twitch";

  private eventSub: EventSubClient | null = null;
  private accessToken: string | null = null;

  async connect(): Promise<void> {
    // OAuth flow (popup, no redirect needed)
    this.accessToken = await this.authenticate();

    // Connect to EventSub WebSocket
    this.eventSub = new EventSubClient(this.accessToken);
    await this.eventSub.connect();

    // Subscribe to chat events
    await this.eventSub.subscribe("channel.chat.message", {
      broadcaster_user_id: this.channelId,
    });
  }

  onChatMessage(handler: (msg: ChatMessage) => void): void {
    this.eventSub?.on("channel.chat.message", (event) => {
      const message: ChatMessage = {
        platform: "twitch",
        userId: event.chatter.user_id,
        userName: event.chatter.user_name,
        content: event.message.text,
        timestamp: Date.now(),
        badges: event.chatter.badges,
        isSubscriber: event.chatter.badges.some((b) => b.set_id === "subscriber"),
        isModerator: event.chatter.badges.some((b) => b.set_id === "moderator"),
      };

      // ⚠️ DO NOT auto-sync to P2P
      // Just emit event for UI to display
      handler(message);
    });
  }

  async sendChatMessage(message: string): Promise<void> {
    // Only send if user explicitly triggers it
    // e.g., "Announce tier list to chat" button
    await fetch("https://api.twitch.tv/helix/chat/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Client-Id": CLIENT_ID,
      },
      body: JSON.stringify({
        broadcaster_id: this.channelId,
        sender_id: this.botId,
        message,
      }),
    });
  }
}

// src/integrations/livestream/ChatVotingService.ts
export class ChatVotingService {
  private platforms = new Map<LivestreamPlatform["id"], LivestreamPlatform>();
  private votes = new Map<string, ChatVote[]>();

  // ⚠️ CRITICAL: Votes are LOCAL ONLY until user confirms
  registerPlatform(platform: LivestreamPlatform) {
    this.platforms.set(platform.id, platform);

    platform.onChatMessage((msg) => {
      const vote = this.parseVote(msg);
      if (vote) {
        // Store vote locally (NOT synced to P2P yet)
        const itemVotes = this.votes.get(vote.itemId) || [];
        itemVotes.push(vote);
        this.votes.set(vote.itemId, itemVotes);

        // Show pending vote in UI (different color/style)
        emit("vote:pending", vote);
      }
    });
  }

  private parseVote(msg: ChatMessage): ChatVote | null {
    // Parse "!vote S character_name" format
    const match = msg.content.match(/!vote\s+([SABCDF])\s+(.+)/i);
    if (!match) return null;

    return {
      id: `${msg.platform}-${msg.userId}-${Date.now()}`,
      itemId: match[2].trim(),
      tier: match[1].toUpperCase(),
      userId: msg.userId,
      userName: msg.userName,
      platform: msg.platform,
      timestamp: msg.timestamp,
      isPending: true, // ⚠️ Marked as pending until confirmed
    };
  }

  // User must explicitly confirm chat votes
  async confirmVotes(voteIds: string[]): Promise<void> {
    const votesToConfirm = voteIds
      .flatMap((id) => this.votes.get(id) || [])
      .filter((v) => v.isPending);

    for (const vote of votesToConfirm) {
      // NOW apply to P2P document
      const boardDoc = useBoardDocument.getCurrent();
      BoardDocument.change(boardDoc, (doc) => {
        const item = doc.items.find((i) => i.id === vote.itemId);
        if (item) {
          // Move item to voted tier
          // ... (tier logic)
        }
      });

      // Mark as confirmed (no longer pending)
      vote.isPending = false;

      // Optionally announce to chat
      const platform = this.platforms.get(vote.platform);
      await platform?.sendChatMessage(
        `@${vote.userName} voted ${vote.itemId} → Tier ${vote.tier}!`,
      );
    }
  }

  // Reject votes (don't apply to P2P)
  rejectVotes(voteIds: string[]): void {
    voteIds.forEach((id) => this.votes.delete(id));
    emit("vote:rejected", voteIds);
  }
}
```

**Key Principles:**

- ❌ **NEVER** auto-sync external API data to P2P documents
- ✅ Chat votes are **pending** until user confirms
- ✅ External APIs are **read-only** by default
- ✅ Sending to chat requires **explicit user action**
- ✅ All P2P sync goes through standard `BoardDocument.change()` flow

**Architecture:**

```
┌─────────────────┐
│  Twitch/Kick/   │
│    YouTube      │
│  External API   │
└────────┬────────┘
         │ (ONE-WAY: Read Only)
         ▼
┌─────────────────┐
│ ChatVotingService│
│  (Local Only)   │
└────────┬────────┘
         │ (Pending Votes)
         ▼
┌─────────────────┐
│   User Confirms │
│   (UI Button)   │
└────────┬────────┘
         │ (User Action)
         ▼
┌─────────────────┐
│ BoardDocument   │
│ .change()       │
└────────┬────────┘
         │ (P2P Sync)
         ▼
┌─────────────────┐
│   WebRTC to     │
│   All Peers     │
└─────────────────┘
```

---

## Data Flow Diagrams

### Local Edit Flow (P2P Sync)

```
┌─────────────┐
│ User Action │ (Drag item to tier)
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  TierList.tsx   │
│  handleDragEnd  │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ useBoardDocument│
│ .change()       │
└──────┬──────────┘
       │
       ├──────────────────┐
       │                  │
       ▼                  ▼
┌──────────────┐   ┌──────────────┐
│  IndexedDB   │   │ SyncEngine   │
│  (Persist)   │   │ .broadcast() │
└──────────────┘   └──────┬───────┘
                          │
                          ▼
                   ┌──────────────┐
                   │  WebRTC DC   │
                   │  (to peers)  │
                   └──────────────┘
```

### Remote Edit Flow (P2P Receive)

```
┌──────────────┐
│  WebRTC DC   │
│  (from peer) │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ SyncEngine   │
│ .receive()   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ BoardDocument│
│ .merge()     │
└──────┬───────┘
       │
       ├──────────────────┐
       │                  │
       ▼                  ▼
┌──────────────┐   ┌──────────────┐
│  IndexedDB   │   │  React UI    │
│  (Persist)   │   │  (Re-render) │
└──────────────┘   └──────────────┘
```

### Chat Vote Flow (External → P2P)

```
┌──────────────┐
│ Twitch Chat  │
│  (External)  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ EventSub WS  │
│  (Read Only) │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ ChatVoting   │
│  (Pending)   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  UI Display  │
│ (Yellow highlight)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ User Clicks  │
│ "Confirm All"│
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ BoardDocument│
│ .change()    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  P2P Sync    │
│  (to peers)  │
└──────────────┘
```

---

## Security Boundaries

### P2P Isolation

```typescript
// ✅ GOOD: P2P data stays in Automerge
const board = BoardDocument.create({ name: "My Tier List" });
Storage.saveBoard(board.id, board); // Local only
network.broadcast(board); // P2P only

// ❌ BAD: Sending P2P data to external API
fetch("https://api.example.com/boards", {
  method: "POST",
  body: JSON.stringify(board), // NEVER do this
});

// ✅ GOOD: External data requires user confirmation
const chatVote = parseChatVote(message);
showPendingVote(chatVote); // Local UI only

// User clicks "Confirm"
BoardDocument.change(doc, (d) => {
  // NOW apply to P2P doc
});
```

### Token Storage

```typescript
// ✅ GOOD: Encrypted token storage
import { encrypt, decrypt } from "@noble/ciphers";

class TokenStore {
  async store(platform: string, token: string) {
    const key = await deriveKeyFromMasterPassword();
    const encrypted = await encrypt(token, key);
    localStorage.setItem(`token:${platform}`, encrypted);
  }

  async retrieve(platform: string): Promise<string | null> {
    const encrypted = localStorage.getItem(`token:${platform}`);
    if (!encrypted) return null;

    const key = await deriveKeyFromMasterPassword();
    return decrypt(encrypted, key);
  }
}
```

### Peer Validation

```typescript
// ✅ GOOD: Validate incoming P2P data
class SyncEngine {
  receive(peerId: string, delta: Uint8Array) {
    // Verify peer is known
    if (!this.knownPeers.has(peerId)) {
      console.warn("Unknown peer, rejecting sync");
      return;
    }

    // Validate delta format
    try {
      BoardDocument.validateDelta(delta);
    } catch (e) {
      console.error("Invalid delta from peer", peerId);
      this.kickPeer(peerId);
      return;
    }

    // Apply merge
    const doc = BoardDocument.merge(this.doc, delta);
    this.doc = doc;
  }
}
```

---

## API Surface

### Public API (for future plugin system)

```typescript
// src/api/index.ts
export interface TierBoardAPI {
  // Board management
  boards: {
    create(options: CreateBoardOptions): Promise<BoardId>;
    open(id: BoardId): Promise<BoardDocument>;
    delete(id: BoardId): Promise<void>;
    list(): Promise<BoardSummary[]>;
    export(id: BoardId): Promise<Blob>;
    import(file: File): Promise<BoardId>;
  };

  // P2P networking
  network: {
    createRoom(options: RoomOptions): Promise<RoomCode>;
    joinRoom(code: RoomCode): Promise<void>;
    leaveRoom(): Promise<void>;
    getPeers(): PeerInfo[];
  };

  // Image management
  images: {
    store(file: File): Promise<string>;
    get(id: string): Promise<Blob>;
    delete(id: string): Promise<void>;
  };

  // Livestream integration (read-only)
  livestream: {
    connect(platform: Platform): Promise<void>;
    disconnect(platform: Platform): Promise<void>;
    getStatus(): ConnectionStatus;
    // ⚠️ No direct P2P sync methods
  };
}

// Create API instance
export function createAPI(): TierBoardAPI {
  return {
    boards: {
      create: async (options) => {
        /* ... */
      },
      // ...
    },
    network: {
      createRoom: async (options) => {
        /* ... */
      },
      // ...
    },
    // ...
  };
}
```

---

## File Structure

```
src/
├── api/                          # Public API surface
│   └── index.ts
├── components/                   # UI components
│   ├── board/
│   ├── tier-list/
│   ├── dnd/
│   ├── p2p/
│   └── livestream/              # Livestream UI (read-only display)
├── hooks/                        # React hooks
│   ├── useBoardDocument.ts
│   ├── useP2PNetwork.ts
│   ├── useImageStore.ts
│   └── useChatVoting.ts
├── integrations/                 # External integrations
│   ├── livestream/
│   │   ├── TwitchIntegration.ts
│   │   ├── KickIntegration.ts
│   │   ├── YouTubeIntegration.ts
│   │   └── ChatVotingService.ts  # ⚠️ Local-only vote buffering
│   └── tanstack-query/
├── lib/                          # Core logic
│   ├── documents/
│   │   ├── BoardDocument.ts
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── p2p/
│   │   ├── P2PNetwork.ts
│   │   ├── PeerManager.ts
│   │   ├── SyncEngine.ts
│   │   └── types.ts
│   ├── storage/
│   │   ├── Storage.ts
│   │   ├── ImageStore.ts
│   │   └── BoardStore.ts
│   └── utils/
├── routes/                       # TanStack Router
│   ├── __root.tsx
│   ├── index.tsx
│   ├── board/
│   │   └── $boardId.tsx
│   └── settings.tsx
└── styles/
```

---

## Dependencies

### Core P2P

```json
{
  "dependencies": {
    "@automerge/automerge": "^2.x",
    "dexie": "^4.x",
    "isomorphic-ws": "^5.x"
  }
}
```

### Livestream (Optional)

```json
{
  "dependencies": {
    "pusher-js": "^8.x" // Kick chat
  },
  "devDependencies": {
    "@types/ws": "^8.x"
  }
}
```

### Image Processing

```json
{
  "dependencies": {
    "fflate": "^0.8.x" // ZIP handling
  }
}
```

### Vendor Packages (No bun install needed)

```typescript
// Already in vendor/
import Cropper from "#vendor/react-easy-crop";
import Gallery from "#vendor/react-grid-gallery";
import Img from "#vendor/react-image";
import { Star, Heart } from "#vendor/phosphor-icons-react";
import Picker from "#vendor/emoji-mart/packages/emoji-mart-react";
import ContentLoader from "#vendor/react-content-loader";
```

---

## Testing Strategy

### Unit Tests (Vitest)

```typescript
// src/lib/documents/__tests__/BoardDocument.test.ts
import { describe, it, expect } from "vitest";
import { BoardDocument } from "../BoardDocument";

describe("BoardDocument", () => {
  it("should create a new board", () => {
    const doc = BoardDocument.create({ name: "Test" });
    expect(doc.name).toBe("Test");
    expect(doc.tiers).toHaveLength(0);
  });

  it("should apply changes", () => {
    const doc = BoardDocument.create({ name: "Test" });
    const updated = BoardDocument.change(doc, (d) => {
      d.name = "Updated";
    });
    expect(updated.name).toBe("Updated");
  });

  it("should merge concurrent changes", () => {
    const doc1 = BoardDocument.create({ name: "Test" });
    const doc2 = BoardDocument.change(doc1, (d) => {
      d.name = "Peer1";
    });
    const doc3 = BoardDocument.change(doc1, (d) => {
      d.description = "Peer2";
    });

    const merged = BoardDocument.merge(doc2, BoardDocument.getDelta(doc3));
    expect(merged.name).toBe("Peer1");
    expect(merged.description).toBe("Peer2");
  });
});
```

### Integration Tests

```typescript
// src/lib/p2p/__tests__/SyncEngine.test.ts
describe("SyncEngine", () => {
  it("should sync changes between peers", async () => {
    const host = new P2PNetwork();
    const client = new P2PNetwork();

    const room = await host.createRoom();
    await client.joinRoom(room.code);

    // Wait for connection
    await waitFor(() => client.getPeers().length > 0);

    // Make change on host
    const board = BoardDocument.create({ name: "Test" });
    host.broadcast(BoardDocument.getDelta(board));

    // Verify client received
    await waitFor(() => {
      const clientBoard = client.getDocument();
      expect(clientBoard.name).toBe("Test");
    });
  });
});
```

### E2E Tests (Playwright)

```typescript
// tests/e2e/p2p-sync.spec.ts
import { test, expect } from "@playwright/test";

test("P2P sync between two browsers", async ({ browser }) => {
  // Open two contexts (simulating two peers)
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  // Navigate to same room
  await page1.goto("/board/new");
  const roomCode = await page1.locator("[data-room-code]").textContent();

  await page2.goto(`/board/join/${roomCode}`);

  // Drag item on page1
  await page1.locator('[data-item="1"]').dragTo(page1.locator('[data-tier="S"]'));

  // Verify item moved on page2
  await expect(page2.locator('[data-tier="S"] [data-item="1"]')).toBeVisible();
});
```

---

## Performance Targets

| Metric           | Target        | Measurement                     |
| ---------------- | ------------- | ------------------------------- |
| P2P sync latency | < 100ms (LAN) | Time from change to peer render |
| Image load time  | < 500ms       | Compressed WebP from IndexedDB  |
| Initial load     | < 2s          | Cold start to interactive       |
| Bundle size      | < 500KB       | Gzipped JS bundle               |
| Max peers        | 10            | Stable sync with 10 peers       |
| Storage quota    | < 500MB       | IndexedDB usage                 |

---

## Migration Path

### Phase 1: Core P2P (Current)

- ✅ Automerge documents
- ✅ WebRTC sync
- ✅ IndexedDB storage
- ⏳ Basic DnD

### Phase 2: Image Handling

- ⏳ Image compression
- ⏳ ZIP import/export
- ⏳ react-easy-crop integration

### Phase 3: Livestream (Optional)

- ⏳ Twitch EventSub (read-only)
- ⏳ Kick Pusher chat (read-only)
- ⏳ Chat voting (pending → confirm flow)

### Phase 4: Polish

- ⏳ PWA offline support
- ⏳ i18n with Paraglide
- ⏳ Accessibility (a11y)
- ⏳ Performance optimization
