# Plan 9: Persist TanStack Store to IndexedDB with Dexie

> Add persistence to TanStack Store so critical app state (room codes, peer count, user settings) survives page reloads, while keeping TanStack Store's in-memory reactivity.

---

## Problem Statement

**Current Limitations:**

1. **P2P state lost on reload** - In-memory Maps are intentional for WebRTC; persistence would require significant architecture changes
2. **Store not persisted** - TanStack Store is designed as in-memory; could add localStorage persistence as enhancement
3. **Peer count race** - Read-modify-write is acceptable for peer counting (non-critical)

**Goal:** Persist critical app state to IndexedDB using Dexie so data survives page reloads without changing the in-memory store architecture.

---

## What to Persist

### ✅ Persist These (Critical for UX)

| Store | Fields | Why Persist? |
|-------|--------|--------------|
| `appStore` | `currentBoard`, `roomCode`, `isHost`, `connectedPeers` | Restore room state on reload |
| `peerPresenceStore` | `peers` array | Show who was in the room |
| `userSettingsStore` | `username`, `theme`, `audioEnabled`, `videoEnabled` | User preferences survive reload |

### ❌ Don't Persist (Transient)

| Store | Why Skip? |
|-------|-----------|
| `connectionStatus` | Re-computed on reconnect |
| `isLoading`, `error` | Reset on fresh load |
| `isReconnecting` | Temporary state |

---

## Implementation Plan

### Phase 1: Add Dexie Tables (30 min)

Add new tables to your existing Dexie database (`src/lib/storage/db.ts`):

```typescript
export interface StoreSnapshot {
  id: "appStore" | "peerPresenceStore" | "userSettingsStore";
  data: Record<string, unknown>;  // Serialized store state
  updatedAt: number;
  expiresAt?: number;  // Optional expiry (24h default)
}

export interface UserSetting {
  key: "theme" | "username" | "audioEnabled" | "videoEnabled";
  value: string | boolean | number;
  updatedAt: number;
}

export interface TierBoardDB extends Dexie {
  // ... existing tables ...
  stores: Table<StoreSnapshot, string>;
  userSettings: Table<UserSetting, string>;
}
```

Update database version and schema:
```typescript
const DB_VERSION = 3; // Incremented from previous

db.version(DB_VERSION).stores({
  // ... existing stores ...
  stores: "id, updatedAt",
  userSettings: "key, updatedAt",
});
```

---

### Phase 2: Create Persistence Layer (1 hour)

Create `src/lib/persistence/storePersistence.ts`:

**Core Functions:**

1. **`saveStoreSnapshot(storeName: string, data: unknown)`**
   - Serialize store state
   - Write to Dexie with timestamp
   - Debounce saves (500ms delay)

2. **`loadStoreSnapshot(storeName: string)`**
   - Read from Dexie
   - Validate data structure
   - Return parsed data or null

3. **`subscribeToChanges(storeName: string, store: Store, keys: string[])`**
   - Subscribe to store changes
   - Auto-save debounced updates
   - Return unsubscribe function

4. **`clearStoreSnapshot(storeName: string)`**
   - Remove snapshot from Dexie
   - Use on logout/leave room

5. **`cleanupExpiredSnapshots(maxAge: number)`**
   - Remove snapshots older than threshold
   - Run on app initialization

**Utilities:**
- `serialize(data)` - Safe JSON stringify with error handling
- `deserialize(str)` - Safe JSON parse with error handling
- `isValidSnapshot(data)` - Type guard for validation

---

### Phase 3: Wire Up TanStack Store (1 hour)

For each store to persist:

#### On Load (App Initialization)

In `src/routes/__root.tsx` or app entry point:

```
1. Check Dexie for saved snapshot
2. If exists and valid, restore to store state
3. If not, use default initial state
4. Log restoration (debug mode)
```

#### On Change (Auto-Save)

In each store file (`appStore.ts`, `userSettingsStore.ts`):

```
1. Subscribe to store changes
2. Debounce saves (500ms delay)
3. Save to Dexie with timestamp
4. Log errors, don't crash app
5. Return unsubscribe cleanup
```

#### On Clear (Leave Room/Logout)

In `useRoomConnection.ts` or relevant hooks:

```
1. Call clearStoreSnapshot()
2. Reset store to defaults
3. Confirm cleanup in logs
```

---

### Phase 4: Handle Edge Cases (30 min)

| Scenario | Solution |
|----------|----------|
| **Multiple tabs open** | Save with timestamp, load newest on startup |
| **Stale data (>24h old)** | Auto-expire old snapshots via `cleanupExpiredSnapshots()` |
| **Storage quota exceeded** | Catch errors, fallback to memory-only, warn user |
| **Corrupt data** | Try-catch in deserialize, use defaults if parse fails |
| **Concurrent writes** | Last-write-wins (acceptable for this use case) |
| **SSR/Hydration** | Only persist on client (`typeof window !== 'undefined'`) |

---

### Phase 5: Testing (1 hour)

**Manual Test Scenarios:**

1. **Room State Persistence**
   - Join room as host
   - Note room code and peer count
   - Refresh page
   - **Verify:** Room code, peer count restored

2. **User Settings Persistence**
   - Change theme to dark
   - Change username
   - Toggle audio/video settings
   - Refresh page
   - **Verify:** All settings persist

3. **Cleanup on Leave**
   - Join room
   - Click "Leave Room"
   - Refresh page
   - **Verify:** No stale room data

4. **Multi-Tab Behavior**
   - Open 2 tabs
   - Change settings in Tab 1
   - Refresh Tab 2
   - **Verify:** Tab 2 loads latest data

5. **Stale Data Cleanup**
   - Wait 24+ hours
   - Refresh page
   - **Verify:** Old snapshots cleared

---

## File Changes

### New Files
- `src/lib/persistence/storePersistence.ts` - Persistence logic
- `src/lib/persistence/types.ts` - TypeScript interfaces

### Modified Files
- `src/lib/storage/db.ts` - Add new Dexie tables
- `src/stores/appStore.ts` - Add persistence subscription
- `src/stores/userSettingsStore.ts` - Add persistence subscription
- `src/stores/peerPresenceStore.ts` - Add persistence subscription (if exists)
- `src/routes/__root.tsx` - Load snapshots on app init
- `src/hooks/useRoomConnection.ts` - Clear snapshots on leave

---

## Data Schema

### `stores` Table
```typescript
interface StoreSnapshot {
  id: "appStore" | "peerPresenceStore" | "userSettingsStore";
  data: Record<string, unknown>;  // Serialized store state
  updatedAt: number;
  expiresAt?: number;  // Optional expiry (24h default)
}
```

### `userSettings` Table
```typescript
interface UserSetting {
  key: "theme" | "username" | "audioEnabled" | "videoEnabled";
  value: string | boolean | number;
  updatedAt: number;
}
```

---

## Code Patterns (Structure Only)

### Save Pattern
```
Store Change → Debounce (500ms) → Serialize → Dexie.put() → Log
```

### Load Pattern
```
App Init → Dexie.get() → Deserialize → Validate → Store.set() → Fallback to defaults
```

### Cleanup Pattern
```
Leave Room → Dexie.delete() → Store.reset() → Log
```

---

## Rollback Plan

If issues arise:

1. **Disable persistence** - Add feature flag `ENABLE_STORE_PERSISTENCE`
2. **Memory-only mode** - Skip Dexie writes, use defaults
3. **Clear all snapshots** - Add debug command to wipe IndexedDB

---

## Success Criteria

- [ ] Room code persists across reload
- [ ] Peer count restores (within acceptable staleness)
- [ ] User settings (theme, username) persist
- [ ] No errors in console during save/load
- [ ] Multi-tab doesn't corrupt data
- [ ] Old snapshots auto-expire
- [ ] Leave room clears data

---

## Timeline

| Phase | Time | Dependencies |
|-------|------|--------------|
| Phase 1: Dexie tables | 30 min | None |
| Phase 2: Persistence layer | 1 hour | Phase 1 |
| Phase 3: Wire up stores | 1 hour | Phase 2 |
| Phase 4: Edge cases | 30 min | Phase 3 |
| Phase 5: Testing | 1 hour | Phase 4 |
| **Total** | **4 hours** | Can ship after Phase 3 |

---

## Future Enhancements (Not in Scope)

- [ ] Sync across tabs in real-time (BroadcastChannel)
- [ ] Compression for large snapshots
- [ ] Selective field persistence (exclude transient data)
- [ ] Migration system for schema changes
- [ ] Export/import backups

---

## Decision: What to Persist

| Store | Persist? | Fields | Priority |
|-------|----------|--------|----------|
| `appStore` | ✅ Yes | `roomCode`, `isHost`, `currentBoardId` | High |
| `appStore` | ⚠️ Partial | `connectedPeers` (restore, don't trust) | Medium |
| `peerPresenceStore` | ✅ Yes | `peers` array | Medium |
| `userSettingsStore` | ✅ Yes | All fields | High |
| `connectionStatus` | ❌ No | Re-computed | Skip |

---

## Notes

- **Design limitation acknowledged:** P2P state in memory is intentional for WebRTC. This plan persists only the **metadata** (room codes, settings) not the full P2P state.
- **Peer count race condition:** Read-modify-write is acceptable for peer counting. We persist the count but don't guarantee perfect accuracy across rapid changes.
- **TanStack Store architecture:** Store remains in-memory for reactivity. Persistence is a side-effect, not a replacement.
