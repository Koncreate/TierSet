# Wiki Scraping & Text Search

## Overview

Import character images from Wikipedia and Fandom wikis via their open APIs, and add client-side text search with [Orama](https://github.com/oramasearch/orama).

---

## Wiki Image Scraping

Both Wikipedia and Fandom expose MediaWiki APIs with permissive CORS (`origin=*`), so no proxy is needed.

### URL Detection

```ts
type WikiImage = { title: string; url: string; selected: boolean };

function getWikiTitle(url: string): string {
  const match = url.match(/\/wiki\/([^#?]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function scrapeWikiCharacterImages(pageUrl: string): Promise<WikiImage[]> {
  const url = new URL(pageUrl);

  if (url.hostname.includes("wikipedia.org")) {
    return scrapeAndResolveWikipedia(pageUrl);
  } else if (url.hostname.includes("fandom.com") || url.hostname.includes("wiki")) {
    return scrapeAndResolveFandom(pageUrl);
  }

  throw new Error("Unsupported wiki type");
}
```

### Wikipedia API

```ts
async function scrapeWikipediaImages(pageUrl: string): Promise<string[]> {
  const title = getWikiTitle(pageUrl);
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "images|pageimages",
    imlimit: "50",
    piprop: "thumbnail",
    pithumbsize: "300",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`);
  const data = await res.json();
  const page = Object.values(data.query.pages)[0] as any;

  return (
    page.images
      ?.map((img: any) => img.title)
      .filter((t: string) => !t.match(/\.(svg|ico|ogv|ogg)/i)) ?? []
  );
}

async function resolveWikipediaImageUrl(imageTitle: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: imageTitle,
    prop: "imageinfo",
    iiprop: "url|dimensions",
    iiurlwidth: "300",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`);
  const data = await res.json();
  const page = Object.values(data.query.pages)[0] as any;
  return page.imageinfo?.[0]?.thumburl ?? null;
}
```

### Fandom API

```ts
async function scrapeFandomImages(pageUrl: string): Promise<string[]> {
  const urlObj = new URL(pageUrl);
  const base = urlObj.origin;
  const title = getWikiTitle(pageUrl);

  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "images",
    imlimit: "100",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`${base}/api.php?${params}`);
  const data = await res.json();
  const page = Object.values(data.query.pages)[0] as any;

  const titles: string[] =
    page.images?.map((i: any) => i.title).filter((t: string) => !t.match(/\.(svg|ico|ogv)/i)) ?? [];

  const urls = await Promise.all(titles.map((t) => resolveImageUrl(base, t)));
  return urls.filter(Boolean) as string[];
}

async function resolveImageUrl(base: string, imageTitle: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: imageTitle,
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: "300",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`${base}/api.php?${params}`);
  const data = await res.json();
  const page = Object.values(data.query.pages)[0] as any;
  return page.imageinfo?.[0]?.thumburl ?? null;
}
```

---

## UI Flow

```
User pastes URL
    │
Detect wiki type
    │
Fetch + show image grid (checkboxes, "select all")
    │
User picks which characters to import
    │
Compress → store in IndexedDB → appear in tier slots
```

The image picker step is important — wiki character list pages often have decorative images mixed in with actual character portraits. Let the user deselect junk before importing.

---

## Text Search with Orama

[Orama](https://github.com/oramasearch/orama) is a fully client-side, TypeScript-native search engine. It runs in the browser with no server component, fitting the offline-first IndexedDB architecture.

### Why Orama

- Zero backend — runs entirely in-browser
- TypeScript-first with strong typing
- Supports full-text search, filters, facets, and typo tolerance
- Tiny bundle (~5 KB gzipped core)
- Can index Dexie/IndexedDB data directly

### Planned Usage

Search across tier lists, tier names, and character/item labels. Index structure:

```ts
import { create, insert, search } from "@orama/orama";

const db = await create({
  schema: {
    tierListName: "string",
    tierName: "string",
    itemLabel: "string",
  },
});

// On tier list load, index items
await insert(db, {
  tierListName: "Fire Emblem Characters",
  tierName: "S Tier",
  itemLabel: "Edelgard",
});

// Search
const results = await search(db, { term: "edel" });
```

### Integration Points

1. **Rebuild index** when a tier list is opened or modified
2. **Search bar** in the tier list editor for quick item lookup
3. **Global search** across all saved tier lists on the dashboard
