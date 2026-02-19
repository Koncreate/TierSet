# TierBoard Development Continuation Prompt

## Project Overview

**TierBoard** is a collaborative tier list maker with real-time P2P synchronization using WebRTC and Automerge CRDTs. Multiple users can edit the same tier list simultaneously, with changes syncing automatically across all connected peers.

**Tech Stack:**

- Frontend: React 19, TypeScript, Vite, TanStack Start/Router/Query
- P2P: WebRTC (signaling via Cloudflare Workers + KV)
- Storage: unstorage (KV in prod, memory in dev), Dexie (IndexedDB)
- CRDT: Automerge for conflict-free document sync
- Deployment: Cloudflare Workers

---

## Current Implementation Status (COMPLETED ✅)

### Task A: P2P Signaling Server ✅

**Files:** `src/lib/p2p/signaling-store-unstorage.ts`, `src/routes/api/-signaling.ts`, `src/lib/p2p/P2PNetwork.ts`

- **unstorage-backed signaling store** with automatic KV/memory fallback
- In development: Uses in-memory storage (no setup required)
- In production (Cloudflare Workers): Uses KV storage with TTL-based expiration
- 12 TanStack Start server endpoints for SDP/ICE exchange
- WebRTC handshake via signaling server (offer/answer/candidates)
- ICE connection type detection (direct/STUN/TURN)

**Storage Configuration:**

```typescript
// src/routes/api/-signaling.ts
declare const SIGNALING_KV: KVNamespace | undefined;
const signalingStore = createSignalingStore(
  typeof SIGNALING_KV !== "undefined" ? SIGNALING_KV : undefined,
);
```

**wrangler.jsonc:**

```json
{
  "kv_namespaces": [
    {
      "binding": "SIGNALING_KV",
      "id": "your-kv-namespace-id",
      "preview_id": "your-preview-kv-namespace-id"
    }
  ]
}
```

### Task B: Automerge Document Sync ✅

**Files:** `src/hooks/useBoardDocument.ts`, `src/components/board/BoardView.tsx`

- `useBoardDocument()` hook with P2P integration
- Sends document deltas via `network.sendSync()` on local changes
- Listens for `sync:received` events and merges with `mergeDocumentChanges()`
- Sync status indicator ("syncing" | "synced" | "error" | "disconnected")
- Connected peer count tracking

### Task C: Peer Presence UI ✅

**Files:** `src/components/p2p/PeerList.tsx`, `src/components/p2p/ConnectionStatus.tsx`

- `PeerList` component showing connected peers with:
  - Avatar (initial letter with role-based color)
  - Host crown icon
  - Connection quality indicator (color-coded WiFi icons)
  - Connection duration timer
  - "(you)" marker for current user
- Connection quality detection based on ICE connection type:
  - **Excellent** (green): Direct P2P connection
  - **Good** (light green): STUN relay
  - **Fair** (orange): TURN relay
  - **Poor** (red): Disconnected/failed
- Host controls:
  - Kick peer button (removes specific peer)
  - Close room button (disconnects all peers, deletes room)
  - Copy room code (in `RoomCodeDisplay`)

### Task D: Image Sync ✅

**Files:** `src/lib/p2p/P2PNetwork.ts`, `src/lib/storage/ImageStore.ts`, `src/components/board/BoardView.tsx`

- **Chunked Transfer:** 16KB chunks with metadata (imageId, chunkIndex, totalChunks)
- **Reassembly:** Automatic chunk reassembly into Blob when all chunks received
- **Auto-Sync on Join:** When peer joins, all existing board images are sent automatically
- **On-Demand Request:** Peers can request missing images via `requestImage()`
- **New Upload Sync:** Newly uploaded images are synced to connected peers
- **Storage:** `ImageStore.put()` method for storing received blobs with predetermined IDs

**Message Types:**

```typescript
interface ImageChunkMessage {
  type: "image:chunk";
  imageId: string;
  chunkIndex: number;
  totalChunks: number;
  data: Uint8Array;
  senderId: string;
}
interface ImageRequestMessage {
  type: "image:request";
  imageId: string;
  senderId: string;
}
interface ImageCompleteMessage {
  type: "image:complete";
  imageId: string;
  senderId: string;
}
```

### Task F: Production Signaling Store ✅

**Files:** `src/lib/p2p/signaling-store-unstorage.ts`, `src/routes/api/-signaling.ts`, `wrangler.jsonc`

- **unstorage** package installed (~35KB bundle)
- Automatic fallback: KV in production, memory in development
- TTL-based room expiration for cleanup
- All 12 signaling endpoints updated to use async store methods

---

## Key Architecture Patterns

### Document Sync Flow

```
User Action → changeBoardDocument() → Automerge change →
  ├─→ Save to IndexedDB
  └─→ getDocumentDelta() → network.sendSync() → Data Channel →
       Peer receives → mergeDocumentChanges() → Automerge merge →
       ├─→ Update UI
       └─→ Save to IndexedDB
```

### Image Sync Flow

```
Peer A uploads image → ImageStore.store() →
  ├─→ Save locally
  └─→ network.sendImage() → chunk into 16KB pieces →
       Data Channel → Peer B receives chunks →
       reassemble → ImageStore.put() → save locally
```

### Connection Quality Detection

```typescript
// In P2PNetwork.ts oniceconnectionstatechange
if (iceState === "connected" || iceState === "completed") {
  const hasRelayCandidate = candidates.some((c) => c.candidate?.includes("relay"));
  const hasLocalCandidate = candidates.some(
    (c) => c.candidate?.includes("srflx") || c.candidate?.includes("host"),
  );

  if (hasRelayCandidate) {
    type = "turn";
    quality = "fair";
  } else if (hasLocalCandidate) {
    type = "direct";
    quality = "excellent";
  } else {
    type = "stun";
    quality = "good";
  }
}
```

### unstorage Signaling Store

```typescript
// src/lib/p2p/signaling-store-unstorage.ts
export function createSignalingStore(kvBinding?: KVNamespace): SignalingStore {
  const storage = createStorage({
    driver: kvBinding ? createKVDriver(kvBinding) : undefined,
    // undefined = in-memory for development
  });
  // ... store implementation
}
```

---

## Remaining Limitations

1. **No Authentication:** Anyone with room code can join. Consider adding auth.
2. **No TURN Fallback:** Direct P2P may fail for some users behind strict NATs.
3. **No Message Persistence:** Chat/messages lost on page refresh.
4. **Single Board Per Tab:** Cannot have multiple boards open simultaneously.

---

## Next Priority Tasks

### Priority 1: Add Tests (Task E)

**Why:** Ensure reliability of P2P sync and image transfer.

**Test files to create:**

- `src/lib/p2p/__tests__/P2PNetwork.test.ts`
- `src/lib/p2p/__tests__/image-transfer.test.ts`
- `src/hooks/__tests__/useBoardDocument.test.tsx`
- `src/lib/storage/__tests__/ImageStore.test.ts`

**Key test scenarios:**

- Two peers syncing document changes simultaneously
- Image chunk loss/recovery
- Peer join during active editing
- Connection quality changes
- Host kick/close room functionality

**Estimated effort:** 4-6 hours

---

### Priority 2: Deployment Documentation (Task M)

**Why:** Enable production deployment.

**Files to create:**

- `DEPLOYMENT.md` (step-by-step deployment guide)
- `.env.example` (required environment variables)
- Update `README.md` with deployment section

**Topics to cover:**

1. Cloudflare Workers account setup
2. KV namespace creation (`wrangler kv:namespace create`)
3. TURN server configuration (Cloudflare Calls or self-hosted)
4. Environment variables (TURN credentials, etc.)
5. Build and deploy commands
6. Troubleshooting common issues

**Estimated effort:** 2 hours

---

### Priority 3: Chat Feature (Task G)

**Why:** Enhances collaboration experience.

**Files to create:**

- `src/components/p2p/ChatPanel.tsx`
- `src/hooks/useP2PChat.ts`

**Features:**

- Real-time chat via P2P data channel
- Message list with sender name/timestamp
- Auto-scroll to latest
- Typing indicator (optional)

**Estimated effort:** 2-3 hours

---

### Priority 4: Export/Import with Images (Task H)

**Why:** Data portability and backup.

**Files to create:**

- `src/lib/export/board-exporter.ts`
- `src/lib/export/board-importer.ts`
- `src/components/board/ExportImportModal.tsx`

**Format:**

```json
{
  "version": "1.0",
  "board": {
    /* BoardDocument */
  },
  "images": [{ "id": "...", "data": "base64", "mimeType": "image/png" }]
}
```

**Estimated effort:** 3-4 hours

---

### Priority 5: Undo/Redo (Task I)

**Why:** Better UX for mistake correction.

**Files to create:**

- `src/lib/documents/useBoardHistory.ts`
- `src/components/board/HistoryControls.tsx`

**Features:**

- Undo/redo local changes
- Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z)
- History limit (e.g., 50 states)

**Estimated effort:** 3-4 hours

---

## Build & Test Commands

```bash
# Development
npm run dev          # Start dev server (port 3000)

# Build
npm run build        # Full build (client + server)
npm run preview      # Preview production build

# Quality
npx oxlint src/      # Lint
npx oxfmt src/       # Format
npm test             # Run tests

# Deploy
npm run deploy       # Build + wrangler deploy
```

---

## Current Build Status

```
✅ oxlint: 0 warnings, 0 errors
✅ oxfmt: formatted
✅ Tests: 18/18 passing (signaling-store tests)
✅ Build: succeeds (~12s)
✅ unstorage: integrated (~35KB bundle)
```

---

## Key Files Reference

### P2P Core

- `src/lib/p2p/P2PNetwork.ts` - WebRTC manager, data channel, sync, image transfer
- `src/lib/p2p/types.ts` - TypeScript types and Zod schemas for P2P messages
- `src/lib/p2p/signaling-store-unstorage.ts` - **NEW** unstorage-backed signaling store
- `src/lib/p2p/ice-servers.ts` - ICE/TURN server configuration
- `src/lib/p2p/room-auth.ts` - Room code generation and password hashing

### Signaling API

- `src/routes/api/-signaling.ts` - 12 server endpoints for WebRTC signaling (updated for unstorage)

### React Hooks

- `src/hooks/useP2PNetwork.ts` - P2P network React hook
- `src/hooks/useBoardDocument.ts` - Board document with P2P sync
- `src/hooks/useImageStore.ts` - Image storage hook

### Components

- `src/components/board/BoardView.tsx` - Main board UI with P2P integration
- `src/components/p2p/PeerList.tsx` - Connected peers list with quality indicators
- `src/components/p2p/ConnectionStatus.tsx` - Connection + sync status indicator
- `src/components/p2p/RoomCodeDisplay.tsx` - Room code with copy button
- `src/components/p2p/JoinRoomModal.tsx` - Modal for joining rooms

### Storage

- `src/lib/storage/ImageStore.ts` - Image storage with put() for P2P received images
- `src/lib/storage/BoardStore.ts` - Board document storage
- `src/lib/storage/db.ts` - Dexie IndexedDB schema

### Configuration

- `wrangler.jsonc` - Cloudflare Workers config with KV namespace binding
- `package.json` - Dependencies including unstorage

---

## How to Continue Development

1. **Pick a priority task** from the list above (recommended order: E → M → G → H → I)

2. **Review the architecture** section to understand existing patterns

3. **Follow existing conventions:**
   - TypeScript with strict types
   - Zod schemas for runtime validation
   - EventEmitter for P2P events
   - TanStack Start for server functions
   - Automerge for CRDT sync
   - unstorage for flexible storage backends

4. **Run quality checks** before committing:

   ```bash
   npm run build && npx oxlint src/ && npm test
   ```

5. **Update this document** with completed work

---

## Deployment Setup (Required)

Before deploying to production:

```bash
# 1. Create KV namespace
wrangler kv:namespace create "SIGNALING_KV"

# 2. Update wrangler.jsonc with the namespace ID
# Edit: "id": "your-actual-namespace-id"
# Edit: "preview_id": "your-preview-namespace-id"

# 3. Deploy
npm run deploy
```

---

## Common Gotchas

1. **Binary data in data channels:** Must send metadata as JSON first, then binary. Receiver needs to track state.

2. **Automerge changes:** Always use `changeBoardDocument()` wrapper, never modify doc directly.

3. **Image chunking:** 16KB chunks work well. Larger chunks may fail on slow connections.

4. **Connection quality:** Only accurate after ICE gathering completes (~2-5 seconds after connection).

5. **KV in development:** unstorage automatically falls back to in-memory, no setup needed.

6. **Peer events:** Always clean up event listeners in useEffect cleanup functions.

7. **unstorage async:** All store methods are async now - make sure to await them.

---

## Contact/Questions

If you encounter issues:

1. Check existing tests in `src/lib/p2p/__tests__/`
2. Review the signaling flow in `-signaling.ts`
3. Check browser console for P2P debug logs (prefixed with `[P2PNetwork]`, `[BoardView]`)
4. Verify ICE connection state in Chrome DevTools → WebRTC Internals
5. Check KV binding in Cloudflare dashboard
