import React, { useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { Tier, BoardItem } from "../../lib/documents";
import { TierItem } from "./TierItem";

interface TierRowProps {
  tier: Tier;
  items: BoardItem[];
  itemImages?: Map<string, string>;
  onItemMove?: (itemId: string, fromTierId: string, toTierId: string) => void;
  onItemDrop?: (itemId: string, tierId: string) => void;
}

export function TierRow({ tier, items, itemImages, onItemMove, onItemDrop }: TierRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    return combine(
      // Drop target for this tier row
      dropTargetForElements({
        element,
        getData: () => ({ tierId: tier.id, type: "tier-row" }),
        canDrop: ({ source }) => {
          return source.data.type === "tier-item";
        },
        getIsSticky: () => true,
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
          onItemDrop?.(itemId, tier.id);
          onItemMove?.(itemId, fromTierId, tier.id);
        },
      }),

      // Monitor for global drag state
      monitorForElements({
        onDragStart: ({ source }) => {
          if (source.data.type === "tier-item") {
            setIsOver(false);
          }
        },
      }),
    );
  }, [tier.id, onItemMove, onItemDrop]);

  return (
    <div
      ref={ref}
      className={`tier-row flex items-start gap-4 px-4 py-3 rounded-lg transition-colors duration-150 min-h-16 ${isOver ? "bg-black/5" : "bg-transparent"}`}
      data-tier-id={tier.id}
    >
      <div
        className="flex items-center justify-center w-12 h-12 rounded-lg text-white text-xl font-bold shrink-0"
        style={{ background: tier.color }}
      >
        {tier.label}
      </div>

      <div className="flex items-center min-w-20 text-sm font-medium text-[#666]">
        {tier.name}
      </div>

      <div className="flex flex-wrap gap-2 flex-1 p-2 rounded-md bg-black/[0.03] min-h-12">
        {items.map((item) => (
          <TierItem
            key={item.id}
            item={item}
            tier={tier}
            tierItems={items}
            imageUrl={itemImages?.get(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
