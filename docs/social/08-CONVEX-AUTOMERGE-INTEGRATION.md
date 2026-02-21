# Plan 8: Convex + Automerge Integration Guide

> How to integrate Convex (for social features, auth, and durable workflows) with your existing Automerge-based P2P collaboration system.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TierSet Architecture                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐         ┌──────────────────────┐              │
│  │   Automerge (P2P)    │         │   Convex (Cloud)     │              │
│  │                      │         │                      │              │
│  │  ┌────────────────┐  │         │  ┌────────────────┐  │              │
│  │  │ Board Document │  │         │  │ User Profiles  │  │              │
│  │  │ - Tiers        │  │         │  │ Published Boards│ │              │
│  │  │ - Items        │  │         │  │ Likes/Comments │  │              │
│  │  │ - Settings     │  │         │  │ Follows        │  │              │
│  │  │ - Peers        │  │         │  │ Notifications  │  │              │
│  │  └────────────────┘  │         │  └────────────────┘  │              │
│  │         │            │         │         │            │              │
│  │  ┌──────▼─────────┐  │         │  ┌──────▼─────────┐  │              │
│  │  │ IndexedDB      │  │         │  │ Convex DB      │  │              │
│  │  │ (Local cache)  │  │         │  │ (Cloud sync)   │  │              │
│  │  └────────────────┘  │         │  └────────────────┘  │              │
│  │         │            │         │         │            │              │
│  │  ┌──────▼─────────┐  │         │  ┌──────▼─────────┐  │              │
│  │  │ WebRTC P2P     │  │         │  │ Workflows      │  │              │
│  │  │ - Sync         │◄─┼─────────┼─►│ - Email        │              │
│  │  │ - Presence     │  │         │  │ - Alerts       │  │              │
│  │  └────────────────┘  │         │  │ - Feed Fan-out │  │              │
│  └──────────────────────┘         │  └────────────────┘  │              │
│              │                     └──────────────────────┘              │
│              │                                │                          │
│              └────────────┬───────────────────┘                          │
│                           │                                              │
│                    ┌──────▼──────┐                                       │
│                    │ TanStack App│                                       │
│                    │ (Frontend)  │                                       │
│                    └─────────────┘                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Automerge owns the collaborative document** - Real-time P2P editing, offline-first
2. **Convex owns the social layer** - User profiles, published boards, notifications
3. **Publish = Snapshot from Automerge → Convex** - One-way sync for published boards
4. **Both can coexist** - No conflicts, different concerns

---

## Data Flow

### Board Lifecycle

```
┌─────────────┐
│ Create Board│
│ (Automerge) │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│ Edit in P2P Room        │
│ - Real-time sync        │
│ - Multiple collaborators│
│ - Offline support       │
│ - Stored in IndexedDB   │
└──────┬──────────────────┘
       │
       │ User clicks "Publish"
       ▼
┌─────────────────────────┐
│ Serialize Automerge Doc │
│ - Extract tier data     │
│ - Extract items         │
│ - Generate preview      │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Upload Images to Convex │
│ - Get storageId for     │
│   each image            │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Call boards.publish()   │
│ - Save to Convex DB     │
│ - Trigger workflow      │
│ - Email + Alerts + Feed │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Board Published         │
│ - Visible on www site   │
│ - Shareable URL         │
│ - Likes/Comments enabled│
└─────────────────────────┘
```

---

## Integration Points

### 1. User Authentication Sync

**Automerge side:** User identity in P2P rooms
**Convex side:** User profiles, authentication state

```typescript
// src/components/auth/UserSyncer.tsx
import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../../convex/_generated/api";

/**
 * Invisible component that syncs Clerk auth to Convex
 * Placed inside <SignedIn> in your root provider
 */
export function UserSyncer() {
  const { user } = useUser();
  const ensureUser = useMutation(api.users.ensureUser);

  useEffect(() => {
    if (!user) return;

    // Sync user to Convex on every sign-in
    // Convex handles idempotency (upsert by clerkId)
    ensureUser().catch(console.error);
  }, [user, ensureUser]);

  return null; // Renders nothing
}
```

**Usage in `__root.tsx`:**

```tsx
// apps/app/src/routes/__root.tsx
import { ClerkProvider, SignedIn } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { UserSyncer } from "../components/auth/UserSyncer";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <SignedIn>
          <UserSyncer /> {/* ← Sync auth to Convex */}
        </SignedIn>
        {/* Your existing providers */}
        <AutomergeRepoProvider>
          {children}
        </AutomergeRepoProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

---

### 2. Board Publishing (Automerge → Convex)

This is the main integration point. When a user publishes a board:

```typescript
// src/components/board/PublishButton.tsx
import { useMutation, useAction } from "convex/react";
import { useBoardDocument } from "../../hooks/useBoardDocument";
import { api } from "../../../convex/_generated/api";
import type { BoardDocument } from "../../lib/documents";

interface PublishButtonProps {
  boardId: string;
  automergeUrl: string;
}

export function PublishButton({ boardId, automergeUrl }: PublishButtonProps) {
  const { doc: automergeDoc } = useBoardDocument(boardId);
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const publishBoard = useMutation(api.boards.publish);

  const handlePublish = async (title: string, description: string) => {
    if (!automergeDoc) return;

    try {
      // Step 1: Serialize Automerge document to Convex schema
      const snapshot = serializeBoardForConvex(automergeDoc);

      // Step 2: Upload preview image to Convex storage
      let previewImageId: string | undefined;
      if (automergeDoc.items.length > 0) {
        const firstItemImage = automergeDoc.items.find(item => item.imageId);
        if (firstItemImage?.imageId) {
          previewImageId = await uploadImageToConvex(
            firstItemImage.imageId,
            generateUploadUrl,
          );
        }
      }

      // Step 3: Publish to Convex (triggers workflow internally)
      const result = await publishBoard({
        title,
        description,
        category: "gaming", // or from user selection
        tagIds: [], // or from user selection
        tierData: {
          tiers: snapshot.tiers,
          items: snapshot.items,
        },
        itemCount: snapshot.items.length,
        tierCount: snapshot.tiers.length,
        previewImageId: previewImageId as any,
        visibility: "public",
      });

      // Step 4: Store Convex boardId in Automerge doc (optional, for linking)
      // This allows you to reference the published version from the P2P doc
      automergeDoc.change((doc) => {
        doc.metadata = doc.metadata || {};
        doc.metadata.publishedConvexId = result.boardId;
        doc.metadata.publishedAt = Date.now();
      });

      return { success: true, boardId: result.boardId, slug: result.slug };
    } catch (error) {
      console.error("Publish failed:", error);
      return { success: false, error };
    }
  };

  return (
    <button onClick={() => handlePublish("My Board", "Description")}>
      Publish Board
    </button>
  );
}

/**
 * Serialize Automerge BoardDocument to Convex publish format
 */
function serializeBoardForConvex(doc: BoardDocument) {
  return {
    tiers: doc.tiers.map(tier => ({
      id: tier.id,
      name: tier.name,
      label: tier.label,
      color: tier.color,
      itemIds: tier.itemIds,
      createdAt: tier.createdAt,
    })),
    items: doc.items.map(item => ({
      id: item.id,
      name: item.name,
      imageId: item.imageId,
      emoji: item.emoji,
      metadata: item.metadata,
      createdAt: item.createdAt,
      createdBy: item.createdBy,
    })),
  };
}

/**
 * Upload image from IndexedDB to Convex storage
 */
async function uploadImageToConvex(
  imageId: string,
  generateUploadUrl: (args: {}) => Promise<string>,
): Promise<string> {
  // Get image from your IndexedDB image store
  const imageBlob = await getImageFromIndexedDB(imageId);
  if (!imageBlob) throw new Error("Image not found");

  // Get upload URL from Convex
  const uploadUrl = await generateUploadUrl({});

  // Upload to Convex storage
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: imageBlob,
    headers: {
      "Content-Type": imageBlob.type,
    },
  });

  const { storageId } = await response.json();
  return storageId;
}
```

---

### 3. Room Codes (Convex → Automerge P2P)

Use Convex to generate/join room codes, then pass the Automerge document URL to P2P:

```typescript
// src/hooks/useHostRoom.ts
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { encodeRoomCode } from "../lib/p2p/room-code";

export function useHostRoom() {
  const createRoomCode = useMutation(api.rooms.createShortCode);

  const createRoom = async (options: {
    boardId: string;
    automergeUrl: string;
    maxPeers?: number;
    ttlHours?: number;
  }) => {
    // Create Convex room code
    const code = await createRoomCode({
      documentUrl: options.automergeUrl,
      maxPeers: options.maxPeers ?? 10,
      ttlHours: options.ttlHours ?? 24,
    });

    // Also encode document URL in room code for backward compatibility
    const legacyCode = encodeRoomCode({
      documentUrl: options.automergeUrl,
      code,
    });

    return { code, legacyCode };
  };

  return { createRoom };
}
```

```typescript
// src/hooks/useJoinRoom.ts
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { decodeRoomCode } from "../lib/p2p/room-code";

export function useJoinRoom() {
  const resolveCode = useQuery(api.rooms.resolveCode);

  const joinRoom = async (code: string) => {
    // Try legacy decode first (embedded document URL)
    const decoded = decodeRoomCode(code);
    if (decoded?.documentUrl) {
      return { documentUrl: decoded.documentUrl };
    }

    // Fall back to Convex resolution
    if (!resolveCode) return null;

    const resolved = await resolveCode({ code });
    if (!resolved) {
      throw new Error("Invalid or expired room code");
    }

    return { documentUrl: resolved.documentUrl };
  };

  return { joinRoom };
}
```

---

### 4. Image Storage Migration

**Current:** Images in IndexedDB via `imageStore`
**Target:** Published images in Convex storage, working images in IndexedDB

```typescript
// src/lib/images/upload.ts
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useConvexImageUpload() {
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const savePhoto = useMutation(api.photos.savePhoto);
  const user = useQuery(api.users.getProfile);

  const uploadToConvex = async (file: File): Promise<string> => {
    if (!user) throw new Error("Must be logged in");

    // Get upload URL
    const uploadUrl = await generateUploadUrl({});

    // Upload file
    const response = await fetch(uploadUrl, {
      method: "POST",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });

    const { storageId } = await response.json();

    // Save metadata
    await savePhoto({
      storageId,
      mimeType: file.type,
      width: 0, // Can get from image metadata
      height: 0,
      sizeBytes: file.size,
    });

    return storageId;
  };

  return { uploadToConvex };
}
```

---

## Convex Schema for Automerge Integration

Add these fields to track the relationship:

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ... existing tables ...

  // Published boards (snapshots from Automerge)
  boards: defineTable({
    authorId: v.id("users"),
    slug: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    
    // Link back to Automerge document
    automergeUrl: v.optional(v.string()), // Reference to original P2P doc
    automergeSnapshot: v.any(), // Serialized snapshot at publish time
    
    // Tier data (serialized from Automerge)
    tierData: v.any(), // { tiers: [...], items: [...] }
    itemCount: v.number(),
    tierCount: v.number(),
    
    // ... rest of your schema ...
  })
    .index("by_author", ["authorId"])
    .index("by_slug", ["slug"])
    .index("by_automerge_url", ["automergeUrl"]), // For lookup

  // ... rest of schema ...
});
```

---

## Syncing Strategy

### One-Way Sync: Automerge → Convex (on Publish)

```typescript
// convex/boards.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUser } from "./auth";
import { workflow } from "./workflows";

export const publish = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    tagIds: v.array(v.id("tags")),
    tierData: v.any(), // From Automerge
    itemCount: v.number(),
    tierCount: v.number(),
    previewImageId: v.optional(v.id("_storage")),
    automergeUrl: v.optional(v.string()), // Link back to P2P doc
    visibility: v.union(v.literal("public"), v.literal("unlisted")),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);

    const slug = generateSlug(args.title);
    const now = Date.now();

    const boardId = await ctx.db.insert("boards", {
      authorId: user._id,
      slug,
      title: args.title,
      description: args.description,
      category: args.category,
      tagIds: args.tagIds,
      previewImageId: args.previewImageId,
      automergeUrl: args.automergeUrl, // Store reference
      automergeSnapshot: args.tierData, // Store snapshot
      tierData: args.tierData,
      itemCount: args.itemCount,
      tierCount: args.tierCount,
      likeCount: 0,
      viewCount: 0,
      commentCount: 0,
      bookmarkCount: 0,
      status: "approved",
      visibility: args.visibility,
      isPinned: false,
      isHidden: false,
      changeLog: [],
      publishedAt: now,
      updatedAt: now,
    });

    // Update user's board count
    await ctx.db.patch(user._id, { boardCount: user.boardCount + 1 });

    // Trigger durable workflow for fan-out
    await workflow.start(ctx, internal.workflows.onBoardPublished, {
      boardId,
      authorId: user._id,
      title: args.title,
    });

    return { boardId, slug };
  },
});
```

### Optional: Two-Way Sync (Convex Updates → Automerge)

If you want to allow edits to published boards and sync back:

```typescript
// convex/boards.ts
export const updatePublished = mutation({
  args: {
    boardId: v.id("boards"),
    tierData: v.any(), // Updated from Automerge
    itemCount: v.number(),
    tierCount: v.number(),
  },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error("Board not found");

    // Update Convex snapshot
    await ctx.db.patch(args.boardId, {
      tierData: args.tierData,
      itemCount: args.itemCount,
      tierCount: args.tierCount,
      updatedAt: Date.now(),
      changeLog: [
        ...board.changeLog,
        { editedAt: Date.now(), summary: "Updated from editor" },
      ],
    });

    // Optionally notify via workflow
    // await workflow.start(...);
  },
});
```

---

## React Hooks for Integration

### Combined Hook: Board with Publish Status

```typescript
// src/hooks/useBoardWithPublishStatus.ts
import { useQuery } from "convex/react";
import { useBoardDocument } from "./useBoardDocument";
import { api } from "../../convex/_generated/api";

export function useBoardWithPublishStatus(boardId: string) {
  // Get Automerge document (P2P, local-first)
  const {
    doc: automergeDoc,
    change,
    syncStatus,
    connectedPeers,
  } = useBoardDocument(boardId);

  // Get Convex published version (if exists)
  const publishedBoard = useQuery(api.boards.getByAutomergeUrl, {
    automergeUrl: automergeDoc?.metadata?.publishedConvexId 
      ? automergeDoc.metadata.publishedConvexId 
      : null,
  });

  return {
    // Automerge data
    automergeDoc,
    change,
    syncStatus,
    connectedPeers,
    
    // Convex data
    publishedBoard,
    isPublished: !!publishedBoard,
    publishedAt: automergeDoc?.metadata?.publishedAt,
    
    // Combined
    canEdit: !publishedBoard || publishedBoard.authorId === getCurrentUserId(),
    hasUnpublishedChanges: hasChangesSincePublish(automergeDoc, publishedBoard),
  };
}

function hasChangesSincePublish(doc, published) {
  if (!published) return false;
  // Compare updatedAt timestamps or do deep comparison
  return doc.updatedAt > published.updatedAt;
}
```

---

## Migration Path from Current Setup

### Phase 1: Add Convex Auth (Week 1)

- [ ] Install Convex + Clerk
- [ ] Add `UserSyncer` component
- [ ] Verify users sync to Convex on sign-in

### Phase 2: Add Board Publishing (Week 2)

- [ ] Create `boards.publish` mutation in Convex
- [ ] Create `PublishButton` component
- [ ] Implement Automerge → Convex serialization
- [ ] Test publish flow end-to-end

### Phase 3: Add Workflows (Week 3)

- [ ] Install `@convex-dev/workflow`, `@convex-dev/resend`
- [ ] Create `onBoardPublished` workflow
- [ ] Wire up email + alerts
- [ ] Test workflow execution

### Phase 4: Add Social Features (Week 4)

- [ ] Add likes, comments, follows
- [ ] Add notification bell in header
- [ ] Add user profiles page
- [ ] Test social interactions

### Phase 5: Room Codes (Week 5)

- [ ] Add `rooms.createShortCode` mutation
- [ ] Update `useHostRoom` to use Convex
- [ ] Update `useJoinRoom` with dual resolution
- [ ] Test room creation/joining

---

## Testing the Integration

See [`07-TESTING-CONVEX-COMPONENTS.md`](./07-TESTING-CONVEX-COMPONENTS.md) for:
- Testing workflow execution
- Testing email sending
- Testing presence updates
- Testing Automerge → Convex publishing

Key test scenarios:

```typescript
// __tests__/integration.test.ts
describe("Convex + Automerge integration", () => {
  it("should publish Automerge board to Convex", async () => {
    // 1. Create Automerge document
    // 2. Call publish mutation
    // 3. Verify Convex board created
    // 4. Verify workflow triggered
  });

  it("should maintain P2P sync after publish", async () => {
    // 1. Publish board
    // 2. Make changes in P2P room
    // 3. Verify changes sync to peers
    // 4. Verify Convex snapshot unchanged (until re-publish)
  });

  it("should resolve room codes to Automerge URLs", async () => {
    // 1. Create room via Convex
    // 2. Join via room code
    // 3. Verify Automerge document loaded
  });
});
```

---

## Common Patterns

### Pattern 1: Read from Automerge, Write to Convex

```typescript
// User edits in Automerge, publishes to Convex
const { doc, change } = useBoardDocument(boardId);
const publish = useMutation(api.boards.publish);

const handlePublish = () => {
  // Read from Automerge
  const snapshot = {
    tiers: doc.tiers,
    items: doc.items,
  };
  
  // Write to Convex
  publish({ tierData: snapshot, /* ... */ });
};
```

### Pattern 2: Convex for Discovery, Automerge for Editing

```typescript
// Browse published boards from Convex
const publishedBoards = useQuery(api.boards.listPublished);

// Click to edit opens Automerge P2P room
const handleEdit = (board) => {
  if (board.automergeUrl) {
    navigate(`/board/${board.automergeUrl}`);
  }
};
```

### Pattern 3: Dual Storage for Images

```typescript
// Working images: IndexedDB (fast, offline)
const workingImageId = await saveToIndexedDB(file);

// Published images: Convex storage (shareable, permanent)
const publishedImageId = await uploadToConvex(file);
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Automerge changes don't appear in Convex | Publish creates snapshot, not live sync. Re-publish to update. |
| Room codes not resolving | Check dual resolution: legacy decode first, then Convex query |
| Images missing after publish | Ensure image upload happens before publish mutation |
| Workflow not triggering | Verify `workflow.start()` is called inside mutation, not action |
| Presence not showing | Ensure heartbeat interval < 30s (default timeout) |

---

## Next Steps

1. Read [`07-TESTING-CONVEX-COMPONENTS.md`](./07-TESTING-CONVEX-COMPONENTS.md) for testing strategies
2. Read [`03-CONVEX-COMPONENTS.md`](./03-CONVEX-COMPONENTS.md) for component setup
3. Read [`06-INTEGRATION-PLAN.md`](./06-INTEGRATION-PLAN.md) for implementation order
