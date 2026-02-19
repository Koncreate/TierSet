# TierBoard Development - New Chat Context

## Project Summary

**TierBoard** = Collaborative tier list maker with real-time P2P sync via WebRTC + Automerge CRDTs.

**Stack:** React 19, TypeScript, Vite, TanStack Start, Cloudflare Workers, unstorage, Dexie (IndexedDB), Automerge

---

## ✅ COMPLETED TASKS

| Task  | Description                                                | Status      |
| ----- | ---------------------------------------------------------- | ----------- |
| **A** | P2P Signaling Server (WebRTC SDP/ICE via Cloudflare)       | ✅ Complete |
| **B** | Automerge Document Sync (CRDT over P2P data channels)      | ✅ Complete |
| **C** | Peer Presence UI (connection quality, host controls)       | ✅ Complete |
| **D** | Image Sync (16KB chunked transfer, auto-sync on join)      | ✅ Complete |
| **F** | Production Signaling Store (unstorage: KV/memory fallback) | ✅ Complete |

---

## Key Files

### P2P Core

- `src/lib/p2p/P2PNetwork.ts` - WebRTC manager, data channel, sync, image transfer
- `src/lib/p2p/signaling-store-unstorage.ts` - unstorage-backed store (KV in prod, memory in dev)
- `src/lib/p2p/types.ts` - TypeScript types, Zod schemas, message types
- `src/routes/api/-signaling.ts` - 12 TanStack Start endpoints for signaling

### React Integration

- `src/hooks/useP2PNetwork.ts` - P2P network hook
- `src/hooks/useBoardDocument.ts` - Board doc with P2P sync integration
- `src/components/board/BoardView.tsx` - Main UI, P2P integration
- `src/components/p2p/PeerList.tsx` - Peer list with connection quality
- `src/components/p2p/ConnectionStatus.tsx` - Sync status indicator

### Storage

- `src/lib/storage/ImageStore.ts` - Image storage with `put()` for P2P received images
- `src/lib/storage/db.ts` - Dexie IndexedDB schema

### Config

- `wrangler.jsonc` - Cloudflare Workers + KV namespace binding

---

## Architecture Highlights

### Document Sync

```
User change → changeBoardDocument() → Automerge →
  ├─ Save to IndexedDB
  └─ sendSync() → Data Channel → Peer merges via mergeDocumentChanges()
```

### Image Sync

```
Upload → sendImage() → 16KB chunks → Peer reassembles → ImageStore.put()
Auto-send all images when peer joins
On-demand request via requestImage()
```

### Connection Quality

```typescript
// Detected via ICE candidate analysis
direct (srflx/host) → excellent
stun → good
turn (relay) → fair
disconnected → poor
```

### unstorage Signaling

```typescript
// Automatic fallback based on environment
const signalingStore = createSignalingStore(
  typeof SIGNALING_KV !== "undefined" ? SIGNALING_KV : undefined,
);
// KV in production, memory in development
```

---

## 📋 NEXT PRIORITY TASKS

### 1. Task E: Add Tests (HIGH PRIORITY)

**Files to create:**

- `src/lib/p2p/__tests__/P2PNetwork.test.ts`
- `src/lib/p2p/__tests__/image-transfer.test.ts`
- `src/hooks/__tests__/useBoardDocument.test.tsx`

**Test scenarios:**

- Two peers syncing simultaneously
- Image chunk loss/recovery
- Connection quality changes
- Host kick/close room

**Estimated:** 4-6 hours

---

### 2. Task M: Deployment Docs (HIGH PRIORITY)

**Files to create:**

- `DEPLOYMENT.md`
- `.env.example`
- Update `README.md`

**Topics:**

- Cloudflare Workers setup
- KV namespace creation
- TURN server config
- Deploy commands

**Estimated:** 2 hours

---

### 3. Task G: Chat Feature (MEDIUM)

**Files:** `src/components/p2p/ChatPanel.tsx`, `src/hooks/useP2PChat.ts`

**Features:**

- Real-time chat via data channel
- Message list with sender/timestamp
- Auto-scroll

**Estimated:** 2-3 hours

---

### 4. Task H: Export/Import (MEDIUM)

**Files:** `src/lib/export/`, `src/components/board/ExportImportModal.tsx`

**Format:** JSON with base64 images or ZIP

**Estimated:** 3-4 hours

---

### 5. Task J: Mobile Responsiveness (MEDIUM)

- Touch-friendly drag-and-drop
- Collapsible peer list
- Responsive tier layout

**Estimated:** 2-3 hours

---

## Build Commands

```bash
npm run dev       # Dev server (port 3000)
npm run build     # Full build
npm test          # Run tests
npx oxlint src/   # Lint
npx oxfmt src/    # Format
npm run deploy    # Build + wrangler deploy
```

---

## Current Status

```
✅ Build: passes (~12s)
✅ Lint: 0 warnings, 0 errors
✅ Tests: 18/18 passing (signaling-store tests)
✅ unstorage: integrated (~35KB)
```

---

## Deployment Setup (Required Before Prod)

```bash
# Create KV namespace
wrangler kv:namespace create "SIGNALING_KV"

# Update wrangler.jsonc with namespace IDs
# Edit: "id" and "preview_id" fields

# Deploy
npm run deploy
```

---

## Common Gotchas

1. **Binary data:** Send metadata JSON first, then binary chunk
2. **Automerge:** Always use `changeBoardDocument()` wrapper
3. **Image chunks:** 16KB works well, larger may fail on slow connections
4. **unstorage async:** All store methods are async - use await
5. **KV in dev:** unstorage auto-falls back to memory, no setup needed
6. **Event cleanup:** Always remove listeners in useEffect cleanup

---

## How to Continue

1. Pick a task from the priority list above
2. Review existing code patterns in related files
3. Follow conventions: TypeScript strict types, Zod validation, async/await
4. Run `npm run build && npx oxlint src/ && npm test` before committing
5. Update docs with completed work

---

## Questions?

- Check `src/lib/p2p/__tests__/signaling-store.test.ts` for existing test patterns
- Review `docs/CONTINUATION_PROMPT.md` for detailed architecture
- Check browser console for `[P2PNetwork]` and `[BoardView]` debug logs
- Cloudflare dashboard for KV namespace management
