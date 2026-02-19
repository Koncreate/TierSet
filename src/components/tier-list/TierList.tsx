import React from "react";
import type { BoardDocument, BoardItem, Tier } from "../../lib/documents";
import { TierRow } from "./TierRow";

interface TierListProps {
  board: BoardDocument;
  itemImages?: Map<string, string>;
  onItemMove?: (itemId: string, fromTierId: string, toTierId: string) => void;
}

export function TierList({ board, itemImages, onItemMove }: TierListProps) {
  // Get items for a specific tier
  const getItemsForTier = (tier: Tier): BoardItem[] => {
    return tier.itemIds
      .map((itemId) => board.items.find((item) => item.id === itemId))
      .filter((item): item is BoardItem => item !== undefined);
  };

  return (
    <div
      className="tier-list"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "16px",
        background: "white",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      {board.tiers.map((tier) => (
        <TierRow
          key={tier.id}
          tier={tier}
          items={getItemsForTier(tier)}
          itemImages={itemImages}
          onItemMove={onItemMove}
        />
      ))}
    </div>
  );
}
