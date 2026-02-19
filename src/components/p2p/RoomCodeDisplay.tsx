import React, { useState } from "react";
import { Copy, Check } from "@phosphor-icons/react";

interface RoomCodeProps {
  code: string;
  onCopy?: () => void;
}

export function RoomCodeDisplay({ code, onCopy }: RoomCodeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy room code:", error);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        background: "#f5f5f5",
        borderRadius: "8px",
        border: "2px solid #e0e0e0",
      }}
    >
      <div
        style={{
          flex: 1,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            color: "#666",
            marginBottom: "4px",
          }}
        >
          Room Code
        </div>
        <div
          style={{
            fontSize: "24px",
            fontWeight: "bold",
            fontFamily: "monospace",
            letterSpacing: "4px",
            color: "#1d1d1d",
          }}
        >
          {code}
        </div>
      </div>

      <button
        onClick={handleCopy}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "40px",
          height: "40px",
          border: "none",
          borderRadius: "6px",
          background: copied ? "#4CAF50" : "#2196F3",
          color: "white",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
        title="Copy room code"
      >
        {copied ? <Check size={20} weight="fill" /> : <Copy size={20} />}
      </button>
    </div>
  );
}
