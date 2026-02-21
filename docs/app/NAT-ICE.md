# NAT Traversal & ICE Configuration Plan

## Overview

TierBoard uses WebRTC for P2P sync. This document covers NAT traversal strategy using **Google STUN (free)** + **Cloudflare TURN (1TB free)**.

---

## 🎯 Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TIERBOARD NAT TRAVERSAL STRATEGY                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Connection Attempt Order (ICE automatically tries in sequence):        │
│                                                                          │
│  1️⃣ Direct Connection (same LAN)                                        │
│     User A ←──────────────────→ User B                                  │
│     ✅ Zero latency, no server                                          │
│                                                                          │
│  2️⃣ STUN (discover public IP, try P2P)                                  │
│     User A ←─── Google STUN ───→ User B                                 │
│     ✅ Free, ~80-90% success rate                                       │
│                                                                          │
│  3️⃣ TURN (relay through Cloudflare)                                     │
│     User A ←─── Cloudflare TURN ───→ User B                             │
│     ✅ 100% success, 1TB free/month                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 ICE Server Configuration

### Production Config

```typescript
// src/lib/p2p/ice-servers.ts

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Google STUN servers (free, no auth required)
 * Used for discovering public IP address
 */
export const GOOGLE_STUN: IceServerConfig[] = [
  { urls: ["stun:stun.l.google.com:19302"] },
  { urls: ["stun:stun1.l.google.com:19302"] },
  { urls: ["stun:stun2.l.google.com:19302"] },
  { urls: ["stun:stun3.l.google.com:19302"] },
  { urls: ["stun:stun4.l.google.com:19302"] },
];

/**
 * Cloudflare TURN servers
 * Requires authentication token (generated server-side)
 * 1TB free egress per month, then $0.05/GB
 */
export function getCloudflareTurnConfig(token: string, username: string): IceServerConfig[] {
  return [
    {
      urls: [
        "turns:global.turn.cloudflare.com:443?transport=tcp",
        "turn:global.turn.cloudflare.com:80?transport=tcp",
      ],
      username,
      credential: token,
    },
  ];
}

/**
 * Combined ICE server list
 * Order matters: STUN first (free), TURN last (paid)
 */
export function getIceServers(options?: {
  cloudflareToken?: string;
  cloudflareUsername?: string;
}): RTCIceServer[] {
  const servers = [...GOOGLE_STUN];

  // Add Cloudflare TURN if credentials provided
  if (options?.cloudflareToken && options?.cloudflareUsername) {
    servers.push(...getCloudflareTurnConfig(options.cloudflareToken, options.cloudflareUsername));
  }

  return servers;
}
```

### Usage in P2PNetwork

```typescript
// src/lib/p2p/P2PNetwork.ts

import { getIceServers } from "./ice-servers";

export class P2PNetwork {
  private pc: RTCPeerConnection;
  private turnToken: string | null = null;

  constructor(options: { turnToken?: string; turnUsername?: string } = {}) {
    this.pc = new RTCPeerConnection({
      iceServers: getIceServers({
        cloudflareToken: options.turnToken,
        cloudflareUsername: options.turnUsername,
      }),
      // Optimize for P2P data transfer
      iceCandidatePoolSize: 10,
    });

    this.setupIceHandlers();
  }

  private setupIceHandlers() {
    // Collect ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Send candidate to peer via signaling
        this.sendCandidate(event.candidate);
      }
    };

    // Track connection state
    this.pc.onconnectionstatechange = () => {
      console.log("Connection state:", this.pc.connectionState);

      switch (this.pc.connectionState) {
        case "connected":
          this.emit("connected");
          break;
        case "disconnected":
        case "failed":
          this.emit("disconnected");
          break;
      }
    };

    // Log ICE connection state
    this.pc.oniceconnectionstatechange = () => {
      console.log("ICE state:", this.pc.iceConnectionState);
    };
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async acceptOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(answer);
  }

  async addCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(candidate);
  }
}
```

---

## ☁️ Cloudflare TURN Setup

### Step 1: Enable Realtime in Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Realtime** (or **Stream** → **Realtime**)
3. Click **Enable Realtime**
4. Note your **Account ID** (found in right sidebar)

### Step 2: Create TURN Credentials API

```typescript
// src/lib/turn/cloudflare-turn-api.ts

const CLOUDFLARE_ACCOUNT_ID = "your-account-id";
const CLOUDFLARE_API_TOKEN = "your-api-token"; // Create in Dashboard → Profile → API Tokens

interface TurnCredentials {
  username: string;
  password: string;
  ttl: number;
  iceServers: RTCIceServer[];
}

/**
 * Generate short-lived TURN credentials
 * Call this server-side (never expose API token to client)
 */
export async function generateTurnCredentials(
  userId: string,
  ttlSeconds: number = 86400, // 24 hours
): Promise<TurnCredentials> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/realtime/turn_credentials`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ttl: ttlSeconds,
        // Optional: restrict to specific user
        display_name: userId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Cloudflare API error: ${response.statusText}`);
  }

  const result = await response.json();
  return result.result;
}
```

### Step 3: Server Function to Issue Tokens

```typescript
// src/routes/api/turn-token.ts (TanStack server function)

import { createServerFn } from "@tanstack/react-start";
import { generateTurnCredentials } from "#lib/turn/cloudflare-turn-api";

export const getTurnToken = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  // Authenticate user first!
  const userId = context.user?.id;

  if (!userId) {
    throw new Error("Unauthorized");
  }

  // Generate 24-hour credentials
  const credentials = await generateTurnCredentials(userId, 86400);

  return {
    username: credentials.username,
    password: credentials.password,
    expiresAt: Date.now() + credentials.ttl * 1000,
  };
});
```

### Step 4: Client-Side Token Fetch

```typescript
// src/hooks/useTurnToken.ts

import { useEffect, useState } from "react";
import { getTurnToken } from "#routes/api/turn-token";

export function useTurnToken() {
  const [token, setToken] = useState<{
    username: string;
    password: string;
    expiresAt: number;
  } | null>(null);

  useEffect(() => {
    async function fetchToken() {
      try {
        const credentials = await getTurnToken();
        setToken(credentials);
      } catch (error) {
        console.error("Failed to fetch TURN token:", error);
        // Continue without TURN - STUN will work for most users
      }
    }

    fetchToken();

    // Refresh token before expiry
    const refreshInterval = setInterval(() => {
      if (token && token.expiresAt - Date.now() < 3600000) {
        // 1 hour before expiry
        fetchToken();
      }
    }, 60000); // Check every minute

    return () => clearInterval(refreshInterval);
  }, []);

  return token;
}
```

### Step 5: Use in P2PNetwork

```typescript
// src/components/P2PProvider.tsx

import { useTurnToken } from '#hooks/useTurnToken'
import { P2PNetwork } from '#lib/p2p/P2PNetwork'

export function P2PProvider({ children }: { children: React.ReactNode }) {
  const turnToken = useTurnToken()
  const [network, setNetwork] = useState<P2PNetwork | null>(null)

  useEffect(() => {
    const p2p = new P2PNetwork({
      turnToken: turnToken?.password,
      turnUsername: turnToken?.username,
    })

    setNetwork(p2p)

    return () => {
      p2p.destroy()
    }
  }, [turnToken])

  return (
    <P2PContext.Provider value={{ network }}>
      {children}
    </P2PContext.Provider>
  )
}
```

---

## 💰 Cost Estimation

### Cloudflare Realtime Pricing

| Tier | Egress           | Cost     |
| ---- | ---------------- | -------- |
| Free | 0-1,000 GB/month | $0       |
| Paid | >1,000 GB        | $0.05/GB |

### Usage Estimates for TierBoard

```
┌─────────────────────────────────────────────────────────────┐
│ ESTIMATED BANDWIDTH USAGE PER USER SESSION                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Scenario 1: Text-only sync (moving items between tiers)     │
│ - Automerge delta: ~500 bytes per action                   │
│ - 100 actions/hour = 50 KB/hour                            │
│ - 4-hour session = 200 KB                                  │
│                                                             │
│ Scenario 2: With image sync (10 images, compressed)         │
│ - Image avg: 50 KB (WebP compressed)                       │
│ - 10 images = 500 KB                                       │
│ - Plus sync overhead: ~100 KB                              │
│ - Total: ~600 KB per session                               │
│                                                             │
│ Scenario 3: Heavy usage (50 images, many edits)             │
│ - 50 images × 50 KB = 2.5 MB                               │
│ - Sync overhead: ~500 KB                                   │
│ - Total: ~3 MB per session                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Monthly Cost Projection

| Users  | Sessions/Month | Avg Data/Session | Total Egress | Cost      |
| ------ | -------------- | ---------------- | ------------ | --------- |
| 100    | 10             | 600 KB           | 6 GB         | $0 (free) |
| 1,000  | 10             | 600 KB           | 60 GB        | $0 (free) |
| 10,000 | 10             | 600 KB           | 600 GB       | $0 (free) |
| 20,000 | 10             | 600 KB           | 1,200 GB     | $10       |
| 50,000 | 10             | 600 KB           | 3,000 GB     | $100      |

**Conclusion:** Free tier (1TB) covers ~1,600 users/month with moderate usage.

---

## 🔧 Monitoring & Alerts

### Track TURN Usage

```typescript
// src/lib/turn/usage-tracker.ts

interface TurnUsageStats {
  totalBytesSent: number;
  totalBytesReceived: number;
  turnRelayUsage: number; // Bytes via TURN
  directP2PUsage: number; // Bytes via direct/STUN
  connectionAttempts: number;
  successfulConnections: number;
}

class TurnUsageTracker {
  private stats: TurnUsageStats = {
    totalBytesSent: 0,
    totalBytesReceived: 0,
    turnRelayUsage: 0,
    directP2PUsage: 0,
    connectionAttempts: 0,
    successfulConnections: 0,
  };

  trackConnection(type: "direct" | "stun" | "turn") {
    this.stats.connectionAttempts++;
    if (type === "turn") {
      // Will track bytes when data flows
    }
  }

  trackBytes(bytes: number, via: "turn" | "direct") {
    this.stats.totalBytesSent += bytes;
    if (via === "turn") {
      this.stats.turnRelayUsage += bytes;
    } else {
      this.stats.directP2PUsage += bytes;
    }
  }

  getUsageReport() {
    const successRate = (this.stats.successfulConnections / this.stats.connectionAttempts) * 100;
    const turnUsagePercent = (this.stats.turnRelayUsage / this.stats.totalBytesSent) * 100;

    return {
      ...this.stats,
      successRate: successRate.toFixed(2) + "%",
      turnUsagePercent: turnUsagePercent.toFixed(2) + "%",
      estimatedMonthlyEgress: this.estimateMonthlyEgress(),
    };
  }

  private estimateMonthlyEgress() {
    // Simple projection based on current usage
    const hoursInMonth = 720;
    const currentHourlyRate = this.stats.totalBytesSent / 1; // Assuming 1 hour session
    return ((currentHourlyRate * hoursInMonth) / 1024 / 1024 / 1024).toFixed(2) + " GB";
  }
}

export const usageTracker = new TurnUsageTracker();
```

### Alert Thresholds

```typescript
// Alert when approaching free tier limit
const FREE_TIER_LIMIT_GB = 1000;
const ALERT_THRESHOLD_PERCENT = 80; // Alert at 80% usage

function checkUsageAlert(currentUsageGB: number) {
  const threshold = FREE_TIER_LIMIT_GB * (ALERT_THRESHOLD_PERCENT / 100);

  if (currentUsageGB >= threshold) {
    // Send alert (email, Discord webhook, etc.)
    console.warn(`⚠️ TURN usage alert: ${currentUsageGB.toFixed(0)}GB / ${FREE_TIER_LIMIT_GB}GB`);

    // Optionally: disable TURN for new connections, force STUN-only
    // setTurnEnabled(false)
  }
}
```

---

## 🧪 Testing NAT Traversal

### Test Scenarios

```typescript
// src/lib/p2p/__tests__/nat-traversal.test.ts

import { describe, it, expect } from "vitest";
import { P2PNetwork } from "../P2PNetwork";
import { getIceServers } from "../ice-servers";

describe("NAT Traversal", () => {
  it("should connect via STUN (same network)", async () => {
    const peer1 = new P2PNetwork({ iceServers: getIceServers() });
    const peer2 = new P2PNetwork({ iceServers: getIceServers() });

    // Simulate handshake
    const offer = await peer1.createOffer();
    const answer = await peer2.acceptOffer(offer);
    await peer1.acceptAnswer(answer);

    // Wait for ICE gathering
    await waitFor(() => peer1.isConnected());

    expect(peer1.isConnected()).toBe(true);
    expect(peer1.getConnectionType()).toBe("direct"); // or 'stun'
  });

  it("should fallback to TURN when direct fails", async () => {
    // Simulate symmetric NAT (blocks P2P)
    const peer1 = new P2PNetwork({
      iceServers: getIceServers({ turnToken: "test", turnUsername: "test" }),
    });
    const peer2 = new P2PNetwork({
      iceServers: getIceServers({ turnToken: "test", turnUsername: "test" }),
    });

    // Force TURN-only by blocking direct candidates
    peer1.onIceCandidate = (candidate) => {
      if (candidate.candidate.includes("relay")) {
        // Only send TURN candidates
        sendToPeer(candidate);
      }
    };

    // ... complete handshake

    expect(peer1.isConnected()).toBe(true);
    expect(peer1.getConnectionType()).toBe("turn");
  });
});
```

### Manual Testing Checklist

- [ ] **Same LAN**: Two devices on same WiFi should connect directly
- [ ] **Different networks**: Phone on cellular, laptop on WiFi (STUN)
- [ ] **Strict NAT**: Corporate firewall, university network (TURN)
- [ ] **Mobile**: iOS Safari, Android Chrome (different ICE behavior)
- [ ] **IPv6**: Test on IPv6-only networks

---

## 🦎 Optional: Tailscale Relay (Future)

If Cloudflare costs exceed budget, add self-hosted TURN via Tailscale:

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ HYBRID: Cloudflare (primary) + Tailscale (fallback)         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User A ────┐                                               │
│  (Browser)  │                                               │
│             │───▶ Cloudflare TURN (1TB free)                │
│  User B ────┤                                               │
│  (Browser)  │                                               │
│             │                                               │
│  User C ─────────▶ Tailscale Relay (self-hosted, unlimited) │
│  (Strict NAT)     Your server on tailnet                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Setup coturn on Tailscale Server

```bash
# On your Tailscale server (always-online machine)
apt install coturn

# /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
realm=turn.yourdomain.com
server-name=turn.yourdomain.com
lt-cred-mech
user=tierboard:YourSecretPassword

# Get Tailscale IP
tailscale ip
# Output: 100.64.0.1 (use this in ICE config)
```

```typescript
// Add to ICE servers (after Cloudflare)
{
  urls: ['turn:100.64.0.1:3478'],  // Tailscale IP
  username: 'tierboard',
  credential: 'YourSecretPassword'
}
```

---

## 🔌 TCP vs UDP Transport

### WebRTC Data Channel Stack

```
┌─────────────────────────────────────────────────────────────┐
│ WEBRTC DATA CHANNEL STACK                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Application Data (tier list updates)                       │
│       ↓                                                     │
│  SCTP (Stream Control Transmission Protocol)                │
│  - Multiplexing (multiple streams)                          │
│  - Ordered/unordered delivery options                       │
│  - Reliability configuration                                │
│       ↓                                                     │
│  DTLS (Encryption)                                          │
│       ↓                                                     │
│  UDP (Transport) ← Default, lower latency                   │
│  TCP (Fallback) ← Used when UDP blocked                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### ICE Candidate Types

WebRTC gathers both UDP and TCP candidates. Priority order:

```
1. UDP host (same LAN, direct)
2. UDP srflx (STUN discovered public IP)
3. UDP relay (TURN via UDP)
4. TCP host (same LAN, TCP direct)
5. TCP srflx (STUN via TCP)
6. TCP relay (TURN via TCP) ← Cloudflare uses this
```

**Example candidates:**

```typescript
pc.onicecandidate = (event) => {
  if (event.candidate) {
    console.log(event.candidate.candidate);
    // UDP: "candidate:1 1 UDP 2130706431 192.168.1.5 54321 typ host"
    // TCP: "candidate:4 1 TCP 2105524479 192.168.1.5 9 typ host tcptype active"
  }
};
```

### Cloudflare TURN Uses TCP

Cloudflare TURN only supports TCP transport:

```typescript
{
  urls: [
    "turns:global.turn.cloudflare.com:443?transport=tcp", // TLS over TCP
    "turn:global.turn.cloudflare.com:80?transport=tcp", // TCP
  ];
}
```

**Why TCP for TURN?**

- Works through strict firewalls (port 80/443 always open)
- More reliable for NAT traversal
- Slightly higher latency than UDP

**For P2P streaming, UDP is preferred** once connected.

---

## 📡 Optimized for P2P Streaming

### Strategy: TURN for Handshake, P2P for Data

Use Cloudflare TURN only for ICE negotiation handshake, then stream data directly P2P:

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: ICE Negotiation (via Cloudflare TURN)              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User A ──────▶ Cloudflare TURN ──────▶ User B              │
│  (SDP offer)      (relays candidate)    (receives)          │
│                                                             │
│  User A ◀────── Cloudflare TURN ◀────── User B              │
│  (receives)       (relays candidate)    (SDP answer)        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: Data Streaming (Direct P2P - UDP)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User A ═══════════════════════════════▶ User B             │
│  (tier list updates via direct UDP)                         │
│                                                             │
│  ✅ Cloudflare not involved in data transfer!               │
│  ✅ Zero bandwidth cost after handshake                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Data Channel Configuration

**For real-time tier list streaming (preferred):**

```typescript
const streamingChannel = pc.createDataChannel("tier-updates", {
  // Optimized for streaming frequent updates
  ordered: false, // Latest state wins, skip old updates
  maxRetransmits: 2, // Drop stale data after 2 retries
  priority: "high", // Prefer over other channels
  protocol: "tierboard-v1",
});

// Example: User drags item to S tier
channel.send(
  JSON.stringify({
    type: "item-move",
    itemId: "mario",
    tierId: "S",
    timestamp: Date.now(), // Receiver uses latest timestamp
  }),
);
```

**For critical state (board settings, user list):**

```typescript
const reliableChannel = pc.createDataChannel("state-sync", {
  // Reliable delivery for important changes
  ordered: true, // Order matters
  maxRetransmits: null, // Retry until delivered
  priority: "medium",
  protocol: "tierboard-v1",
});
```

### Force P2P-Only Mode (No TURN Relay)

If you want to guarantee TURN is only for handshake (not data relay):

```typescript
export class P2PNetwork {
  private pc: RTCPeerConnection;

  constructor() {
    this.pc = new RTCPeerConnection({
      iceServers: [
        // STUN only for ICE negotiation
        { urls: ["stun:stun.l.google.com:19302"] },
      ],
      iceCandidatePoolSize: 10,
    });

    // Filter out relay (TURN) candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate.candidate;

        // Only send host and srflx (STUN) candidates
        // Skip relay (TURN) candidates
        if (!candidate.includes("typ relay")) {
          this.sendCandidate(event.candidate);
        }
      }
    };
  }
}
```

**Trade-off:** ~10-20% of users with strict NAT won't connect.

---

## 🔍 Connection Type Monitoring

### Verify P2P vs TURN Usage

```typescript
// src/lib/p2p/connection-monitor.ts

export class ConnectionMonitor {
  constructor(private pc: RTCPeerConnection) {
    this.startMonitoring();
  }

  async getConnectionType(): Promise<"direct" | "stun" | "turn" | "unknown"> {
    const stats = await this.pc.getStats();

    for (const report of stats.values()) {
      if (report.type === "candidate-pair" && report.nominated) {
        const localCandidate = stats.get(report.localCandidateId);
        const remoteCandidate = stats.get(report.remoteCandidateId);

        const localType = localCandidate?.candidateType;
        const remoteType = remoteCandidate?.candidateType;

        if (localType === "relay" || remoteType === "relay") {
          return "turn";
        }
        if (localType === "prflx" || remoteType === "prflx") {
          return "stun";
        }
        if (localType === "host" && remoteType === "host") {
          return "direct";
        }
      }
    }

    return "unknown";
  }

  async getBandwidthUsage(): Promise<{ sent: number; received: number }> {
    const stats = await this.pc.getStats();
    let bytesSent = 0;
    let bytesReceived = 0;

    stats.forEach((report) => {
      if (report.type === "data-channel") {
        bytesSent += report.bytesSent || 0;
        bytesReceived += report.bytesReceived || 0;
      }
    });

    return { sent: bytesSent, received: bytesReceived };
  }

  private startMonitoring() {
    // Log connection type every 30 seconds
    setInterval(async () => {
      const type = await this.getConnectionType();
      const bandwidth = await this.getBandwidthUsage();

      console.log(
        `Connection: ${type}, Sent: ${bandwidth.sent}B, Received: ${bandwidth.received}B`,
      );

      // Alert if using TURN relay (costs money)
      if (type === "turn") {
        console.warn("⚠️ Using TURN relay - bandwidth costs apply");
      }
    }, 30000);
  }
}
```

### Usage in P2PNetwork

```typescript
// src/lib/p2p/P2PNetwork.ts

export class P2PNetwork {
  private pc: RTCPeerConnection;
  private monitor: ConnectionMonitor | null = null;

  constructor(options: { turnToken?: string; turnUsername?: string } = {}) {
    this.pc = new RTCPeerConnection({
      iceServers: [
        // Primary: Google STUN (free, UDP)
        { urls: ["stun:stun.l.google.com:19302"] },
        { urls: ["stun:stun1.l.google.com:19302"] },

        // Fallback: Cloudflare TURN (for handshake + strict NAT)
        // Only used when direct P2P fails
        ...(options.turnToken
          ? [
              {
                urls: [
                  "turns:global.turn.cloudflare.com:443?transport=tcp",
                  "turn:global.turn.cloudflare.com:80?transport=tcp",
                ],
                username: options.turnUsername,
                credential: options.turnToken,
              },
            ]
          : []),
      ],

      // Prefer UDP for lower latency
      iceCandidatePoolSize: 10,
    });

    this.monitor = new ConnectionMonitor(this.pc);
    this.setupOptimizedDataChannels();
  }

  private setupOptimizedDataChannels() {
    this.pc.ondatachannel = (event) => {
      const channel = event.channel;
      channel.binaryType = "arraybuffer";
    };
  }

  createStreamingChannel(label: string): RTCDataChannel {
    return this.pc.createDataChannel(label, {
      // Optimized for real-time tier list updates
      ordered: false, // Latest state wins
      maxRetransmits: 2, // Drop stale updates
      priority: "high",
    });
  }

  createReliableChannel(label: string): RTCDataChannel {
    return this.pc.createDataChannel(label, {
      // For critical state (board settings, user list)
      ordered: true,
      maxRetransmits: null, // Reliable delivery
      priority: "medium",
    });
  }

  async getConnectionStats() {
    if (!this.monitor) return null;
    return {
      type: await this.monitor.getConnectionType(),
      bandwidth: await this.monitor.getBandwidthUsage(),
    };
  }
}
```

---

## 📊 Expected Connection Distribution

| Scenario                           | Connection Type         | % of Users | Cloudflare Cost        |
| ---------------------------------- | ----------------------- | ---------- | ---------------------- |
| Same LAN (WiFi party)              | Direct (UDP)            | ~5%        | $0                     |
| Different networks, permissive NAT | STUN P2P (UDP)          | ~80%       | $0                     |
| Strict NAT/Symmetric NAT           | TURN Relay (TCP)        | ~15%       | $0.05/GB               |
| **Typical mix**                    | **~85% P2P, ~15% TURN** | **100%**   | **~$0 for most users** |

---

## 📋 Deployment Checklist

### Pre-Launch

- [ ] Google STUN configured (free, always on)
- [ ] Cloudflare Realtime enabled
- [ ] TURN credentials API endpoint created
- [ ] Token refresh logic implemented
- [ ] Usage tracking enabled
- [ ] Alert threshold configured (80% of 1TB)
- [ ] Connection monitoring implemented
- [ ] Data channel types configured (streaming + reliable)

### Post-Launch Monitoring

- [ ] Track connection success rate (target: >95%)
- [ ] Monitor TURN usage % (target: <30% of connections)
- [ ] Monitor P2P vs TURN ratio (target: >70% P2P)
- [ ] Set up monthly usage report
- [ ] Prepare budget alert if usage exceeds free tier

### Fallback Plan

If Cloudflare costs exceed budget:

1. **Reduce TURN TTL**: Issue 1-hour tokens instead of 24-hour
2. **Add Tailscale relay**: Self-hosted coturn for heavy users
3. **Graceful degradation**: STUN-only mode when TURN budget exhausted
4. **Premium feature**: Offer paid tier with guaranteed TURN access

---

## 🔗 References

- [Cloudflare Realtime Docs](https://developers.cloudflare.com/realtime/)
- [Cloudflare TURN Pricing](https://www.cloudflare.com/plans/developer-platform/)
- [WebRTC ICE RFC](https://datatracker.ietf.org/doc/html/rfc8838)
- [coturn GitHub](https://github.com/coturn/coturn)
- [Tailscale](https://tailscale.com)

---

## Summary

| Component       | Provider                  | Cost                    | Fallback Order        |
| --------------- | ------------------------- | ----------------------- | --------------------- |
| STUN            | Google                    | Free                    | 1st (automatic)       |
| TURN            | Cloudflare                | 1TB free, then $0.05/GB | 2nd (when STUN fails) |
| TURN (optional) | Self-hosted via Tailscale | $5/month VPS            | 3rd (budget fallback) |

**Start:** Google STUN + Cloudflare TURN (free tier covers ~1,600 users)

**Monitor:** Usage dashboard, alert at 800GB

**Scale:** Add Tailscale relay if costs exceed budget
