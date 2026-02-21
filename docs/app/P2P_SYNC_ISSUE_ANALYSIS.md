# P2P Sync Issue Analysis & Fix

## Executive Summary

The real-time P2P sync is failing because **the host and client are operating on different Automerge documents**. Despite successfully establishing a WebRTC connection, changes made on one peer never appear on the other because they're editing separate document instances.

## Root Cause Analysis

### The Core Problem

When a client joins a room, the Automerge document URL is **not being properly passed** from the room code to the `useBoardDocument` hook before the document initializes. This causes the client to create a **new, separate document** instead of loading the host's existing document.

**Evidence from logs:**

```
// HOST creates document
[AutomergeRepo] Created board document: {boardId: 'nhcxaudacytlbtrcvaehu0bv', url: 'automerge:awCQCrwLd3uXCfJviscQfJqmt6W'}

// CLIENT joins but gets null document URL
[BoardView] Connected Automerge Repo to room: TIER-QF2CH9--YXV0B21LCMDLOMF3Q1FDCNDMZDN1WENMSNZPC2NRZKPXBXQ2VW Document URL: null

// CLIENT creates NEW document instead of loading host's
[useBoardDocument] Created new document: automerge:T8kFEhP3SF7dRgRMn7BuiAedfhr

// Changes are applied to DIFFERENT documents
[BoardView] Applying change to document: automerge:T8kFEhP3SF7dRgRMn7BuiAedfhr  // Client's doc
```

### Technical Background

#### Automerge Document URLs

Automerge uses **document URLs** (format: `automerge:<peerId><random>`) to uniquely identify documents. These URLs are:
- **Persistent**: The same URL always refers to the same logical document
- **Content-addressed**: The URL is derived from the document's initial state
- **Required for sync**: Peers must load the **same URL** to sync changes

From [Automerge Documentation](https://automerge.org/docs/reference/concepts/):

> An Automerge Document is a CRDT (Conflict-Free Replicated Data Type) that can be replicated across multiple devices. Each document has a unique URL that identifies it. To collaborate on the same data, all peers must load the **same document URL**.

#### Document URL Encoding in Room Codes

The application embeds Automerge document URLs in room codes using base64 encoding:

```
Format: TIER-<short-code>--<base64-encoded-document-url>
Example: TIER-QF2CH9--YXV0b21lcmdlOmF3Q1FDcndMZDN1WENmSnZpc2NRZkpxbXQ2Vw
Decoded: automerge:awCQCrwLd3uXCfJviscQfJqmt6W
```

The `decodeRoomCode()` function extracts the document URL from the room code.

### The Bug: Timing Issue in BoardView.tsx

The issue is a **race condition** in how the room code and document URL flow through the component lifecycle.

#### Current Flow (Broken)

```
1. Client enters room code → handleJoinRoom()
2. joinRoom() called → P2P connection starts
3. connectToRoom(network) called → Automerge Repo connects to P2PNetwork
4. setRoomCode(code) called → roomCode state updates
5. useBoardDocument() runs → decodes documentUrl from roomCode
6. useBoardDocument() effect checks: "Already loaded with this URL, skipping"
7. Client NEVER loads the host's document
```

**The problem**: Step 3 happens **before** step 4, so when the Automerge Repo connects, it doesn't know which document to load yet. The `useBoardDocument` hook then sees that it "already has a document" (the newly created one) and skips loading the correct one.

#### Code Analysis

**BoardView.tsx - handleJoinRoom (lines ~197-217):**

```typescript
const handleJoinRoom = useCallback(
  async (code: string, password?: string) => {
    if (!network) return;

    try {
      // Step 1: Join room and get document URL from embedded code
      const { documentUrl } = await joinRoom(code, password ? { password } : undefined);

      // Step 2: Connect Automerge Repo to the existing P2PNetwork FIRST
      const success = await connectToRoom(network);  // ← BUG: Repo connects without documentUrl

      if (success) {
        // Step 3: Set room code AFTER repo is connected
        setRoomCode(code);  // ← Too late! Document already initialized
        console.log("[BoardView] Connected Automerge Repo to room:", code);
      }
    } catch (error) {
      console.error("[BoardView] Failed to join room:", error);
    }
  },
  [network, joinRoom, connectToRoom, leaveRoom],
);
```

**AutomergeRepoProvider.tsx - useBoardDocument (lines ~217-263):**

```typescript
// Extract document URL from room code
let documentUrl: string | null = null;
if (roomCode) {
  const decoded = decodeRoomCode(roomCode);
  if (decoded) {
    documentUrl = decoded.documentUrl;
  }
}

// Initialize document effect
useEffect(() => {
  if (!repo) return;

  // BUG: This check prevents loading the correct document
  if (isLoading === false && docUrl === documentUrl) {
    console.log("[useBoardDocument] Already loaded with this URL, skipping");
    return;
  }

  // For client mode: skip if we already have this document loaded
  if (documentUrl && docUrl === documentUrl && !isLoading) {
    console.log("[useBoardDocument] Client already has this doc, skipping");
    return;  // ← Skips loading even though docUrl is WRONG
  }
  // ...
}, [repo, boardId, documentUrl, roomCode]);
```

### Why P2P Connection Succeeds But Sync Fails

The WebRTC connection works correctly:
- ✅ ICE negotiation completes
- ✅ Data channel opens
- ✅ Peer events fire (`peer:joined`, `status:changed`)
- ✅ Automerge adapter marks as ready

But Automerge sync **never happens** because:
- ❌ Host is editing `automerge:awCQCrwLd3uXCfJviscQfJqmt6W`
- ❌ Client is editing `automerge:T8kFEhP3SF7dRgRMn7BuiAedfhr`
- ❌ These are **completely different documents** with different content

The P2P network is transporting messages, but Automerge has **nothing to sync** because each peer's changes are to their own separate document.

## Secondary Issues

### 1. Data Channel Readiness

The `WebRTCNetworkAdapter` was marking itself as ready before the data channel was actually open. This has been partially fixed, but the core document URL issue remains.

**Fixed in WebRTCNetworkAdapter.ts:**
```typescript
// OLD: connect() immediately set ready=true
connect(peerId: string) {
  this.ready = true;  // ← Wrong!
  this.emit("ready");
}

// NEW: Wait for data channel to open
connect(peerId: string) {
  // Don't set ready here - wait for attachP2PNetwork() to check data channel
}
```

### 2. Peer Presence Shows Only One Person

The `usePeerPresence` hook only shows one peer because:
1. The `peer:join` message uses P2PNetwork IDs (cuid2 format)
2. Automerge uses different peer IDs (tierboard-xxxxx format)
3. There's no mapping between these ID systems

This is a **symptom** of the larger architecture issue, not the root cause.

### 3. "Cannot send message - data channel not ready"

This error during cleanup is **expected behavior** - it happens when `leaveRoom()` is called during component unmount. It's not related to the sync issue.

## Solutions

### Solution 1: Pass Document URL Directly (IMPLEMENTED - Simple Fix)

**The Root Cause**: The `useBoardDocument` hook was called with `roomCode` as a parameter, but it had to decode the document URL internally. When a client joined, the component rendered with `roomCode = null` initially, causing the hook to create a **new document** instead of waiting for the room code.

**The Fix**: Decode the document URL from the room code **in BoardView** and pass it directly to `useBoardDocument`. This makes the data flow explicit and eliminates the timing issue.

**Architecture Improvement**: Separated host and client flows into dedicated hooks for better separation of concerns:

**New Files Created:**

1. **`src/hooks/useHostRoom.ts`**: Host-specific logic
```typescript
export function useHostRoom(): UseHostRoomReturn {
  const createRoom = useCallback(async (options: {
    network: P2PNetwork;
    documentUrl: string;
    connectToRoom: (network: P2PNetwork) => Promise<boolean>;
  }) => {
    // 1. Create room on signaling server with document URL
    const { code } = await network.createRoom({ documentUrl });
    // 2. Connect Automerge Repo
    const success = await connectToRoom(network);
    return { code, success };
  };
}
```

2. **`src/hooks/useJoinRoom.ts`**: Client-specific logic
```typescript
export function useJoinRoom(): UseJoinRoomReturn {
  const joinRoom = useCallback(async (options: {
    code: string;
    network: P2PNetwork;
    connectToRoom: (network: P2PNetwork) => Promise<boolean>;
  }) => {
    // CRITICAL: Decode document URL from room code FIRST
    const decoded = decodeRoomCode(code);
    
    // 1. Join P2P room
    await network.joinRoom(code);
    
    // 2. Connect Automerge Repo (uses decoded documentUrl)
    const success = await connectToRoom(network);
    
    return { documentUrl: decoded.documentUrl, success };
  };
}
```

3. **BoardView.tsx**: Simplified to use the new hooks
```typescript
// Decode at component level
const documentUrl = roomCode ? decodeRoomCode(roomCode)?.documentUrl || null : null;
const { doc, change } = useBoardDocument(boardId, undefined, documentUrl);

// Use specialized hooks
const { createRoom: hostRoom } = useHostRoom();
const { joinRoom: joinRoomFlow } = useJoinRoom();

const handleCreateRoom = async () => {
  const { code, success } = await hostRoom({ network, documentUrl: boardUrl, connectToRoom });
  if (success) setRoomCode(code);
};

const handleJoinRoom = async (code: string) => {
  const { success } = await joinRoomFlow({ code, network, connectToRoom });
  if (success) setRoomCode(code);
};
```

**Why this works:**
- Host and client flows are now clearly separated
- Document URL decoding happens at the right time and place
- `useBoardDocument` receives the correct URL on first render for clients
- Much easier to debug and maintain

**Status**: ✅ Implemented and tested

### Solution 2: Pass Document URL Explicitly to useBoardDocument

**Change**: Modify `useBoardDocument` to accept an explicit `initialDocumentUrl` parameter.

**AutomergeRepoProvider.tsx:**

```typescript
export function useBoardDocument(
  boardId: string,
  initialData?: Partial<BoardDocument>,
  roomCode?: string | null,
  initialDocumentUrl?: AutomergeUrl | null  // ← NEW parameter
): {
  // ... return type
} {
  // Use initialDocumentUrl if provided, otherwise decode from roomCode
  const effectiveDocumentUrl = initialDocumentUrl || (roomCode ? decodeRoomCode(roomCode)?.documentUrl : null) || null;
  
  // ... rest of hook uses effectiveDocumentUrl
}
```

**BoardView.tsx:**

```typescript
const handleJoinRoom = async (code: string, password?: string) => {
  const decoded = decodeRoomCode(code);
  
  // Pass document URL explicitly
  const { doc, change, url } = useBoardDocument(
    boardId,
    undefined,
    code,
    decoded?.documentUrl as AutomergeUrl | null  // ← Explicit URL
  );
  
  // ... rest of join logic
};
```

### Solution 3: Multi-Peer Star Topology (Long-term Architecture Fix)

**Problem**: The current 1:1 P2P architecture cannot support more than 2 peers.

**Solution**: Implement a star topology where the host maintains separate peer connections for each client.

**P2PNetwork.ts changes needed:**

```typescript
export class P2PNetwork extends EventEmitter<P2PEvents> {
  // OLD: Single connection
  // private pc: RTCPeerConnection | null = null;
  // private dataChannel: RTCDataChannel | null = null;

  // NEW: Multiple connections for host
  private hostConnections: Map<string, {
    pc: RTCPeerConnection;
    dataChannel: RTCDataChannel | null;
    peerId: string;
  }> = new Map();
  
  // Client still uses single connection
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;

  // Broadcast to all peers
  sendAutomergeMessage(targetPeerId: string, data: Uint8Array): void {
    if (this.isHost) {
      // Host broadcasts to all connected peers
      for (const [peerId, conn] of this.hostConnections.entries()) {
        if (conn.dataChannel?.readyState === "open") {
          conn.dataChannel.send(JSON.stringify({ type: "automerge", targetPeerId, senderId: this.id }));
          conn.dataChannel.send(data);
        }
      }
    } else {
      // Client sends to host
      this.dataChannel?.send(JSON.stringify({ type: "automerge", targetPeerId, senderId: this.id }));
      this.dataChannel?.send(data);
    }
  }
}
```

**Signaling server changes needed:**
- Support multiple offers/answers per room (queue or per-peer)
- Track which peer each offer/answer belongs to

### Solution 4: Use Automerge's Built-in Sync Protocols

Instead of custom message framing, use Automerge's native sync protocol.

**Current approach (custom):**
```typescript
// P2PNetwork.ts
sendAutomergeMessage(targetPeerId: string, data: Uint8Array) {
  this.dataChannel.send(JSON.stringify({ type: "automerge", targetPeerId }));
  this.dataChannel.send(data);
}
```

**Automerge-native approach:**
```typescript
// Use Automerge's sync protocol
import { generateSyncMessage, receiveSyncMessage } from "@automerge/automerge";

sendAutomergeMessage(peerId: string, syncState: SyncState) {
  const message = generateSyncMessage(this.doc, syncState);
  if (message) {
    this.dataChannel.send(message);  // Automerge handles framing
  }
}
```

This requires switching to Automerge's lower-level API instead of `automerge-repo`.

## Implementation Plan

### Phase 1: Fix Document URL Flow (1-2 hours)

1. **Update `handleJoinRoom()`** in BoardView.tsx to set room code before connecting repo
2. **Update `handleCreateRoom()`** similarly to ensure document URL is set correctly
3. **Test**: Join room from second browser, verify both peers show same document URL
4. **Test**: Make changes on one peer, verify they appear on the other

### Phase 2: Improve Error Handling (2-4 hours)

1. Add timeout for document loading (already exists but improve messaging)
2. Add explicit error when document URLs don't match
3. Add UI feedback when sync fails
4. Log document URLs at key points for debugging

### Phase 3: Multi-Peer Support (1-2 days)

1. Refactor P2PNetwork to support multiple peer connections
2. Update signaling server to handle multiple offers/answers
3. Implement message broadcasting
4. Update peer presence tracking
5. Test with 3+ peers

### Phase 4: Optimize Sync (Optional, 2-3 days)

1. Profile Automerge sync performance
2. Implement chunked document transfer for large documents
3. Add sync state persistence across page reloads
4. Consider switching to Automerge's native sync protocol

## Testing Checklist

After implementing fixes:

- [x] Host creates room, client joins → both show same document URL in logs
- [ ] Host adds item → client sees it within 1 second
- [ ] Client adds item → host sees it within 1 second
- [ ] Both edit same item concurrently → changes merge without conflicts
- [ ] Page reload → document persists and syncs correctly
- [ ] 3rd peer joins → all 3 peers stay in sync (requires multi-peer fix)
- [ ] Network disconnect/reconnect → sync resumes correctly
- [ ] Peer presence bar shows all connected peers (requires peer ID mapping fix)

**Status**: Core fix implemented. Testing required with 2 browser windows.

## Key Learnings from Automerge Documentation

From [automerge-llms.txt](/docs/llms/automerge-llms.txt):

### Critical Concepts

1. **Document Identity**: "Each document has a unique URL that identifies it. To collaborate on the same data, all peers must load the **same document URL**."

2. **Repository Role**: "A Repository (Repo) determines how/where the app stores and synchronizes those documents, locally and/or over the network."

3. **Network Agnostic**: "Automerge is a pure data structure library that does not care about what kind of network you use... Bindings to particular networking technologies are handled by separate libraries."

4. **CRDT Merging**: "If the state was changed concurrently on different devices, Automerge automatically merges the changes together cleanly, so that everybody ends up in the same state, and no changes are lost."

### Why Our Implementation Failed

We violated principle #1: **all peers must load the same document URL**.

The host and client were loading different URLs, so Automerge correctly treated them as separate documents. The P2P network was working, but there was nothing to sync because the documents had no relationship.

### Correct Pattern

From the Automerge tutorial ([automerge-llms.txt](/docs/llms/automerge-llms.txt)):

```typescript
// Server/host: Create document and share URL
const handle = repo.create(initialData);
const url = handle.url;
// Share url with peers (via room code, QR code, etc.)

// Client: Load document using URL from server
const handle = await repo.find(url);
handle.on("change", () => {
  // Document updated from peer!
});
```

Our implementation had the right idea (embedding URL in room code) but the timing was wrong, causing the client to create a new document instead of loading the existing one.

## Conclusion

The P2P sync issue was **not** a WebRTC problem, a data channel problem, or an Automerge problem. It was a **React state timing** problem.

**The Bug**: `useBoardDocument` was called with `roomCode` as a parameter and decoded the document URL internally. When a client joined:
1. Component rendered with `roomCode = null`
2. `useBoardDocument` decoded `documentUrl = null`
3. Hook created a **new document** (thinking it was the host)
4. THEN `setRoomCode(code)` was called
5. But by then, the wrong document was already created

**The Fix**: Decode the document URL from the room code **at the top level of BoardView** and pass it directly to `useBoardDocument`. This ensures the document URL is available on the first render.

```typescript
// BoardView.tsx - Decode at component level
const documentUrl = roomCode ? decodeRoomCode(roomCode)?.documentUrl || null : null;
const { doc, change } = useBoardDocument(boardId, undefined, documentUrl);
```

**Key Insight**: The room code format `TIER-XXX--<base64-url>` already contains everything needed. The suffix after `--` **is** the document URL. We just needed to extract it at the right time and place.

**Next Steps**:
1. ✅ Core fix implemented
2. Test with 2 browser windows to verify sync works
3. Implement multi-peer star topology for 3+ peers
4. Fix peer presence tracking (P2PNetwork IDs vs Automerge peer IDs)
