# Plan 3: Convex Components — Durable Fan-Out, Email, Presence

> Convex-only architecture — no external backend service. Three Convex components provide everything needed for durable workflows, email delivery, and user presence.

---

## Why Convex-Only

Everything runs inside Convex — no separate backend service needed. The original plan considered Encore.ts for external fan-out (email, push, analytics, webhooks), but three Convex components eliminate that need entirely:

| Encore Service | Convex Component Replacement | Quality |
|---|---|---|
| notification/email (Resend + retry + DLQ) | `@convex-dev/resend` — queueing, batching, retry, idempotency, rate limiting, webhook tracking | ✅ Better |
| Fan-out (topic → N subscribers) | `@convex-dev/workflow` — `Promise.all()` parallel steps with per-step retry + backoff | ✅ Equivalent |
| Retry + DLQ | Workflow — `maxAttempts`, exponential backoff, failed workflow inspection | ✅ Equivalent |
| Long-running processing | Workflow — survives server restarts, runs for months, cancellable | ✅ Equivalent |
| Cron jobs | Convex native `cronJobs()` | ✅ Native |
| Webhook ingestion (Clerk, Stripe) | `convex/http.ts` | ✅ Native |
| Push notifications | Workflow step → `fetch()` to Web Push API with retry | ✅ Works |
| Analytics tracking | Workflow step → `fetch()` to analytics API with retry | ✅ Works |
| Feed fan-out | Workflow with parallel mutation steps | ✅ Works |
| User presence | `@convex-dev/presence` — heartbeat, online status, facepile | ✅ Bonus |

### What This Eliminates

- `apps/backend/` directory (no Encore services)
- `api.tierset.com` subdomain
- Convex → Encore webhook bridge
- Encore secrets, deploy pipeline, monitoring
- Second backend billing
- One codebase, one deploy, one dashboard, one billing

---

## Component Setup

### `convex/convex.config.ts`

```typescript
import { defineApp } from "convex/server";
import resend from "@convex-dev/resend/convex.config.js";
import workflow from "@convex-dev/workflow/convex.config.js";
import presence from "@convex-dev/presence/convex.config.js";

const app = defineApp();
app.use(resend);
app.use(workflow);
app.use(presence);
export default app;
```

### Package Dependencies

```json
// Add to convex-related deps (root or wherever Convex functions are deployed from)
{
  "dependencies": {
    "convex": "^1.x",
    "@convex-dev/resend": "latest",
    "@convex-dev/workflow": "latest",
    "@convex-dev/presence": "latest"
  }
}
```

### Environment Variables (Convex Dashboard)

```
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...    (optional, for delivery tracking)
```

---

## Component 1: `@convex-dev/workflow` — Durable Fan-Out

Replaces Encore topics + subscribers. Define workflows that run N steps in parallel with independent retry.

### Workflow Manager Setup

```typescript
// convex/workflows.ts
import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";

export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 500,
      base: 2,
    },
    retryActionsByDefault: true,
  },
});
```

### Fan-Out Workflows

```typescript
// convex/workflows.ts (continued)

// ─── Board Published → notify followers + email + feed ───
export const onBoardPublished = workflow.define({
  args: {
    boardId: v.id("boards"),
    authorId: v.id("users"),
    title: v.string(),
  },
  handler: async (step, args): Promise<void> => {
    await Promise.all([
      step.runMutation(internal.alerts.notifyFollowers, {
        authorId: args.authorId,
        boardId: args.boardId,
        type: "board_published",
      }),
      step.runAction(internal.emails.sendBoardPublishedEmail, {
        authorId: args.authorId,
        title: args.title,
      }),
      step.runMutation(internal.feed.fanOutToFollowers, {
        authorId: args.authorId,
        boardId: args.boardId,
      }),
    ]);
  },
});

// ─── Board Liked → notify board author ───
export const onBoardLiked = workflow.define({
  args: {
    boardId: v.id("boards"),
    boardAuthorId: v.id("users"),
    likerId: v.id("users"),
  },
  handler: async (step, args): Promise<void> => {
    await step.runMutation(internal.alerts.createAlert, {
      recipientUserId: args.boardAuthorId,
      actorUserId: args.likerId,
      type: "like",
      boardId: args.boardId,
    });
  },
});

// ─── User Followed → notify followed user ───
export const onUserFollowed = workflow.define({
  args: {
    followerId: v.id("users"),
    followingId: v.id("users"),
  },
  handler: async (step, args): Promise<void> => {
    await Promise.all([
      step.runMutation(internal.alerts.createAlert, {
        recipientUserId: args.followingId,
        actorUserId: args.followerId,
        type: "follow",
      }),
      step.runAction(internal.emails.sendNewFollowerEmail, {
        followerId: args.followerId,
        followingId: args.followingId,
      }),
    ]);
  },
});

// ─── Comment Added → notify board author + parent commenter ───
export const onCommentAdded = workflow.define({
  args: {
    commentId: v.id("comments"),
    boardId: v.id("boards"),
    boardAuthorId: v.id("users"),
    commenterId: v.id("users"),
    parentCommentAuthorId: v.optional(v.id("users")),
  },
  handler: async (step, args): Promise<void> => {
    const tasks = [
      step.runMutation(internal.alerts.createAlert, {
        recipientUserId: args.boardAuthorId,
        actorUserId: args.commenterId,
        type: "comment",
        boardId: args.boardId,
        commentId: args.commentId,
      }),
    ];

    // Also notify parent comment author if this is a reply
    if (args.parentCommentAuthorId && args.parentCommentAuthorId !== args.commenterId) {
      tasks.push(
        step.runMutation(internal.alerts.createAlert, {
          recipientUserId: args.parentCommentAuthorId,
          actorUserId: args.commenterId,
          type: "reply",
          boardId: args.boardId,
          commentId: args.commentId,
        }),
      );
    }

    await Promise.all(tasks);
  },
});

// ─── User Signed Up → welcome email ───
export const onUserSignedUp = workflow.define({
  args: {
    userId: v.id("users"),
    email: v.string(),
    displayName: v.string(),
  },
  handler: async (step, args): Promise<void> => {
    await step.runAction(internal.emails.sendWelcomeEmail, {
      email: args.email,
      name: args.displayName,
    });
  },
});

// ─── Subscription Changed → sync plan ───
export const onSubscriptionChanged = workflow.define({
  args: {
    userId: v.id("users"),
    newPlan: v.union(v.literal("free"), v.literal("pro")),
  },
  handler: async (step, args): Promise<void> => {
    await step.runMutation(internal.users.updatePlan, {
      userId: args.userId,
      plan: args.newPlan,
    });
  },
});
```

### Triggering Workflows from Mutations

```typescript
// convex/boards.ts — inside publish handler
import { workflow } from "./workflows";

// After saving the board to DB:
await workflow.start(ctx, internal.workflows.onBoardPublished, {
  boardId: newBoardId,
  authorId: user._id,
  title: args.title,
});
```

```typescript
// convex/likes.ts — inside toggle handler
// After inserting the like:
await workflow.start(ctx, internal.workflows.onBoardLiked, {
  boardId: args.boardId,
  boardAuthorId: board.authorId,
  likerId: user._id,
});
```

### Parallelism Limits

- **Free tier:** max 20 parallel workflow steps
- **Pro tier:** max 100 across all workflows
- For early-stage TierSet, this is plenty. Batch work per step if needed later.

---

## Component 2: `@convex-dev/resend` — Email Delivery

Built-in queueing, batching, retry, idempotency, rate limiting, and delivery tracking.

### Setup

```typescript
// convex/emails.ts
import { components, internal } from "./_generated/api";
import { Resend } from "@convex-dev/resend";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const resend = new Resend(components.resend, {
  testMode: false, // set true during dev
  onEmailEvent: internal.emails.handleEmailEvent,
});

// ─── Welcome email ───
export const sendWelcomeEmail = internalAction({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await resend.sendEmail(ctx, {
      from: "TierSet <hello@tierset.com>",
      to: args.email,
      subject: `Welcome to TierSet, ${args.name}!`,
      html: `<h1>Welcome, ${args.name}!</h1><p>Start creating tier lists and brackets with friends.</p>`,
    });
  },
});

// ─── Board published notification ───
export const sendBoardPublishedEmail = internalAction({
  args: { authorId: v.id("users"), title: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.users.getById, { userId: args.authorId });
    if (!user?.email) return;

    await resend.sendEmail(ctx, {
      from: "TierSet <hello@tierset.com>",
      to: user.email,
      subject: `Your board "${args.title}" is live!`,
      html: `<p>Your board <strong>${args.title}</strong> has been published.</p>`,
    });
  },
});

// ─── New follower notification ───
export const sendNewFollowerEmail = internalAction({
  args: { followerId: v.id("users"), followingId: v.id("users") },
  handler: async (ctx, args) => {
    const [follower, following] = await Promise.all([
      ctx.runQuery(internal.users.getById, { userId: args.followerId }),
      ctx.runQuery(internal.users.getById, { userId: args.followingId }),
    ]);
    if (!following?.email || !follower) return;

    await resend.sendEmail(ctx, {
      from: "TierSet <hello@tierset.com>",
      to: following.email,
      subject: `${follower.displayName} started following you`,
      html: `<p><strong>${follower.displayName}</strong> is now following you on TierSet.</p>`,
    });
  },
});

// ─── Delivery status tracking ───
export const handleEmailEvent = internalAction({
  args: { id: v.any(), event: v.any() },
  handler: async (ctx, args) => {
    // Log delivery status changes (delivered, bounced, complained)
    console.log("Email event:", args.event);
  },
});
```

### Webhook for Delivery Tracking (Optional)

```typescript
// convex/http.ts — add Resend webhook route
import { resend } from "./emails";

http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await resend.handleResendEventWebhook(ctx, req);
  }),
});
```

### Cleanup Cron

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const crons = cronJobs();

crons.interval("cleanup-old-emails", { hours: 1 }, internal.crons.cleanupResend);

export const cleanupResend = internalMutation({
  handler: async (ctx) => {
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    await ctx.scheduler.runAfter(0, components.resend.lib.cleanupOldEmails, {
      olderThan: ONE_WEEK,
    });
  },
});

export default crons;
```

---

## Component 3: `@convex-dev/presence` — User Presence

Live "who's online" in P2P rooms and on published boards.

### Setup

```typescript
// convex/presence.ts
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { Presence } from "@convex-dev/presence";

export const presence = new Presence(components.presence);

export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    return await presence.heartbeat(ctx, roomId, userId, sessionId, interval);
  },
});

export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    return await presence.list(ctx, roomToken);
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    return await presence.disconnect(ctx, sessionToken);
  },
});
```

### React Hook Usage (in apps/app)

```tsx
// In BoardView.tsx or RoomCodeDisplay.tsx
import usePresence from "@convex-dev/presence/react";
import FacePile from "@convex-dev/presence/facepile";
import { api } from "../../convex/_generated/api";

function RoomPresence({ roomCode, username }: { roomCode: string; username: string }) {
  const presenceState = usePresence(api.presence, roomCode, username);

  return <FacePile presenceState={presenceState ?? []} />;
}
```

---

## Cron Jobs (Native Convex)

No Encore needed — Convex has built-in cron support.

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Weekly digest email (Monday 9 AM UTC)
crons.cron("weekly-digest", "0 9 * * 1", internal.emails.sendWeeklyDigest);

// Expire old room codes (every hour)
crons.interval("cleanup-rooms", { hours: 1 }, internal.rooms.cleanupExpired);

// Aggregate daily stats (midnight UTC)
crons.cron("daily-stats", "0 0 * * *", internal.analytics.aggregateDaily);

// Cleanup old emails from Resend component
crons.interval("cleanup-old-emails", { hours: 1 }, internal.crons.cleanupResend);

export default crons;
```

---

## Updated Convex File Structure

```
convex/
├── _generated/               ← auto-generated
├── convex.config.ts          ← component registration (resend, workflow, presence)
├── schema.ts                 ← all table definitions (see Plan 2)
├── auth.config.ts            ← Clerk JWT verification
├── http.ts                   ← HTTP router: Clerk webhook + Resend webhook + OG meta
│
├── users.ts                  ← ensureUser, getProfile, updateProfile, setUsername
├── boards.ts                 ← publish, listPublished, getById, search
├── comments.ts               ← add, delete, list (threaded)
├── likes.ts                  ← toggle like
├── follows.ts                ← toggle follow
├── bookmarks.ts              ← toggle bookmark
├── alerts.ts                 ← createAlert (internalMutation), list, markRead
├── rooms.ts                  ← createShortCode, resolveCode, cleanupExpired
├── urls.ts                   ← create, resolve short URLs
├── photos.ts                 ← generateUploadUrl, savePhoto, getUrl
├── feed.ts                   ← fanOutToFollowers
├── subscriptions.ts          ← check plan, update from webhook
│
├── workflows.ts              ← WorkflowManager + all fan-out workflow definitions
├── emails.ts                 ← Resend component + email sending functions
├── presence.ts               ← Presence component + heartbeat/list/disconnect
├── crons.ts                  ← scheduled jobs (digest, cleanup, stats)
└── tsconfig.json
```

---

## Event Flow: Full Example (Convex-Only)

**User publishes a board** — end-to-end:

```
1. User clicks "Publish" in apps/app
   │
2. SPA calls Convex mutation boards.publish()
   │ → Board saved to Convex DB
   │ → Preview image uploaded to Convex storage
   │ → workflow.start(onBoardPublished, { boardId, authorId, title })
   │
3. Workflow runs 3 steps in parallel (with retry):
   │
   ├─► alerts.notifyFollowers (internalMutation)
   │     → Insert alert for each follower
   │     → Followers see it via useQuery(api.alerts.list) in realtime
   │
   ├─► emails.sendBoardPublishedEmail (internalAction)
   │     → Resend component queues email with idempotency
   │     → Batched + rate-limited delivery
   │
   └─► feed.fanOutToFollowers (internalMutation)
         → Insert board into each follower's feed
         → Followers see it on www.tierset.com/feed via useQuery()
```

No webhook bridge, no external service, no second deploy.

---

## Implementation Phases

### Phase 1: Component Setup
- [ ] Install `@convex-dev/resend`, `@convex-dev/workflow`, `@convex-dev/presence`
- [ ] Create `convex/convex.config.ts` with all three components
- [ ] Set `RESEND_API_KEY` in Convex dashboard
- [ ] Verify `npx convex dev` starts with components registered

### Phase 2: Workflow Fan-Out
- [ ] Create `convex/workflows.ts` with WorkflowManager
- [ ] Define `onBoardPublished`, `onBoardLiked`, `onUserFollowed`, `onCommentAdded`
- [ ] Wire `workflow.start()` into board publish, like toggle, follow toggle mutations
- [ ] Verify: publish board → workflow runs → alerts created

### Phase 3: Email Delivery
- [ ] Create `convex/emails.ts` with Resend component
- [ ] Welcome email on signup (triggered by `onUserSignedUp` workflow)
- [ ] Board published notification email
- [ ] New follower notification email
- [ ] Set up Resend webhook for delivery tracking (optional)
- [ ] Email cleanup cron

### Phase 4: Presence
- [ ] Create `convex/presence.ts` with Presence component
- [ ] Add `usePresence` hook to BoardView for P2P rooms
- [ ] Show FacePile of online users in room
- [ ] Optionally show online status on user profiles

### Phase 5: Crons + Analytics
- [ ] Weekly digest cron → query top boards → send via Resend
- [ ] Room code cleanup cron
- [ ] Daily stats aggregation
- [ ] Analytics tracking via workflow steps (Convex mutations to analytics table)
