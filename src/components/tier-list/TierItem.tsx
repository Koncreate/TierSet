import React, { useCallback, useRef } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { Button } from "react-aria-components";
import type { BoardItem, Tier } from "../../lib/documents";
import { uiActions } from "../../stores";

interface TierItemProps {
  item: BoardItem;
  tier: Tier;
  tierItems: BoardItem[];
  imageUrl?: string;
  onClick?: (itemId: string) => void;
}

const DRAG_COOLDOWN_MS = 300;

export function TierItem({ item, tier, tierItems, imageUrl, onClick }: TierItemProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const lastDragTimeRef = useRef<number>(0);

  React.useEffect(() => {
    const element = buttonRef.current;
    if (!element) return;

    return draggable({
      element,
      getInitialData: () => ({
        itemId: item.id,
        sourceTierId: tier.id,
        type: "tier-item",
      }),
      onDragStart: () => {
        element.setAttribute("data-is-dragging", "true");
        lastDragTimeRef.current = Date.now();

        setCustomNativeDragPreview({
          getOffset: () => ({ x: 16, y: 16 }),
          nativeSetDragImage: null,
          render: ({ container }) => {
            const preview = document.createElement("div");
            preview.style.cssText = `
              padding: 8px 12px;
              background: ${tier.color};
              color: white;
              border-radius: 4px;
              font-size: 14px;
              font-weight: 500;
            `;
            preview.textContent = item.name;
            container.append(preview);
            return () => preview.remove();
          },
        });
      },
      onDrop: () => {
        element.removeAttribute("data-is-dragging");
      },
    });
  }, [item.id, tier.id, tier.color, item.name]);

  const handleClick = useCallback(() => {
    onClick?.(item.id);
  }, [onClick, item.id]);

  const handleDoubleClick = useCallback(() => {
    const timeSinceLastDrag = Date.now() - lastDragTimeRef.current;
    if (timeSinceLastDrag < DRAG_COOLDOWN_MS) {
      return;
    }
    uiActions.openTierLightbox(tier.id, tierItems, item.id);
  }, [tier.id, tierItems, item.id]);

  return (
    <Button
      ref={buttonRef}
      onPress={handleClick}
      onDoubleClick={handleDoubleClick}
      className="tier-item flex items-center gap-2 px-3 py-2 bg-white rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.12)] cursor-grab select-none min-w-[120px] max-w-[200px] border-none text-left"
      data-item-id={item.id}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="w-8 h-8 rounded object-cover"
          draggable={false}
        />
      ) : item.emoji ? (
        <span className="text-2xl leading-none">
          {item.emoji}
        </span>
      ) : (
        <div
          className="w-8 h-8 rounded"
          style={{ background: tier.color }}
        />
      )}
      <span className="text-sm font-medium text-[#1d1d1d] overflow-hidden text-ellipsis whitespace-nowrap">
        {item.name}
      </span>
    </Button>
  );
}
