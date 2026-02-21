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
          <div className="flex items-center gap-1 text-[#2196F3] text-xs">
            <ArrowsClockwise size={14} weight="bold" className="animate-spin" />
            <span>Syncing...</span>
          </div>
        );
      case "synced":
        if (connectedPeers > 0) {
          return (
            <div className="flex items-center gap-1 text-[#4CAF50] text-xs">
              <ArrowsClockwise size={14} weight="fill" />
              <span>Synced</span>
            </div>
          );
        }
        return null;
      case "error":
        return (
          <div className="flex items-center gap-1 text-[#FF4444] text-xs">
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
      className={`flex items-center gap-3 py-2 px-3 rounded-lg text-sm ${
        status === "connected" ? "bg-green-50" : "bg-gray-100"
      }`}
    >
      {getStatusIcon()}
      <div className="flex flex-col gap-0.5">
        <span className="text-gray-500">{getStatusText()}</span>
        {getSyncIndicator()}
      </div>
      {peerCount > 0 && (
        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-300">
          <Users size={16} color="#666" />
          <span className="text-gray-500 font-medium">{peerCount}</span>
        </div>
      )}
    </div>
  );
}
