# Plan 1: Monorepo Migration

> Convert tierset from a single TanStack Start app into a Bun workspace monorepo housing two apps and shared packages.

---

## Target Structure

```
tierset/
├── apps/
│   ├── app/                  ← existing TanStack Start SPA (moved here)
│   │   ├── src/
│   │   ├── vendor/
│   │   ├── public/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── wrangler.jsonc
│   │   └── playwright.config.ts
│   │
│   └── www/                  ← NEW: Astro social/marketing site
│       ├── src/
│       ├── package.json
│       ├── astro.config.ts
│       └── tsconfig.json
│
├── packages/
│   └── shared/               ← NEW: shared types, Zod schemas, brand
│       ├── src/
│       │   ├── types/        ← board, user, subscription types
│       │   ├── schemas/      ← Zod validation schemas
│       │   ├── brand/        ← logo, colors, design tokens
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── convex/                   ← NEW: Convex schema + functions (shared)
│   ├── schema.ts
│   ├── boards.ts
│   ├── users.ts
│   ├── rooms.ts
│   ├── urls.ts
│   ├── photos.ts
│   └── tsconfig.json
│
├── docs/                     ← stays at root
├── package.json              ← workspace root
├── bunfig.toml
└── tsconfig.base.json        ← shared TS config
```

---

## Phase 1: Workspace Root Setup

### 1.1 Root `package.json`

```json
{
  "name": "tierset",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "bun --filter '*' dev",
    "dev:app": "bun --filter @tierset/app dev",
    "dev:www": "bun --filter @tierset/www dev",
    "build": "bun --filter '*' build",
    "build:app": "bun --filter @tierset/app build",
    "build:www": "bun --filter @tierset/www build",
    "test": "bun --filter '*' test",
    "lint": "bunx oxlint --type-aware",
    "format": "bunx oxfmt --write .",
    "deploy:app": "bun --filter @tierset/app deploy",
    "deploy:www": "bun --filter @tierset/www deploy"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "oxlint": "^1.48.0",
    "oxfmt": "^0.33.0"
  }
}
```

### 1.2 Root `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  }
}
```

### 1.3 Root `bunfig.toml`

```toml
[install]
peer = false
```

---

## Phase 2: Move Existing App → `apps/app/`

### 2.1 File Moves

| Source (root)          | Destination                |
|------------------------|----------------------------|
| `src/`                 | `apps/app/src/`            |
| `vendor/`              | `apps/app/vendor/`         |
| `public/`              | `apps/app/public/`         |
| `tests/`               | `apps/app/tests/`          |
| `vite.config.ts`       | `apps/app/vite.config.ts`  |
| `wrangler.jsonc`       | `apps/app/wrangler.jsonc`  |
| `playwright.config.ts` | `apps/app/playwright.config.ts` |
| `project.inlang/`      | `apps/app/project.inlang/` |
| `.cta.json`            | `apps/app/.cta.json`       |

### 2.2 `apps/app/package.json`

```json
{
  "name": "@tierset/app",
  "private": true,
  "type": "module",
  "imports": {
    "#/*": "./src/*",
    "#vendor/*": "./vendor/*"
  },
  "scripts": {
    "dev": "vite dev --port 3000",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "deploy": "bun run build && wrangler deploy"
  },
  "dependencies": {
    "@tierset/shared": "workspace:*",
    "convex": "^1.x",
    "@clerk/clerk-react": "^5.x",
    ... (all existing deps from current package.json)
  },
  "devDependencies": {
    ... (all existing devDeps)
  }
}
```

### 2.3 Update Import Paths

No import path changes needed — the `#/*` and `#vendor/*` imports are relative to `apps/app/` and continue to work. The `tsconfig.json` in `apps/app/` extends the base:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "paths": {
      "#/*": ["./src/*"],
      "#vendor/*": ["./vendor/*"],
      "@tierset/shared": ["../../packages/shared/src"]
    }
  },
  "include": ["src/**/*", "vendor/**/*"]
}
```

---

## Phase 3: Shared Package

### 3.1 `packages/shared/package.json`

```json
{
  "name": "@tierset/shared",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./schemas": "./src/schemas/index.ts",
    "./brand": "./src/brand/index.ts"
  },
  "dependencies": {
    "zod": "^4.1.11"
  }
}
```

### 3.2 Shared Types to Extract

These types are used across all three apps and Convex:

```typescript
// packages/shared/src/types/user.ts
export interface TiersetUser {
  id: string;
  clerkId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  plan: "free" | "pro";
  createdAt: number;
}

// packages/shared/src/types/board.ts
export interface PublishedBoard {
  id: string;
  authorId: string;
  title: string;
  description: string;
  previewImageUrl: string;
  tierCount: number;
  itemCount: number;
  likes: number;
  views: number;
  publishedAt: number;
  tags: string[];
  visibility: "public" | "unlisted";
}

// packages/shared/src/types/subscription.ts
export type Plan = "free" | "pro";

export interface PlanLimits {
  maxRoomSize: number;
  maxImageUploads: number;
  canCreatePrivateBoard: boolean;
  canUseLargeRoom: boolean;
  canUseStreamIntegration: boolean;
  canUseCustomThemes: boolean;
  canShortenRoomCode: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxRoomSize: 10,
    maxImageUploads: 10,
    canCreatePrivateBoard: false,
    canUseLargeRoom: false,
    canUseStreamIntegration: false,
    canUseCustomThemes: false,
    canShortenRoomCode: false,
  },
  pro: {
    maxRoomSize: 50,
    maxImageUploads: Infinity,
    canCreatePrivateBoard: true,
    canUseLargeRoom: true,
    canUseStreamIntegration: true,
    canUseCustomThemes: true,
    canShortenRoomCode: true,
  },
};
```

---

## Phase 4: Convex at Root

Convex lives at the repo root because both `apps/app` and `apps/www` share the same Convex deployment.

> **Pattern learned from [vibeapps](https://github.com/waynesutton/vibeapps):** Organize Convex functions by domain into separate files, use `internalMutation`/`internalAction` for server-only logic, and register HTTP routes for webhooks + OG meta serving.

```
convex/
├── _generated/           ← auto-generated by Convex
├── schema.ts             ← all table definitions (see Plan 2 for full schema)
├── auth.config.ts        ← Clerk JWT verification config
├── http.ts               ← HTTP router: webhook endpoints + OG meta routes
│
├── users.ts              ← ensureUser, getProfile, updateProfile, setUsername
├── boards.ts             ← publish, listPublished, getById, search
├── comments.ts           ← add, delete, list (threaded via parentId)
├── likes.ts              ← toggle like (vote pattern from vibeapps)
├── follows.ts            ← toggle follow, list followers/following
├── bookmarks.ts          ← toggle bookmark
├── alerts.ts             ← createAlert (internalMutation), list, markRead
├── rooms.ts              ← createShortCode, resolveCode
├── urls.ts               ← create, resolve short URLs
├── photos.ts             ← generateUploadUrl, savePhoto, getUrl
├── subscriptions.ts      ← check plan, update from webhook
│
├── clerk.ts              ← Clerk webhook handler (user.created, subscription.*)
├── emails/               ← email templates + sending logic
│   ├── welcome.ts
│   ├── daily.ts
│   └── weekly.ts
├── crons.ts              ← scheduled jobs (digest, cleanup, stats)
└── tsconfig.json
```

Both apps point to the same Convex project via `CONVEX_URL` env var and import the generated client types.

### Dual User Sync (from vibeapps pattern)

Both mechanisms run to ensure user data is always in Convex:

1. **`UserSyncer` component** — invisible React component inside `<SignedIn>`, calls `ensureUser` mutation on every sign-in, redirects to `/set-username` if username is null
2. **Clerk webhook** — `POST /clerk` endpoint in `convex/http.ts`, handles `user.created`/`user.updated` events via Svix signature verification, schedules welcome email

---

## Migration Checklist

### Pre-Migration
- [ ] Commit all current changes
- [ ] Create `monorepo-migration` branch
- [ ] Verify all tests pass on current structure

### Workspace Setup
- [ ] Create root `package.json` with workspaces
- [ ] Create `tsconfig.base.json`
- [ ] Create `apps/` and `packages/` directories

### Move Existing App
- [ ] Move `src/`, `vendor/`, `public/`, `tests/` → `apps/app/`
- [ ] Move `vite.config.ts`, `wrangler.jsonc`, `playwright.config.ts` → `apps/app/`
- [ ] Create `apps/app/package.json` (split from root)
- [ ] Create `apps/app/tsconfig.json` (extends base)
- [ ] Update `apps/app/vite.config.ts` paths if needed
- [ ] Verify `bun install` resolves all workspace deps
- [ ] Verify `bun run dev:app` starts the SPA on port 3000
- [ ] Verify `bun test` passes

### Shared Package
- [ ] Create `packages/shared/` with types, schemas, brand
- [ ] Extract common types from `apps/app/src/lib/`
- [ ] Wire up `@tierset/shared` dependency in `apps/app`

### Convex Setup
- [ ] `bunx convex init` at repo root
- [ ] Define schema tables
- [ ] Configure Clerk auth
- [ ] Wire Convex client into `apps/app`

### Scaffold New Apps
- [ ] Scaffold `apps/www/` (see Plan 2)

### Verify
- [ ] `bun install` from root resolves everything
- [ ] `bun run dev:app` works
- [ ] `bun run build:app` produces deployable output
- [ ] `bun run deploy:app` deploys to Cloudflare Workers
- [ ] All existing tests pass
- [ ] Git history preserved (use `git mv` where possible)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Broken imports after move | `#/*` aliases are relative, should work. Run full test suite. |
| Vendor symlinks break | Vendor uses `file:./vendor/*` — update to `file:./apps/app/vendor/*` or keep vendor inside `apps/app/`. |
| Wrangler can't find entry | Update `wrangler.jsonc` `main` path. Run `wrangler dev` from `apps/app/`. |
| CI/CD pipeline changes | Update deploy scripts to `cd apps/app && bun run deploy`. |
| Paraglide paths | Move `project.inlang/` into `apps/app/`, update `vite.config.ts` path. |

---

## Domain Routing

| Subdomain | App | Deploy Target |
|-----------|-----|---------------|
| `app.tierset.com` | `apps/app` | Cloudflare Workers |
| `www.tierset.com` | `apps/www` | Cloudflare Pages |

Cloudflare handles subdomain routing — each app has its own `wrangler.jsonc` (Workers) or Pages project. No shared routing needed.
