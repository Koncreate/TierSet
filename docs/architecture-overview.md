# TierBoard Architecture Overview

## System Architecture

TierBoard is a local-first, serverless P2P multiplayer tier list application built with modern web technologies. The system operates entirely offline after initial installation, using WebRTC for peer-to-peer connectivity and Automerge CRDT for conflict-free collaborative editing.

### Core Principles

- **Local-first**: Full functionality offline, no backend dependency
- **Serverless**: SPA output deployable to static hosting
- **P2P**: WebRTC signaling with QR/link join
- **CRDT**: Automerge handles concurrent edits and conflicts
- **Offline PWA**: Workbox service worker caches all assets

### Technology Stack

| Category   | Technology             | Purpose                                                     |
| ---------- | ---------------------- | ----------------------------------------------------------- |
| Framework  | TanStack Start + Vinxi | Full-stack React with file-based routing, static SPA output |
| State      | Automerge CRDT         | Conflict-free collaborative document sync                   |
| Storage    | Dexie.js + IndexedDB   | Local persistence for boards, images, user preferences      |
| UI         | Adobe Spectrum         | Design system for consistent components                     |
| DnD        | Pragmatic DnD          | Drag-and-drop for tier list interactions                    |
| Networking | WebRTC                 | P2P connections via data channels                           |
| i18n       | Paraglide-JS           | Compile-time internationalization                           |
| PWA        | Vite PWA Plugin        | Offline capability and installability                       |

### Architecture Layers

The application uses a layered architecture with clear separation of concerns:

1. **Presentation Layer**: React components with Adobe Spectrum UI
2. **Application Layer**: Business logic, routing, state management
3. **Data Layer**: Automerge documents and Dexie local storage
4. **Infrastructure Layer**: WebRTC networking and PWA service worker

### Data Flow

- **Local Edits**: User actions → Automerge change() → local doc update
- **Sync**: CRDT merge across peers via WebRTC data channels
- **Persistence**: Automatic IndexedDB storage via Automerge repo
- **UI Updates**: Reactive subscription to doc changes

### Key Features

- **Tier List Mode**: Drag items into ranked tiers with live collaboration
- **Tournament Mode**: Bracket generation with voting mechanics
- **Visual Customization**: Room-level themes and personal preferences
- **Multiplayer**: P2P join via QR codes and shareable links
- **Offline-first**: Works without internet after initial load

### Security Model

- **Local Storage**: All data stored locally, no server transmission
- **Peer Authentication**: Optional room passwords hashed locally
- **CRDT Security**: Automerge handles malicious peer isolation
- **No External APIs**: Zero network dependencies after installation

### Performance Characteristics

- **Bundle Size**: Tree-shaken imports, lazy-loaded components
- **Memory Usage**: Efficient CRDT operations, compressed image storage
- **Network**: Minimal bandwidth via compressed signaling
- **Responsiveness**: 60fps animations with hardware acceleration
