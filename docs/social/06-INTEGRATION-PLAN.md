# Plan 6: Integration Plan — Social Layer into TanStack Start App

> Concrete mapping of how Clerk, Convex, and Convex Components connect into the existing TanStack Start SPA without touching Automerge.

---

## Architecture Summary

```
SPA (apps/app)                    Convex (repo root)
─────────────────                 ──────────────────
ClerkProvider                     ctx.auth.getUserIdentity()
  └─ ConvexProviderWithClerk      users.ensureUser()
       └─ TanStackQueryProvider   boards.publish()
            └─ AutomergeRepo      likes.toggle() → workflow.start(onBoardLiked)
                 └─ UI            follows.toggle() → workflow.start(onUserFollowed)
                                  comments.add() → workflow.start(onCommentAdded)
                                  ↓
                                  @convex-dev/workflow (durable fan-out)
                                    ├─ alerts (internalMutation)
                                    ├─ emails via @convex-dev/resend
                                    ├─ feed fan-out (internalMutation)
                                    └─ analytics (internalMutation)
                                  @convex-dev/presence (room presence)
```

**Data flow:** SPA → Convex → Convex Components. Convex-only — no external backend service.

---

## 1. Provider Chain in `__root.tsx`

### Current Chain
```
TanStackQueryProvider → AutomergeRepoProvider → TanStackStoreDevTools → Header → children
```

### Target Chain
```
ClerkProvider → ConvexProviderWithClerk → TanStackQueryProvider → AutomergeRepoProvider → (SignedIn UserSyncer) → TanStackStoreDevTools → Header → children
```

### Implementation

```tsx
// apps/app/src/routes/__root.tsx
import { ClerkProvider, SignedIn } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { UserSyncer } from "../components/auth/UserSyncer";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <TanStackQueryProvider>
              <AutomergeRepoProvider>
                <SignedIn>
                  <UserSyncer />
                </SignedIn>
                <TanStackStoreDevTools enabled={!import.meta.env.PROD}>
                  <Header />
                  {children}
                </TanStackStoreDevTools>
                {/* existing devtools */}
              </AutomergeRepoProvider>
            </TanStackQueryProvider>
          </ConvexProviderWithClerk>
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  );
}
```

**SSR guardrail:** If Clerk/Convex providers cause SSR issues with TanStack Start's shell render, wrap the provider subtree in `<ClientOnly>`. Acceptable for `app.tierset.com` since it's a highly interactive app.

---

## 2. Feature Integration Map

### What Stays Automerge (No Change)
| Feature | Current Implementation | Change |
|---------|----------------------|--------|
| Board creation/editing | Automerge doc via `useBoardDocument` | None |
| P2P collaboration | WebRTC via `useP2PNetwork`, `useHostRoom`, `useJoinRoom` | None |
| Local persistence | Dexie/IndexedDB via `storage/` | None |
| Drag-and-drop | Pragmatic DnD in `BoardView.tsx` | None |
| Image storage (working) | `imageStore` in Dexie | None |
| Signaling transport | Cloudflare KV via `/api/signaling/*` serverFns | None |

### What Connects to Convex (New)
| Feature | Integration Point | Convex Function |
|---------|------------------|-----------------|
| User profiles | `UserSyncer` component + `Header.tsx` | `users.ensureUser`, `users.getProfile` |
| Set username flow | New route `/set-username` | `users.setUsername` |
| Publish board | New "Publish" button in `BoardView.tsx` | `boards.publish` → `workflow.start(onBoardPublished)` |
| Room codes | `useHostRoom.ts`, `useJoinRoom.ts` | `rooms.createShortCode`, `rooms.resolveCode` |
| Short URLs | `RoomCodeDisplay.tsx`, share UX | `urls.create`, `urls.resolve` |
| Like/bookmark | New islands on published boards | `likes.toggle` → `workflow.start(onBoardLiked)` |
| Comments | New section on published boards | `comments.add` → `workflow.start(onCommentAdded)` |
| Follow users | Profile pages | `follows.toggle` → `workflow.start(onUserFollowed)` |
| Subscriptions | Header upgrade CTA, feature gates | `users.plan` query |
| Alerts | NotificationBell in Header | `alerts.hasUnread`, `alerts.list` |
| Email | Triggered by workflows | `@convex-dev/resend` component |
| Presence | Room facepile in BoardView | `@convex-dev/presence` component |

---

## 3. Component-Level Changes

### `Header.tsx` — Add Auth UI
```tsx
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { NotificationBell } from "../components/social/NotificationBell";

// In header nav:
<SignedOut>
  <SignInButton mode="modal" />
</SignedOut>
<SignedIn>
  <NotificationBell />
  <UserButton />
</SignedIn>
```

### `BoardView.tsx` — Add Publish Button
```tsx
import { SignedIn, SignedOut } from "@clerk/clerk-react";

// In toolbar:
<SignedIn>
  <PublishButton board={automergeBoard} />
</SignedIn>
<SignedOut>
  <button disabled title="Sign in to publish">Publish</button>
</SignedOut>
```

**Publish steps (client-side):**
1. Serialize Automerge doc → JSON snapshot (use `@tierset/shared` schemas)
2. Upload preview image: read blob from `imageStore.get(imageId)` → `photos.generateUploadUrl()` → PUT blob → `photos.savePhoto(storageId)`
3. Call `boards.publish({ title, slug, tierData, previewImageId, ... })`
4. Convex mutation internally calls `workflow.start(onBoardPublished, ...)` for fan-out
5. Show published URL: `www.tierset.com/b/:slug`

### `useJoinRoom.ts` — Dual Room Code Resolution
```tsx
let documentUrl: string;
const decoded = decodeRoomCode(code);
if (decoded?.documentUrl) {
  documentUrl = decoded.documentUrl;
} else {
  const resolved = await convex.query(api.rooms.resolveCode, { code });
  if (!resolved) throw new Error("Invalid room code");
  documentUrl = resolved.documentUrl;
}
```

### `useHostRoom.ts` — Create Convex Room Code
```tsx
const code = await convex.mutation(api.rooms.createShortCode, {
  documentUrl: boardUrl,
  maxPeers: 10,
  ttlHours: 24,
});
```

---

## 4. New Files to Create

### `apps/app/src/components/auth/UserSyncer.tsx`
Invisible component inside `<SignedIn>`:
- Calls `users.ensureUser` mutation on mount
- If `username` is null → redirect to `/set-username`
- Runs on every sign-in (idempotent via Convex upsert)

### `apps/app/src/routes/set-username.tsx`
- TanStack Form → `users.setUsername` mutation
- Validates username uniqueness via `users.checkUsername` query
- Redirects to `/board` or previous location on success

### `apps/app/src/components/board/PublishButton.tsx`
- Serialize Automerge doc
- Upload images to Convex storage
- Call `boards.publish` mutation (triggers workflow internally)
- Show success modal with published URL

### `apps/app/src/components/social/NotificationBell.tsx`
- Uses `useQuery(api.alerts.hasUnread)` for badge
- Dropdown shows `useQuery(api.alerts.list)` with mark-as-read

---

## 5. Convex Workflow Fan-Out

Social actions trigger durable workflows with parallel steps and automatic retry.

```typescript
// convex/boards.ts — publish handler triggers workflow
import { workflow } from "./workflows";

export const publish = mutation({
  args: { /* ... */ },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const boardId = await ctx.db.insert("boards", { /* ... */ });

    // Durable fan-out: email + alerts + feed (parallel, with retry)
    await workflow.start(ctx, internal.workflows.onBoardPublished, {
      boardId,
      authorId: user._id,
      title: args.title,
    });

    return boardId;
  },
});
```

```typescript
// convex/likes.ts — toggle handler triggers workflow
export const toggle = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const existing = await ctx.db.query("likes")
      .withIndex("by_user_board", q => q.eq("userId", user._id).eq("boardId", args.boardId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(args.boardId, { likeCount: board.likeCount - 1 });
    } else {
      await ctx.db.insert("likes", { userId: user._id, boardId: args.boardId, createdAt: Date.now() });
      await ctx.db.patch(args.boardId, { likeCount: board.likeCount + 1 });

      // Notify board author (durable, with retry)
      const board = await ctx.db.get(args.boardId);
      await workflow.start(ctx, internal.workflows.onBoardLiked, {
        boardId: args.boardId,
        boardAuthorId: board!.authorId,
        likerId: user._id,
      });
    }
  },
});
```

---

## 6. Environment Variables

### `apps/app` (client-exposed via Vite, `VITE_` prefix)
```env
VITE_CONVEX_URL=https://your-project.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
```

### `apps/app/wrangler.jsonc` (Cloudflare Workers)
```jsonc
{
  "vars": {
    "ENVIRONMENT": "production",
    "VITE_CONVEX_URL": "https://your-project.convex.cloud",
    "VITE_CLERK_PUBLISHABLE_KEY": "pk_live_..."
  }
}
```

### Convex (server-side, set via dashboard)
```
CLERK_ISSUER_URL=https://your-clerk-instance.clerk.accounts.dev
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...    (optional, for delivery tracking)
```

---

## 7. Package Additions

### `apps/app/package.json`
```json
{
  "dependencies": {
    "convex": "^1.x",
    "@clerk/clerk-react": "^5.x",
    "@convex-dev/presence": "latest",
    "@tierset/shared": "workspace:*"
  }
}
```

### Root / Convex package deps
```json
{
  "dependencies": {
    "convex": "^1.x",
    "@convex-dev/resend": "latest",
    "@convex-dev/workflow": "latest",
    "@convex-dev/presence": "latest",
    "svix": "^1.x"
  }
}
```

---

## 8. Auth Across Subdomains

Configure Clerk for multi-domain session sharing:
- `app.tierset.com` — SPA (ClerkProvider)
- `www.tierset.com` — Astro site (ConvexProviderWithClerk)

Clerk settings:
- Set cookie domain to `.tierset.com` (shared across subdomains)
- Configure allowed origins for both subdomains
- Use same Clerk application for both

---

## 9. Implementation Order

### Phase A: Auth Foundation (Day 1)
- [ ] Add `convex` + `@clerk/clerk-react` to `apps/app/package.json`
- [ ] Update `__root.tsx` with ClerkProvider + ConvexProviderWithClerk
- [ ] Add auth UI to `Header.tsx` (SignIn/UserButton)
- [ ] Create `UserSyncer.tsx` component
- [ ] Create `/set-username` route
- [ ] Verify: sign in → user created in Convex `users` table

### Phase B: Room Codes via Convex (Day 1-2)
- [ ] Update `useHostRoom.ts` to create Convex room codes
- [ ] Update `useJoinRoom.ts` with dual resolution (legacy + Convex)
- [ ] Update signaling serverFn to accept provided codes
- [ ] Verify: host creates room → join via Convex code → P2P works

### Phase C: Publish Flow (Day 2-3)
- [ ] Create `PublishButton.tsx` component
- [ ] Implement Automerge doc → JSON serialization
- [ ] Implement image upload to Convex storage
- [ ] Add `boards.publish` mutation call
- [ ] Verify: publish board → appears in Convex dashboard

### Phase D: Social Features (Day 3-4)
- [ ] Add like/bookmark toggle UI on published boards
- [ ] Add comment section on published boards
- [ ] Add follow button on user profiles
- [ ] Add NotificationBell to Header
- [ ] Verify: social interactions → alerts created

### Phase E: Convex Components (Day 4-5)
- [ ] Install `@convex-dev/workflow`, `@convex-dev/resend`, `@convex-dev/presence`
- [ ] Create `convex/convex.config.ts` with component registration
- [ ] Create `convex/workflows.ts` with fan-out workflows
- [ ] Create `convex/emails.ts` with Resend component
- [ ] Wire mutations to `workflow.start()` for durable fan-out
- [ ] Verify: publish → workflow runs → alert + email sent

### Phase F: Subscriptions (Day 5)
- [ ] Configure Clerk billing with Stripe
- [ ] Wire Clerk webhook → Convex `users.plan` update
- [ ] Add plan-gated UI in SPA (pro features)
- [ ] Add presence component to P2P rooms

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| SSR crashes from Clerk/Convex providers | Wrap in `<ClientOnly>` — app is SPA-first anyway |
| Room join requires embedded doc URL | Dual resolution: try legacy decode first, fall back to Convex |
| Publishing needs images from Dexie | Read blobs from `imageStore.get()`, handle missing gracefully |
| Auth across subdomains | Configure Clerk cookie domain to `.tierset.com` |
| Convex cold starts on free tier | Acceptable for social features; Automerge P2P unaffected |
| Workflow parallelism limits (20 free / 100 pro) | Sufficient for early-stage; batch work per step if needed |
| Resend rate limits | Component handles rate limiting automatically |

---

## 11. Architecture Benefits: Convex-Only

| Benefit | Impact |
|---------|--------|
| One backend | One deploy, one dashboard, one billing |
| No webhook bridge | No `emitToEncore` action, no webhook secret, no latency |
| Better email | `@convex-dev/resend` has idempotency, batching, delivery tracking built-in |
| Reactive workflow status | `useQuery` on workflow status for real-time progress UI |
| Presence included | Heartbeat-based "who's online" in rooms |
| Simpler monorepo | `apps/app/`, `apps/www/`, `packages/shared/`, `convex/` — no `apps/backend/` |
