import type { PeerPresence } from "../hooks/usePeerPresence";

interface PeerPresenceBarProps {
  peers: PeerPresence[];
  roomCode?: string | null;
}

export function PeerPresenceBar({ peers, roomCode }: PeerPresenceBarProps) {
  if (peers.length === 0) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      {/* Room info */}
      {roomCode && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Room:</span>
          <span className="px-2 py-1 text-sm font-mono font-semibold bg-gray-100 dark:bg-gray-700 rounded">
            {roomCode}
          </span>
        </div>
      )}

      {/* Peer avatars */}
      <div className="flex items-center gap-2">
        {peers.map((peer) => (
          <PeerAvatar key={peer.id} peer={peer} />
        ))}
      </div>
    </div>
  );
}

interface PeerAvatarProps {
  peer: PeerPresence;
}

function PeerAvatar({ peer }: PeerAvatarProps) {
  const initials = getInitials(peer.name);
  const isHost = peer.role === "host" || peer.isHost;

  return (
    <div
      className="group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-white text-sm font-medium transition-transform hover:scale-105"
      style={{ backgroundColor: peer.color }}
      title={`${peer.name}${isHost ? " (Host)" : ""}`}
    >
      {/* Avatar circle with initials */}
      <span className="w-5 h-5 flex items-center justify-center text-xs font-bold">
        {initials}
      </span>

      {/* Name label - shown on hover for remote peers */}
      <span className="hidden group-hover:inline-block ml-1">
        {peer.name}
      </span>

      {/* Host badge */}
      {isHost && (
        <span className="ml-1 text-[10px] opacity-75">
          👑
        </span>
      )}
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
