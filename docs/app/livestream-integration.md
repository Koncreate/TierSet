# Livestream Integration Plan

## Overview

TierBoard can integrate with major livestreaming platforms to enable:

- Real-time tier list voting via chat commands
- Subscriber/follower-only tier list creation
- Display live stream info on tier boards
- Chat-based interaction with tier lists
- Stream overlays showing tier rankings

## Platform Comparison

| Feature               | Twitch                   | YouTube Live          | Kick               |
| --------------------- | ------------------------ | --------------------- | ------------------ |
| **API Maturity**      | Mature, well-documented  | Mature, comprehensive | New, limited docs  |
| **Authentication**    | OAuth 2.0                | OAuth 2.0             | OAuth 2.1          |
| **Real-time Events**  | EventSub (WebSocket)     | PubSub Hub            | Webhooks           |
| **Chat Access**       | ✓ EventSub               | ✗ Limited             | ✓ WebSocket        |
| **Rate Limits**       | 800 req/min (user token) | 10,000 quota/day      | Undocumented       |
| **Chat Commands**     | ✓ Full support           | ✗ No direct API       | ✓ Full support     |
| **Subscriber Data**   | ✓ EventSub               | ✓ Data API            | ✓ Channel API      |
| **Bits/Cheers**       | ✓ EventSub               | ✗ N/A                 | ✗ N/A              |
| **Stream Key Access** | ✗ Restricted             | ✓ API                 | ✓ `streamkey:read` |
| **Clip Creation**     | ✓ API                    | ✗ Limited             | ✗ Undocumented     |
| **Moderation**        | ✓ Full API               | ✗ Limited             | ✓ Basic API        |

---

## Twitch Integration

### Authentication

**OAuth 2.0 Flow:**

```
Authorization URL: https://id.twitch.tv/oauth2/authorize
Token URL: https://id.twitch.tv/oauth2/token
```

**Required Scopes:**
| Scope | Purpose |
|-------|---------|
| `user:read:chat` | Read chat messages via EventSub |
| `channel:read:chat` | Read channel chat info |
| `channel:manage:broadcast` | Manage stream info |
| `channel:read:subscriptions` | Subscriber events |
| `bits:read` | Bits/cheers events |
| `moderator:manage:chat_messages` | Delete chat messages |
| `channel:moderate` | Ban/timeout users |

### EventSub WebSocket Events

**Chat Commands for Tier Voting:**

```typescript
// Event: channel.chat.message
// User types: "!vote S tier_name" or "!tier S character"

interface ChatMessageEvent {
  event: {
    broadcaster_user_id: string;
    chatter: {
      user_id: string;
      user_login: string;
      user_name: string;
      badges: Badge[];
      badge_info: BadgeInfo[];
    };
    message: {
      text: string;
      fragments: Fragment[];
    };
  };
}
```

**Subscriber Events:**

```typescript
// Event: channel.subscribe
interface SubscribeEvent {
  event: {
    user_id: string;
    user_name: string;
    broadcaster_user_id: string;
    tier: "1000" | "2000" | "3000"; // Tier 1, 2, 3
    is_gift: boolean;
  };
}

// Event: channel.subscription.gift
interface GiftSubEvent {
  event: {
    user_id: string;
    user_name: string;
    broadcaster_user_id: string;
    total: number; // Total gifts in session
    tier: "1000" | "2000" | "3000";
  };
}
```

**Bits/Cheers Events:**

```typescript
// Event: channel.cheer
interface CheerEvent {
  event: {
    user_id: string;
    user_name: string;
    broadcaster_user_id: string;
    message: string;
    bits: number;
  };
}

// Event: channel.bits.use
interface BitsUseEvent {
  event: {
    user_id: string;
    user_name: string;
    broadcaster_user_id: string;
    total_bits_used: number;
  };
}
```

### API Endpoints

```typescript
// Get channel info
GET https://api.twitch.tv/helix/channels?broadcaster_id={id}
Headers:
  Authorization: Bearer {access_token}
  Client-Id: {client_id}

// Get stream status
GET https://api.twitch.tv/helix/streams?user_id={id}

// Create clip
POST https://api.twitch.tv/helix/clips?broadcaster_id={id}

// Get chatters
GET https://api.twitch.tv/helix/chat/chatters
  ?broadcaster_id={id}&moderator_id={mod_id}

// Send chat message (bot only)
POST https://api.twitch.tv/helix/chat/messages
  ?broadcaster_id={id}&sender_id={bot_id}
Body: { message: "Hello!" }
```

### Rate Limits

| Endpoint               | Limit                              |
| ---------------------- | ---------------------------------- |
| Most Helix endpoints   | 800 requests/minute per user token |
| EventSub subscriptions | 300 total subscriptions per app    |
| Chat messages          | 100 messages/second per bot        |

---

## YouTube Live Integration

### Authentication

**OAuth 2.0 Flow:**

```
Authorization URL: https://accounts.google.com/o/oauth2/v2/auth
Token URL: https://oauth2.googleapis.com/token
```

**Required Scopes:**
| Scope | Purpose |
|-------|---------|
| `https://www.googleapis.com/auth/youtube` | Manage videos & broadcasts |
| `https://www.googleapis.com/auth/youtube.readonly` | Read-only access |
| `https://www.googleapis.com/auth/youtube.force-ssl` | SSL streaming |

### Quota System

**Daily Limit:** 10,000 units/day (default)

| Operation                    | Quota Cost |
| ---------------------------- | ---------- |
| Read (list channels, videos) | 1 unit     |
| Write (create, update)       | 50 units   |
| Search                       | 100 units  |
| Video upload                 | 100 units  |
| Invalid request              | 1+ units   |

### API Endpoints

```typescript
// Get live broadcast
GET https://www.googleapis.com/youtube/v3/liveBroadcasts
  ?part=snippet,status,contentDetails
  &broadcastType=all
  &key={API_KEY}

// Create broadcast
POST https://www.googleapis.com/youtube/v3/liveBroadcasts
  ?part=snippet,status,contentDetails
Body: {
  snippet: {
    title: "Tier List Stream",
    scheduledStartTime: "2025-03-01T20:00:00Z"
  },
  status: {
    privacyStatus: "public"
  }
}

// Bind stream to broadcast
POST https://www.googleapis.com/youtube/v3/liveBroadcasts/bind
  ?id={broadcast_id}&streamId={stream_id}

// Transition broadcast state
POST https://www.googleapis.com/youtube/v3/liveBroadcasts/transition
  ?id={broadcast_id}&broadcastStatus=testing
```

### Limitations

⚠️ **No direct chat message API** - YouTube doesn't provide real-time chat access via Data API v3. You need:

- YouTube Live Chat API (separate quota)
- Or third-party services like StreamElements/Streamlabs

---

## Kick Integration

### Authentication (OAuth 2.1)

```
Auth Server: https://id.kick.com
API Server: https://api.kick.com
```

**Required Scopes:**
| Scope | Purpose |
|-------|---------|
| `user:read` | Read user info |
| `channel:read` | Channel info, stream status |
| `channel:write` | Update stream metadata |
| `chat:write` | Send chat messages |
| `events:subscribe` | Subscribe to channel events |
| `moderation:chat_message:manage` | Delete chat messages |
| `streamkey:read` | Read stream URL/key |

### API Endpoints

```typescript
// Get channel info
GET https://api.kick.com/public/v1/channels/{channel_id}
Headers:
  Authorization: Bearer {access_token}

// Update stream metadata
PATCH https://api.kick.com/public/v1/channels
Body: {
  title: "Tier List Stream",
  category_id: 123,
  tags: ["tier-list", "gaming"]
}

// Send chat message
POST https://api.kick.com/public/v1/chat
Body: {
  content: "Welcome to the tier list!",
  chatroom_id: {chatroom_id}
}

// Get livestreams
GET https://api.kick.com/public/v1/livestreams
  ?category={id}&language={lang}

// Ban user (moderation)
POST https://api.kick.com/public/v1/moderation/bans
Body: {
  user_id: {user_id},
  duration: 600 // seconds (0 = permanent)
}
```

### Chat WebSocket

Kick uses Pusher for real-time chat:

```typescript
import Pusher from "pusher-js";

const pusher = new Pusher(APP_KEY, {
  cluster: "us2",
  encrypted: true,
});

// Subscribe to chat channel
const channel = pusher.subscribe(`chatrooms.${chatroomId}.v2`);

// Listen for messages
channel.bind("chat-message", (data: ChatMessage) => {
  console.log(`${data.sender.username}: ${data.content}`);
  // Parse tier voting commands
  parseTierVote(data.content, data.sender);
});
```

### Rate Limits

⚠️ **Not officially documented** - Implement exponential backoff for 429 responses.

---

## Implementation Architecture

### Chat Command Parser

```typescript
// src/lib/chat-commands.ts

interface ChatCommand {
  name: string;
  aliases: string[];
  handler: (args: string[], user: ChatUser) => Promise<void>;
  permissions?: PermissionLevel;
}

const TIER_VOTE_PATTERN = /^!(?:vote|tier)\s+([SABCDF]|s|a|b|c|d|f)\s+(.+)$/i;

function parseChatCommand(message: string): ParsedCommand | null {
  const match = message.match(TIER_VOTE_PATTERN);
  if (!match) return null;

  return {
    command: "vote",
    tier: match[1].toUpperCase(),
    item: match[2].trim(),
  };
}

class ChatCommandHandler {
  private commands = new Map<string, ChatCommand>();

  register(command: ChatCommand) {
    this.commands.set(command.name, command);
    command.aliases.forEach((alias) => {
      this.commands.set(alias, command);
    });
  }

  async handle(message: string, user: ChatUser) {
    const parsed = parseChatCommand(message);
    if (!parsed) return;

    const command = this.commands.get(parsed.command);
    if (!command) return;

    // Check permissions
    if (command.permissions && !hasPermission(user, command.permissions)) {
      return;
    }

    await command.handler(parsed.args, user);
  }
}
```

### EventSub WebSocket Client (Twitch)

```typescript
// src/lib/twitch-eventsub.ts

import WebSocket from "isomorphic-ws";

class TwitchEventSubClient {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, EventSubSubscription>();

  async connect() {
    this.ws = new WebSocket("wss://eventsub.wss.twitch.tv/ws");

    this.ws.on("open", () => {
      console.log("EventSub WebSocket connected");
    });

    this.ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      this.handleMessage(message);
    });
  }

  private handleMessage(message: EventSubMessage) {
    switch (message.metadata.message_type) {
      case "session_welcome":
        this.sessionId = message.payload.session.id;
        break;

      case "session_keepalive":
        // Send pong
        break;

      case "notification":
        this.handleNotification(message.payload);
        break;

      case "session_reconnect":
        this.reconnect(message.payload.session.reconnect_url);
        break;
    }
  }

  private handleNotification(payload: NotificationPayload) {
    const { subscription, event } = payload;

    switch (subscription.type) {
      case "channel.chat.message":
        this.onChatMessage(event as ChatMessageEvent);
        break;

      case "channel.subscribe":
        this.onSubscribe(event as SubscribeEvent);
        break;

      case "channel.cheer":
        this.onCheer(event as CheerEvent);
        break;

      case "channel.raid":
        this.onRaid(event as RaidEvent);
        break;
    }
  }

  async subscribeToChat(channelId: string) {
    await this.createSubscription({
      type: "channel.chat.message",
      version: "1",
      condition: {
        broadcaster_user_id: channelId,
      },
      transport: {
        method: "websocket",
        session_id: this.sessionId,
      },
    });
  }
}
```

### Tier Voting Integration

```typescript
// src/features/tier-voting/chat-voting.ts

interface TierVote {
  userId: string;
  userName: string;
  tier: string;
  item: string;
  timestamp: number;
  platform: "twitch" | "youtube" | "kick";
  isSubscriber: boolean;
  isModerator: boolean;
}

class TierVotingService {
  private votes = new Map<string, TierVote[]>();

  async processChatVote(vote: TierVote) {
    // Validate tier
    if (!isValidTier(vote.tier)) return;

    // Check if user already voted for this item
    const existingVotes = this.votes.get(vote.item) || [];
    const existingVote = existingVotes.find((v) => v.userId === vote.userId);

    if (existingVote) {
      // Update existing vote
      existingVote.tier = vote.tier;
      existingVote.timestamp = vote.timestamp;
    } else {
      // Add new vote
      existingVotes.push(vote);
    }

    this.votes.set(vote.item, existingVotes);

    // Update tier list in real-time
    await this.updateTierList(vote.item);

    // Acknowledge vote in chat
    await this.sendChatMessage(`@${vote.userName} voted ${vote.item} → Tier ${vote.tier}!`);
  }

  async updateTierList(itemId: string) {
    // Calculate tier distribution
    const votes = this.votes.get(itemId) || [];
    const tierCounts = votes.reduce(
      (acc, vote) => {
        acc[vote.tier] = (acc[vote.tier] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Find winning tier
    const winningTier = Object.entries(tierCounts).sort(([, a], [, b]) => b - a)[0]?.[0];

    // Update board state
    await updateBoardState({
      itemId,
      tier: winningTier,
      voteCount: votes.length,
    });
  }
}
```

---

## Setup Requirements

### Twitch

1. **Register Application:**
   - Go to [Twitch Console](https://dev.twitch.tv/console)
   - Create new application
   - Set OAuth redirect URL
   - Note Client ID and Client Secret

2. **Enable EventSub:**
   - No additional setup required
   - WebSocket connections handle subscriptions

3. **Bot Setup:**
   - Create bot account
   - Add bot as moderator to your channel
   - Request `user:bot` and `channel:bot` scopes

### YouTube

1. **Enable API:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Enable YouTube Data API v3
   - Create OAuth 2.0 credentials
   - Note Client ID and Client Secret

2. **Get API Key:**
   - Create API key for read-only operations
   - Set quota limits in Cloud Console

3. **Channel Verification:**
   - Channel must be verified for live streaming
   - May require phone verification

### Kick

1. **Register Application:**
   - Go to [Kick Developer Portal](https://id.kick.com)
   - Create new OAuth application
   - Set redirect URIs
   - Note Client ID and Client Secret

2. **Pusher Setup:**
   - Get Pusher app key from Kick API
   - Configure WebSocket connection

---

## Security Considerations

1. **Token Storage:**
   - Store tokens encrypted at rest
   - Use environment variables for secrets
   - Implement token rotation

2. **Rate Limiting:**
   - Implement client-side rate limiting
   - Use exponential backoff for 429 errors
   - Cache API responses when possible

3. **Chat Moderation:**
   - Validate all chat commands
   - Implement cooldowns for voting
   - Filter spam/abuse patterns

4. **User Permissions:**
   - Verify user badges/roles
   - Implement permission levels (mod, sub, vip, follower)
   - Log all privileged actions

---

## Recommended Integration Order

1. **Phase 1: Twitch EventSub**
   - Chat message reading
   - Basic tier voting commands
   - Subscriber-only voting

2. **Phase 2: Kick WebSocket**
   - Chat message reading
   - Cross-platform vote aggregation

3. **Phase 3: YouTube Live**
   - Stream info display
   - Broadcast management

4. **Phase 4: Advanced Features**
   - Bits/cheers integration
   - Raid notifications
   - Stream overlays
   - Multi-platform sync

---

## Dependencies to Add

```bash
# WebSocket client
bun add isomorphic-ws
bun add -d @types/ws

# OAuth utilities
bun add oauth2-server

# Pusher for Kick chat
bun add pusher-js

# Rate limiting
bun add rate-limiter-flexible

# Token storage (encrypted)
bun add @noble/ciphers
```

---

## API Reference Links

- [Twitch API Docs](https://dev.twitch.tv/docs/api/)
- [Twitch EventSub](https://dev.twitch.tv/docs/eventsub/)
- [YouTube Live Streaming API](https://developers.google.com/youtube/v3/live)
- [YouTube Data API Quotas](https://developers.google.com/youtube/v3/getting-started#quota)
- [Kick API Guide](https://repostit.io/kick-api-guide/)
- [Kick GitHub Docs](https://github.com/KickEngineering/KickDevDocs)
