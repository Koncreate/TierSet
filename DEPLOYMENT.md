# TierBoard Deployment Guide

Deploy TierBoard to Cloudflare Workers for production P2P signaling with KV storage.

---

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
- Node.js 18+ and Bun installed

---

## Quick Start

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy (first time will prompt for KV setup)
bun run deploy
```

---

## Step 1: Create KV Namespaces

TierBoard uses KV for P2P signaling state (room offers, answers, ICE candidates).

```bash
# Create production KV namespace
wrangler kv:namespace create "SIGNALING_KV"

# Create preview KV namespace (for development/testing)
wrangler kv:namespace create "SIGNALING_KV" --preview
```

**Copy the namespace IDs** from the output - you'll need them for `wrangler.jsonc`.

---

## Step 2: Configure wrangler.jsonc

Edit `wrangler.jsonc` with your KV namespace IDs:

```jsonc
{
  "name": "tanstack-start-app",
  "compatibility_date": "2025-09-02",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "kv_namespaces": [
    {
      "binding": "SIGNALING_KV",
      "id": "YOUR_PRODUCTION_KV_ID", // ← Replace with production ID
      "preview_id": "YOUR_PREVIEW_KV_ID", // ← Replace with preview ID
    },
  ],
}
```

**Where to find KV IDs:**

- Cloudflare Dashboard → Workers & Pages → KV → Click namespace → Copy ID
- Or from `wrangler kv:namespace create` output

---

## Step 3: Environment Variables (Optional)

Create a `.env` file for local development:

```bash
# Copy example
cp .env.example .env

# Edit with your values
```

**Variables:**

| Variable                | Required | Description                                             |
| ----------------------- | -------- | ------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | No       | Your Cloudflare account ID (auto-detected if logged in) |
| `CLOUDFLARE_API_TOKEN`  | No       | API token (auto-detected from `wrangler login`)         |

---

## Step 4: Deploy

```bash
# Build and deploy
bun run deploy
```

**First deployment output:**

```
Deploying to https://tanstack-start-app.<your-subdomain>.workers.dev
```

**Your app is now live!** Share the URL with others.

---

## Step 5: Verify Deployment

1. Open the deployed URL in **two different browsers** (or incognito)
2. Create a room in browser A
3. Join the room in browser B using the room code
4. Verify P2P connection establishes (check browser console for `[P2PNetwork]` logs)

---

## Development Workflow

### Local Development (No KV)

```bash
bun run dev
```

Local dev uses **in-memory storage** (no KV required). Perfect for testing UI changes.

### Preview Deployments

```bash
# Deploy to preview environment
wrangler deploy --env preview
```

Preview uses the `preview_id` KV namespace (isolated from production).

### Production Deployments

```bash
# Deploy to production
wrangler deploy
```

---

## TURN Server Configuration (Optional)

TierBoard works with Cloudflare's built-in TURN servers by default. For custom TURN:

### Option 1: Cloudflare Calls (Recommended)

```bash
# Enable Cloudflare Calls in wrangler.jsonc
{
  "calls": {
    "enabled": true
  }
}
```

### Option 2: Custom TURN Server

Add to `src/lib/p2p/ice-servers.ts`:

```typescript
export function getIceServers() {
  return {
    iceServers: [
      {
        urls: "turn:your-turn-server.com:3478",
        username: "your-username",
        credential: "your-credential",
      },
      // Fallback to STUN
      { urls: "stun:stun.l.google.com:19302" },
    ],
  };
}
```

---

## Troubleshooting

### "KV namespace not found"

**Error:**

```
[code: 10009] KV namespace not found
```

**Fix:**

1. Run `wrangler kv:namespace create "SIGNALING_KV"` again
2. Update `wrangler.jsonc` with the new ID
3. Redeploy

### P2P Connection Fails

**Symptoms:** Room created but peer can't join

**Check:**

1. Browser console for `[P2PNetwork]` errors
2. Cloudflare Workers logs: Dashboard → Workers → Click worker → Logs
3. Verify KV namespace is bound correctly

**Common causes:**

- Firewall blocking WebRTC (needs UDP ports 1024-65535)
- Strict NAT requiring TURN relay
- Expired room (rooms expire after 1 hour by default)

### Build Fails

**Error:**

```
Module not found: Can't resolve '@tanstack/react-start/server-entry'
```

**Fix:**

```bash
# Rebuild
bun run build

# Then deploy
wrangler deploy
```

---

## Monitoring

### Cloudflare Dashboard

1. **Workers Analytics**: Dashboard → Workers → Select worker → Analytics
   - Request count, errors, CPU time

2. **KV Usage**: Dashboard → Workers → KV
   - Storage size, operation count

3. **Logs**: Dashboard → Workers → Select worker → Logs
   - Real-time error logs

### Browser Console Logs

```javascript
// P2P Network logs
[P2PNetwork] Created room: TIER-ABC123
[P2PNetwork] Received answer from client
[P2PNetwork] ICE state: connected

// Board sync logs
[BoardView] Sync received from peer: peer_xyz
[BoardView] Merged document changes
```

---

## Scaling Considerations

### Current Limits (Free Tier)

| Resource         | Limit       | Notes                         |
| ---------------- | ----------- | ----------------------------- |
| Workers requests | 100,000/day | ~1 request per P2P connection |
| KV operations    | 100,000/day | ~10 ops per room lifecycle    |
| KV storage       | 1 GB        | Room state is ~1-5 KB each    |

**Estimated capacity:** ~5,000 rooms/day on free tier

### When to Upgrade

- **Paid Workers** ($5/month): 10M requests/day
- **KV Paid**: $0.50/GB storage, $0.50/1M operations

---

## Backup & Recovery

### Export KV Data

```bash
# Export all KV keys
wrangler kv:namespace list "SIGNALING_KV" --preview > kv-backup.json
```

### Restore KV Data

```bash
# Import KV keys from backup
wrangler kv:namespace put "SIGNALING_KV" --key=KEY --value=VALUE
```

### Room Persistence

Rooms are **ephemeral** (stored in KV with TTL). If KV is cleared:

- Active rooms will need to be recreated
- Board data in IndexedDB (client-side) is unaffected

---

## Security Checklist

- [ ] Enable [Workers Firewall](https://developers.cloudflare.com/workers/platform/security/firewall-rules/) to restrict access
- [ ] Set up [Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/) for signaling endpoints
- [ ] Use [API Shield](https://developers.cloudflare.com/api-shield/) for request validation
- [ ] Enable [Bot Fight Mode](https://developers.cloudflare.com/bots/concepts/bot-fight-mode/) if abuse detected

---

## Next Steps

- [ ] Set up custom domain (Dashboard → Workers → Custom Domains)
- [ ] Configure [Workers Analytics](https://developers.cloudflare.com/workers/analytics/)
- [ ] Set up [Logpush](https://developers.cloudflare.com/workers/observability/logs/logpush/) for log export
- [ ] Add [Uptime Monitoring](https://developers.cloudflare.com/uptime/)

---

## Support

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [KV Documentation](https://developers.cloudflare.com/kv/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [TierBoard Issues](https://github.com/your-repo/tierset/issues)
