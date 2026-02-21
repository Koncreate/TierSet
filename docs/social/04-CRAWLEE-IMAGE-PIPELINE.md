# Plan 4: Crawlee Image Scraping Pipeline (Convex Actions → Convex Storage → SPA)

> Server-side wiki/web image scraping using Crawlee inside Convex actions. Scrape → compress → upload to Convex storage → return signed URLs to the TanStack Start SPA for use as tier list items.

---

## Why Server-Side Instead of Client-Side

The existing `docs/app/wiki-scraping-search.md` uses MediaWiki APIs directly from the browser. This works for Wikipedia/Fandom but has limits:

| Concern | Client-Side (Current) | Server-Side (Crawlee + Convex) |
|---------|----------------------|-------------------------------|
| Wiki API support | Only MediaWiki API sites | Any website — HTML scraping |
| CORS restrictions | Blocked on many sites | No CORS — server makes requests |
| Image compression | Client CPU/memory bound | Server-side sharp (WebP/AVIF) |
| Image storage | IndexedDB (per-device) | Convex storage (cloud, shared) |
| Rate limiting | Can't control | Built-in retry with backoff |
| JS-rendered pages | Can't handle | PlaywrightCrawler fallback |
| Deduplication | Manual | Crawlee RequestQueue auto-dedup |
| Retry on failure | Manual | Built-in retry with backoff |

**Client-side scraping stays for offline/P2P mode.** Server pipeline is for authenticated users who want cloud-stored, shareable images.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│  TanStack Start SPA (app.tierset.com)                             │
│                                                                   │
│  User pastes URL → calls Convex action → gets signed image URLs   │
│  → selects images → adds to tier list items (Automerge doc)       │
└───────────────┬───────────────────────────────────────────────────┘
                │ convex.mutation(api.images.scrape, { url, maxImages })
                ▼
┌───────────────────────────────────────────────────────────────────┐
│  Convex Actions — image scraping pipeline                         │
│                                                                   │
│  1. CheerioCrawler: GET page HTML → extract <img> URLs            │
│  2. FileDownload: fetch binary images concurrently                │
│  3. sharp: compress to WebP (quality 80, max 400px width)         │
│  4. Upload compressed buffer to Convex storage                    │
│  5. Return array of { title, storageId, signedUrl, dimensions }   │
│                                                                   │
│  Rate limit: respect source sites, exponential backoff on failure │
└───────────────┬───────────────────────────────────────────────────┘
                │ Convex mutations + queries
                ▼
┌───────────────────────────────────────────────────────────────────┐
│  Convex — scrapedImages table                                     │
│                                                                   │
│  storageId: Id<"_storage">     ← binary in Convex S3              │
│  sourceUrl: string             ← original image URL               │
│  sourcePageUrl: string         ← wiki page it came from           │
│  uploadedBy: Id<"users">                                          │
│  width / height / sizeBytes                                       │
│  mimeType: "image/webp"                                           │
│                                                                   │
│  getUrl(storageId) → signed URL for SPA to display                │
└───────────────────────────────────────────────────────────────────┘
```

---

## Convex Action: Image Scraping Pipeline

```
convex/
├── images/
│   ├── scrape.ts            ← main action endpoint
│   ├── extractors.ts        ← site-specific image extraction logic
│   ├── compressor.ts        ← sharp compression pipeline
│   └── uploader.ts          ← Convex storage upload
```

### Main Scrape Action

```typescript
// convex/images/scrape.ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import { CheerioCrawler, FileDownload } from "crawlee";
import { compressImage } from "./compressor";
import { getUser } from "../auth";

interface ScrapeRequest {
  url: string;
  maxImages?: number;      // default 50
  maxWidth?: number;       // default 400px
  quality?: number;        // default 80 (WebP quality)
}

interface ScrapedImage {
  title: string;
  sourceUrl: string;
  storageId: string;
  signedUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

interface ScrapeResponse {
  images: ScrapedImage[];
  sourcePageUrl: string;
  scrapedAt: number;
}

// Authenticated action — requires Clerk JWT
export const scrape = action({
  args: {
    url: v.string(),
    maxImages: v.optional(v.number()),
    maxWidth: v.optional(v.number()),
    quality: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ScrapeResponse> => {
    const maxImages = args.maxImages ?? 50;
    const maxWidth = args.maxWidth ?? 400;
    const quality = args.quality ?? 80;

    // Phase 1: Extract image URLs from the page
    const imageUrls = await extractImageUrls(args.url, maxImages);

    // Phase 2: Download, compress, upload
    const images = await downloadAndProcess(imageUrls, {
      sourcePageUrl: args.url,
      maxWidth,
      quality,
    });

    return {
      images,
      sourcePageUrl: args.url,
      scrapedAt: Date.now(),
    };
  },
});

// ─── Phase 1: CheerioCrawler extracts image URLs ───
async function extractImageUrls(pageUrl: string, maxImages: number): Promise<string[]> {
  const config = new Configuration({
    persistStorage: false,
    purgeOnStart: true,
  });

  const imageUrls: string[] = [];

  const crawler = new CheerioCrawler({
    async requestHandler({ $, request }) {
      // Generic img extraction
      $("img").each((_, el) => {
        const src = $(el).attr("src") ?? $(el).attr("data-src");
        if (!src) return;

        // Filter out icons, tracking pixels, SVGs
        if (src.match(/\.(svg|ico|gif)$/i)) return;
        if (src.includes("tracking") || src.includes("pixel")) return;
        if (src.includes("1x1")) return;

        const resolved = new URL(src, request.loadedUrl).href;

        // Fandom: strip /revision/ thumbnail params to get full-size
        const cleaned = resolved.replace(/\/revision\/.*$/, "");

        if (!imageUrls.includes(cleaned)) {
          imageUrls.push(cleaned);
        }
      });

      // Fandom-specific: gallery images
      $(".wikia-gallery-item img, .image img, figure img").each((_, el) => {
        const src = $(el).attr("src") ?? $(el).attr("data-src");
        if (src) {
          const resolved = new URL(src, request.loadedUrl).href;
          const cleaned = resolved.replace(/\/revision\/.*$/, "");
          if (!imageUrls.includes(cleaned)) {
            imageUrls.push(cleaned);
          }
        }
      });
    },
    maxRequestsPerCrawl: 1,   // only scrape the one page
    maxConcurrency: 1,
  }, config);

  await crawler.run([pageUrl]);

  return imageUrls.slice(0, maxImages);
}

// ─── Phase 2: FileDownload fetches binary, compresses, uploads ───
async function downloadAndProcess(
  imageUrls: string[],
  opts: { sourcePageUrl: string; maxWidth: number; quality: number },
): Promise<ScrapedImage[]> {
  const config = new Configuration({
    persistStorage: false,
    purgeOnStart: true,
  });

  const results: ScrapedImage[] = [];

  const downloader = new FileDownload({
    async requestHandler({ body, request, contentType }) {
      const buffer = body as Buffer;

      // Skip tiny images (likely icons/decorative)
      if (buffer.length < 2048) return;

      // Compress with sharp
      const { data, info } = await compressImage(buffer, {
        maxWidth: opts.maxWidth,
        quality: opts.quality,
      });

      // Upload to Convex storage
      const { storageId, signedUrl } = await uploadToConvex(data, {
        sourceUrl: request.url,
        sourcePageUrl: opts.sourcePageUrl,
        mimeType: "image/webp",
        width: info.width,
        height: info.height,
        sizeBytes: data.length,
      });

      // Derive title from URL
      const title = deriveTitle(request.url);

      results.push({
        title,
        sourceUrl: request.url,
        storageId,
        signedUrl,
        width: info.width,
        height: info.height,
        sizeBytes: data.length,
      });
    },
    maxConcurrency: 20,
    maxRequestsPerCrawl: imageUrls.length,
    autoscaledPoolOptions: {
      maxTasksPerMinute: 60, // respect source site rate limits
    },
  }, config);

  await downloader.run(imageUrls);

  return results;
}

function deriveTitle(imageUrl: string): string {
  const filename = imageUrl.split("/").pop() ?? "";
  return decodeURIComponent(filename)
    .replace(/\.\w+$/, "")           // strip extension
    .replace(/[_-]/g, " ")           // underscores/dashes to spaces
    .replace(/\d{2,}x\d{2,}/, "")   // strip dimension strings like "300x400"
    .trim();
}
```

### Image Compressor

```typescript
// convex/images/compressor.ts
import sharp from "sharp";

interface CompressOptions {
  maxWidth: number;
  quality: number;
}

interface CompressResult {
  data: Buffer;
  info: { width: number; height: number };
}

export async function compressImage(
  input: Buffer,
  opts: CompressOptions,
): Promise<CompressResult> {
  const image = sharp(input);
  const metadata = await image.metadata();

  // Only resize if wider than maxWidth
  const pipeline = metadata.width && metadata.width > opts.maxWidth
    ? image.resize({ width: opts.maxWidth, withoutEnlargement: true })
    : image;

  const { data, info } = await pipeline
    .webp({ quality: opts.quality })
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    info: { width: info.width, height: info.height },
  };
}
```

### Convex Uploader

```typescript
// convex/images/uploader.ts
import { internal } from "../_generated/api";

interface UploadMeta {
  sourceUrl: string;
  sourcePageUrl: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export async function uploadToConvex(
  ctx: ActionCtx,
  imageBuffer: Buffer,
  meta: UploadMeta,
): Promise<{ storageId: string; signedUrl: string }> {
  // Step 1: Generate upload URL from Convex
  const uploadUrl = await ctx.runMutation(internal.photos.generateUploadUrl, {});

  // Step 2: PUT binary directly to Convex storage
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": meta.mimeType },
    body: imageBuffer,
  });
  const { storageId } = await uploadRes.json();

  // Step 3: Save metadata record
  await fetch(`${convexUrl()}/api/mutation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Convex ${convexAdminKey()}`,
    },
    body: JSON.stringify({
      path: "scrapedImages:save",
      args: {
        storageId,
        sourceUrl: meta.sourceUrl,
        sourcePageUrl: meta.sourcePageUrl,
        mimeType: meta.mimeType,
        width: meta.width,
        height: meta.height,
        sizeBytes: meta.sizeBytes,
      },
    }),
  });

  // Step 4: Get signed URL for the SPA
  const urlRes = await fetch(`${convexUrl()}/api/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Convex ${convexAdminKey()}`,
    },
    body: JSON.stringify({
      path: "photos:getUrl",
      args: { storageId },
    }),
  });
  const signedUrl = await urlRes.json();

  return { storageId, signedUrl };
}
```

---

## Convex Schema Addition

Add to `convex/schema.ts`:

```typescript
// ─── Scraped images (server-side pipeline results) ───
scrapedImages: defineTable({
  storageId: v.id("_storage"),
  sourceUrl: v.string(),           // original image URL
  sourcePageUrl: v.string(),       // wiki page it came from
  uploadedBy: v.optional(v.id("users")),
  mimeType: v.string(),
  width: v.number(),
  height: v.number(),
  sizeBytes: v.number(),
  createdAt: v.number(),
})
  .index("by_source_url", ["sourceUrl"])      // dedup by source
  .index("by_source_page", ["sourcePageUrl"]) // all images from one page
  .index("by_user", ["uploadedBy"]),
```

---

## SPA Integration

### Scrape Hook

```typescript
// apps/app/src/hooks/useScrapeImages.ts
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

interface ScrapeResult {
  images: Array<{
    title: string;
    sourceUrl: string;
    storageId: string;
    signedUrl: string;
    width: number;
    height: number;
    sizeBytes: number;
  }>;
  sourcePageUrl: string;
}

export function useScrapeImages() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrape = useMutation(api.images.scrape);

  const handleScrape = async (url: string, maxImages = 50) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await scrape({
        url,
        maxImages,
        maxWidth: 400,
        quality: 80,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scrape failed");
    } finally {
      setIsLoading(false);
    }
  };

  return { scrape: handleScrape, result, isLoading, error };
}
```

### UI Flow

```
User pastes URL (e.g., https://terraria.fandom.com/wiki/Bosses)
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  Loading state: "Scraping images from terraria.fandom…"  │
│  Progress: 12/34 images processed                        │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  Image picker grid (checkboxes, "Select All")            │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│  │☑ Eye │ │☑ King│ │☐ Icon│ │☑ Wall│ │☑ Moon│          │
│  │of Cth│ │Slime │ │      │ │Flesh │ │Lord  │          │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘          │
│                                                          │
│  [Cancel]                        [Add 4 Selected Items]  │
└─────────────────────────────────────────────────────────┘
    │
    ▼
Selected images added as tier list items with:
  - title from filename
  - signedUrl as the display image (cloud-hosted, shareable)
  - storageId saved in Automerge doc for persistence
```

### Adding Scraped Images to Automerge Doc

```typescript
// When user confirms selection from the image picker:
function addScrapedItemsToBoard(
  changeDoc: ChangeDocFn<BoardDocument>,
  selectedImages: ScrapedImage[],
) {
  changeDoc((doc) => {
    for (const img of selectedImages) {
      doc.items.push({
        id: nanoid(),
        name: img.title,
        imageUrl: img.signedUrl,         // cloud URL (shareable)
        imageStorageId: img.storageId,    // Convex ref for re-resolving
        metadata: {
          sourceUrl: img.sourceUrl,
          width: img.width,
          height: img.height,
        },
        createdAt: Date.now(),
        createdBy: "local",
      });
    }
  });
}
```

---

## Site-Specific Extractors

```typescript
// convex/images/extractors.ts

// Detect site type from URL and apply extraction strategy
export function getExtractor(url: string): "wiki-api" | "cheerio-generic" {
  const hostname = new URL(url).hostname;

  // MediaWiki sites: use API for better results
  if (
    hostname.includes("wikipedia.org") ||
    hostname.includes("fandom.com") ||
    hostname.includes(".wiki")
  ) {
    return "wiki-api";
  }

  // Everything else: generic HTML scraping
  return "cheerio-generic";
}

// MediaWiki API extraction (faster, more reliable for supported sites)
export async function extractViaWikiApi(pageUrl: string, maxImages: number): Promise<string[]> {
  const urlObj = new URL(pageUrl);
  const base = urlObj.origin;
  const title = pageUrl.match(/\/wiki\/([^#?]+)/)?.[1] ?? "";

  const params = new URLSearchParams({
    action: "query",
    titles: decodeURIComponent(title),
    prop: "images",
    imlimit: String(maxImages),
    format: "json",
    origin: "*",
  });

  const res = await fetch(`${base}/api.php?${params}`);
  const data = await res.json();
  const page = Object.values(data.query.pages)[0] as any;

  const imageTitles: string[] = page.images
    ?.map((i: any) => i.title)
    .filter((t: string) => !t.match(/\.(svg|ico|ogv|ogg)$/i)) ?? [];

  // Resolve titles to actual URLs
  const urls = await Promise.all(
    imageTitles.map(async (imageTitle) => {
      const infoParams = new URLSearchParams({
        action: "query",
        titles: imageTitle,
        prop: "imageinfo",
        iiprop: "url",
        iiurlwidth: "400",
        format: "json",
        origin: "*",
      });
      const infoRes = await fetch(`${base}/api.php?${infoParams}`);
      const infoData = await infoRes.json();
      const infoPage = Object.values(infoData.query.pages)[0] as any;
      return infoPage.imageinfo?.[0]?.thumburl ?? infoPage.imageinfo?.[0]?.url ?? null;
    }),
  );

  return urls.filter(Boolean) as string[];
}
```

---

## Rate Limiting & Abuse Prevention

```typescript
// In the scrape action — check user's plan + rate limits
import { getUser } from "../auth";

export const scrape = action({
  args: { /* ... */ },
  handler: async (ctx, args): Promise<ScrapeResponse> => {
    const user = await getUser(ctx);

    // Free users: 5 scrapes/day, max 20 images each
    // Pro users: 50 scrapes/day, max 100 images each
    const limits = user.plan === "pro"
      ? { maxPerDay: 50, maxImages: 100 }
      : { maxPerDay: 5, maxImages: 20 };

    // Check rate limit via Convex
    // ... (query rateLimits table)

    const maxImages = Math.min(args.maxImages ?? 50, limits.maxImages);

    // ... rest of scrape logic
  },
});
```

---

## Convex Package Dependencies

```json
// convex/package.json — add to dependencies
{
  "dependencies": {
    "convex": "^1.x",
    "crawlee": "^3.x",
    "sharp": "^0.33.x",
    "@clerk/backend": "^1.x",
    "@tierset/shared": "workspace:*"
  }
}
```

> **No Playwright needed.** CheerioCrawler + FileDownload handles all wiki/fandom sites. Only add `@crawlee/playwright-crawler` if you need JS-rendered pages later.

---

## Implementation Phases

### Phase 1: Basic Pipeline
- [ ] Add `images/` folder to `convex/`
- [ ] CheerioCrawler extracts image URLs from any page
- [ ] FileDownload fetches binary images
- [ ] sharp compresses to WebP
- [ ] Upload to Convex storage, return signed URLs
- [ ] Test with a Fandom wiki page

### Phase 2: Wiki API Fast Path
- [ ] Detect MediaWiki sites, use API instead of HTML scraping
- [ ] Better title extraction from MediaWiki image filenames
- [ ] Handle pagination for pages with 100+ images

### Phase 3: SPA Integration
- [ ] `useScrapeImages` hook in TanStack Start app
- [ ] Image picker modal with select/deselect
- [ ] Add selected images to Automerge board doc
- [ ] Show cloud-hosted images in tier list items

### Phase 4: Rate Limiting & Premium
- [ ] Rate limit table in Convex (per-user, per-day)
- [ ] Free tier: 5 scrapes/day, 20 images max
- [ ] Pro tier: 50 scrapes/day, 100 images max
- [ ] Dedup: skip re-scraping images already in Convex (by sourceUrl index)

### Phase 5: Workflow Integration
- [ ] Track scrape usage in analytics table
- [ ] Notify user when large scrape completes
