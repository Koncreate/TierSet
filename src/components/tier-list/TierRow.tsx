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
      className="tier-row"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "16px",
        padding: "12px 16px",
        background: isOver ? "rgba(0,0,0,0.05)" : "transparent",
        borderRadius: "8px",
        transition: "background 0.15s ease",
        minHeight: "64px",
      }}
      data-tier-id={tier.id}
    >
      {/* Tier label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "48px",
          height: "48px",
          borderRadius: "8px",
          background: tier.color,
          color: "white",
          fontSize: "20px",
          fontWeight: "bold",
          flexShrink: 0,
        }}
      >
        {tier.label}
      </div>

      {/* Tier name */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          minWidth: "80px",
          fontSize: "14px",
          fontWeight: 500,
          color: "#666",
        }}
      >
        {tier.name}
      </div>

      {/* Items in this tier */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          flex: 1,
          padding: "8px",
          borderRadius: "6px",
          background: "rgba(0,0,0,0.03)",
          minHeight: "48px",
        }}
      >
        {items.map((item) => (
          <TierItem key={item.id} item={item} tier={tier} imageUrl={itemImages?.get(item.id)} />
        ))}
      </div>
    </div>
  );
}
