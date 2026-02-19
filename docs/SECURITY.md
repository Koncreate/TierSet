# TierBoard Security Model

## Overview

TierBoard is a **P2P local-first** application with a unique security model that differs from traditional server-client architectures.

---

## 🏗️ Architecture Security Properties

### P2P Trust Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TIERBOARD SECURITY MODEL                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Traditional App (Server-Client):                                       │
│  ┌──────────┐      HTTPS/TLS      ┌──────────┐                         │
│  │  Client  │ ──────────────────▶ │  Server  │                         │
│  └──────────┘                     └──────────┘                         │
│       │                              │                                  │
│       │ ✅ Server validates all     │ ✅ Central auth (JWT/OAuth)      │
│       │ ✅ Server rate limits       │ ✅ Audit logs                    │
│       │ ✅ Server access control    │ ✅ Data backup                   │
│                                                                          │
│  TierBoard (P2P):                                                       │
│  ┌──────────┐      WebRTC DTLS      ┌──────────┐                       │
│  │  Peer A  │ ◀───────────────────▶ │  Peer B  │                       │
│  └──────────┘      (Encrypted)      └──────────┘                       │
│       │                              │                                  │
│       │ ⚠️ Peers trust each other   │ ⚠️ No central authority          │
│       │ ✅ Room codes = access      │ ✅ WebRTC encryption             │
│       │ ✅ Local validation         │ ✅ No server breach risk         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Security Properties

| Property                  | Implementation                 | Status               |
| ------------------------- | ------------------------------ | -------------------- |
| **In-transit encryption** | WebRTC DTLS 1.2                | ✅ Built-in          |
| **Access control**        | Room codes + optional password | ✅ Implemented       |
| **Input validation**      | Zod schemas                    | ✅ Available         |
| **Rate limiting**         | TanStack Pacer                 | ✅ Installed         |
| **Data integrity**        | Automerge CRDT                 | ✅ Built-in          |
| **At-rest encryption**    | Browser IndexedDB              | ⚠️ Browser-dependent |
| **End-to-end encryption** | Not implemented                | ❌ Future option     |
| **Audit logging**         | Not implemented                | ❌ Future option     |

---

## 🔐 Threat Model

### Assets to Protect

1. **Tier list data** - User-created rankings and item metadata
2. **Images** - Uploaded/cropped images for tier items
3. **Room access** - Prevent unauthorized users from joining
4. **User privacy** - No tracking, minimal data collection

### Threat Actors

| Actor                    | Capability               | Risk Level | Mitigation                    |
| ------------------------ | ------------------------ | ---------- | ----------------------------- |
| **Network eavesdropper** | Intercept P2P traffic    | Medium     | WebRTC DTLS encryption        |
| **Malicious peer**       | Join room, send bad data | Medium     | Room codes, input validation  |
| **Compromised peer**     | Send malformed messages  | Medium     | Zod validation, rate limiting |
| **Browser attacker**     | Access IndexedDB         | Low        | Browser sandbox, HTTPS-only   |
| **DoS attacker**         | Flood with messages      | Medium     | Rate limiting per peer        |
| **Server attacker**      | N/A (no server)          | ✅ None    | P2P architecture              |

### Attack Vectors

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ATTACK VECTOR ANALYSIS                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. NETWORK LAYER (WebRTC)                                              │
│     ├─ Eavesdropping ──────────────▶ DTLS encryption (built-in)        │
│     ├─ Man-in-the-middle ──────────▶ DTLS certificates (built-in)      │
│     └─ DoS flood ──────────────────▶ Rate limiting (TanStack Pacer)    │
│                                                                          │
│  2. APPLICATION LAYER (P2P Messages)                                    │
│     ├─ Malformed messages ─────────▶ Zod validation                    │
│     ├─ Replay attacks ─────────────▶ Timestamp validation              │
│     └─ Spam votes ─────────────────▶ Per-user rate limits              │
│                                                                          │
│  3. ACCESS CONTROL (Room Join)                                          │
│     ├─ Brute force room code ──────▶ 6-char codes (16M combinations)   │
│     ├─ Room hijacking ─────────────▶ Host validates peers              │
│     └─ Password guessing ──────────▶ Hashed passwords, salted          │
│                                                                          │
│  4. DATA LAYER (IndexedDB)                                              │
│     ├─ XSS data theft ─────────────▶ CSP headers, sanitize input       │
│     ├─ Physical access ────────────▶ Browser encryption (future)       │
│     └─ Side-channel ───────────────▶ Clear memory on logout            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🛡️ Security Layers

### Layer 1: Network Security (WebRTC)

**Built-in Protection:**

- DTLS 1.2 encryption for all data channels
- SRTP for media streams
- Certificate fingerprinting prevents MITM

**Your Configuration:**

```typescript
// src/lib/p2p/P2PNetwork.ts

const pc = new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // TURN over TLS (more secure than UDP)
    {
      urls: "turns:global.turn.cloudflare.com:443?transport=tcp",
      username,
      credential: token,
    },
  ],
  // Enforce encrypted connections
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
});
```

**Additional Hardening:**

```typescript
// Validate remote certificate fingerprints
pc.onconnectionstatechange = () => {
  if (pc.connectionState === "connected") {
    const cert = pc.getRemoteCertificates()[0];
    // Log or verify certificate fingerprint
    console.log("Peer certificate:", cert);
  }
};
```

---

### Layer 2: Access Control (Room-Based)

**Room Code Generation:**

```typescript
// src/lib/p2p/room-auth.ts

export class RoomManager {
  generateRoomCode(): string {
    // Use cryptographically secure random
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars (no I,O,1,0)
    const bytes = crypto.getRandomValues(new Uint8Array(6));

    const code = Array.from(bytes)
      .map((byte) => chars[byte % chars.length])
      .join("");

    return `TIER-${code}`; // e.g., "TIER-7XK9Q2"
  }
}
```

**Security Properties:**

- 32^6 = 1,073,741,824 possible codes
- Brute force: ~12 days at 1000 attempts/minute
- Rate limit join attempts per IP

**Password Protection (Optional):**

```typescript
// src/lib/p2p/room-auth.ts

import { randomBytes } from "@noble/hashes/utils";
import { scrypt } from "@noble/hashes/scrypt";

export async function hashPassword(password: [REDACTED: password]): Promise<string> {
  const salt = randomBytes(16);
  const params = { N: 2 ** 15, r: 8, p: 1, dkLen: 32 };

  const key = await scrypt(password, salt, params);

  return `scrypt:${params.N}:${params.r}:${params.p}:${toHex(salt)}:${toHex(key)}`;
}

export async function verifyPassword(
  password: [REDACTED: password],
  hash: string,
): Promise<boolean> {
  const [algo, n, r, p, saltHex, expectedKeyHex] = hash.split(":");
  const params = { N: Number(n), r: Number(r), p: Number(p), dkLen: 32 };
  const salt = fromHex(saltHex);

  const key = await scrypt(password, salt, params);
  const actualKeyHex = toHex(key);

  return constantTimeEqual(actualKeyHex, expectedKeyHex);
}
```

---

### Layer 3: Input Validation (Zod)

**P2P Message Validation:**

```typescript
// src/lib/p2p/validation.ts

import { z } from "zod";
import { isCuid } from "@paralleldrive/cuid2";

export const SyncMessageSchema = z.object({
  type: z.literal("sync"),
  boardId: z.string().refine(isCuid, "Invalid board ID"),
  delta: z.instanceof(Uint8Array, "Delta must be binary"),
  timestamp: z
    .number()
    .min(Date.now() - 3600000)
    .max(Date.now() + 60000), // ±1 hour
  senderId: z.string().refine(isCuid, "Invalid sender ID"),
  sequence: z.number().int().positive("Sequence must be positive"),
});

export const ChatMessageSchema = z.object({
  type: z.literal("chat"),
  boardId: z.string().refine(isCuid, "Invalid board ID"),
  content: z.string().min(1).max(500, "Message too long"),
  timestamp: z
    .number()
    .min(Date.now() - 3600000)
    .max(Date.now() + 60000),
  senderId: z.string().refine(isCuid, "Invalid sender ID"),
});

export function validateP2PMessage(data: unknown): Result<P2PMessage, Error> {
  const syncResult = SyncMessageSchema.safeParse(data);
  if (syncResult.success) return { ok: true, value: syncResult.data };

  const chatResult = ChatMessageSchema.safeParse(data);
  if (chatResult.success) return { ok: true, value: chatResult.data };

  return { ok: false, error: new Error("Invalid message format") };
}
```

**Board Document Validation:**

```typescript
// src/lib/documents/validation.ts

import { isCuid } from "@paralleldrive/cuid2";

export const BoardDocumentSchema = z.object({
  id: z.string().refine(isCuid, "Invalid board ID"),
  name: z.string().min(1).max(100, "Name too long"),
  description: z.string().max(500).optional(),
  createdAt: z.number().min(0).max(Date.now()),
  updatedAt: z.number().min(0).max(Date.now()),
  createdBy: z.string().refine(isCuid, "Invalid creator ID"),
  tiers: z.array(TierSchema).max(26, "Too many tiers"),
  items: z.array(BoardItemSchema).max(1000, "Too many items"),
  settings: z.object({
    allowPublicJoin: z.boolean(),
    requirePassword: z.boolean(),
    maxPeers: z.number().min(1).max(50),
  }),
});

export function validateBoardOnReceive(data: unknown): BoardDocument | null {
  const result = BoardDocumentSchema.safeParse(data);

  if (!result.success) {
    console.error("Invalid board document from peer:", result.error);
    return null;
  }

  return result.data;
}
```

---

### Layer 4: Rate Limiting (TanStack Pacer)

**Per-Peer Message Rate Limit:**

```typescript
// src/lib/p2p/rate-limiter.ts

import { rateLimit, asyncRateLimit } from "@tanstack/pacer";

export class P2PRateLimiter {
  private peerLimiters = new Map<string, ReturnType<typeof asyncRateLimit>>();

  getPeerLimiter(peerId: string): ReturnType<typeof asyncRateLimit> {
    if (!this.peerLimiters.has(peerId)) {
      // 20 messages per second per peer
      const limiter = asyncRateLimit(async (fn: () => Promise<void>) => await fn(), {
        limit: 20,
        interval: 1000,
      });
      this.peerLimiters.set(peerId, limiter);
    }
    return this.peerLimiters.get(peerId)!;
  }

  async receiveMessage(peerId: string, message: P2PMessage): Promise<void> {
    const limiter = this.getPeerLimiter(peerId);

    try {
      await limiter(async () => {
        await this.processMessage(message);
      });
    } catch {
      console.warn(`Rate limit exceeded for peer ${peerId}`);
      // Optionally: kick peer after repeated violations
    }
  }
}
```

**Chat Vote Rate Limit (Prevent Spam):**

```typescript
// src/integrations/livestream/ChatVotingService.ts

import { rateLimit } from "@tanstack/pacer";

export class ChatVotingService {
  private userLimiters = new Map<string, ReturnType<typeof rateLimit>>();

  private getUserLimiter(userId: string): ReturnType<typeof rateLimit> {
    if (!this.userLimiters.has(userId)) {
      // 1 vote per 3 seconds per user
      const limiter = rateLimit((vote: ChatVote) => this.bufferVote(vote), {
        limit: 1,
        interval: 3000,
      });
      this.userLimiters.set(userId, limiter);
    }
    return this.userLimiters.get(userId)!;
  }

  async handleVote(vote: ChatVote): Promise<void> {
    const limiter = this.getUserLimiter(vote.userId);

    try {
      limiter(vote);
    } catch {
      // Rate limit exceeded - silently ignore
      // Optionally: notify user to slow down
    }
  }
}
```

**Connection Rate Limit (Prevent Brute Force):**

```typescript
// src/lib/p2p/room-auth.ts

import { rateLimit } from "@tanstack/pacer";

export class RoomManager {
  private joinAttempts = new Map<string, ReturnType<typeof rateLimit>>();

  getJoinLimiter(ipOrPeerId: string): ReturnType<typeof rateLimit> {
    if (!this.joinAttempts.has(ipOrPeerId)) {
      // 5 join attempts per minute
      const limiter = rateLimit((fn: () => void) => fn(), { limit: 5, interval: 60000 });
      this.joinAttempts.set(ipOrPeerId, limiter);
    }
    return this.joinAttempts.get(ipOrPeerId)!;
  }

  async attemptJoin(code: string, password?: string): Promise<RoomConfig> {
    const limiter = this.getJoinLimiter(code); // Rate limit per room

    try {
      limiter(() => {});
      return await this.joinRoom(code, password);
    } catch {
      throw new Error("Too many join attempts. Please wait.");
    }
  }
}
```

---

### Layer 5: Data Integrity (Automerge CRDT)

**Automatic Conflict Resolution:**

```typescript
// Automerge handles concurrent edits safely
import * as A from "@automerge/automerge";

const doc1 = A.change(initialDoc, (d) => {
  d.tiers[0].items.push("mario");
});

const doc2 = A.change(initialDoc, (d) => {
  d.tiers[0].items.push("luigi");
});

// Merge is deterministic and conflict-free
const merged = A.merge(doc1, doc2);
// Result: ['mario', 'luigi'] - both changes preserved
```

**Validation on Merge:**

```typescript
// src/lib/documents/BoardDocument.ts

export function safeMerge(local: BoardDocument, remote: Uint8Array): BoardDocument | null {
  try {
    // Apply remote changes
    const merged = A.merge(local, remote);

    // Validate result
    const result = BoardDocumentSchema.safeParse(merged);

    if (!result.success) {
      console.error("Merge produced invalid document:", result.error);
      return null; // Reject invalid merge
    }

    return result.data;
  } catch (error) {
    console.error("Merge failed:", error);
    return null;
  }
}
```

---

## 🔒 Security Checklist

### Pre-Launch Security Audit

#### Network Security

- [ ] WebRTC DTLS encryption enabled (default, verify)
- [ ] TURN over TLS (not UDP) for firewall traversal
- [ ] Certificate fingerprinting logged
- [ ] ICE candidate validation (reject invalid candidates)

#### Access Control

- [ ] Room codes use cryptographically secure random
- [ ] Password hashing with PBKDF2/bcrypt (not plain text)
- [ ] Join attempt rate limiting (prevent brute force)
- [ ] Host can kick/ban peers

#### Input Validation

- [ ] All P2P messages validated with Zod schemas
- [ ] Timestamp validation (prevent replay attacks)
- [ ] cuid2 format validation
- [ ] String length limits (prevent DoS via large payloads)
- [ ] Array size limits (prevent memory exhaustion)

#### Rate Limiting

- [ ] Per-peer message rate limit (20 msg/sec)
- [ ] Per-user vote rate limit (1 vote/3 sec)
- [ ] Room join rate limit (5 attempts/min)
- [ ] Image upload rate limit (10 images/min)

#### Data Integrity

- [ ] Automerge merge validation
- [ ] Document schema validation on receive
- [ ] Sequence number tracking (detect missing messages)
- [ ] Checksum/hash for large binary transfers

#### Browser Security

- [ ] HTTPS-only deployment (Cloudflare Pages)
- [ ] Content Security Policy (CSP) headers
- [ ] Secure cookie flags (if using cookies)
- [ ] IndexedDB encrypted (future: use Web Crypto)

---

## 🚨 Incident Response

### Malicious Peer Detected

```typescript
// src/lib/p2p/PeerManager.ts

export class PeerManager {
  private violations = new Map<string, number>();

  reportViolation(peerId: string, reason: string): void {
    const count = (this.violations.get(peerId) || 0) + 1;
    this.violations.set(peerId, count);

    console.warn(`Peer ${peerId} violation #${count}: ${reason}`);

    if (count >= 3) {
      this.kickPeer(peerId);
      this.banPeer(peerId);
    }
  }

  kickPeer(peerId: string): void {
    // Send kick message
    this.broadcast({
      type: "peer:kicked",
      peerId,
      reason: "Multiple violations",
    });

    // Close connection
    const peer = this.peers.get(peerId);
    peer?.connection.close();
    this.peers.delete(peerId);
  }

  banPeer(peerId: string): void {
    // Add to ban list (persist to IndexedDB)
    this.banList.add(peerId);
    this.saveBanList();
  }

  async saveBanList(): Promise<void> {
    await db.security.put({
      key: "banList",
      value: Array.from(this.banList),
      updatedAt: Date.now(),
    });
  }
}
```

### Data Corruption Detected

```typescript
// src/lib/documents/DocumentRecovery.ts

export class DocumentRecovery {
  private backups: Map<string, BoardDocument> = new Map();

  // Keep last N versions
  createBackup(doc: BoardDocument): void {
    const backups = this.backups.get(doc.id) || [];
    backups.push(doc);

    if (backups.length > 10) {
      backups.shift(); // Keep last 10
    }

    this.backups.set(doc.id, backups);
  }

  // Restore to last known good state
  async recover(docId: string): Promise<BoardDocument | null> {
    const backups = this.backups.get(docId);

    if (!backups || backups.length === 0) {
      console.error("No backups available for recovery");
      return null;
    }

    // Get last valid backup
    for (let i = backups.length - 1; i >= 0; i--) {
      const backup = backups[i];
      const valid = BoardDocumentSchema.safeParse(backup);

      if (valid.success) {
        console.log(`Recovered to backup #${i}`);
        return backup;
      }
    }

    console.error("All backups invalid");
    return null;
  }
}
```

---

## 🔮 Future Security Enhancements

### End-to-End Encryption (E2EE)

For sensitive tier lists (private rankings, etc.):

```typescript
// Future: Add encryption layer
import { Box } from '@localfirst/crypto'

const box = new Box({
  teamName: 'my-private-tier-list',
  userName: 'alice',
  keys: {
    // Generate or load from secure storage
    public: await crypto.subtle.generateKey(...),
    secret: await crypto.subtle.generateKey(...),
  },
})

// Encrypt before sending to peers
const encryptedDoc = box.encrypt(automergeDoc)

// Decrypt on receive
const decryptedDoc = box.decrypt(encryptedDoc)
```

**Trade-offs:**

- ✅ Privacy from peers
- ✅ Protection against compromised peers
- ❌ More complex key management
- ❌ Can't search/index encrypted data
- ❌ Lost keys = lost data forever

### Secure Backup

```typescript
// Future: Encrypted backup to cloud
import { encrypt, decrypt } from "@noble/ciphers/aes";

async function backupToCloud(doc: BoardDocument, userKey: string): Promise<void> {
  // Derive encryption key from user password
  const key = await deriveKey(userKey);

  // Encrypt document
  const encrypted = await encrypt(doc, key);

  // Upload to cloud (S3, Cloudflare R2, etc.)
  await fetch("https://backup.tierboard.app", {
    method: "POST",
    body: encrypted,
  });
}
```

### Audit Logging

```typescript
// Future: Local audit log
interface AuditLogEntry {
  timestamp: number;
  action: "edit" | "join" | "leave" | "kick";
  actor: string;
  target?: string;
  details?: unknown;
}

class AuditLogger {
  private log: AuditLogEntry[] = [];

  log(action: AuditLogEntry["action"], actor: string, details?: unknown): void {
    this.log.push({
      timestamp: Date.now(),
      action,
      actor,
      details,
    });

    // Persist to IndexedDB
    this.save();
  }

  async export(): Promise<Blob> {
    return new Blob([JSON.stringify(this.log)], { type: "application/json" });
  }
}
```

---

## 📊 Security vs. Usability Trade-offs

| Feature             | Security Impact         | Usability Impact      | Decision     |
| ------------------- | ----------------------- | --------------------- | ------------ |
| Room codes          | Medium (access control) | Low (easy to share)   | ✅ Implement |
| Password protection | High                    | Medium (extra step)   | ⚠️ Optional  |
| Rate limiting       | High (DoS prevention)   | Low (invisible)       | ✅ Implement |
| Input validation    | High (integrity)        | Low (invisible)       | ✅ Implement |
| E2EE                | Very High               | High (key management) | ❌ Future    |
| Audit logs          | Medium                  | Low (background)      | ⚠️ Future    |
| Ban list            | Medium                  | Low (auto)            | ✅ Implement |

---

## 📝 Summary

### Current Security Posture

| Layer                           | Status             | Notes                           |
| ------------------------------- | ------------------ | ------------------------------- |
| **Network (WebRTC DTLS)**       | ✅ Secure          | Built-in encryption             |
| **Access Control (Room Codes)** | ✅ Good            | Cryptographically secure random |
| **Input Validation (Zod)**      | ✅ Good            | Comprehensive schemas           |
| **Rate Limiting (Pacer)**       | ✅ Good            | Per-peer, per-user limits       |
| **Data Integrity (Automerge)**  | ✅ Good            | CRDT + validation               |
| **At-Rest Encryption**          | ⚠️ Partial         | Browser-dependent               |
| **E2EE**                        | ❌ Not implemented | Future enhancement              |

### Key Strengths

1. **No server to breach** - P2P architecture eliminates central attack surface
2. **Encrypted transport** - WebRTC DTLS by default
3. **Input validation** - Zod schemas prevent malformed data
4. **Rate limiting** - TanStack Pacer prevents DoS/spam
5. **Conflict-free sync** - Automerge handles concurrent edits safely

### Known Limitations

1. **Trusted peers** - Once connected, peers can see all data
2. **No E2EE** - Data not encrypted at rest
3. **No audit trail** - Can't追溯 malicious actions
4. **Browser security** - Depends on browser sandbox

### Recommended Next Steps

1. **P0:** Implement Zod validation for all P2P messages
2. **P0:** Add rate limiting to all message handlers
3. **P1:** Add password protection option for rooms
4. **P1:** Implement peer ban/kick functionality
5. **P2:** Add document backup/recovery
6. **P3:** Consider E2EE for sensitive use cases
