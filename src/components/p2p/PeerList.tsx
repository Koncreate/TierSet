import React from "react";
import type { PeerInfo, ConnectionQuality } from "../../lib/p2p";
import {
  Users,
  Crown,
  SignOut,
  WifiHigh,
  WifiMedium,
  WifiLow,
  WifiNone,
} from "@phosphor-icons/react";

interface PeerListProps {
  peers: PeerInfo[];
  currentPeerId?: string;
  isHost?: boolean;
  onKickPeer?: (peerId: string) => void;
  onCloseRoom?: () => void;
}

export function PeerList({
  peers,
  currentPeerId,
  isHost = false,
  onKickPeer,
  onCloseRoom,
}: PeerListProps) {
  if (peers.length === 0) {
    return null;
  }

  const formatConnectionTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (minutes === 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  };

  const getPeerColor = (role: string) => {
    switch (role) {
      case "host":
        return "#FFA502";
      case "client":
        return "#2196F3";
      default:
        return "#666";
    }
  };

  const getConnectionQualityIcon = (quality?: ConnectionQuality, type?: string) => {
    const size = 16;

    // Show connection type tooltip
    const title = type ? `${type.toUpperCase()} connection` : "Connection quality";

    switch (quality) {
      case "excellent":
        return <WifiHigh size={size} weight="fill" color="#4CAF50" title={title} />;
      case "good":
        return <WifiHigh size={size} weight="fill" color="#8BC34A" title={title} />;
      case "fair":
        return <WifiMedium size={size} weight="fill" color="#FFA502" title={title} />;
      case "poor":
        return <WifiLow size={size} weight="fill" color="#FF4444" title={title} />;
      default:
        return <WifiNone size={size} weight="fill" color="#999" title="Unknown connection" />;
    }
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-md">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 text-base font-semibold text-gray-700">
          <Users size={20} weight="fill" color="#666" />
          <span>Connected Peers ({peers.length})</span>
        </div>
        {isHost && onCloseRoom && (
          <button
            onClick={onCloseRoom}
            className="flex items-center gap-1 py-1.5 px-3 bg-[#FF4444] text-white border-none rounded-md cursor-pointer text-[13px] font-medium"
          >
            <SignOut size={16} />
            Close Room
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {peers.map((peer) => {
          const isCurrentUser = peer.id === currentPeerId;

          return (
            <div
              key={peer.id}
              className={`flex items-center justify-between py-2.5 px-3 rounded-lg border-2 ${
                isCurrentUser ? "bg-blue-50 border-[#2196F3]" : "bg-gray-100 border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                  style={{ background: getPeerColor(peer.role) }}
                >
                  {peer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <span>{peer.name}</span>
                    {peer.role === "host" && <Crown size={16} weight="fill" color="#FFA502" />}
                    {isCurrentUser && (
                      <span className="text-[11px] text-gray-500 italic">
                        (you)
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                    {getConnectionQualityIcon(peer.connectionQuality, peer.iceConnectionType)}
                    <span>Connected {formatConnectionTime(peer.connectedAt)}</span>
                  </div>
                </div>
              </div>

              {isHost && !isCurrentUser && onKickPeer && (
                <button
                  onClick={() => onKickPeer(peer.id)}
                  className="py-1 px-2 bg-white text-[#FF4444] border border-[#FF4444] rounded cursor-pointer text-xs font-medium"
                >
                  Kick
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
