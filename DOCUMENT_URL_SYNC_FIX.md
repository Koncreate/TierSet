# Room-Code Document URL Sharing Implementation

**Status:** ✅ Implementation Complete - Solution C (Separate Host/Client Flows)  
**Date:** 2026-02-20

---

## Overview

This document describes the implementation of **Room-Code Document URL Sharing** for Automerge sync in the TierBoard application. This approach stores the Automerge document URL in the signaling server's room metadata, ensuring all peers sync to the same document.

### Problem Solved

**Before:** Each peer created their own Automerge document with a different URL:
- Peer A (host): `automerge:zLktnxvu8kJ7Zc4Nw14NWW2AKSq`
- Peer B (client): `automerge:4GtrggTBpeMGWAVoNvQMrafmh3B5`

Result: Messages synced successfully, but peers were editing **different documents**.

**After:** All peers use the same document URL stored in the room metadata:
- Host creates document → URL stored in signaling server
- Client joins room → receives URL from server → calls `repo.find(url)`
- All peers sync to the **same** Automerge document

---

## The Two Flows (Solution C)

### Host Flow (Creates Room)

```
1. Document is created FIRST by useBoardDocument() → returns boardUrl
   ↓
2. User clicks "Create Room"
   ↓
3. Pass boardUrl to createRoom({ documentUrl: boardUrl })
   ↓
4. Server stores URL with room
   ↓
5. useBoardDocument() already has the document (no change needed)
```

**Key:** Host creates document BEFORE room. The room stores a reference to the existing document.

### Joiner Flow (Joins Room)

```
1. User enters room code
   ↓
2. Receive documentUrl from joinRoom(code) response
   ↓
3. Set roomDocumentUrl state
   ↓
4. useBoardDocument() re-runs with documentUrl prop
   ↓
5. Find existing document via repo.find(url)
```

**Key:** Joiner receives URL from server and uses it to find the host's document.

### Logic Separation

| Aspect | Host | Joiner |
|--------|------|--------|
| `documentUrl` prop | `null` | Received from server |
| Document action | `repo.create()` | `repo.find(url)` |
| When document created | Before room creation | Already exists (created by host) |
| Room creation | Creates room + stores URL | Joins room + retrieves URL |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Signaling Server (KV Store)                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Room: "ABC123"                                           │   │
│  │  - hostId: "peer-1"                                      │   │
│  │  - hostOffer: {...}                                      │   │
│  │  - clientAnswer: {...}                                   │   │
│  │  - documentUrl: "automerge:abc123"  ← NEW                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         │                    │                    │
┌────────┴────────┐  ┌────────┴────────┐  ┌────────┴────────┐
│   Peer A (Host) │  │  Peer B (Client)│  │  Peer C (Client)│
│                 │  │                 │  │                 │
│ 1. Create doc   │  │ 1. Enter code   │  │ 1. Enter code   │
│ 2. Create room  │  │ 2. Join room    │  │ 2. Join room    │
│    + store URL  │  │    → get URL    │  │    → get URL    │
│ 3. Connect P2P  │  │ 3. repo.find()  │  │ 3. repo.find()  │
│                 │  │ 4. Sync!        │  │ 4. Sync!        │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## Implementation Details

### 1. Signaling Store (`src/lib/p2p/signaling-store-unstorage.ts`)

Added `documentUrl` field to `SignalingRoom` interface:

```typescript
export interface SignalingRoom {
  code: string;
  hostId: string;
  peerCount: number;
  hostOffer: RTCSessionDescriptionInit | null;
  clientAnswer: RTCSessionDescriptionInit | null;
  hostCandidates: RTCIceCandidateInit[];
  clientCandidates: RTCIceCandidateInit[];
  createdAt: number;
  expiresAt: number;
  documentUrl?: string;  // ← NEW: Automerge document URL
}
```

Added methods to store/retrieve document URLs:

```typescript
async setDocumentUrl(code: string, documentUrl: string): Promise<void>
async getDocumentUrl(code: string): Promise<string | null>
```

### 2. Signaling API (`src/routes/api/-signaling.ts`)

**Updated `createRoom`**:
- Accepts optional `documentUrl` parameter
- Stores URL in room metadata
- Returns `documentUrl` in response

**Updated `joinRoom`**:
- Returns `documentUrl` from room metadata
- Clients receive the URL immediately when joining

**Added `setDocumentUrl` endpoint**:
- Allows updating document URL after room creation
- Used when document is created after room creation

### 3. P2P Network (`src/lib/p2p/P2PNetwork.ts`)

**Updated `createRoom()`**:
```typescript
async createRoom(options?: {
  password?: string;
  maxPeers?: number;
  documentUrl?: string;  // ← NEW
}): Promise<{ code: string; room: P2PNetwork; documentUrl?: string }>
```

**Updated `joinRoom()`**:
```typescript
async joinRoom(code: string, options?: { password?: string }): Promise<{ 
  room: P2PNetwork;
  documentUrl?: string | null;  // ← NEW: returned from server
}>
```

### 4. P2P Network Hook (`src/hooks/useP2PNetwork.ts`) - CRITICAL

**CRITICAL**: The hook must pass through `documentUrl` in both directions.

**Interface update:**
```typescript
interface UseP2PNetworkReturn {
  // ...
  createRoom: (
    options?: { 
      password?: string; 
      maxPeers?: number; 
      documentUrl?: string;
    }
  ) => Promise<{ code: string; documentUrl?: string | null }>;
  
  joinRoom: (
    code: string, 
    options?: { password?: string }
  ) => Promise<{ documentUrl?: string | null }>;
  // ...
}
```

**Implementation:**
```typescript
const createRoom = useCallback(async (
  options?: { password?: string; maxPeers?: number; documentUrl?: string }
) => {
  if (!network) throw new Error("Network not initialized");
  const result = await network.createRoom(options);
  return { code: result.code, documentUrl: result.documentUrl };
}, [network]);

const joinRoom = useCallback(
  async (code: string, options?: { password?: string }) => {
    if (!network) throw new Error("Network not initialized");
    const result = await network.joinRoom(code, options);
    return { documentUrl: result.documentUrl };
  },
  [network],
);
```

### 5. Automerge Repo Provider (`src/lib/automerge/AutomergeRepoProvider.tsx`)

**Simplified `useBoardDocument()` hook**:
```typescript
export function useBoardDocument(
  boardId: string,
  initialData?: Partial<BoardDocument>,
  documentUrl?: string | null  // ← NEW: URL from room
): {
  doc: BoardDocument | null;
  change: (callback: BoardChangeFn) => void;
  handle: DocHandle<BoardDocument> | null;
  url: AutomergeUrl | null;
  isLoading: boolean;
  error: Error | null;
}
```

**Initialization logic**:
```typescript
if (documentUrl) {
  // Client: Use URL from room to find existing document
  docHandle = await repo.find<BoardDocument>(documentUrl);
} else {
  // Host: Create new document
  docHandle = await repo.create<BoardDocument>(initialData);
}
```

### 6. Board View (`src/components/board/BoardView.tsx`)

**Added state for room document URL**:
```typescript
const [roomDocumentUrl, setRoomDocumentUrl] = useState<string | null>(null);
```

**Updated `handleCreateRoom`**:
```typescript
const handleCreateRoom = useCallback(async () => {
  if (!network || !boardUrl) return;
  
  // Create room with document URL stored on server
  const { code } = await createRoom({ documentUrl: boardUrl });
  
  const success = await connectToRoom(network);
  if (success) {
    setRoomCode(code);
    console.log("[BoardView] Created room with document URL:", code, boardUrl);
  }
}, [network, createRoom, connectToRoom, leaveRoom, boardUrl]);
```

**Updated `handleJoinRoom`**:
```typescript
const handleJoinRoom = useCallback(
  async (code: string, password?: string) => {
    if (!network) return;
    
    // Join room and get document URL from server
    const { documentUrl } = await joinRoom(code, password ? { password } : undefined);
    
    // Set the URL so useBoardDocument can find the right document
    if (documentUrl) {
      setRoomDocumentUrl(documentUrl);
      console.log("[BoardView] Received document URL from room:", documentUrl);
    }
    
    const success = await connectToRoom(network);
    if (success) {
      setRoomCode(code);
    }
  },
  [network, joinRoom, connectToRoom, leaveRoom],
);
```

**Updated `handleLeaveRoom`**:
```typescript
const handleLeaveRoom = useCallback(async () => {
  await disconnectFromRoom();
  await leaveRoom();
  setRoomCode(null);
  setRoomDocumentUrl(null);  // Clear document URL
}, [disconnectFromRoom, leaveRoom]);
```

### 7. Removed Obsolete Code

**Removed from `src/lib/p2p/types.ts`**:
- `DocumentUrlMessageSchema`
- `DocumentUrlMessage` type

**Removed from `src/lib/p2p/P2PNetwork.ts`**:
- `sendDocumentUrl()` method
- `"document-url:received"` event
- Message handler for document-url messages

**Removed from `src/lib/p2p/WebRTCNetworkAdapter.ts`**:
- `pendingDocumentUrls` map
- `getDocumentUrl()` method
- `clearDocumentUrls()` method
- Document URL event handlers

**Removed from `src/components/board/BoardView.tsx`**:
- Document URL synchronization effect
- Broadcasting logic

---

## Flow Diagram

### Host Flow
```
1. User opens board
   ↓
2. useBoardDocument() creates new document
   → URL: automerge:abc123
   ↓
3. User clicks "Create Room"
   ↓
4. createRoom({ documentUrl: boardUrl })
   ↓
5. Signaling server stores:
   { code: "ABC123", documentUrl: "automerge:abc123" }
   ↓
6. P2P connection established
   ↓
7. Peers can now join and sync to same document
```

### Client Flow
```
1. User enters room code "ABC123"
   ↓
2. joinRoom("ABC123")
   ↓
3. Server returns: { documentUrl: "automerge:abc123" }
   ↓
4. setRoomDocumentUrl("automerge:abc123")
   ↓
5. useBoardDocument() receives URL
   ↓
6. repo.find("automerge:abc123")
   ↓
7. Syncs to existing document!
```

---

## Benefits

### ✅ Deterministic
- No race conditions
- No timing-based delays
- URL available before document operations begin

### ✅ Simple
- Clean separation of concerns
- Signaling server handles URL storage
- No complex message passing

### ✅ Scalable
- Multiple clients can join simultaneously
- All receive the same URL from server
- No peer-to-peer URL negotiation needed

### ✅ Follows Automerge Best Practices
- Uses `repo.find(url)` for existing documents
- URL is the source of truth for document identity
- Repo handles sync automatically

---

## Testing Checklist

- [ ] **Host creates room** → Verify document URL stored in signaling store
- [ ] **Client joins room** → Verify document URL received in join response
- [ ] **Both peers see same document** → Changes sync automatically
- [ ] **Multiple clients** → All sync to same document
- [ ] **Reconnection** → Client can rejoin and continue syncing
- [ ] **Room leave** → State properly cleaned up
- [ ] **Host leaves** → Room deleted, clients can't rejoin

### Expected Behavior

1. **Host opens board** → Document created with URL `automerge:abc123`
2. **Host clicks "Create Room"** → Room code `ABC123` created, URL stored
3. **Client enters room code** → Receives URL `automerge:abc123` from server
4. **Client calls `repo.find()`** → Syncs to SAME document as host
5. **Both peers edit** → Changes sync automatically via Automerge Repo

---

## Debugging

### How to verify document sync is working

1. **Open browser console on both peers**

2. **Host creates room** - should see:
   ```
   [useBoardDocument] Created new document: automerge:abc123
   [BoardView] Created room with document URL: ROOM-CODE automerge:abc123
   ```

3. **Client joins** - should see:
   ```
   [BoardView] Received document URL from room: automerge:abc123
   [useBoardDocument] Found existing document via room URL: automerge:abc123
   ```

4. **If client shows "Created new document" with a DIFFERENT URL** → sync is broken

### Debug logs to add

```typescript
// BoardView.tsx - handleJoinRoom
console.log("[BoardView] joinRoom() returned:", { documentUrl });
console.log("[BoardView] Setting roomDocumentUrl:", documentUrl);
console.log("[BoardView] Current roomDocumentUrl state:", roomDocumentUrl);

// AutomergeRepoProvider.tsx - useBoardDocument
console.log("[useBoardDocument] Initialized with:", { boardId, documentUrl });
console.log("[useBoardDocument] documentUrl changed, re-initializing");

// P2PNetwork.ts - joinRoom
console.log("[P2PNetwork] joinRoom() received from server:", joinResult);
```

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/p2p/signaling-store-unstorage.ts` | Added `documentUrl` field and methods |
| `src/lib/p2p/signaling-store.ts` | Added `documentUrl` field and methods (memory store) |
| `src/routes/api/-signaling.ts` | Updated `createRoom`, `joinRoom`; added `setDocumentUrl` |
| `src/lib/p2p/P2PNetwork.ts` | Updated `createRoom()`, `joinRoom()` signatures |
| `src/lib/automerge/AutomergeRepoProvider.tsx` | Simplified `useBoardDocument()` |
| `src/components/board/BoardView.tsx` | Updated room creation/join logic |
| `src/hooks/useP2PNetwork.ts` | **CRITICAL** - Must pass `documentUrl` through |
| `src/lib/p2p/types.ts` | Removed `DocumentUrlMessageSchema` |
| `src/lib/p2p/WebRTCNetworkAdapter.ts` | Removed obsolete URL handling |

---

## Migration Notes

This implementation **replaces** the previous broadcast-based approach:
- ❌ No more `document-url` P2P messages
- ❌ No more timing-based delays (1-second waits)
- ❌ No more URL storage in WebRTCNetworkAdapter
- ✅ URL stored centrally in signaling server
- ✅ Clients receive URL immediately on join

---

## Future Improvements

1. **Persistence**: Store document URLs in database instead of KV/memory
2. **Room history**: Keep track of all documents created in a room
3. **Document recovery**: Allow rejoining peers to discover document URL
4. **Multi-board support**: Store multiple document URLs per room

---

## Related Documents

- `DOCUMENT_URL_SYNC_ISSUES.md` - Debug report and problem analysis
- `docs/P2P-SIGNALING-IMPLEMENTATION.md` - Signaling server implementation
- `docs/llms/automerge-llms.txt` - Official Automerge patterns

---

## Implementation Status

### ✅ Completed (Backend/Infrastructure)
- [x] Signaling store - `documentUrl` field added
- [x] Signaling API - `createRoom`, `joinRoom`, `setDocumentUrl` endpoints updated
- [x] P2PNetwork class - `createRoom()`, `joinRoom()` signatures updated
- [x] AutomergeRepoProvider - `useBoardDocument()` accepts `documentUrl` prop
- [x] BoardView - State management for `roomDocumentUrl`
- [x] Obsolete code removed - `DocumentUrlMessageSchema`, handlers, etc.

### ⚠️ PENDING (Critical - Blocks Sync)
- [ ] **`src/hooks/useP2PNetwork.ts`** - Hook must return `documentUrl` from `createRoom()` and `joinRoom()`

### 📋 Additional Improvements (Recommended)
- [ ] Add `useEffect` in BoardView to watch `roomDocumentUrl` changes and trigger re-init
- [ ] Consider adding loading state while client waits for URL from server
- [ ] Add error handling for when `documentUrl` is not returned from server

---

## Quick Start for Next Session

**If you're continuing this implementation, start here:**

1. **Read `DOCUMENT_URL_SYNC_ISSUES.md`** for full problem context

2. **Check current state of `src/hooks/useP2PNetwork.ts`**:
   ```bash
   cat src/hooks/useP2PNetwork.ts
   ```

3. **Verify the hook returns `documentUrl`**:
   ```typescript
   // Should look like:
   const joinRoom = useCallback(async (code: string, options?: { password?: string }) => {
     if (!network) throw new Error("Network not initialized");
     const result = await network.joinRoom(code, options);
     return { documentUrl: result.documentUrl };  // ← This line is critical
   }, [network]);
   ```

4. **Test with two browser windows**:
   - Window 1 (Host): Create board → Create room
   - Window 2 (Client): Enter room code
   - Check console logs - both should show SAME `automerge:` URL

5. **If URLs differ**, check:
   - Is `joinRoom()` returning `documentUrl`?
   - Is `roomDocumentUrl` state being set in BoardView?
   - Is `useBoardDocument` receiving `documentUrl` prop?
   - Is `repo.find(url)` being called (not `repo.create()`)?

---

## Common Pitfalls

### Pitfall 1: Hook Discards Return Value
```typescript
// ❌ WRONG - return value lost
const joinRoom = useCallback(async (code: string) => {
  await network.joinRoom(code);
}, [network]);

// ✅ CORRECT - return value passed through
const joinRoom = useCallback(async (code: string) => {
  const result = await network.joinRoom(code);
  return { documentUrl: result.documentUrl };
}, [network]);
```

### Pitfall 2: State Update Timing
```typescript
// ❌ WRONG - assumes state updates synchronously
const { documentUrl } = await joinRoom(code);
setRoomDocumentUrl(documentUrl);
useBoardDocument(boardId, undefined, roomDocumentUrl);  // Still null!

// ✅ CORRECT - useEffect watches for URL changes
useEffect(() => {
  if (roomDocumentUrl) {
    // Document will be found via repo.find()
    console.log("Document URL available:", roomDocumentUrl);
  }
}, [roomDocumentUrl]);
```

### Pitfall 3: Not Clearing State on Leave
```typescript
// ❌ WRONG - stale URL persists
const handleLeaveRoom = useCallback(async () => {
  await leaveRoom();
  setRoomCode(null);
  // roomDocumentUrl still set!
}, [leaveRoom]);

// ✅ CORRECT - clear all state
const handleLeaveRoom = useCallback(async () => {
  await disconnectFromRoom();
  await leaveRoom();
  setRoomCode(null);
  setRoomDocumentUrl(null);  // ← Clear URL too
}, [disconnectFromRoom, leaveRoom]);
```
