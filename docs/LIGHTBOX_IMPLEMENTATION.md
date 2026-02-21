# TierList & Bracket Lightbox Implementation Plan

## Overview

Implement double-click lightbox functionality for tierlist items and bracket match details using TanStack Store for state management.

---

## 1. Lightbox Behavior

### TierList Items
- **Trigger**: Double-click on any tier item
- **Scope**: Shows only items from the clicked tier
- **Peeking View**: 
  - Current item centered
  - Left/right adjacent items partially visible at edges (50vw width, dimmed)
  - Dotted/dimmed overlay on non-focused items
- **Navigation**: Arrow buttons on left/right edges
- **Edge Case**: Single item in tier = centered, no arrows

### Bracket Match Details
- **Trigger**: Double-click on bracket participant
- **Scope**: Shows participants from the same match (2 items max)
- **Peeking View**: Same pattern - current participant centered, other visible at edge
- **Navigation**: Arrow buttons (only shows if both participants exist)

---

## 2. Image Editing Modal

Open via "Edit Photo" button in lightbox.

### Features:
- **Crop**: Aspect ratio presets (free, 1:1, 16:9, 4:3)
- **Rotate**: 90° increments + fine rotation slider
- **Flip**: Horizontal and vertical flip
- **Color Adjustment**:
  - Brightness slider (-100 to +100)
  - Contrast slider (-100 to +100)
  - Saturation slider (-100 to +100)
- **Curves**: RGB curves editor (basic)
- **Actions**: Save, Cancel, Reset

---

## 3. TanStack Store Structure

### New State in `appStore.ts`

```typescript
export interface UIState {
  lightbox: {
    isOpen: boolean;
    mode: 'tier' | 'bracket' | null;
    // For tier mode
    tierId: string | null;
    items: BoardItem[];
    currentIndex: number;
    // For bracket mode
    matchId: string | null;
    participants: BracketParticipant[];
  };
  imageEditor: {
    isOpen: boolean;
    itemId: string | null;
    originalImageUrl: string | null;
  };
}
```

### Actions in `appStore.actions.ts`

```typescript
// Lightbox actions
openTierLightbox(tierId: string, items: BoardItem[], itemId: string)
openBracketLightbox(matchId: string, participants: BracketParticipant[], participantId: string)
closeLightbox()

// Image editor actions
openImageEditor(itemId: string, imageUrl: string)
closeImageEditor()
saveImageEdits(itemId: string, edits: ImageEdits)
```

---

## 4. Components

| Component | File | Purpose |
|----------|------|---------|
| `ItemLightbox` | `src/components/tier-list/ItemLightbox.tsx` | Peeking carousel for tier items |
| `MatchDetailsLightbox` | `src/components/bracket/MatchDetailsLightbox.tsx` | Peeking carousel for bracket |
| `ImageEditorModal` | `src/components/ui/ImageEditorModal.tsx` | Crop, rotate, flip, curves |

---

## 5. Implementation Files

### New Files
- `src/stores/appStore.ts` - Add UI state
- `src/stores/appStore.actions.ts` - Add lightbox/editor actions  
- `src/components/tier-list/ItemLightbox.tsx` - Redesign for peeking
- `src/components/bracket/MatchDetailsLightbox.tsx` - Peeking for bracket
- `src/components/ui/ImageEditorModal.tsx` - Full image editing

### Modified Files
- `src/components/tier-list/TierItem.tsx` - Use store for double-click
- `src/components/tier-list/TierRow.tsx` - Remove onItemDoubleClick
- `src/components/tier-list/TierList.tsx` - Remove onItemDoubleClick
- `src/components/bracket/BracketMatch.tsx` - Use store for double-click
- `src/components/board/BoardView.tsx` - Subscribe to store for lightbox

---

## 6. Architecture

```
User double-clicks item
        │
        ▼
TierItem/BracketMatch dispatches action
        │
        ▼
TanStack Store updates UI state
        │
        ▼
BoardView subscribes, renders appropriate lightbox
        │
        ├──► ItemLightbox (tier mode)
        │         │
        │         ▼
        │    Click "Edit Photo"
        │         │
        │         ▼
        │    ImageEditorModal
        │
        └──► MatchDetailsLightbox (bracket mode)
```

---

## 7. Image Editor Technical Details

### Using Existing Libraries
- `react-easy-crop` (already in vendor/) - for crop functionality
- `fflate` (in dependencies) - for image compression if needed

### State Structure
```typescript
interface ImageEdits {
  crop: { x: number; y: number };
  cropAspectRatio: number | null;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
}
```

---

## 8. Acceptance Criteria

- [ ] Double-click tier item opens lightbox showing only that tier's items
- [ ] Adjacent items peek at edges with dimmed overlay
- [ ] Arrow navigation works (hidden for single item)
- [ ] Double-click bracket participant opens lightbox with match participants
- [ ] "Edit Photo" button opens full image editor
- [ ] Crop, rotate, flip, brightness/contrast/saturation work
- [ ] Curves editor functional
- [ ] Save applies edits to image
- [ ] Build passes
