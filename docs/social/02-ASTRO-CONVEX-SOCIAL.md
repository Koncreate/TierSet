# Plan 2: Astro + Convex Social Site (www.tierset.com)

> The public-facing social media repository where users browse, discover, and interact with published tier lists and tournament brackets. Built with Astro for SEO + Convex for realtime data and storage.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    www.tierset.com (Astro)                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │ Static Pages │  │ SSR Pages    │  │ React Islands              │ │
│  │ Landing      │  │ /u/:username │  │ LikeButton, Comments,      │ │
│  │ Pricing      │  │ /b/:boardId  │  │ ShareModal, SearchBar,     │ │
│  │ Docs/Blog    │  │ /t/:bracket  │  │ NotificationBell           │ │
│  └──────────────┘  └──────────────┘  └────────────────────────────┘ │
│         │                  │                      │                  │
│         └──────────────────┴──────────────────────┘                  │
│                            │                                         │
│                            ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     Convex Client                             │   │
│  │  useQuery() · useMutation() · useAction() · Realtime subs    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                            │                                         │
└────────────────────────────┼─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Convex Backend                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Tables:                    Functions:                                │
│  ├── users                  ├── users.getProfile                     │
│  ├── boards                 ├── boards.getPublished                  │
│  ├── boardItems             ├── boards.publish                       │
│  ├── likes                  ├── boards.like / unlike                 │
│  ├── comments               ├── comments.list / create              │
│  ├── follows                ├── follows.toggle                       │
│  ├── shortUrls              ├── urls.create / resolve                │
│  ├── roomCodes              ├── rooms.create / join                  │
│  ├── photos                 ├── photos.getUploadUrl                  │
│  └── subscriptions          └── subscriptions.check                  │
│                                                                      │
│  Auth: Clerk JWT verification                                        │
│  File Storage: Convex file storage (signed URLs for photos)          │
│  Realtime: Automatic via useQuery() subscriptions                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## App Structure

```
apps/www/
├── astro.config.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
│
├── public/
│   ├── favicon.svg
│   ├── og-default.png          ← default Open Graph image
│   └── robots.txt
│
├── src/
│   ├── layouts/
│   │   ├── BaseLayout.astro     ← html shell, meta, fonts
│   │   ├── MarketingLayout.astro ← landing, pricing, docs
│   │   └── SocialLayout.astro   ← profile, board, feed pages
│   │
│   ├── pages/
│   │   ├── index.astro          ← landing page (static)
│   │   ├── pricing.astro        ← plan comparison (static)
│   │   ├── explore.astro        ← discover boards (SSR)
│   │   ├── feed.astro           ← social feed (SSR, auth required)
│   │   │
│   │   ├── u/
│   │   │   └── [username].astro ← public user profile (SSR)
│   │   │
│   │   ├── b/
│   │   │   └── [boardId].astro  ← published board view (SSR)
│   │   │
│   │   ├── t/
│   │   │   └── [bracketId].astro ← tournament results (SSR)
│   │   │
│   │   ├── s/
│   │   │   └── [code].astro     ← short URL redirect
│   │   │
│   │   └── api/
│   │       ├── og/[boardId].ts  ← dynamic OG image generation
│   │       └── webhook/
│   │           └── clerk.ts     ← Clerk webhook → sync user to Convex
│   │
│   ├── components/              ← Astro components (zero JS)
│   │   ├── BoardCard.astro
│   │   ├── UserAvatar.astro
│   │   ├── TierPreview.astro
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   └── SEOHead.astro
│   │
│   ├── islands/                 ← React islands (interactive)
│   │   ├── LikeButton.tsx
│   │   ├── CommentSection.tsx
│   │   ├── ShareModal.tsx
│   │   ├── SearchBar.tsx
│   │   ├── FollowButton.tsx
│   │   ├── NotificationBell.tsx
│   │   ├── InfiniteScroll.tsx
│   │   └── ConvexProvider.tsx   ← wraps islands with ConvexProviderWithClerk
│   │
│   ├── lib/
│   │   ├── convex.ts            ← Convex client setup
│   │   └── clerk.ts             ← Clerk client setup
│   │
│   └── styles/
│       └── global.css           ← Tailwind + brand styles
│
└── wrangler.jsonc               ← Cloudflare Pages deploy config
```

---

## Convex Schema

> **Patterns applied from [vibeapps](https://github.com/waynesutton/vibeapps):**
> - Denormalized counters on parent records (likeCount, commentCount, viewCount) updated atomically in toggle mutations
> - Compound indexes for O(1) "has user done X?" lookups (`by_user_board`, `by_pair`)
> - `alerts` table with `internalMutation` + `ctx.scheduler.runAfter(0)` for non-blocking notification fan-out
> - `status` fields for moderation workflows (pending/approved/rejected)
> - `searchIndex` on title fields with `filterFields` for scoped full-text search
> - Slug-based URLs for SEO-friendly board links
> - Rate limiting table for abuse prevention
> - Email preference table for granular unsubscribe

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ─── User profiles (dual sync: UserSyncer component + Clerk webhook) ───
  users: defineTable({
    clerkId: v.string(),
    username: v.optional(v.string()),  // null until set (forces /set-username flow)
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    website: v.optional(v.string()),
    twitter: v.optional(v.string()),
    plan: v.union(v.literal("free"), v.literal("pro")),
    boardCount: v.number(),           // denormalized — updated on publish/delete
    followerCount: v.number(),        // denormalized — updated on follow/unfollow
    followingCount: v.number(),       // denormalized — updated on follow/unfollow
    isBanned: v.boolean(),
    isVerified: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_username", ["username"])
    .searchIndex("search_users", { searchField: "displayName" }),

  // ─── Published boards (snapshots from Automerge docs) ───
  boards: defineTable({
    authorId: v.id("users"),
    slug: v.string(),                  // URL-friendly identifier
    title: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    tagIds: v.array(v.id("tags")),     // M:M via array embedding (vibeapps pattern)
    previewImageId: v.optional(v.id("_storage")),  // Convex native storage ref
    additionalImageIds: v.array(v.id("_storage")), // gallery (max 4)
    tierData: v.any(),                 // serialized tier structure snapshot
    itemCount: v.number(),
    tierCount: v.number(),
    likeCount: v.number(),             // denormalized — updated in toggle mutation
    viewCount: v.number(),             // denormalized — incremented on view
    commentCount: v.number(),          // denormalized — updated on add/delete
    bookmarkCount: v.number(),         // denormalized
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    visibility: v.union(v.literal("public"), v.literal("unlisted")),
    isPinned: v.boolean(),
    isHidden: v.boolean(),
    changeLog: v.array(v.object({      // edit history embedded (vibeapps pattern)
      editedAt: v.number(),
      summary: v.string(),
    })),
    publishedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_author", ["authorId"])
    .index("by_slug", ["slug"])
    .index("by_published", ["publishedAt"])
    .index("by_likes", ["likeCount"])
    .index("by_status_published", ["status", "isHidden", "publishedAt"])
    .index("by_category", ["category", "publishedAt"])
    .searchIndex("search_boards", {
      searchField: "title",
      filterFields: ["status", "isHidden", "category"],
    }),

  // ─── Tags (admin-managed + user-created) ───
  tags: defineTable({
    name: v.string(),
    slug: v.string(),
    emoji: v.optional(v.string()),
    backgroundColor: v.optional(v.string()),
    textColor: v.optional(v.string()),
    order: v.number(),
    showInHeader: v.boolean(),
    createdByAdmin: v.boolean(),
  })
    .index("by_slug", ["slug"])
    .index("by_order", ["order"]),

  // ─── Likes (toggle pattern: check by_user_board, insert or delete) ───
  likes: defineTable({
    userId: v.id("users"),
    boardId: v.id("boards"),
    createdAt: v.number(),
  })
    .index("by_user_board", ["userId", "boardId"])  // O(1) "has user liked?"
    .index("by_board", ["boardId"]),

  // ─── Bookmarks (same toggle pattern as likes) ───
  bookmarks: defineTable({
    userId: v.id("users"),
    boardId: v.id("boards"),
    createdAt: v.number(),
  })
    .index("by_user_board", ["userId", "boardId"])
    .index("by_user", ["userId", "createdAt"]),

  // ─── Star Ratings (1-5, one per user per board) ───
  ratings: defineTable({
    userId: v.id("users"),
    boardId: v.id("boards"),
    value: v.number(),                 // 1-5
    createdAt: v.number(),
  })
    .index("by_user_board", ["userId", "boardId"])
    .index("by_board", ["boardId"]),

  // ─── Comments (threaded via parentId, one level of nesting) ───
  comments: defineTable({
    userId: v.id("users"),
    boardId: v.id("boards"),
    parentId: v.optional(v.id("comments")),  // self-ref for threading
    text: v.string(),
    status: v.union(v.literal("visible"), v.literal("hidden"), v.literal("deleted")),
    createdAt: v.number(),
  })
    .index("by_board_status", ["boardId", "status", "createdAt"])
    .index("by_user", ["userId"]),

  // ─── Follows ───
  follows: defineTable({
    followerId: v.id("users"),
    followingId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_follower", ["followerId"])
    .index("by_following", ["followingId"])
    .index("by_pair", ["followerId", "followingId"]),  // O(1) follow check

  // ─── Alerts / Notifications (vibeapps pattern: internalMutation fan-out) ───
  alerts: defineTable({
    recipientUserId: v.id("users"),
    actorUserId: v.id("users"),
    type: v.union(
      v.literal("like"),
      v.literal("comment"),
      v.literal("reply"),
      v.literal("mention"),
      v.literal("follow"),
      v.literal("rating"),
      v.literal("bookmark"),
      v.literal("board_featured"),
      v.literal("admin_message"),
    ),
    boardId: v.optional(v.id("boards")),
    commentId: v.optional(v.id("comments")),
    isRead: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_recipient", ["recipientUserId", "createdAt"])
    .index("by_recipient_unread", ["recipientUserId", "isRead"]),  // badge check

  // ─── Short URLs (room codes + vanity links) ───
  shortUrls: defineTable({
    code: v.string(),
    targetUrl: v.string(),
    createdBy: v.optional(v.id("users")),
    clicks: v.number(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_code", ["code"]),

  // ─── Preview room codes (P2P room → short code mapping) ───
  roomCodes: defineTable({
    code: v.string(),
    documentUrl: v.string(),           // Automerge document URL
    hostUserId: v.optional(v.id("users")),
    maxPeers: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_host", ["hostUserId"]),

  // ─── Photo metadata (two-step upload: generateUrl → PUT → save storageId) ───
  photos: defineTable({
    storageId: v.id("_storage"),       // Convex native storage ref (NOT a URL)
    uploadedBy: v.id("users"),
    boardId: v.optional(v.id("boards")),
    mimeType: v.string(),
    width: v.number(),
    height: v.number(),
    sizeBytes: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["uploadedBy"])
    .index("by_board", ["boardId"]),

  // ─── Subscription/billing (synced from Clerk webhook) ───
  subscriptions: defineTable({
    userId: v.id("users"),
    clerkSubscriptionId: v.string(),
    plan: v.union(v.literal("free"), v.literal("pro")),
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
    ),
    currentPeriodEnd: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_clerk_id", ["clerkSubscriptionId"]),

  // ─── Rate limiting (vibeapps pattern: per-action throttling) ───
  rateLimits: defineTable({
    userId: v.id("users"),
    action: v.string(),                // "publish", "comment", "like"
    windowStart: v.number(),
    count: v.number(),
  })
    .index("by_user_action", ["userId", "action"]),

  // ─── Email preferences (granular per-user unsubscribe) ───
  emailSettings: defineTable({
    userId: v.id("users"),
    weeklyDigest: v.boolean(),
    likeNotifications: v.boolean(),
    commentNotifications: v.boolean(),
    followNotifications: v.boolean(),
    marketingEmails: v.boolean(),
  })
    .index("by_user", ["userId"]),

  // ─── App-wide settings (key/value feature flags) ───
  appSettings: defineTable({
    key: v.string(),
    value: v.any(),
  })
    .index("by_key", ["key"]),
});
```

---

## Key Convex Functions

> **Auth helper pattern** (from vibeapps): Extract a reusable `requireAuth` function that all mutations call. Admin role is read from Clerk JWT claims, not from the database.

### Auth Helper

```typescript
// convex/auth.ts
import { QueryCtx, MutationCtx } from "./_generated/server";

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("User must be authenticated.");
  return identity.subject; // Clerk User ID
}

export async function getUser(ctx: QueryCtx | MutationCtx) {
  const clerkId = await requireAuth(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .unique();
  if (!user) throw new Error("User not found in database.");
  return user;
}

export async function isUserAdmin(ctx: QueryCtx | MutationCtx): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  // Role comes from Clerk JWT template: "role": "{{user.public_metadata.role}}"
  return (identity as any)?.role === "admin";
}
```

### User Sync (Dual Mechanism)

```typescript
// convex/users.ts
import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Called by UserSyncer component on every sign-in
export const ensureUser = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing) {
      // Update avatar/name from Clerk if changed
      await ctx.db.patch(existing._id, {
        displayName: identity.name ?? existing.displayName,
        avatarUrl: identity.pictureUrl ?? existing.avatarUrl,
      });
      return existing._id;
    }

    // First sign-in: create user with null username (forces /set-username)
    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      username: undefined,
      displayName: identity.name ?? "New User",
      avatarUrl: identity.pictureUrl,
      plan: "free",
      boardCount: 0,
      followerCount: 0,
      followingCount: 0,
      isBanned: false,
      isVerified: false,
      createdAt: Date.now(),
    });

    // Schedule welcome email (non-blocking)
    await ctx.scheduler.runAfter(5000, internal.emails.welcome.send, {
      userId,
      email: identity.email ?? "",
    });

    return userId;
  },
});

// Called by Clerk webhook (server-side sync path)
export const syncUserFromClerkWebhook = internalMutation({
  args: { clerkId: v.string(), email: v.string(), name: v.string(), avatarUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { displayName: args.name, avatarUrl: args.avatarUrl });
      return;
    }
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      username: undefined,
      displayName: args.name,
      avatarUrl: args.avatarUrl,
      plan: "free",
      boardCount: 0,
      followerCount: 0,
      followingCount: 0,
      isBanned: false,
      isVerified: false,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(5000, internal.emails.welcome.send, { userId, email: args.email });
  },
});
```

### Board Publishing (from SPA → Convex)

```typescript
// convex/boards.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUser } from "./auth";
import { internal } from "./_generated/api";

export const publish = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    tagIds: v.array(v.id("tags")),
    tierData: v.any(),
    itemCount: v.number(),
    tierCount: v.number(),
    previewImageId: v.optional(v.id("_storage")),
    additionalImageIds: v.optional(v.array(v.id("_storage"))),
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
      additionalImageIds: args.additionalImageIds ?? [],
      tierData: args.tierData,
      itemCount: args.itemCount,
      tierCount: args.tierCount,
      likeCount: 0,
      viewCount: 0,
      commentCount: 0,
      bookmarkCount: 0,
      status: "approved", // auto-approve for now; switch to "pending" for moderation
      visibility: args.visibility,
      isPinned: false,
      isHidden: false,
      changeLog: [],
      publishedAt: now,
      updatedAt: now,
    });

    // Denormalized counter update
    await ctx.db.patch(user._id, { boardCount: user.boardCount + 1 });

    return { boardId, slug };
  },
});

// Paginated explore feed (manual cursor pagination — vibeapps pattern)
export const listPublished = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    category: v.optional(v.string()),
    sortBy: v.optional(v.union(v.literal("recent"), v.literal("popular"))),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const startIndex = args.cursor ? parseInt(args.cursor) : 0;

    let allBoards;
    if (args.sortBy === "popular") {
      allBoards = await ctx.db
        .query("boards")
        .withIndex("by_status_published", (q) =>
          q.eq("status", "approved").eq("isHidden", false),
        )
        .collect();
      allBoards.sort((a, b) => b.likeCount - a.likeCount);
    } else {
      allBoards = await ctx.db
        .query("boards")
        .withIndex("by_status_published", (q) =>
          q.eq("status", "approved").eq("isHidden", false),
        )
        .order("desc")
        .collect();
    }

    if (args.category) {
      allBoards = allBoards.filter((b) => b.category === args.category);
    }

    const page = allBoards.slice(startIndex, startIndex + limit);
    const isDone = startIndex + limit >= allBoards.length;

    // Join with author data + resolve preview image URLs
    const enriched = await Promise.all(
      page.map(async (board) => {
        const author = await ctx.db.get(board.authorId);
        const previewUrl = board.previewImageId
          ? await ctx.storage.getUrl(board.previewImageId)
          : null;
        return { ...board, author, previewUrl };
      }),
    );

    return {
      boards: enriched,
      continueCursor: isDone ? null : String(startIndex + limit),
      isDone,
    };
  },
});

// Full-text search
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("boards")
      .withSearchIndex("search_boards", (q) =>
        q.search("title", args.query).eq("status", "approved").eq("isHidden", false),
      )
      .take(20);
  },
});
```

### Like Toggle (Vibeapps Vote Pattern)

```typescript
// convex/likes.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUser } from "./auth";
import { internal } from "./_generated/api";

export const toggle = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error("Board not found");

    // O(1) lookup via compound index
    const existing = await ctx.db
      .query("likes")
      .withIndex("by_user_board", (q) =>
        q.eq("userId", user._id).eq("boardId", args.boardId),
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(args.boardId, { likeCount: board.likeCount - 1 });
      return { action: "unliked" };
    }

    await ctx.db.insert("likes", {
      userId: user._id,
      boardId: args.boardId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.boardId, { likeCount: board.likeCount + 1 });

    // Non-blocking alert via scheduler (vibeapps pattern)
    if (board.authorId !== user._id) {
      await ctx.scheduler.runAfter(0, internal.alerts.createAlert, {
        recipientUserId: board.authorId,
        actorUserId: user._id,
        type: "like",
        boardId: args.boardId,
      });
    }

    return { action: "liked" };
  },
});

// O(1) check for UI state
export const hasUserLiked = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return false;

    const like = await ctx.db
      .query("likes")
      .withIndex("by_user_board", (q) =>
        q.eq("userId", user._id).eq("boardId", args.boardId),
      )
      .first();
    return !!like;
  },
});
```

### Alerts (Internal Fan-Out via Scheduler)

```typescript
// convex/alerts.ts
import { internalMutation, query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUser } from "./auth";

// Called via ctx.scheduler.runAfter(0, ...) — never directly from client
export const createAlert = internalMutation({
  args: {
    recipientUserId: v.id("users"),
    actorUserId: v.id("users"),
    type: v.string(),
    boardId: v.optional(v.id("boards")),
    commentId: v.optional(v.id("comments")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("alerts", {
      recipientUserId: args.recipientUserId,
      actorUserId: args.actorUserId,
      type: args.type as any,
      boardId: args.boardId,
      commentId: args.commentId,
      isRead: false,
      createdAt: Date.now(),
    });
  },
});

// Badge check: are there any unread alerts?
export const hasUnread = query({
  handler: async (ctx) => {
    const user = await getUser(ctx);
    const unread = await ctx.db
      .query("alerts")
      .withIndex("by_recipient_unread", (q) =>
        q.eq("recipientUserId", user._id).eq("isRead", false),
      )
      .first();
    return !!unread;
  },
});
```

### Photo Upload (Two-Step Pattern)

```typescript
// convex/photos.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUser } from "./auth";

// Step 1: Client calls this to get a pre-signed upload URL
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    await getUser(ctx); // auth check
    return await ctx.storage.generateUploadUrl();
  },
});

// Step 2: Client PUTs file directly to the URL, gets storageId, then calls this
export const savePhoto = mutation({
  args: {
    storageId: v.id("_storage"),
    boardId: v.optional(v.id("boards")),
    mimeType: v.string(),
    width: v.number(),
    height: v.number(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    return await ctx.db.insert("photos", {
      storageId: args.storageId,
      uploadedBy: user._id,
      boardId: args.boardId,
      mimeType: args.mimeType,
      width: args.width,
      height: args.height,
      sizeBytes: args.sizeBytes,
      createdAt: Date.now(),
    });
  },
});

// Resolve storageId to URL in queries (not client-side)
export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
```

### HTTP Router (Webhooks + OG Meta)

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Clerk webhook — Svix signature verification
http.route({
  path: "/clerk",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    // Verify Svix signature headers here...

    switch (body.type) {
      case "user.created":
        await ctx.runMutation(internal.users.syncUserFromClerkWebhook, {
          clerkId: body.data.id,
          email: body.data.email_addresses?.[0]?.email_address ?? "",
          name: `${body.data.first_name ?? ""} ${body.data.last_name ?? ""}`.trim(),
          avatarUrl: body.data.image_url,
        });
        break;
    }
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }),
});

// OG meta tags for social sharing (serves HTML to crawlers)
http.route({
  path: "/meta/b",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return new Response("Not found", { status: 404 });

    const board = await ctx.runQuery(internal.boards.getBySlug, { slug });
    if (!board) return new Response("Not found", { status: 404 });

    const previewUrl = board.previewImageId
      ? await ctx.storage.getUrl(board.previewImageId)
      : "https://www.tierset.com/og-default.png";

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="${board.title}" />
  <meta property="og:description" content="${board.description ?? "Tier list on TierSet"}" />
  <meta property="og:image" content="${previewUrl}" />
  <meta property="og:url" content="https://www.tierset.com/b/${slug}" />
  <meta name="twitter:card" content="summary_large_image" />
  <script>window.location.href = "https://www.tierset.com/b/${slug}";</script>
</head>
<body></body>
</html>`;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }),
});

export default http;
```

### Room Code Shortening

```typescript
// convex/rooms.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createShortCode = mutation({
  args: {
    documentUrl: v.string(),
    maxPeers: v.optional(v.number()),
    ttlHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const code = generateShortCode();
    const ttl = (args.ttlHours ?? 24) * 60 * 60 * 1000;

    const userId = identity
      ? (await ctx.db.query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
          .unique())?._id
      : undefined;

    await ctx.db.insert("roomCodes", {
      code,
      documentUrl: args.documentUrl,
      hostUserId: userId,
      maxPeers: args.maxPeers ?? 10,
      isActive: true,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
    });

    return code;
  },
});

export const resolveCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("roomCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!room || !room.isActive || room.expiresAt < Date.now()) return null;
    return { documentUrl: room.documentUrl, maxPeers: room.maxPeers };
  },
});

function generateShortCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
```

---

## Page Examples

### Landing Page (Static)

```astro
---
// apps/www/src/pages/index.astro
import MarketingLayout from "../layouts/MarketingLayout.astro";
---

<MarketingLayout title="TierSet – Create & Share Tier Lists">
  <section class="hero">
    <h1>Rank Everything. Together.</h1>
    <p>Create tier lists and tournament brackets with friends in real-time.</p>
    <div class="cta-buttons">
      <a href="https://app.tierset.com" class="btn-primary">Open App</a>
      <a href="/explore" class="btn-secondary">Explore Lists</a>
    </div>
  </section>

  <section class="features">
    <!-- Feature cards: P2P, Offline, Tournaments, etc. -->
  </section>
</MarketingLayout>
```

### Published Board Page (SSR + Islands)

```astro
---
// apps/www/src/pages/b/[boardId].astro
import SocialLayout from "../../layouts/SocialLayout.astro";
import TierPreview from "../../components/TierPreview.astro";
import LikeButton from "../../islands/LikeButton";
import CommentSection from "../../islands/CommentSection";
import ShareModal from "../../islands/ShareModal";
import { preloadQuery } from "convex/nextjs"; // SSR data loading
import { api } from "../../convex/_generated/api";

const { boardId } = Astro.params;
const board = await preloadQuery(api.boards.getById, { boardId });
if (!board) return Astro.redirect("/404");

const author = await preloadQuery(api.users.getById, { userId: board.authorId });
---

<SocialLayout
  title={`${board.title} | TierSet`}
  description={board.description}
  ogImage={`/api/og/${boardId}`}
>
  <article class="board-page">
    <header>
      <h1>{board.title}</h1>
      <a href={`/u/${author.username}`} class="author-link">
        <img src={author.avatarUrl} alt={author.displayName} />
        <span>{author.displayName}</span>
      </a>
    </header>

    <TierPreview tierData={board.tierData} />

    <div class="actions">
      <LikeButton client:visible boardId={boardId} initialCount={board.likeCount} />
      <ShareModal client:idle boardUrl={Astro.url.href} title={board.title} />
      <a href={`https://app.tierset.com/board?fork=${boardId}`} class="btn">
        Fork in App
      </a>
    </div>

    <CommentSection client:visible boardId={boardId} />
  </article>
</SocialLayout>
```

### Dynamic OG Image

```typescript
// apps/www/src/pages/api/og/[boardId].ts
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params }) => {
  const { boardId } = params;

  // Fetch board data from Convex
  // Render tier list preview as PNG using @vercel/og or satori
  // Return as image/png response

  return new Response(imageBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
```

---

## Astro Configuration

```typescript
// apps/www/astro.config.ts
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server", // SSR for dynamic pages
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [
    react(), // React islands for interactive components
    tailwind(),
  ],
  vite: {
    optimizeDeps: {
      exclude: ["convex"],
    },
  },
});
```

### `apps/www/package.json`

```json
{
  "name": "@tierset/www",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev --port 4000",
    "build": "astro build",
    "preview": "astro preview",
    "deploy": "astro build && wrangler pages deploy dist/"
  },
  "dependencies": {
    "astro": "^5.x",
    "@astrojs/react": "^4.x",
    "@astrojs/tailwind": "^6.x",
    "@astrojs/cloudflare": "^12.x",
    "@clerk/astro": "^1.x",
    "convex": "^1.x",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-share": "^5.2.2",
    "tailwindcss": "^4.1.18",
    "@tierset/shared": "workspace:*"
  }
}
```

---

## Cross-App Integration Points

### Provider Setup (vibeapps pattern)

Both apps use `ConvexProviderWithClerk` — this automatically injects Clerk's JWT into every Convex request. No manual token passing needed.

```tsx
// apps/app — in __root.tsx (TanStack Start)
import { ClerkProvider } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient, useAuth } from "convex/react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
  <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
    <AutomergeRepoProvider>
      <UserSyncer />   {/* invisible — calls ensureUser on sign-in */}
      {children}
    </AutomergeRepoProvider>
  </ConvexProviderWithClerk>
</ClerkProvider>
```

```tsx
// apps/www — in ConvexProvider.tsx (Astro React island)
// Same pattern, used as a wrapper for all interactive islands
```

### UserSyncer Component (from vibeapps)

```tsx
// Invisible component mounted inside <SignedIn>
// Ensures Convex user record exists on every sign-in
// Redirects to /set-username if username is null
function UserSyncer() {
  const { isSignedIn } = useUser();
  const ensureUser = useMutation(api.users.ensureUser);
  const user = useQuery(api.users.me);

  useEffect(() => {
    if (isSignedIn) ensureUser();
  }, [isSignedIn]);

  // Force username selection on first sign-in
  if (user && user.username === null) {
    navigate("/set-username");
  }

  return null;
}
```

### SPA → Convex: Publish Board

When a user in `app.tierset.com` clicks "Publish", the SPA:

```
1. Get upload URL    →  photos.generateUploadUrl()
2. PUT file directly →  fetch(uploadUrl, { method: "POST", body: file })
3. Save photo ref    →  photos.savePhoto({ storageId, ... })
4. Publish board     →  boards.publish({ tierData, previewImageId: storageId, ... })
5. Get slug back     →  share link: www.tierset.com/b/{slug}
```

### SPA → Convex: Room Code Shortening

Pro users get shortened room codes:
1. SPA calls `rooms.createShortCode({ documentUrl })` → gets `"Xk9mZq"`
2. Shares code `Xk9mZq` instead of the full Automerge URL
3. Joining peer hits `www.tierset.com/s/Xk9mZq` → resolves → redirects to `app.tierset.com/board?room=Xk9mZq`
4. App calls `rooms.resolveCode("Xk9mZq")` → gets Automerge document URL → joins P2P

### Clerk Auth: Shared Across Subdomains

```typescript
// Both apps use the same Clerk publishable key
// Clerk supports multi-domain SSO via shared session cookies
// Configure in Clerk Dashboard:
//   - Primary domain: tierset.com
//   - Satellite domains: app.tierset.com, www.tierset.com
```

### Convex JWT Configuration

```javascript
// convex/auth.config.js
export default {
  providers: [{
    domain: process.env.CLERK_FRONTEND_API_URL,
    applicationID: "convex", // must match "aud" claim in Clerk JWT template
  }],
};
```

### Convex: Shared Deployment

Both `apps/app` and `apps/www` point to the same Convex project:

```env
# apps/app/.env
VITE_CONVEX_URL=https://your-project.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx

# apps/www/.env
PUBLIC_CONVEX_URL=https://your-project.convex.cloud
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx
```

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Scaffold Astro project in `apps/www/`
- [ ] Set up Tailwind with shared brand tokens
- [ ] Create base layouts (Marketing, Social)
- [ ] Static pages: landing, pricing
- [ ] Deploy to Cloudflare Pages

### Phase 2: Convex Integration
- [ ] Initialize Convex project at repo root
- [ ] Define schema (users, boards, likes, comments, follows)
- [ ] Set up Clerk auth in Convex
- [ ] Wire Clerk webhook → user sync
- [ ] Basic queries: list boards, get profile

### Phase 3: Social Features
- [ ] Board view page (`/b/[boardId]`)
- [ ] User profile page (`/u/[username]`)
- [ ] React islands: LikeButton, CommentSection, FollowButton
- [ ] Explore/discover page with search
- [ ] OG image generation for board sharing

### Phase 4: SPA Integration
- [ ] Add Convex client to `apps/app`
- [ ] "Publish" flow: serialize board → Convex mutation
- [ ] Photo upload via Convex storage (signed URLs)
- [ ] Room code shortening via Convex
- [ ] Short URL redirect page (`/s/[code]`)

### Phase 5: Premium Features
- [ ] Subscription status checks via Convex
- [ ] Gate premium features (short codes, cloud photos, etc.)
- [ ] Billing portal link from both apps
- [ ] Usage tracking (photo count, board count)
