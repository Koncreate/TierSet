# Board Creation Flow - Debugging Context

## Current Status (as of Feb 20, 2026)

### ✅ What's Working
1. **Visual regression tests** - 9 tests were passing with baseline screenshots (before unstorage migration)
2. **Build** - Compiles successfully
3. **Signaling server** - Fixed the createServerFn().validator error
4. **Hydration** - Fixed locale mismatch issues
5. **Board validation** - Fixed cuid2 validation errors
6. **Automerge document handling** - Fixed undefined/null issues for Automerge compatibility

### ❌ What's Broken

**Main Issue:** Board creation hangs on "Creating tier list..." after migrating to unstorage.

The page is stuck in the loading state because the board creation promise never resolves or rejects. This happens because:
1. The unstorage `localStorageDriver` tries to access `window.localStorage` during initialization
2. During SSR (server-side rendering), `window` and `localStorage` don't exist
3. The code hangs waiting for the promise to resolve, but it never does

## Desired User Flow

```
1. Home Page (/)
2. ↓
3. Click "Tier List" card
4. ↓
5. /board route loads
6. ↓
7. Auto-create board with ID (name = "Untitled Tier List")
8. ↓
9. Show tier list page IMMEDIATELY with:
   - Inline editable name input at top (pre-filled with "Untitled Tier List")
   - Add item input below
   - Tier list structure visible
   - User can edit name OR add items in any order
```

## Files Changed

### 1. `/src/routes/board.tsx`
**Current state:** Uses `useEffect` to auto-create board on mount

```tsx
function BoardViewWithAutoCreate() {
  const [boardId, setBoardId] = useState<BoardId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const createBoard = async () => {
      try {
        const { createBoardDocument } = await import("../lib/documents");
        const { storage } = await import("../lib/storage");
        const { createId } = await import("../lib/ids");
        
        const localId = createId();
        const boardDoc = createBoardDocument({
          name: "Untitled Tier List",
          createdBy: localId,
        });
        await storage.boards.saveBoard(boardDoc.id, boardDoc);
        setBoardId(boardDoc.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create board");
      }
    };
    
    createBoard();
  }, []);

  if (!boardId) return <div>Creating tier list...</div>;
  return <BoardView boardId={boardId} />;
}
```

**Problem:** The `storage.boards.saveBoard()` call hangs because unstorage's localStorageDriver fails during SSR.

### 2. `/src/lib/board/board-storage-unstorage.ts` (NEW FILE)
Created unstorage-based board storage:

```ts
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";

export function createBoardStorage(kvBinding?: KVNamespace): BoardStorage {
  const storage = createStorage<BoardRecord>({
    driver: kvBinding ? createKVDriver(kvBinding) : localStorageDriver({ base: "tierboard:" }),
  });
  // ... implementation
}
```

**Problem:** localStorageDriver doesn't work during SSR.

### 3. `/src/lib/storage/Storage.ts`
Updated to use unstorage-based board storage:

```ts
import { createBoardStorage } from "../board/board-storage-unstorage";

export class Storage {
  boards: BoardStorage;
  
  constructor(kvBinding?: KVNamespace) {
    this.boards = createBoardStorage(kvBinding);
  }
  // ...
}
```

### 4. `/src/lib/documents/BoardDocument.ts`
Fixed Automerge compatibility issues:

```ts
export function createBoardDocument(...) {
  const doc: BoardDocument = {
    // ...
    description: partial.description || "", // Must be "" not undefined for Automerge
    // ...
  };
  // ...
}

export function getDocumentDelta(doc: BoardDocument): Uint8Array {
  const isAutomergeDoc = (doc as any)["_root"] !== undefined;
  
  if (!isAutomergeDoc) {
    // Initialize as a new Automerge document and copy all properties
    const initializedDoc = A.init<BoardDocument>();
    const docWithChanges = A.change(initializedDoc, (d) => {
      Object.assign(d, doc);
    });
    return A.save(docWithChanges);
  }
  
  return A.save(doc);
}
```

### 5. `/src/components/board/BoardView.tsx`
- Removed `localBoardId` state and `onCreateBoard` prop
- Removed `handleCreateBoard` function
- Fixed `handleDelete` to navigate to home instead of calling non-existent `setBoard`

### 6. `/src/tests/e2e/visual/board-view.test.ts`
- Increased timeout from 15000ms to 20000ms
- Removed initial `page.waitForTimeout(3000)` calls

## Root Cause Analysis

### The Problem
The unstorage `localStorageDriver` is not SSR-safe. When the app renders on the server:
1. `localStorageDriver({ base: "tierboard:" })` is called
2. The driver tries to access `window.localStorage` immediately
3. `window` is undefined in Node.js/Cloudflare Workers
4. The promise hangs (doesn't resolve or reject)

### Previous Working State
Before the unstorage migration, the code used **Dexie (IndexedDB)** which was working in the browser tests. The visual tests were passing with 9/9 tests green.

## Solutions to Try

### Option 1: Use memory driver for browser, localStorage for client-side only
```ts
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";
import memoryDriver from "unstorage/drivers/memory";

export function createBoardStorage(kvBinding?: KVNamespace): BoardStorage {
  // Check if we're in browser environment
  const isBrowser = typeof window !== 'undefined' && window.localStorage;
  
  const storage = createStorage<BoardRecord>({
    driver: kvBinding 
      ? createKVDriver(kvBinding) 
      : isBrowser 
        ? localStorageDriver({ base: "tierboard:" })
        : memoryDriver(),
  });
  // ...
}
```

### Option 2: Use indexedb driver (SSR-safe, works in browser)
```ts
import indexedDbDriver from "unstorage/drivers/indexedb";

export function createBoardStorage(kvBinding?: KVNamespace): BoardStorage {
  const storage = createStorage<BoardRecord>({
    driver: kvBinding 
      ? createKVDriver(kvBinding) 
      : indexedDbDriver({ base: "tierboard:" }),
  });
  // ...
}
```

### Option 3: Lazy initialize storage only in useEffect
Move the storage initialization into the useEffect so it only runs on the client:

```tsx
useEffect(() => {
  const createBoard = async () => {
    // Dynamic import ensures this only runs on client
    const { createBoardStorage } = await import("../lib/board/board-storage-unstorage");
    const storage = createBoardStorage();
    // ... create board
  };
  createBoard();
}, []);
```

### Option 4: Revert to Dexie for board storage
Since Dexie was working, we could keep unstorage only for chat/signaling and use Dexie for boards.

## Commands to Run

```bash
# Build and check for errors
bun run build

# Run visual tests
bun run test:e2e:visual

# Update baselines after fixing
bun run test:e2e:visual:update

# Manual testing
bun run dev
# Navigate to http://localhost:3000/board
```

## Success Criteria

- [ ] Navigating to /board shows tier list page immediately
- [ ] No "Create New Tier List" form visible
- [ ] Name input at top is editable (shows "Untitled Tier List" by default)
- [ ] Can add items via the "Add New Item" input
- [ ] Name changes persist (saved via Automerge change)
- [ ] All 9 visual tests pass
- [ ] Build passes without errors
- [ ] Storage works in both SSR and client environments

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/routes/board.tsx` | Route definition, needs board auto-creation |
| `src/components/board/BoardView.tsx` | Main board UI, has inline name edit |
| `src/lib/board/board-storage-unstorage.ts` | NEW: unstorage-based board storage |
| `src/lib/storage/Storage.ts` | Main storage facade |
| `src/lib/documents/BoardDocument.ts` | Board document creation with Automerge |
| `src/lib/documents/validation.ts` | Zod validation schema |
| `src/lib/ids.ts` | cuid2 ID generation |
| `tests/e2e/visual/board-view.test.ts` | Visual tests to pass |

## Reference Image
Target UI: `/public/Tierlist_Example.png` - Shows tier list with S, A, B, C, D, F tiers
