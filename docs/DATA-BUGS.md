# Data Bugs Investigation Report

**Date:** 2026-02-21
**Status:** Investigation complete, fixes pending

---

## Summary

This document catalogs all potential data bugs found after fixing the three primary issues (UI stuck, data channel race, board URL mapping). Issues are organized by severity.

---

## CRITICAL Issues

### 1. Duplicate Signaling Stores
**Files:** `src/lib/p2p/signaling-store.ts` vs `src/lib/p2p/signaling-store-unstorage.ts`

**Problem:** Two signaling store implementations exist:
- `signaling-store.ts` - Uses in-memory `Map<string, SignalingRoom>` (singleton)
- `signaling-store-unstorage.ts` - Uses unstorage with KV/memory driver

The API route imports from `signaling-store-unstorage.ts`, but test file imports from `signaling-store.ts`. Tests validate the wrong implementation.

**Impact:** Tests may pass while production code has bugs.

**Fix:**
- Remove `signaling-store.ts` or update tests to use unstorage version
- Ensure only one implementation exists

---

### 2. Orphaned Automerge Documents
**File:** `src/lib/board/board-storage-unstorage.ts:152-156`

```typescript
async deleteBoard(id: BoardId): Promise<void> {
  await urlStorage.removeItem(`board:${id}`);
  // Note: The actual document remains in Repo storage
}
```

**Problem:** Deleting a board only removes the URL mapping, not the Automerge document in IndexedDB (`tierboard-automerge` database). Documents accumulate indefinitely.

**Impact:** Storage bloat, wasted IndexedDB space.

**Fix:**
- Implement document deletion from Repo when board is deleted
- Or implement garbage collection for orphaned documents

---

### 3. Dual Storage Systems
**Files:** 
- `src/lib/storage/BoardStore.ts` (Dexie-based)
- `src/lib/board/board-storage-unstorage.ts` (Unstorage-based)

**Problem:** Two separate board storage implementations:
1. `BoardStore.ts` stores boards in Dexie with binary Automerge docs
2. `board-storage-unstorage.ts` stores boardId→AutomergeUrl mappings while docs live in Repo

This creates confusion about which storage to use.

**Impact:** Data could be stored in wrong place, leading to sync issues.

**Fix:**
- Decide on single storage approach
- Remove or deprecate unused implementation

---

### 4. KV Driver Inconsistency
**Files:**
- `src/lib/board/board-storage-unstorage.ts:259-283`
- `src/lib/p2p/signaling-store-unstorage.ts:189-206`

**Problem:** Two different KV driver implementations with different serialization:

```typescript
// board-storage-unstorage.ts - NO JSON handling
async getItem(key: string) {
  return await kvBinding.get(key);  // Returns raw string
}
async setItem(key: string, value: any) {
  await kvBinding.put(key, value);  // Stores directly
}

// signaling-store-unstorage.ts - WITH JSON handling
async getItem(key: string) {
  const value = await kv.get(key);
  return JSON.parse(value as string);  // Parses JSON
}
async setItem(key: string, value: any) {
  await kv.put(key, JSON.stringify(value));  // Stringifies
}
```

**Impact:** Data corruption or retrieval failures when switching drivers.

**Fix:**
- Standardize on one KV driver implementation
- Ensure consistent serialization

---

### 5. Blob URL Leak
**File:** `src/lib/storage/ImageStore.ts:146-151`

```typescript
async getUrl(id: string, thumbnail: boolean = false): Promise<string | null> {
  const blob = thumbnail ? await this.getThumbnail(id) : await this.get(id);
  if (!blob) return null;
  return URL.createObjectURL(blob);  // NEVER REVOKED!
}
```

**Problem:** `getUrl()` creates Object URLs that are never revoked, causing memory leaks.

**Impact:** Browser memory leak, potential crash with many images.

**Fix:**
- Track created URLs and provide cleanup mechanism
- Or use `useImageStore` hook which handles cleanup

---

### 6. One-Way Sync Only (Automerge → Store)
**File:** `src/components/board/BoardView.tsx:93-98`

```typescript
useEffect(() => {
  if (automergeBoard) {
    boardActions.setBoard(automergeBoard);
  }
}, [automergeBoard]);
```

**Problem:** Sync only runs when `automergeBoard` reference changes. Automerge may return same reference for multiple updates, causing missed UI updates.

**Impact:** Stale UI, users don't see changes immediately.

**Fix:**
- Subscribe to Automerge's `change` event instead of relying on reference changes
- Add deep equality check

---

## HIGH Issues

### 7. Unbounded Message Queue
**File:** `src/lib/p2p/WebRTCNetworkAdapter.ts:19`

```typescript
private messageQueue: Map<string, Uint8Array[]> = new Map();
```

**Problem:** No limit on queue size. If data channel fails to open, messages pile up unboundedly.

**Impact:** Memory exhaustion.

**Fix:**
- Add maximum queue size (e.g., 100 messages)
- Drop oldest messages when limit exceeded
- Log warning when dropping

---

### 8. Messages Lost on Disconnect
**File:** `src/lib/p2p/WebRTCNetworkAdapter.ts:200-213`

**Problem:** When `disconnect()` is called, queued messages are not flushed or delivered.

**Impact:** Sync messages lost, inconsistent document state.

**Fix:**
- Flush queue before disconnect (if channel still open)
- Or persist queue to storage for retry on reconnect

---

### 9. P2P State Lost on Page Reload
**File:** `src/lib/p2p/P2PNetwork.ts:55,58,66-75`

```typescript
private peers: Map<string, PeerInfo> = new Map();
private peerSequence: Map<string, number> = new Map();
private pendingImages: Map<string, {...}> = new Map();
```

**Problem:** All critical state is in-memory only.

**Impact:**
- In-progress image transfers lost on reload
- Reconnection requires full re-sync

**Fix:**
- Persist critical state to localStorage/IndexedDB
- Or accept this limitation and handle gracefully

---

### 10. Store Not Persisted
**File:** `src/stores/appStore.ts`

**Problem:** Entire app state is in-memory: `roomCode`, `documentUrl`, `currentBoard`, `localPeer`, `remotePeers`.

**Impact:** Can't rejoin room or reconnect after page reload.

**Fix:**
- Persist critical state to localStorage
- Restore on app init

---

### 11. canEdit Requires Connection
**File:** `src/hooks/useBoardState.ts:31-37`

```typescript
const canEdit = useStore(
  appStore,
  (state) =>
    !state.board.isLoading &&
    state.board.currentBoard !== null &&
    state.room.isConnected  // PROBLEM
);
```

**Problem:** `canEdit` is `false` when not in a room. Solo users can't edit.

**Impact:** Local-first editing broken.

**Fix:**
- Remove `isConnected` check
- Allow editing when board exists, regardless of connection

---

### 12. No Debouncing on Name Input
**File:** `src/components/board/BoardView.tsx:466-479`

```typescript
onChange={(e) => {
  change((doc) => {
    doc.name = e.target.value;  // Every keystroke!
    doc.updatedAt = Date.now();
  });
}}
```

**Problem:** Every keystroke creates an Automerge change.

**Impact:** Excessive sync overhead, performance issues.

**Fix:**
- Use `@tanstack/pacer` for debouncing
- 300ms debounce recommended

---

## MEDIUM Issues

### 13. TOCTOU Race in send()
**File:** `src/lib/p2p/WebRTCNetworkAdapter.ts:236-247`

**Problem:** Channel can close between state check and actual send.

**Fix:**
- Wrap send in try-catch
- Re-queue message on failure

---

### 14. ICE Candidate Order Not Guaranteed
**File:** `src/lib/p2p/P2PNetwork.ts:829-867`

**Problem:** Candidates added in received order, not generated order.

**Fix:**
- Add sequence number to candidates
- Sort before adding

---

### 15. Peer Count Race Condition
**File:** `src/lib/p2p/signaling-store.ts:156-163`

```typescript
incrementPeerCount(code: string): number {
  const room = this.getRoom(code);
  room.peerCount++;
  this.rooms.set(code, room);  // Not atomic
  return room.peerCount;
}
```

**Problem:** Read-modify-write is not atomic.

**Fix:**
- Use atomic increment if storage supports it
- Or accept minor inaccuracy for peer count

---

### 16. Incomplete Cleanup on Leave
**File:** `src/lib/p2p/P2PNetwork.ts:632-672`

**Problem:** `leaveRoom()` doesn't clean: `pendingImages`, `peerSequence`, `imageBytesSent`, `imageBytesReceived`.

**Fix:**
- Reset all state in `leaveRoom()`

---

### 17. Expiration Only Checked in getRoom()
**File:** `src/lib/p2p/signaling-store-unstorage.ts:79-88`

**Problem:** `incrementPeerCount`, `decrementPeerCount`, `setDocumentUrl` don't check expiration.

**Fix:**
- Add expiration check to all room operations

---

### 18. Image Sync Race Condition
**File:** `src/components/board/BoardView.tsx:293-325`

**Problem:** Item is added to document before image is synced. Remote peers see item with `imageId` but no image.

**Fix:**
- Sync image before adding item to document
- Or add retry mechanism for failed image syncs

---

### 19. Missing Store Cleanup on Unmount
**File:** `src/components/board/BoardView.tsx`

**Problem:** Board state persists in store after navigating away.

**Fix:**
- Add cleanup effect that clears board state on unmount

---

### 20. No Image Size Validation in put()
**File:** `src/lib/storage/ImageStore.ts:112-133`

**Problem:** `put()` method bypasses 5MB per-file limit. P2P received images have no size validation.

**Fix:**
- Add size validation to `put()` method
- Reject oversized images from P2P

---

## Quick Wins (Fix First)

1. **Add store cleanup on unmount** - BoardView.tsx
2. **Debounce board name input** - BoardView.tsx
3. **Fix canEdit logic** - useBoardState.ts
4. **Add message queue limit** - WebRTCNetworkAdapter.ts
5. **Clean pending images on peer leave** - P2PNetwork.ts

---

## Priority Order for Fixing

1. **canEdit logic** - Blocks solo users
2. **Store cleanup on unmount** - State leak
3. **Debounce name input** - Performance
4. **Message queue limit** - Memory safety
5. **One-way sync** - UI correctness
6. **Blob URL leak** - Memory leak
7. **Orphaned documents** - Storage bloat
8. **Duplicate signaling stores** - Test validity
9. Remaining medium issues

---

## Related Documentation

- `docs/llms/automerge-llms.txt` - Automerge patterns
- `docs/P2P-SIGNALING-IMPLEMENTATION.md` - Signaling details
- `docs/NAT-ICE.md` - WebRTC ICE handling
