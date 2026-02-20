# Document URL Sync Issues - Debug Report & Fix Plan

**Date:** 2026-02-20  
**Status:** Implementation complete but sync not working  
**Severity:** 🔴 CRITICAL - Multi-peer collaboration broken

---

## Problem Summary

The Room-Code Document URL Sharing implementation is **architecturally correct**, but there are **critical runtime bugs** preventing clients from receiving and using the host's document URL. As a result, each peer creates their own document, and changes don't sync across peers.

### Evidence from Logs

```
Host document URL:   automerge:3KuSDVcmntL42BZ5NUCwnerWrvDF
Client document URL: automerge:2f4YfRr65tvodSizfnQmDQmNFYrd  ← DIFFERENT!
```

Messages ARE being sent (WebRTC works), but to **different documents**.

---

## Root Cause Analysis

### Issue 1: `joinRoom()` Return Value Not Propagated

**Location:** `src/hooks/useP2PNetwork.ts`

**Problem:** The `useP2PNetwork` hook wraps `P2PNetwork.joinRoom()` but doesn't return the new `{ room, documentUrl }` structure.

**Current code (likely):**
```typescript
const joinRoom = useCallback(async (code: string, options?: { password?: string }) => {
  await network.joinRoom(code, options);  // ← Return value discarded!
}, [network]);
```

**Should be:**
```typescript
const joinRoom = useCallback(async (code: string, options?: { password?: string }) => {
  return await network.joinRoom(code, options);  // ← Return { room, documentUrl }
}, [network]);
```

**Error from logs:**
```
TypeError: Cannot destructure property 'documentUrl' of '(intermediate value)' as it is undefined.
    at BoardView.tsx:204:17
```

---

### Issue 2: Race Condition - State Update After Hook Initialization

**Location:** `src/components/board/BoardView.tsx:handleJoinRoom`

**Problem:** The document URL is set via state AFTER `useBoardDocument` has already initialized.

**Current flow:**
```typescript
const handleJoinRoom = async (code: string, password?: string) => {
  // 1. Join room and get URL from server
  const { documentUrl } = await joinRoom(code, password ? { password } : undefined);
  
  // 2. Set state (ASYNC - doesn't update immediately!)
  if (documentUrl) {
    setRoomDocumentUrl(documentUrl);
  }
  
  // 3. Connect to room (triggers useBoardDocument to initialize)
  const success = await connectToRoom(network);
  // ← useBoardDocument runs NOW, but roomDocumentUrl is STILL null!
};
```

**Why this fails:**
1. React state updates are **asynchronous**
2. `useBoardDocument` runs during render, sees `roomDocumentUrl === null`
3. Creates NEW document instead of finding existing one
4. State update completes too late

---

### Issue 3: `useBoardDocument` Doesn't Re-initialize When URL Changes

**Location:** `src/lib/automerge/AutomergeRepoProvider.tsx`

**Problem:** The `useEffect` only runs once. When `documentUrl` changes from `null` → actual URL, the hook doesn't re-fetch the document.

**Current code:**
```typescript
useEffect(() => {
  if (!repo) return;
  
  async function initDoc() {
    if (documentUrl) {
      // Client: Use URL from room
      docHandle = await repo.find<BoardDocument>(documentUrl);
    } else {
      // Host: Create new document
      const result = await getOrCreateBoardDoc(repo, boardId, initialData);
    }
    setDocUrl(url);
    setHandle(docHandle);
    setIsLoading(false);
  }
  
  initDoc();
}, [repo, boardId, documentUrl]);  // ← Dependencies exist, but...
```

**Why it fails:**
- Even if `documentUrl` changes, the effect runs again but `setDocUrl` is called with a NEW value
- React's `useDocument` hook might not handle URL changes gracefully
- The document handle is already set, causing stale references

---

### Issue 4: Client Creates Document Before Receiving URL

**Location:** `src/components/board/BoardView.tsx`

**Problem:** The board component mounts and calls `useBoardDocument` BEFORE the user even clicks "Join Room".

**Flow:**
```
1. User navigates to /board/jgbbuw64x7orjd6zzlk2fy3f
   ↓
2. BoardView mounts → useBoardDocument() runs
   ↓
3. roomDocumentUrl is null (user hasn't joined room yet!)
   ↓
4. useBoardDocument creates NEW document: automerge:abc123
   ↓
5. User clicks "Join Room" → enters code
   ↓
6. joinRoom() returns host's URL: automerge:xyz789
   ↓
7. setRoomDocumentUrl("automerge:xyz789")
   ↓
8. useBoardDocument should re-run... but doesn't switch documents!
```

**Key insight:** The board document is created **too early** - before we know whether we're hosting or joining.

---

### Issue 5: `getOrCreateBoardDoc` Always Creates for New boardId

**Location:** `src/lib/automerge/AutomergeRepoProvider.tsx`

**Problem:** When `documentUrl` is null, `getOrCreateBoardDoc` is called with just `boardId`. It checks `boardIdToUrlMap`, but if the boardId isn't in the map, it **creates a new document** instead of waiting for the URL.

**Current code:**
```typescript
export async function getOrCreateBoardDoc(
  repo: Repo,
  boardId: string,
  initialData?: Partial<BoardDocument>
): Promise<{ handle: DocHandle<BoardDocument>; url: AutomergeUrl }> {
  // Check if we already have a URL for this boardId
  let url = boardIdToUrlMap.get(boardId);
  
  if (url) {
    const handle = await repo.find<BoardDocument>(url);
    return { handle, url };
  }
  
  // ← No URL found, CREATE NEW DOCUMENT
  const handle = repo.create<BoardDocument>(initialBoard as BoardDocument);
  url = handle.url;
  boardIdToUrlMap.set(boardId, url);
  return { handle, url };
}
```

**Why this is problematic:**
- Client joins room → has boardId but no URL yet
- `getOrCreateBoardDoc` doesn't find URL in map
- Creates NEW document instead of waiting
- Now client has wrong document

---

## Files Requiring Changes

### 1. `src/hooks/useP2PNetwork.ts`
**Change:** Update `joinRoom` to return the value from `P2PNetwork.joinRoom()`

### 2. `src/components/board/BoardView.tsx`
**Changes:**
- Delay document initialization until AFTER room join
- OR: Pass boardId to useBoardDocument ONLY after we know the URL
- Consider: Don't create document until room state is known

### 3. `src/lib/automerge/AutomergeRepoProvider.tsx`
**Changes:**
- Handle document URL changes gracefully
- Reset state when URL changes
- Consider: Add explicit "reset" or "reinitialize" mechanism

### 4. `src/lib/automerge/AutomergeRepoProvider.tsx` - `getOrCreateBoardDoc`
**Change:** Accept optional `documentUrl` parameter to bypass map lookup

---

## Proposed Solutions

### Solution A: Delay Document Creation (RECOMMENDED)

**Idea:** Don't create/find the document until we know whether we're hosting or joining.

**Implementation:**
1. Add `isJoiningRoom` state to BoardView
2. Pass `null` boardId to `useBoardDocument` until room state is resolved
3. Once room is joined/created, set the actual boardId AND documentUrl
4. `useBoardDocument` only initializes when boardId is non-null

**Pros:**
- Clean separation of concerns
- No race conditions
- Document created at correct time

**Cons:**
- Shows loading state longer
- Requires UI changes

---

### Solution B: Force Re-initialization on URL Change

**Idea:** When `roomDocumentUrl` changes, force `useBoardDocument` to completely reinitialize.

**Implementation:**
1. Add `key` prop to force component re-render when URL changes
2. OR: Add explicit `reset()` function in hook
3. OR: Use a ref to track if we've already initialized with a URL

**Example:**
```typescript
// BoardView.tsx
const { doc, change, ... } = useBoardDocument(
  boardId, 
  undefined, 
  roomDocumentUrl,
  roomDocumentUrl  // ← Use as key to force re-init
);
```

**Pros:**
- Minimal code changes
- Fixes the race condition

**Cons:**
- Still creates wrong document initially (wasted work)
- Might cause UI flicker

---

### Solution C: Separate Host/Client Flows (MOST ROBUST)

**Idea:** Completely separate the host and client initialization paths.

**Implementation:**
1. BoardView has three states: `idle` | `hosting` | `joining`
2. In `idle` state: Don't call `useBoardDocument` at all
3. User clicks "Create Room" OR "Join Room"
4. Based on choice, initialize with correct parameters
5. Only then call `useBoardDocument` with known URL (for clients) or null (for hosts)

**Pros:**
- Most explicit and maintainable
- No wasted document creation
- Clear state machine

**Cons:**
- Most code changes
- Requires refactoring BoardView

---

## Testing Checklist

After fixes are applied, verify:

- [ ] **Host creates room** → Document URL stored in signaling server
- [ ] **Client joins room** → Receives URL in joinRoom() response
- [ ] **Client uses URL** → `repo.find(url)` called, not `repo.create()`
- [ ] **Both see same URL** → Console logs show identical automerge: URLs
- [ ] **Host adds item** → Client sees item appear
- [ ] **Client moves item** → Host sees move
- [ ] **Multiple clients** → All sync to same document
- [ ] **Refresh page** → Client rejoins and syncs correctly
- [ ] **Leave and rejoin** → Document URL cleared and re-fetched

---

## Debug Logging to Add

Add these logs to help diagnose issues:

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

## Priority Order

1. **Fix `useP2PNetwork` return value** (Issue 1) - 5 minutes
2. **Fix race condition in BoardView** (Issue 2) - 15 minutes  
3. **Fix useBoardDocument re-initialization** (Issue 3) - 20 minutes
4. **Consider Solution A or C** for long-term robustness - 1-2 hours

---

## Additional Context

### Working Features (Don't Break)
- ✅ P2P connection establishment
- ✅ WebRTC data channel
- ✅ Automerge Repo integration
- ✅ Message sending (WebRTCNetworkAdapter.sendAutomergeMessage)
- ✅ Signaling server storage of documentUrl

### What's Broken
- ❌ Client doesn't receive documentUrl from joinRoom()
- ❌ Client creates wrong document
- ❌ Changes don't sync (different documents)

---

## Next Steps for New Chat Session

1. **Read this document** to understand the issues
2. **Check `useP2PNetwork.ts`** - Verify joinRoom return type
3. **Add debug logs** to trace documentUrl flow
4. **Implement Solution A** (delay document creation) OR **Solution B** (force re-init)
5. **Test with two browser windows** - Verify same URL on both
6. **Verify sync works** - Add item on host, see on client

---

## Related Files

- `src/hooks/useP2PNetwork.ts` - P2P network hook
- `src/hooks/useRoomConnection.ts` - Room connection hook
- `src/components/board/BoardView.tsx` - Main board component
- `src/lib/automerge/AutomergeRepoProvider.tsx` - Automerge integration
- `src/lib/p2p/P2PNetwork.ts` - P2P network class
- `src/routes/api/-signaling.ts` - Signaling API
- `DOCUMENT_URL_SYNC_FIX.md` - Original implementation doc

---

## Key Insight

**The architecture is correct.** The signaling server stores and returns the document URL properly. The bug is in the **React state management and timing** - the client receives the URL but doesn't use it because:

1. The hook return value is discarded
2. State updates are async
3. Document initialization happens before URL is available
4. Hook doesn't re-initialize when URL changes

Fix these timing/state issues and sync will work.
