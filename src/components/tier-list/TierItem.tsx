import React from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import type { BoardItem, Tier } from "../../lib/documents";

interface TierItemProps {
  item: BoardItem;
  tier: Tier;
  imageUrl?: string;
  onClick?: (itemId: string) => void;
}

export function TierItem({ item, tier, imageUrl, onClick }: TierItemProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const element = ref.current;
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

        // Set custom drag preview
        setCustomNativeDragPreview({
          getOffset: () => ({ x: 16, y: 16 }),
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

  const handleClick = () => {
    onClick?.(item.id);
  };

  return (
    <div
      ref={ref}
      className="tier-item"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          handleClick();
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 12px",
        background: "white",
        borderRadius: "6px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        cursor: "grab",
        userSelect: "none",
        minWidth: "120px",
        maxWidth: "200px",
      }}
      data-item-id={item.id}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "4px",
            objectFit: "cover",
          }}
          draggable={false}
        />
      ) : item.emoji ? (
        <span
          style={{
            fontSize: "24px",
            lineHeight: 1,
          }}
        >
          {item.emoji}
        </span>
      ) : (
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "4px",
            background: tier.color,
          }}
        />
      )}
      <span
        style={{
          fontSize: "14px",
          fontWeight: 500,
          color: "#1d1d1d",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.name}
      </span>
    </div>
  );
}
