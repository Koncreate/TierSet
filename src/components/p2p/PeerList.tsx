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
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        padding: "16px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "16px",
            fontWeight: 600,
            color: "#333",
          }}
        >
          <Users size={20} weight="fill" color="#666" />
          <span>Connected Peers ({peers.length})</span>
        </div>
        {isHost && onCloseRoom && (
          <button
            onClick={onCloseRoom}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 12px",
              background: "#FF4444",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            <SignOut size={16} />
            Close Room
          </button>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {peers.map((peer) => {
          const isCurrentUser = peer.id === currentPeerId;

          return (
            <div
              key={peer.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                background: isCurrentUser ? "#e3f2fd" : "#f5f5f5",
                borderRadius: "8px",
                border: isCurrentUser ? "2px solid #2196F3" : "2px solid transparent",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: getPeerColor(peer.role),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  {peer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "#333",
                    }}
                  >
                    <span>{peer.name}</span>
                    {peer.role === "host" && <Crown size={16} weight="fill" color="#FFA502" />}
                    {isCurrentUser && (
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#666",
                          fontStyle: "italic",
                        }}
                      >
                        (you)
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#999",
                      marginTop: "2px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    {getConnectionQualityIcon(peer.connectionQuality, peer.iceConnectionType)}
                    <span>Connected {formatConnectionTime(peer.connectedAt)}</span>
                  </div>
                </div>
              </div>

              {isHost && !isCurrentUser && onKickPeer && (
                <button
                  onClick={() => onKickPeer(peer.id)}
                  style={{
                    padding: "4px 8px",
                    background: "#fff",
                    color: "#FF4444",
                    border: "1px solid #FF4444",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 500,
                  }}
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
