import React from "react";
import type { ConnectionStatus } from "../../lib/p2p";
import { WifiHigh, WifiLow, WifiNone, Users, ArrowsClockwise } from "@phosphor-icons/react";

interface ConnectionStatusProps {
  status: ConnectionStatus;
  peerCount?: number;
  syncStatus?: "syncing" | "synced" | "error" | "disconnected";
  connectedPeers?: number;
}

export function ConnectionStatusIndicator({
  status,
  peerCount = 0,
  syncStatus = "disconnected",
  connectedPeers = 0,
}: ConnectionStatusProps) {
  const getStatusIcon = () => {
    switch (status) {
      case "connected":
        return <WifiHigh size={24} color="#4CAF50" weight="fill" />;
      case "connecting":
        return <WifiLow size={24} color="#FFA502" weight="fill" />;
      case "failed":
        return <WifiNone size={24} color="#FF4444" weight="fill" />;
      default:
        return <WifiNone size={24} color="#999" weight="fill" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "failed":
        return "Connection failed";
      default:
        return "Disconnected";
    }
  };

  const getSyncIndicator = () => {
    switch (syncStatus) {
      case "syncing":
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: "#2196F3",
              fontSize: "12px",
            }}
          >
            <ArrowsClockwise size={14} weight="bold" className="animate-spin" />
            <span>Syncing...</span>
          </div>
        );
      case "synced":
        if (connectedPeers > 0) {
          return (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                color: "#4CAF50",
                fontSize: "12px",
              }}
            >
              <ArrowsClockwise size={14} weight="fill" />
              <span>Synced</span>
            </div>
          );
        }
        return null;
      case "error":
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: "#FF4444",
              fontSize: "12px",
            }}
          >
            <WifiNone size={14} weight="fill" />
            <span>Sync error</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "8px 12px",
        background: status === "connected" ? "#e8f5e9" : "#f5f5f5",
        borderRadius: "8px",
        fontSize: "14px",
      }}
    >
      {getStatusIcon()}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <span style={{ color: "#666" }}>{getStatusText()}</span>
        {getSyncIndicator()}
      </div>
      {peerCount > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            marginLeft: "8px",
            paddingLeft: "8px",
            borderLeft: "1px solid #ddd",
          }}
        >
          <Users size={16} color="#666" />
          <span style={{ color: "#666", fontWeight: 500 }}>{peerCount}</span>
        </div>
      )}
    </div>
  );
}
