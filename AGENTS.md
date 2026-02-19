# TierBoard Development Agent Guide

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
- **Automerge** - CRDT for conflict-free sync
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

- `docs/api.md` - Full API architecture
- `docs/P2P-SIGNALING-IMPLEMENTATION.md` - Signaling implementation details
- `docs/NAT-ICE.md` - WebRTC NAT traversal
- `docs/SECURITY.md` - Security considerations
