# Image Handling Plan

## Overview

TierBoard needs efficient image handling for tier list items. Images must be optimized for:

- Local storage efficiency (IndexedDB has quotas)
- P2P sync bandwidth (WebRTC data channels)
- Fast loading and rendering

## Technology Stack

### Build-time Optimization

**unplugin-imagemin** - Build-time image compression

- GitHub: https://github.com/unplugin/unplugin-imagemin
- Integrates with Vite build pipeline
- Supports multiple codecs via squoosh

### Runtime Codecs

**Squoosh Codecs** - Browser-based image compression

- GitHub: https://github.com/GoogleChromeLabs/squoosh/tree/dev/codecs
- WebAssembly-based for fast client-side compression
- Supports: AVIF, WebP, JPEG XL, PNG, MozJPEG, etc.

### ZIP Handling

**fflate** - Fast, lightweight ZIP library

- GitHub: https://github.com/101arrowz/fflate
- Only 8kB minified + gzipped
- Works in browser and Node.js
- Supports ZIP, GZIP, ZLIB, DEFLATE
- Async with Web Workers for parallel processing
- Use cases:
  - Batch import images from ZIP files
  - Export tier lists as downloadable ZIP archives
  - Compress sync payloads for P2P transfer

## Vendor Image Packages

Already installed in `vendor/` directory:

| Package               | Path                                        | Purpose                                                  |
| --------------------- | ------------------------------------------- | -------------------------------------------------------- |
| react-easy-crop       | vendor/react-easy-crop                      | Image/video cropping with zoom, rotation, touch gestures |
| react-grid-gallery    | vendor/react-grid-gallery                   | Justified image gallery with selection support           |
| react-image           | vendor/react-image                          | Image loader with fallback sources and suspense          |
| @phosphor-icons/react | vendor/phosphor-icons-react                 | Icon library with 10,000+ icons                          |
| emoji-mart            | vendor/emoji-mart/packages/emoji-mart       | Emoji picker component                                   |
| @emoji-mart/react     | vendor/emoji-mart/packages/emoji-mart-react | React wrapper for emoji-mart                             |
| react-content-loader  | vendor/react-content-loader                 | SVG placeholder loading skeletons                        |

### react-easy-crop

Full-featured cropping component for user image uploads.

```tsx
import Cropper from "vendor/react-easy-crop";
import "vendor/react-easy-crop/dist/react-easy-crop.css";

function ImageCropModal({ imageSrc, onCropComplete }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedArea, setCroppedArea] = useState(null);

  return (
    <Cropper
      image={imageSrc}
      crop={crop}
      zoom={zoom}
      rotation={rotation}
      aspect={1} // Square for tier items
      cropShape="rect"
      showGrid={true}
      onCropChange={setCrop}
      onZoomChange={setZoom}
      onRotationChange={setRotation}
      onCropComplete={(croppedArea, croppedAreaPixels) => {
        setCroppedArea(croppedAreaPixels);
      }}
    />
  );
}
```

**Features:**

- Touch/mouse drag, pinch-to-zoom
- Rotation support
- Keyboard navigation (arrow keys)
- Customizable aspect ratio
- Round or rectangular crop shape
- Video cropping support

### react-grid-gallery

Justified image gallery (like Google Photos/Unsplash layout).

```tsx
import Gallery from "vendor/react-grid-gallery";

const images = [
  {
    src: "/images/hero.jpg",
    width: 1920,
    height: 1080,
    caption: "Hero Image",
    isSelected: false,
  },
  // ...
];

function ImagePicker({ onSelect }) {
  return (
    <Gallery
      images={images}
      rowHeight={180}
      margin={4}
      enableImageSelection={true}
      onSelect={(index, image, event) => {
        onSelect(image);
      }}
    />
  );
}
```

**Features:**

- Justified layout (rows auto-height)
- Multi-select with checkboxes
- Custom overlay components
- Tags and captions
- Responsive container width

### react-image

Smart image loading with fallbacks and suspense.

```tsx
import Img from "vendor/react-image";

function TierItemImage({ imageId }) {
  return (
    <Img
      src={[
        `/api/images/${imageId}.webp`,
        `/api/images/${imageId}.jpg`,
        "/fallback-placeholder.png",
      ]}
      loader={<Spinner />}
      unloader={<BrokenImageIcon />}
      decode={true}
    />
  );
}
```

**Features:**

- Tries multiple sources sequentially
- Suspense mode with React 18
- Loading placeholder (loader)
- Error fallback (unloader)
- Image decoding before display

## Image Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                      IMAGE LIFECYCLE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. UPLOAD                                                      │
│     User selects image → File API → Resize if needed            │
│                           ↓                                     │
│  2. COMPRESS                                                    │
│     Squoosh WASM codec → WebP/AVIF (smaller than PNG/JPEG)      │
│                           ↓                                     │
│  3. STORE                                                       │
│     Dexie/IndexedDB → Blob stored with generated ID             │
│                           ↓                                     │
│  4. SYNC                                                        │
│     Automerge binary sync → WebRTC to peers                     │
│                           ↓                                     │
│  5. RENDER                                                      │
│     Blob URL → <img> element → Hardware accelerated             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Image Upload & Resize

```typescript
// Maximum dimensions for tier list items
const MAX_WIDTH = 256;
const MAX_HEIGHT = 256;

async function processUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  // Calculate resize dimensions maintaining aspect ratio
  const scale = Math.min(MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height, 1);

  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  // Resize via OffscreenCanvas
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);

  return canvas.convertToBlob({ type: "image/webp", quality: 0.8 });
}
```

### 1.1 Thumbnail + Full-Size Variants

Store a small thumbnail for fast board sync and previews, and keep the full-size asset for zoom or export.

```typescript
const THUMB_SIZE = 64;
const FULL_SIZE = 256;

async function createVariants(file: File) {
  const bitmap = await createImageBitmap(file);

  const full = await resizeToSquare(bitmap, FULL_SIZE, {
    type: "image/webp",
    quality: 0.8,
  });

  const thumb = await resizeToSquare(bitmap, THUMB_SIZE, {
    type: "image/webp",
    quality: 0.6,
  });

  return { full, thumb };
}
```

Recommended defaults:

- `thumb`: `64x64`, WebP quality `0.6`
- `full`: `256x256`, WebP quality `0.8` (AVIF optional where supported)

### 2. Vite Plugin Configuration

```typescript
// vite.config.ts
import imagemin from "unplugin-imagemin/vite";

export default defineConfig({
  plugins: [
    imagemin({
      // Use squoosh codecs for build-time optimization
      mode: "squoosh",
      // Target formats
      format: ["webp", "avif"],
      // Quality settings
      quality: 80,
      // Only optimize images in assets folder
      include: /\/assets\//,
    }),
  ],
});
```

### 3. Dexie Schema

```typescript
// Image storage in IndexedDB
import { createId } from "#/lib/ids";

db.images.bulkAdd([
  {
    id: createId(),
    blob: fullBlob,
    mimeType: "image/webp",
    width: 256,
    height: 256,
    thumbnailBlob: thumbBlob,
    thumbnailMimeType: "image/webp",
    originalName: file.name,
    createdAt: Date.now(),
  },
]);
```

### 4. Squoosh Codec Options

| Codec   | Use Case        | Pros                           | Cons                      |
| ------- | --------------- | ------------------------------ | ------------------------- |
| WebP    | Default         | Wide support, good compression | Slightly larger than AVIF |
| AVIF    | Modern browsers | Best compression, HDR support  | No Safari < 16            |
| JPEG XL | Future-proof    | Lossless transcode from JPEG   | Limited browser support   |
| MozJPEG | Legacy fallback | Maximum JPEG compatibility     | Larger files              |

Recommended: **WebP** as primary, fallback to MozJPEG for older browsers. Squoosh exposes all codecs above, so keep the full-size in WebP/AVIF and thumbnails in WebP for widest support.

### 5. P2P Sync Strategy

```typescript
// Images synced as binary patches via Automerge
interface ImageDocument {
  id: string;
  blob: Uint8Array; // Compressed binary
  mimeType: string;
  width: number;
  height: number;
}

// Chunked transfer for large images via WebRTC
const CHUNK_SIZE = 16384; // 16KB chunks

async function syncImage(peer: RTCPeerConnection, image: ImageDocument) {
  const channel = peer.createDataChannel(`image-${image.id}`);

  for (let offset = 0; offset < image.blob.length; offset += CHUNK_SIZE) {
    channel.send(image.blob.slice(offset, offset + CHUNK_SIZE));
  }
}
```

## Performance Targets

| Metric            | Target                |
| ----------------- | --------------------- |
| Upload processing | < 500ms for 1MB image |
| Compressed size   | < 50KB per image      |
| IndexedDB storage | < 500MB total         |
| P2P sync time     | < 2s per image        |

## Dependencies to Add

```bash
bun add fflate
bun add @aspect-build/squoosh
bun add -d unplugin-imagemin
```

## Already Installed (Vendor)

These packages are available via workspace paths:

```typescript
// Image cropping
import Cropper from "vendor/react-easy-crop";
import "vendor/react-easy-crop/dist/react-easy-crop.css";

// Image gallery
import Gallery from "vendor/react-grid-gallery";

// Image loading with fallbacks
import Img from "vendor/react-image";

// Icons
import { Star, Heart, Check } from "vendor/phosphor-icons-react";

// Emoji picker
import Picker from "vendor/emoji-mart/packages/emoji-mart-react";
import data from "vendor/emoji-mart/packages/emoji-mart";

// Loading skeletons
import ContentLoader from "vendor/react-content-loader";
```

## Future Enhancements

1. **Progressive Loading**: Low-res placeholder → full res
2. **Lazy Loading**: Intersection Observer for viewport images
3. **Cache Strategy**: Service Worker for offline access
4. **Batch Processing**: Queue multiple uploads efficiently
5. **Drag & Drop Files**: Direct file drop onto tier items

## ZIP Import/Export

### Import Images from ZIP

```typescript
import { unzip } from "fflate";

const SUPPORTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

async function importImagesFromZip(zipFile: File): Promise<ProcessedImage[]> {
  const buffer = await zipFile.arrayBuffer();

  return new Promise((resolve, reject) => {
    unzip(new Uint8Array(buffer), async (err, files) => {
      if (err) return reject(err);

      const images: ProcessedImage[] = [];

      for (const [filename, data] of Object.entries(files)) {
        // Skip directories
        if (filename.endsWith("/")) continue;

        // Detect MIME type from extension
        const ext = filename.split(".").pop()?.toLowerCase();
        const mimeMap: Record<string, string> = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          webp: "image/webp",
          gif: "image/gif",
        };

        const mimeType = mimeMap[ext || ""];
        if (!mimeType) continue;

        // Convert to File for processing
        const file = new File([data], filename, { type: mimeType });
        const processed = await processUpload(file);

        images.push({
          filename,
          blob: processed,
          mimeType: "image/webp",
        });
      }

      resolve(images);
    });
  });
}
```

### Export Tier List as ZIP

```typescript
import { zipSync, strToU8 } from "fflate";

interface ExportOptions {
  includeImages: boolean;
  format: "json" | "json-pretty";
}

async function exportTierListAsZip(
  board: BoardDocument,
  images: Map<string, Blob>,
  options: ExportOptions,
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};

  // Add board JSON
  const jsonStr =
    options.format === "json-pretty" ? JSON.stringify(board, null, 2) : JSON.stringify(board);
  files["board.json"] = strToU8(jsonStr);

  // Add images if requested
  if (options.includeImages) {
    for (const [id, blob] of images) {
      const buffer = await blob.arrayBuffer();
      files[`images/${id}.webp`] = new Uint8Array(buffer);
    }
  }

  // Create ZIP
  const zipped = zipSync(files, { level: 6 });

  return new Blob([zipped], { type: "application/zip" });
}
```

### Async ZIP Processing with Workers

```typescript
import { AsyncUnzip, AsyncZip } from "fflate";

// For large ZIP files, use async API with Web Workers
async function importLargeZip(zipFile: File): Promise<ProcessedImages[]> {
  const buffer = await zipFile.arrayBuffer();
  const images: ProcessedImage[] = [];

  return new Promise((resolve, reject) => {
    const unzipper = new AsyncUnzip((err, data, isFinal) => {
      if (err) return reject(err);

      if (data) {
        // Process each file as it's extracted
        const [filename, fileData] = data;
        // ... process file
      }

      if (isFinal) {
        resolve(images);
      }
    });

    unzipper.push(new Uint8Array(buffer));
  });
}
```

## Additional Vendor Packages

### @phosphor-icons/react

Comprehensive icon library with 10,000+ icons in multiple weights.

```tsx
import { Star, Heart, Check, X } from "@phosphor-icons/react";

function IconExample() {
  return (
    <>
      {/* Default size (24x24) */}
      <Star weight="fill" color="gold" />

      {/* Custom size */}
      <Heart size={32} weight="duotone" />

      {/* All weights available */}
      <Check weight="thin" />
      <Check weight="light" />
      <Check weight="regular" />
      <Check weight="bold" />
      <Check weight="fill" />
      <Check weight="duotone" />

      {/* With className for styling */}
      <X size={20} className="hover:rotate-90 transition-transform" />
    </>
  );
}
```

**Features:**

- 10,000+ icons across 6 weights (thin, light, regular, bold, fill, duotone)
- Tree-shakeable imports
- Customizable size, weight, and color
- CSS transitions and animations support
- SVG-based for crisp rendering at any size

**Common Icons for Tier Lists:**

```tsx
import {
  Star,
  Heart,
  Check,
  X,
  Plus,
  Minus,
  Trash,
  Edit,
  Image,
  Upload,
  Download,
  Share,
  ChevronUp,
  ChevronDown,
  GripVertical,
} from "@phosphor-icons/react";
```

### emoji-mart

Emoji picker with search, categories, and skin tone support.

```tsx
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

function EmojiPickerModal({ onSelect, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <Picker
        data={data}
        onEmojiSelect={(emoji) => {
          onSelect(emoji.native);
          onClose();
        }}
        theme="dark"
        set="native"
        dynamicWidth={true}
        maxFrequentRows={4}
        previewPosition="none"
        skinTonePosition="search"
      />
    </div>
  );
}
```

**Features:**

- Searchable emoji database
- Category navigation
- Skin tone picker
- Frequently used emojis
- Custom emoji support
- Multiple emoji sets (native, twitter, facebook, etc.)
- Theme support (light/dark/auto)

**Usage with Tier Items:**

```tsx
function TierItemBadge({ emoji }) {
  return (
    <div className="tier-badge">
      <span className="emoji">{emoji}</span>
    </div>
  );
}
```

### react-content-loader

SVG-powered skeleton loading placeholders.

```tsx
import ContentLoader from "react-content-loader";

function TierListSkeleton() {
  return (
    <ContentLoader
      speed={2}
      width={400}
      height={160}
      viewBox="0 0 400 160"
      backgroundColor="#f3f3f3"
      foregroundColor="#ecebeb"
    >
      {/* Tier row */}
      <rect x="10" y="10" rx="4" ry="4" width="60" height="40" />
      <rect x="80" y="10" rx="4" ry="4" width="40" height="40" />
      <rect x="130" y="10" rx="4" ry="4" width="40" height="40" />
      <rect x="180" y="10" rx="4" ry="4" width="40" height="40" />

      {/* Second row */}
      <rect x="10" y="60" rx="4" ry="4" width="60" height="40" />
      <rect x="80" y="60" rx="4" ry="4" width="40" height="40" />
      <rect x="130" y="60" rx="4" ry="4" width="40" height="40" />

      {/* Loading text */}
      <rect x="10" y="120" rx="4" ry="4" width="200" height="20" />
    </ContentLoader>
  );
}
```

**Features:**

- SVG-based for smooth animations
- Customizable shapes and sizes
- Multiple preset loaders available
- RTL support
- Responsive containers
- Low CPU usage

**Presets for Common Patterns:**

```tsx
import ContentLoader, {
  Facebook, Instagram, Code,
  List, BulletList, Grid
} from 'react-content-loader';

// Use preset directly
<Facebook />
<Instagram />
<Grid />
```

**Loading State Pattern:**

```tsx
function TierList({ items, isLoading }) {
  if (isLoading) {
    return <TierListSkeleton />;
  }

  return (
    <div className="tier-list">
      {items.map((item) => (
        <TierItem key={item.id} {...item} />
      ))}
    </div>
  );
}
```
