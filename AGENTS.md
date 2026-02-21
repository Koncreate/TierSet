# TierBoard Development Agent Guide

## Dependencies Reference

### Core Framework
| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^19.2.0 | UI framework |
| `react-dom` | ^19.2.0 | React DOM renderer |

### TanStack Ecosystem
| Package | Version | Purpose |
|---------|---------|---------|
| `@tanstack/react-start` | ^1.132.0 | Full-stack React framework |
| `@tanstack/react-router` | ^1.132.0 | File-based routing |
| `@tanstack/react-router-devtools` | ^1.132.0 | Router devtools |
| `@tanstack/react-router-ssr-query` | ^1.131.7 | SSR query integration |
| `@tanstack/router-plugin` | ^1.132.0 | Vite plugin for routing |
| `@tanstack/react-store` | ^0.8.0 | Global state management |
| `@tanstack/store` | ^0.8.0 | Core store library |
| `@tanstack/react-form` | ^1.0.0 | Form state management |
| `@tanstack/react-query` | ^5.66.5 | Server state/data fetching |
| `@tanstack/react-query-devtools` | ^5.84.2 | Query devtools |
| `@tanstack/pacer` | ^0.18.0 | Rate limiting utilities |

### CRDT & Collaboration (Automerge)
| Package | Version | Purpose |
|---------|---------|---------|
| `@automerge/automerge` | ^3.2.4 | Core CRDT library |
| `@automerge/automerge-repo` | ^2.5.3 | Repository & sync |
| `@automerge/automerge-repo-storage-indexeddb` | ^2.5.3 | IndexedDB storage adapter |
| `@automerge/react` | ^2.5.3 | React bindings |

### UI Components & Accessibility
| Package | Version | Purpose |
|---------|---------|---------|
| `react-aria-components` | ^1.15.1 | Accessible UI primitives |
| `@react-aria/button` | ^3.14.4 | Button accessibility |
| `@react-aria/focus` | ^3.21.4 | Focus management |
| `@react-aria/interactions` | ^3.27.0 | Interaction hooks |
| `@react-aria/utils` | ^3.33.0 | Aria utilities |
| `@react-stately/overlays` | ^3.6.22 | Overlay state |
| `@react-stately/toggle` | ^3.9.4 | Toggle state |
| `@atlaskit/pragmatic-drag-and-drop` | ^1.7.7 | Drag and drop |

### Icons & Fonts
| Package | Version | Purpose |
|---------|---------|---------|
| `@phosphor-icons/react` | vendored | Icon library |
| `@fontsource-variable/*` | ^5.2.x | Variable fonts (Inter, DM Sans, etc.) |
| `@fontsource/*` | ^5.2.x | Static fonts (Space Grotesk, etc.) |

### Image & Media Handling
| Package | Version | Purpose |
|---------|---------|---------|
| `@uppy/core` | ^5.2.0 | Upload core |
| `@uppy/dashboard` | ^5.1.1 | Upload UI |
| `@uppy/drag-drop` | ^5.1.0 | Drag-drop zone |
| `@uppy/image-editor` | ^4.2.0 | Image editing |
| `@uppy/react` | ^5.2.0 | React components |
| `@uppy/xhr-upload` | ^5.1.1 | XHR upload plugin |
| `react-easy-crop` | vendored | Image cropping |
| `qrcode` | ^1.5.4 | QR code generation |
| `fflate` | ^0.8.2 | ZIP compression |

### Emoji
| Package | Version | Purpose |
|---------|---------|---------|
| `emoji-mart` | vendored | Emoji picker core |
| `@emoji-mart/react` | vendored | React emoji picker |

### Storage & Networking
| Package | Version | Purpose |
|---------|---------|---------|
| `dexie` | ^4.3.0 | IndexedDB wrapper |
| `unstorage` | ^1.17.4 | Universal storage layer |
| `eventemitter3` | ^5.0.4 | Event emitter |
| `@noble/hashes` | ^2.0.1 | Cryptographic hashing |

### Validation & ID Generation
| Package | Version | Purpose |
|---------|---------|---------|
| `zod` | ^4.1.11 | Runtime schema validation |
| `nanoid` | ^5.1.6 | URL-friendly IDs |
| `@paralleldrive/cuid2` | ^3.3.0 | Collision-resistant IDs |
| `fractional-indexing` | ^3.2.0 | Lexicographically ordered keys |

### Styling
| Package | Version | Purpose |
|---------|---------|---------|
| `tailwindcss` | ^4.1.18 | Utility-first CSS |
| `@tailwindcss/vite` | ^4.1.18 | Vite integration |

### Utilities
| Package | Version | Purpose |
|---------|---------|---------|
| `react-share` | ^5.2.2 | Social sharing |
| `react-split-pane` | ^3.2.0 | Resizable panes |
| `react-content-loader` | vendored | Loading skeletons |
| `react-grid-gallery` | vendored | Image gallery |
| `react-image` | vendored | Image loading |

### Cloudflare
| Package | Version | Purpose |
|---------|---------|---------|
| `@cloudflare/vite-plugin` | ^1.13.8 | Cloudflare deployment |

### Dev Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.7.2 | Type checking |
| `vite` | ^7.1.7 | Build tool |
| `@vitejs/plugin-react` | ^5.0.4 | React plugin |
| `vite-plugin-wasm` | ^3.5.0 | WebAssembly support |
| `vite-tsconfig-paths` | ^5.1.4 | Path aliases |
| `vitest` | ^3.0.5 | Unit testing |
| `@playwright/test` | ^1.58.2 | E2E testing |
| `playwright` | ^1.58.2 | Browser automation |
| `oxlint` | ^1.48.0 | Linting |
| `oxfmt` | ^0.33.0 | Formatting |
| `wrangler` | ^4.40.3 | Cloudflare CLI |
| `@inlang/paraglide-js` | ^2.8.0 | i18n |
| `babel-plugin-react-compiler` | ^1.0.0 | React optimization |
| `@testing-library/react` | ^16.2.0 | React testing |
| `@testing-library/dom` | ^10.4.0 | DOM testing |
| `@faker-js/faker` | ^10.3.0 | Test data generation |
| `jsdom` | ^27.0.0 | DOM simulation |
| `msw` | ^2.12.10 | API mocking |

### Browser APIs Used
- **WebRTC** - `RTCPeerConnection`, `RTCDataChannel`, `RTCIceCandidate`
- **IndexedDB** - Browser storage (via Dexie)
- **Canvas API** - `OffscreenCanvas`, `createImageBitmap` for image processing
- **Web Crypto API** - `crypto.randomUUID`, `crypto.subtle`
- **Clipboard API** - `navigator.clipboard`

## Package Manager

**Use `bun` exclusively** for all package management and script execution.

### Common Commands

```bash
# Install dependencies
bun install

# Development server
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview

# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test src/lib/p2p/__tests__/signaling-store.test.ts

# Lint code (type-aware by default)
bunx oxlint --type-aware

# Format code
bunx oxfmt --write

# Deploy to Cloudflare
bun run deploy
```

## Code Quality

### Linting

```bash
# Lint specific files
bunx oxlint --type-aware src/lib/p2p/ src/hooks/

# Lint entire project
bunx oxlint --type-aware
```

### Formatting

```bash
# Format specific files
bunx oxfmt --write src/lib/p2p/

# Format entire project
bunx oxfmt --write .
```

## Project Structure

```
src/
├── api/                    # Public API surface
├── lib/                    # Core logic (no React)
│   ├── documents/          # Automerge CRDT operations
│   ├── p2p/                # WebRTC networking
│   └── storage/            # IndexedDB persistence
├── hooks/                  # React ↔ Core bridge
├── components/             # UI components
├── integrations/           # External APIs (read-only)
└── routes/                 # TanStack Router
```

## Key Technologies

- **TanStack Start** - Full-stack React framework
- **Automerge** - CRDT for conflict-free sync. See `docs/llms/automerge-llms.txt` for patterns.
- **WebRTC** - Peer-to-peer data channels
- **IndexedDB/Dexie** - Local storage
- **Zod** - Runtime validation
- **Tailwind CSS** - Styling

## Development Workflow

1. **Make changes** to code
2. **Run lint**: `bunx oxlint`
3. **Run format**: `bunx oxfmt --write`
4. **Run tests**: `bun test`
5. **Build**: `bun run build`

## Testing Guidelines

- Place tests in `__tests__/` directories next to tested code
- Use Vitest for testing
- Test files: `*.test.ts` or `*.test.tsx`
- Mock external dependencies
- Test edge cases and error handling

## Commit Guidelines

- Write clear, concise commit messages
- Focus on "why" not "what"
- Reference issues/PRs when applicable
- Keep commits atomic

## P2P Signaling

The signaling server is implemented using TanStack Start server functions:

- Location: `src/routes/api/-signaling.ts`
- In-memory store: `src/lib/p2p/signaling-store.ts`
- Tests: `src/lib/p2p/__tests__/signaling-store.test.ts`

## Documentation

- `docs/llms/automerge-llms.txt` - **Canonical Automerge patterns** (read this first for CRDT usage)
- `docs/api.md` - Full API architecture
- `docs/P2P-SIGNALING-IMPLEMENTATION.md` - Signaling implementation details
- `docs/NAT-ICE.md` - WebRTC NAT traversal
- `docs/SECURITY.md` - Security considerations
