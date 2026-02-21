import React, { useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { BoardDocument } from "../../lib/documents";
import { TierItem } from "./TierItem";

interface ItemGalleryProps {
  board: BoardDocument;
  itemImages?: Map<string, string>;
  onItemMove?: (itemId: string, fromTierId: string, toTierId: string) => void;
  onItemDrop?: (itemId: string) => void;
}

export function ItemGallery({ board, itemImages, onItemMove, onItemDrop }: ItemGalleryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

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
      className={`p-4 rounded-xl transition-colors duration-150 mt-4 ${isOver ? "bg-black/5" : "bg-gray-100"}`}
    >
      <h3 className="text-base font-semibold mb-3 text-gray-500">
        Unplaced Items ({unplacedItems.length})
      </h3>
      <div className="flex flex-wrap gap-2">
        {unplacedItems.map((item) => (
          <TierItem
            key={item.id}
            item={item}
            tier={board.tiers[0]}
            tierItems={unplacedItems}
            imageUrl={itemImages?.get(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
