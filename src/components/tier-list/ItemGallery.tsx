import React, { useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { BoardItem, BoardDocument } from "../../lib/documents";
import { TierItem } from "./TierItem";

interface ItemGalleryProps {
  board: BoardDocument;
  itemImages?: Map<string, string>;
  onItemMove?: (itemId: string, fromTierId: string, toTierId: string) => void;
  onItemDrop?: (itemId: string) => void;
}

/**
 * Gallery of unplaced items (items not in any tier)
 */
export function ItemGallery({ board, itemImages, onItemMove, onItemDrop }: ItemGalleryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  // Find items not in any tier
  const unplacedItems = React.useMemo(() => {
    const itemsInTiers = new Set<string>(board.tiers.flatMap((tier) => tier.itemIds));

    return board.items.filter((item) => !itemsInTiers.has(item.id));
  }, [board]);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    return dropTargetForElements({
      element,
      getData: () => ({ type: "gallery", tierId: "unplaced" }),
      canDrop: ({ source }) => {
        return source.data.type === "tier-item";
      },
      onDragEnter: () => {
        setIsOver(true);
      },
      onDragLeave: () => {
        setIsOver(false);
      },
      onDrop: ({ source }) => {
        setIsOver(false);
        const itemId = source.data.itemId as string;
        const fromTierId = source.data.sourceTierId as string;
        onItemDrop?.(itemId);
        onItemMove?.(itemId, fromTierId, "unplaced");
      },
    });
  }, [onItemMove, onItemDrop]);

  if (unplacedItems.length === 0) {
    return null;
  }

  return (
    <div
      ref={ref}
      className="item-gallery"
      style={{
        padding: "16px",
        background: isOver ? "rgba(0,0,0,0.05)" : "#f5f5f5",
        borderRadius: "12px",
        transition: "background 0.15s ease",
        marginTop: "16px",
      }}
    >
      <h3
        style={{
          fontSize: "16px",
          fontWeight: 600,
          marginBottom: "12px",
          color: "#666",
        }}
      >
        Unplaced Items ({unplacedItems.length})
      </h3>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        {unplacedItems.map((item) => (
          <TierItem
            key={item.id}
            item={item}
            tier={board.tiers[0]} // Use first tier for styling
          />
        ))}
      </div>
    </div>
  );
}
