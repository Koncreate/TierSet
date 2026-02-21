import type { BoardDocument, BoardItem, Tier } from "../../lib/documents";
import { TierRow } from "./TierRow";

interface TierListProps {
  board: BoardDocument;
  itemImages?: Map<string, string>;
  onItemMove?: (itemId: string, fromTierId: string, toTierId: string) => void;
}

export function TierList({ board, itemImages, onItemMove }: TierListProps) {
  const getItemsForTier = (tier: Tier): BoardItem[] => {
    return tier.itemIds
      .map((itemId) => board.items.find((item) => item.id === itemId))
      .filter((item): item is BoardItem => item !== undefined);
  };

  return (
    <div className="flex flex-col gap-2 p-4 bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
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
