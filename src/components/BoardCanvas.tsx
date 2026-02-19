import { useEffect, useRef, useState } from "react";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { generateKeyBetween } from "fractional-indexing";

interface Item {
  id: string;
  type: "image" | "text" | "link";
  label: string;
  tierId: string | null;
  order: string;
  imageId?: string;
  url?: string;
}

interface Tier {
  id: string;
  label: string;
  color: string;
  order: string;
}

interface Doc {
  tiers: Record<string, Tier>;
  items: Record<string, Item>;
  change: (fn: (doc: Doc) => void) => void;
}

interface BoardCanvasProps {
  doc: Doc;
}

type DragData = {
  type: "item";
  item: Item;
};

type DropData = {
  type: "tier" | "pool";
  tierId?: string;
};

export function BoardCanvas({ doc }: BoardCanvasProps) {
  const [draggedItem, setDraggedItem] = useState<Item | null>(null);

  useEffect(() => {
    return monitorForElements({
      onDragStart({ source }) {
        const data = source.data as DragData;
        if (data.type === "item") {
          setDraggedItem(data.item);
        }
      },
      onDrop({ source, location }) {
        setDraggedItem(null);

        const data = source.data as DragData;
        if (data.type !== "item") return;

        const item = data.item;
        const dropTarget = location.current.dropTargets[0];
        if (!dropTarget) return;

        const dropData = dropTarget.data as DropData;

        if (dropData.type === "tier" && dropData.tierId) {
          const newTierId = dropData.tierId;
          const itemsInNewTier = Object.values(doc.items)
            .filter((i) => i.tierId === newTierId)
            .sort((a, b) => a.order.localeCompare(b.order));

          const newOrder = generateKeyBetween(
            itemsInNewTier[itemsInNewTier.length - 1]?.order,
            undefined,
          );

          doc.change((d) => {
            d.items[item.id].tierId = newTierId;
            d.items[item.id].order = newOrder;
          });
        } else if (dropData.type === "pool") {
          doc.change((d) => {
            d.items[item.id].tierId = null;
          });
        }
      },
    });
  }, [doc]);

  const tiers = Object.values(doc.tiers).sort((a, b) => a.order.localeCompare(b.order));
  const unassignedItems = Object.values(doc.items)
    .filter((item) => !item.tierId)
    .sort((a, b) => a.order.localeCompare(b.order));

  return (
    <div className="board-canvas">
      <div className="tiers-container">
        {tiers.map((tier) => (
          <TierRow
            key={tier.id}
            tier={tier}
            items={Object.values(doc.items).filter((item) => item.tierId === tier.id)}
            isDragging={draggedItem !== null}
          />
        ))}
      </div>

      <ItemPool items={unassignedItems} isDragging={draggedItem !== null} />

      {draggedItem && (
        <div
          className="drag-preview fixed pointer-events-none"
          style={{
            position: "fixed",
            left: "var(--drag-x, 0)",
            top: "var(--drag-y, 0)",
            zIndex: 1000,
          }}
        >
          <ItemCard item={draggedItem} isPreview />
        </div>
      )}
    </div>
  );
}

interface TierRowProps {
  tier: Tier;
  items: Item[];
  isDragging: boolean;
}

function TierRow({ tier, items, isDragging }: TierRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);
  const sortedItems = items.sort((a, b) => a.order.localeCompare(b.order));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    return dropTargetForElements({
      element: el,
      getData: (): DropData => ({ type: "tier", tierId: tier.id }),
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: () => setIsOver(false),
    });
  }, [tier.id]);

  return (
    <div
      ref={ref}
      className={`tier-row ${isOver ? "drag-over" : ""}`}
      style={{ borderLeftColor: tier.color }}
    >
      <div className="tier-header">
        <span className="tier-label">{tier.label}</span>
      </div>

      <div className="tier-items">
        {sortedItems.map((item, index) => (
          <SortableItemCard key={item.id} item={item} index={index} itemsInTier={sortedItems} />
        ))}
        {isDragging && sortedItems.length === 0 && (
          <div className="tier-empty-placeholder">Drop items here</div>
        )}
      </div>
    </div>
  );
}

interface ItemPoolProps {
  items: Item[];
  isDragging: boolean;
}

function ItemPool({ items, isDragging }: ItemPoolProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    return dropTargetForElements({
      element: el,
      getData: (): DropData => ({ type: "pool" }),
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: () => setIsOver(false),
    });
  }, []);

  return (
    <div ref={ref} className={`item-pool ${isOver ? "drag-over" : ""}`}>
      <h3>Available Items</h3>
      <div className="pool-items">
        {items.map((item) => (
          <DraggableItemCard key={item.id} item={item} />
        ))}
        {isDragging && items.length === 0 && (
          <div className="pool-empty-placeholder">Drop items here to unassign</div>
        )}
      </div>
    </div>
  );
}

interface DraggableItemCardProps {
  item: Item;
}

function DraggableItemCard({ item }: DraggableItemCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    return draggable({
      element: el,
      getInitialData: (): DragData => ({ type: "item", item }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [item]);

  return (
    <div ref={ref} className={`item-card ${isDragging ? "dragging" : ""}`}>
      <ItemCard item={item} />
    </div>
  );
}

interface SortableItemCardProps {
  item: Item;
  index: number;
  itemsInTier: Item[];
}

function SortableItemCard({ item, index, itemsInTier }: SortableItemCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    return combine(
      draggable({
        element: el,
        getInitialData: (): DragData => ({ type: "item", item }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element: el,
        getData: (): DropData => ({ type: "tier", tierId: item.tierId ?? undefined }),
        canDrop: ({ source }) => {
          const sourceData = source.data as DragData;
          return sourceData.type === "item" && sourceData.item.id !== item.id;
        },
        getIsSticky: () => true,
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          const sourceData = source.data as DragData;
          if (sourceData.type !== "item") return;

          const draggedItem = sourceData.item;
          if (draggedItem.id === item.id) return;

          const prevOrder = index > 0 ? itemsInTier[index - 1]?.order : undefined;
          const nextOrder = item.order;
          const newOrder = generateKeyBetween(prevOrder, nextOrder);

          const doc = (window as unknown as { __tierBoardDoc?: Doc }).__tierBoardDoc;
          if (doc) {
            doc.change((d) => {
              d.items[draggedItem.id].order = newOrder;
              if (item.tierId !== draggedItem.tierId) {
                d.items[draggedItem.id].tierId = item.tierId;
              }
            });
          }
        },
      }),
    );
  }, [item, index, itemsInTier]);

  return (
    <div
      ref={ref}
      className={`item-card ${isDragging ? "dragging" : ""} ${isOver ? "drop-target-over" : ""}`}
    >
      <ItemCard item={item} />
    </div>
  );
}

interface ItemCardProps {
  item: Item;
  isPreview?: boolean;
}

function ItemCard({ item, isPreview }: ItemCardProps) {
  return (
    <div className={`item-content ${isPreview ? "is-preview" : ""}`}>
      {item.type === "image" && item.imageId && (
        <img src={`/api/images/${item.imageId}`} alt={item.label} className="item-image" />
      )}
      <span className="item-label">{item.label}</span>
    </div>
  );
}
