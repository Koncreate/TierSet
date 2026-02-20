# Validation, Auth & Rate Limiting Plan

## Current Status

| Feature            | Status               | Notes                               |
| ------------------ | -------------------- | ----------------------------------- |
| **Zod**            | ✅ Already installed | `zod@^4.1.11` in dependencies       |
| **JWT**            | ❌ Not used          | P2P architecture doesn't require it |
| **TanStack Pacer** | ❌ Not installed     | Recommended for rate limiting       |
| **User Auth**      | ❌ Not implemented   | P2P = no server auth needed         |

---

## 🔐 Authentication Strategy (P2P-First)

### Why No JWT?

**JWT is for server-client architectures.** Your app is P2P:

```
┌─────────────────────────────────────────────────────────────┐
│ TRADITIONAL (Needs JWT)                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Client ──▶ JWT Auth ◀── Server                             │
│             │                                               │
│             └──▶ "Who are you?"                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ YOUR APP (P2P - No JWT Needed)                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User A ════════════════════▶ User B                        │
│  (Browser)       P2P         (Browser)                      │
│                                                             │
│  ✅ No server to authenticate with                          │
│  ✅ Room codes = access control                             │
│  ✅ WebRTC encryption = secure transport                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Room-Based Access Control

Instead of JWT, use **room codes** for access control:

```typescript
// src/lib/p2p/room-auth.ts

import { customAlphabet } from "nanoid";
import { createId } from "#/lib/ids";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I, O, 1, 0
const ROOM_CODE_LENGTH = 6;
const createRoomCodeId = customAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);

export interface RoomConfig {
  code: string; // e.g., "TIER-7XK9Q2"
  passwordHash?: string; // Optional password
  hostId: string; // Peer ID of host
  createdAt: number;
  expiresAt: number; // Auto-expire rooms
  maxPeers: number;
}

export class RoomManager {
  private rooms = new Map<string, RoomConfig>();

  createRoom(options: Partial<RoomConfig> = {}): RoomConfig {
    const code = this.generateRoomCode();
    const room: RoomConfig = {
      code,
      hostId: createId(),
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      maxPeers: 10,
      ...options,
    };

    this.rooms.set(code, room);
    return room;
  }

  async joinRoom(code: string, password?: string): Promise<RoomConfig> {
    const room = this.rooms.get(code);

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.expiresAt < Date.now()) {
      this.rooms.delete(code);
      throw new Error("Room expired");
    }

    if (room.passwordHash && password) {
      const valid = await verifyPassword(password, room.passwordHash);
      if (!valid) {
        throw new Error("Invalid password");
      }
    }

    return room;
  }

  private generateRoomCode(): string {
    return `TIER-${createRoomCodeId()}`;
  }
}
```

### Optional: Password-Protected Rooms

```typescript
// src/lib/p2p/room-auth.ts
import { randomBytes } from "@noble/hashes/utils";
import { scrypt } from "@noble/hashes/scrypt";

export async function createPasswordHash(password: [REDACTED: password]): Promise<string> {
  const salt = randomBytes(16);
  const params = { N: 2 ** 15, r: 8, p: 1, dkLen: 32 };
  const key = await scrypt(password, salt, params);

  return `scrypt:${params.N}:${params.r}:${params.p}:${toHex(salt)}:${toHex(key)}`;
}

export async function verifyPassword(
  password: [REDACTED: password],
  hashString: string,
): Promise<boolean> {
  const [algo, n, r, p, saltHex, expectedKeyHex] = hashString.split(":");
  const params = { N: Number(n), r: Number(r), p: Number(p), dkLen: 32 };
  const salt = fromHex(saltHex);

  const key = await scrypt(password, salt, params);
  const actualKeyHex = toHex(key);

  return constantTimeEqual(actualKeyHex, expectedKeyHex);
}
```

---

## ✅ Zod Validation (Already Installed)

### Use Cases for Zod

**1. Board Document Validation**

```typescript
// src/lib/documents/validation.ts

import { z } from "zod";
import { isCuid } from "@paralleldrive/cuid2";

export const BoardItemSchema = z.object({
  id: z.string().refine(isCuid, "Invalid cuid2"),
  name: z.string().min(1).max(100),
  imageId: z.string().refine(isCuid, "Invalid cuid2").optional(),
  emoji: z.string().emoji().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.number(),
  createdBy: z.string().refine(isCuid, "Invalid cuid2"),
});

export const TierSchema = z.object({
  id: z.string().refine(isCuid, "Invalid cuid2"),
  name: z.string().min(1).max(50),
  label: z.string().length(1),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  itemIds: z.array(z.string().refine(isCuid, "Invalid cuid2")),
  createdAt: z.number(),
});

export const BoardDocumentSchema = z.object({
  id: z.string().refine(isCuid, "Invalid cuid2"),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  createdBy: z.string().refine(isCuid, "Invalid cuid2"),
  tiers: z.array(TierSchema),
  items: z.array(BoardItemSchema),
  settings: z.object({
    allowPublicJoin: z.boolean(),
    requirePassword: z.boolean(),
    maxPeers: z.number().min(1).max(50),
  }),
  _peers: z.array(
    z.object({
      id: z.string().refine(isCuid, "Invalid cuid2"),
      connectedAt: z.number(),
    }),
  ),
});

export function validateBoardDocument(data: unknown) {
  return BoardDocumentSchema.parse(data);
}

export function safeValidateBoardDocument(data: unknown) {
  return BoardDocumentSchema.safeParse(data);
}
```

**2. P2P Message Validation**

```typescript
// src/lib/p2p/validation.ts

import { z } from "zod";
import { isCuid } from "@paralleldrive/cuid2";

export const SyncMessageSchema = z.object({
  type: z.literal("sync"),
  boardId: z.string().refine(isCuid, "Invalid cuid2"),
  delta: z.instanceof(Uint8Array),
  timestamp: z.number(),
  senderId: z.string().refine(isCuid, "Invalid cuid2"),
});

export const ChatMessageSchema = z.object({
  type: z.literal("chat"),
  boardId: z.string().refine(isCuid, "Invalid cuid2"),
  content: z.string().min(1).max(500),
  timestamp: z.number(),
  senderId: z.string().refine(isCuid, "Invalid cuid2"),
});

export const P2PMessageSchema = z.discriminatedUnion("type", [
  SyncMessageSchema,
  ChatMessageSchema,
]);

export function validateP2PMessage(data: unknown) {
  const result = P2PMessageSchema.safeParse(data);

  if (!result.success) {
    console.error("Invalid P2P message:", result.error);
    return null;
  }

  return result.data;
}
```

**3. API Endpoint Validation (Server Functions)**

```typescript
// src/routes/api/turn-token.ts

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getTurnToken = createServerFn({ method: "GET" })
  .validator(
    z.object({
      // Optional: validate query params
      expiresIn: z.number().min(300).max(86400).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    // Validate user is authenticated (if you add auth)
    if (!context.user) {
      throw new Error("Unauthorized");
    }

    const expiresIn = data?.expiresIn ?? 86400; // 24 hours default

    // Generate TURN credentials...
  });
```

---

## 🚦 TanStack Pacer (Recommended Addition)

### Install

```bash
bun add @tanstack/pacer
```

### Use Cases

**1. Debounce Search Input**

```typescript
// src/components/ItemSearch.tsx

import { useDebouncedCallback } from '@tanstack/pacer'
import { useState } from 'react'

export function ItemSearch({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState('')

  const debouncedSearch = useDebouncedCallback(
    (value: string) => {
      onSearch(value)
    },
    { wait: 300 }
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    debouncedSearch(value)
  }

  return (
    <input
      type="text"
      value={query}
      onChange={handleChange}
      placeholder="Search items..."
    />
  )
}
```

**2. Throttle Drag Updates**

```typescript
// src/components/tier-list/TierItem.tsx

import { useThrottledCallback } from '@tanstack/pacer'

export function TierItem({ item, onDrag }: { item: Item; onDrag: (pos: Position) => void }) {
  // Only send position updates 10 times per second (100ms)
  const throttledDrag = useThrottledCallback(
    (position: Position) => {
      onDrag(position)
    },
    { wait: 100 }
  )

  const handleDrag = (e: DragEvent) => {
    throttledDrag({ x: e.clientX, y: e.clientY })
  }

  return (
    <div draggable onDrag={handleDrag}>
      {item.name}
    </div>
  )
}
```

**3. Rate Limit P2P Messages**

```typescript
// src/lib/p2p/rate-limiter.ts

import { rateLimit } from "@tanstack/pacer";

export class P2PRateLimiter {
  // Limit: 10 messages per second per peer
  private limiters = new Map<string, ReturnType<typeof rateLimit>>();

  getLimiter(peerId: string) {
    if (!this.limiters.has(peerId)) {
      const limiter = rateLimit((fn: () => void) => fn(), { limit: 10, interval: 1000 });
      this.limiters.set(peerId, limiter);
    }
    return this.limiters.get(peerId)!;
  }

  sendMessage(peerId: string, message: P2PMessage) {
    const limiter = this.getLimiter(peerId);

    limiter(() => {
      this.pc.send(message);
    });
  }
}
```

**4. Rate Limit Chat Voting (Prevent Spam)**

```typescript
// src/integrations/livestream/ChatVotingService.ts

import { rateLimit } from "@tanstack/pacer";

export class ChatVotingService {
  private userLimits = new Map<string, ReturnType<typeof rateLimit>>();

  private getUserLimiter(userId: string) {
    if (!this.userLimits.has(userId)) {
      // 1 vote per 2 seconds per user
      const limiter = rateLimit((vote: ChatVote) => this.processVote(vote), {
        limit: 1,
        interval: 2000,
      });
      this.userLimits.set(userId, limiter);
    }
    return this.userLimits.get(userId)!;
  }

  async handleChatVote(vote: ChatVote) {
    const limiter = this.getUserLimiter(vote.userId);

    try {
      await limiter(vote);
    } catch {
      // Rate limit exceeded - ignore vote
      console.warn(`User ${vote.userId} is voting too fast`);
    }
  }
}
```

**5. Batch Automerge Changes**

```typescript
// src/lib/documents/BatchedChanges.ts

import { useBatcher } from "@tanstack/pacer";

export function useBatchedBoardChanges(boardId: string) {
  const { change } = useBoardDocument(boardId);

  // Batch multiple changes within 100ms window
  const batchedChange = useBatcher(
    (changes: Array<(doc: BoardDocument) => void>) => {
      change((doc) => {
        changes.forEach((fn) => fn(doc));
      });
    },
    { wait: 100 },
  );

  return {
    change: (fn: (doc: BoardDocument) => void) => {
      batchedChange(fn);
    },
  };
}

// Usage:
// Multiple rapid edits get batched into single Automerge transaction
const { change } = useBatchedBoardChanges(boardId);
change((doc) => {
  doc.name = "New Name";
});
change((doc) => {
  doc.description = "Updated";
});
// Both changes applied in single transaction
```

---

## 📊 Recommended Additions

### Add TanStack Pacer

```bash
bun add @tanstack/pacer
```

**Why:**

- ✅ Debounce search (better UX)
- ✅ Throttle drag updates (reduce P2P traffic)
- ✅ Rate limit chat votes (prevent spam)
- ✅ Batch Automerge changes (reduce sync overhead)

### Keep Current Auth Strategy (No JWT)

**Why:**

- ✅ P2P doesn't need server auth
- ✅ Room codes = simple access control
- ✅ Optional password protection
- ✅ WebRTC provides encryption

### Use Zod More Extensively

**Already installed, use for:**

- ✅ Board document validation
- ✅ P2P message validation
- ✅ Server function validation
- ✅ Form validation (already using in demo)

---

## 📋 Implementation Priority

| Priority | Task                                  | Effort | Impact                   |
| -------- | ------------------------------------- | ------ | ------------------------ |
| **P0**   | Add Zod validation to P2P messages    | Low    | High (security)          |
| **P0**   | Add Zod validation to board documents | Low    | High (data integrity)    |
| **P1**   | Install TanStack Pacer                | Low    | Medium (performance)     |
| **P1**   | Add debounce to search inputs         | Low    | Medium (UX)              |
| **P2**   | Add throttle to drag updates          | Medium | Medium (P2P traffic)     |
| **P2**   | Add rate limit to chat voting         | Medium | Medium (spam prevention) |
| **P3**   | Add password-protected rooms          | Medium | Low (optional feature)   |
| **P3**   | Add batched Automerge changes         | High   | Low (optimization)       |

---

## 🔒 Security Considerations

### P2P Trust Model

```
┌─────────────────────────────────────────────────────────────┐
│ P2P SECURITY MODEL                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✅ WebRTC DTLS encryption (in-transit)                     │
│  ✅ Room codes (access control)                             │
│  ✅ Message validation (Zod schemas)                        │
│  ✅ Rate limiting (prevent DoS)                             │
│                                                             │
│  ⚠️  Peers are trusted once connected                       │
│  ⚠️  No E2EE (Automerge docs visible to all peers)          │
│  ⚠️  No audit trail (P2P = no central log)                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### If You Need E2EE Later

For sensitive tier lists (private rankings, etc.):

```typescript
// Future: Add encryption layer to Automerge
import { Box } from "@localfirst/crypto";

const box = new Box({
  teamName: "my-tier-list",
  userName: "alice",
});

const encryptedDoc = box.encrypt(automergeDoc);
// Send encryptedDoc to peers
```

---

## 📝 Summary

| Question                          | Answer                                            |
| --------------------------------- | ------------------------------------------------- |
| **Should we add Zod?**            | ✅ Already installed! Use it more for validation  |
| **Are we using JWT?**             | ❌ No, P2P doesn't need it (room codes instead)   |
| **How do users auth?**            | Room codes + optional password (no server needed) |
| **Should we add TanStack Pacer?** | ✅ Yes, for debounce/throttle/rate-limit          |

**Next Steps:**

1. Add Zod schemas to `src/lib/documents/validation.ts`
2. Add Zod validation to P2P message handlers
3. `bun add @tanstack/pacer`
4. Add debounce to search, throttle to drag, rate-limit to chat
