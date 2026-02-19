# TierBoard - Next Steps

## Current Status: P2P Signaling Complete ✅

Tasks A-D and F have been fully implemented:

- ✅ Task A: P2P Signaling Server (WebRTC, SDP/ICE exchange)
- ✅ Task B: Automerge Document Sync over P2P
- ✅ Task C: Peer Presence UI (connection quality, host controls)
- ✅ Task D: Image Sync (chunked blob transfer)
- ✅ Task F: Production Signaling Store with unstorage (KV in prod, memory in dev)

---

## Completed: Task F - Production Signaling Store

**Implementation:** unstorage-backed signaling store

- **Bundle size:** ~35KB (acceptable tradeoff for flexibility)
- **Development:** In-memory storage (zero setup)
- **Production:** Cloudflare KV with TTL expiration
- **Files:** `src/lib/p2p/signaling-store-unstorage.ts`, `wrangler.jsonc`

**Setup required before deployment:**

```bash
# Create KV namespace
wrangler kv:namespace create "SIGNALING_KV"

# Update wrangler.jsonc with namespace IDs
# Then deploy
npm run deploy
```

### Task E: Add Tests for P2P Sync & Image Transfer

**Priority:** High  
**Estimated Effort:** 2-3 hours

**Files to Create/Modify:**

- `src/lib/p2p/__tests__/P2PNetwork.test.ts`
- `src/lib/p2p/__tests__/image-transfer.test.ts`
- `src/hooks/__tests__/useBoardDocument.test.tsx`

**Test Coverage Needed:**

1. P2PNetwork class
   - Connection establishment (create/join room)
   - Document sync (send/receive deltas)
   - Image chunking and reassembly
   - Connection quality detection
   - Peer kick/close room functionality

2. useBoardDocument hook
   - P2P sync integration
   - Remote change merging
   - Sync status updates

3. Integration tests
   - Two peers syncing document changes
   - Image transfer between peers
   - Peer join/leave scenarios

---

### Task F: Production Signaling Store (Cloudflare Workers)

**Priority:** High (Required for Deployment)  
**Estimated Effort:** 3-4 hours

**Problem:** Current signaling store is in-memory. Rooms are lost on server restart and don't persist across Workers instances.

**Solution:** Use Cloudflare KV or Durable Objects for signaling state.

**Files to Create/Modify:**

- `src/lib/p2p/signaling-store-kv.ts` (new)
- `src/lib/p2p/signaling-store.ts` (refactor to use interface)
- `wrangler.jsonc` (add KV namespace binding)

**Implementation:**

```typescript
// Interface for signaling store
interface SignalingStore {
  createRoom(code: string, hostId: string, ttlMs: number): SignalingRoom;
  getRoom(code: string): SignalingRoom | null;
  deleteRoom(code: string): void;
  setHostOffer(code: string, offer: RTCSessionDescriptionInit): void;
  getHostOffer(code: string): RTCSessionDescriptionInit | null;
  // ... etc
}

// KV-backed implementation for Cloudflare Workers
class KVSignalingStore implements SignalingStore {
  constructor(private kv: KVNamespace) {}
  // ... implement with kv.get/put/delete
}
```

**wrangler.jsonc:**

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "SIGNALING_KV",
      "id": "your-kv-namespace-id",
    },
  ],
}
```

---

### Task G: Add Chat/Messaging Feature

**Priority:** Medium  
**Estimated Effort:** 2-3 hours

**Files to Create/Modify:**

- `src/components/p2p/ChatPanel.tsx` (new)
- `src/components/p2p/ChatMessage.tsx` (new)
- `src/hooks/useP2PChat.ts` (new)
- `src/components/board/BoardView.tsx` (integrate chat panel)

**Features:**

- Real-time chat between peers via P2P data channel
- Message history (stored locally during session)
- Show sender name and timestamp
- Auto-scroll to latest message
- Typing indicator (optional)

**Implementation:**

```typescript
// useP2PChat hook
interface UseP2PChatReturn {
  messages: ChatMessage[];
  sendMessage: (content: string) => void;
  clearMessages: () => void;
}

// ChatMessage type
interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
}
```

---

### Task H: Board Export/Import with Images

**Priority:** Medium  
**Estimated Effort:** 2-3 hours

**Files to Create/Modify:**

- `src/lib/export/board-exporter.ts` (new)
- `src/lib/export/board-importer.ts` (new)
- `src/components/board/ExportImportModal.tsx` (new)
- `src/components/board/BoardView.tsx` (add import button)

**Features:**

- Export board with embedded images (base64 or ZIP)
- Import board from JSON/ZIP file
- Handle image conflicts (skip/overwrite/rename)
- Show import preview before confirming

**Export Format:**

```json
{
  "version": "1.0",
  "board": {
    /* BoardDocument */
  },
  "images": [
    {
      "id": "image-id",
      "data": "base64-encoded-blob",
      "mimeType": "image/png"
    }
  ]
}
```

---

### Task I: Undo/Redo for Board Changes

**Priority:** Medium  
**Estimated Effort:** 3-4 hours

**Files to Create/Modify:**

- `src/lib/documents/useBoardHistory.ts` (new)
- `src/components/board/HistoryControls.tsx` (new)
- `src/hooks/useBoardDocument.ts` (integrate history)

**Features:**

- Undo/redo local changes
- Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z)
- History limit (e.g., 50 states)
- Clear history on sync conflict resolution

**Implementation:**

```typescript
interface UseBoardHistoryReturn {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  pushState: (doc: BoardDocument) => void;
}
```

---

### Task J: Mobile Responsiveness Improvements

**Priority:** Medium  
**Estimated Effort:** 2-3 hours

**Files to Modify:**

- `src/components/board/BoardView.tsx`
- `src/components/tier-list/TierList.tsx`
- `src/components/p2p/PeerList.tsx`
- `src/styles/` (add mobile-specific styles)

**Improvements Needed:**

- Touch-friendly drag-and-drop for mobile
- Collapsible peer list on small screens
- Mobile-optimized image uploader
- Responsive tier list layout (stack on mobile)
- Bottom sheet modals for mobile

---

### Task K: Accessibility (a11y) Improvements

**Priority:** Medium  
**Estimated Effort:** 2-3 hours

**Files to Modify:**

- All component files (add ARIA attributes)
- `src/components/board/BoardView.tsx`
- `src/components/p2p/*.tsx`

**Improvements Needed:**

- ARIA labels for all interactive elements
- Keyboard navigation for drag-and-drop
- Screen reader announcements for sync status
- Focus management in modals
- Color contrast improvements
- Skip links for navigation

---

### Task L: Performance Optimizations

**Priority:** Low  
**Estimated Effort:** 2-3 hours

**Areas to Optimize:**

1. Image lazy loading in gallery
2. Virtual scrolling for large item lists
3. Debounced sync (batch rapid changes)
4. Image compression before transfer
5. Memoization of expensive computations

**Files to Modify:**

- `src/components/tier-list/ItemGallery.tsx`
- `src/hooks/useBoardDocument.ts`
- `src/lib/p2p/P2PNetwork.ts`

---

### Task M: Deployment Documentation

**Priority:** High (Required for Production)  
**Estimated Effort:** 1-2 hours

**Files to Create:**

- `DEPLOYMENT.md`
- `.env.example`
- Update `README.md` with deployment steps

**Documentation Should Cover:**

1. Cloudflare Workers setup
2. KV namespace configuration
3. TURN server configuration (if using Cloudflare Calls)
4. Environment variables
5. Build and deploy commands
6. Troubleshooting guide

---

## Suggested Order

For a production-ready release, prioritize in this order:

1. **Task E** - Add Tests (ensure reliability)
2. **Task M** - Deployment Documentation (enable deployment)
3. **Task G** - Chat Feature (user experience)
4. **Task H** - Export/Import (data portability)
5. **Task J** - Mobile Responsiveness (broader audience)
6. **Task K** - Accessibility (inclusive design)
7. **Task I** - Undo/Redo (polish)
8. **Task L** - Performance (optimization)

---

## Quick Start for Next Developer

```bash
# 1. Review current implementation
cd /home/AQ/tierset

# 2. Run tests to ensure baseline
npm test

# 3. Run build to ensure no errors
npm run build

# 4. Start dev server for manual testing
npm run dev

# 5. Pick a task from above and implement!
```

---

## Architecture Notes

### Current Limitations

1. **In-Memory Signaling:** Rooms are lost on server restart. Use Task F to fix.
2. **No Authentication:** Anyone with room code can join. Consider adding auth.
3. **No TURN Fallback:** Direct P2P may fail for some users behind strict NATs.
4. **No Message Persistence:** Chat/messages lost on page refresh.
5. **Single Board Per Tab:** Cannot have multiple boards open simultaneously.

### Future Enhancements (Beyond Task List)

- User accounts and board ownership
- Board templates and presets
- Real-time cursor presence (see where peers are looking)
- Board versioning and snapshots
- Analytics and usage metrics
- Custom tier configurations
- Collaborative editing with conflict resolution UI
