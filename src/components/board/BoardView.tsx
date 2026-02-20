import React, { useState, useCallback, useEffect } from "react";
import type { BoardId } from "../../lib/documents";
import { storage } from "../../lib/storage";
import { useP2PNetwork } from "../../hooks/useP2PNetwork";
import { useBoardDocument } from "../../lib/automerge";
import { useRoomConnection } from "../../hooks/useRoomConnection";
import { usePeerPresence } from "../../hooks/usePeerPresence";
import { TierList } from "../tier-list/TierList";
import { ItemGallery } from "../tier-list/ItemGallery";
import { ConnectionStatusIndicator } from "../p2p/ConnectionStatus";
import { RoomCodeDisplay, PeerList } from "../p2p";
import { JoinRoomModal } from "../p2p/JoinRoomModal";
import { PeerPresenceBar } from "../presence/PeerPresenceBar";
import { ImageUploader, type UploadResult } from "./ImageUploader";
import { Plus, Share, Download, Trash, SignIn } from "@phosphor-icons/react";
import type { PeerInfo } from "../../lib/p2p";

interface BoardViewProps {
  boardId: BoardId;
}

export function BoardView({ boardId }: BoardViewProps) {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomDocumentUrl, setRoomDocumentUrl] = useState<string | null>(null);
  const [showImageUploader, setShowImageUploader] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [showJoinModal, setShowJoinModal] = useState(false);

  const {
    network,
    peers,
    status,
    createRoom,
    joinRoom,
    leaveRoom,
    kickPeer,
    closeRoom,
    getRoomCode,
  } = useP2PNetwork();

  const { allPeers } = usePeerPresence(network);

  // Use room connection hook for Automerge Repo
  const {
    isConnecting: isRepoConnecting,
    error: repoConnectionError,
    connectToRoom,
    disconnectFromRoom,
    retry,
  } = useRoomConnection();

  // Use board document hook with Automerge Repo
  const {
    doc: board,
    change,
    isLoading,
    error: docError,
    url: boardUrl,
  } = useBoardDocument(boardId, undefined, roomDocumentUrl);

  // Get connected peers count from P2P network
  const connectedPeers = peers.length;
  const syncStatus = status === "connected" ? "synced" : status;

  // Sync room code from network
  useEffect(() => {
    const code = getRoomCode();
    if (code && code !== roomCode) {
      setRoomCode(code);
    }
  }, [getRoomCode, roomCode]);

  // Handle P2P image sync (images are not handled by Automerge, only board state)
  useEffect(() => {
    if (!network || !board) return;

    // Handle image requests from peers
    const handleImageRequest = async (imageId: string, senderId: string) => {
      console.log(`[BoardView] Image request: ${imageId} from ${senderId}`);

      // Get image blob from storage
      const blob = await storage.images.get(imageId);
      if (blob) {
        await network.sendImage(imageId, blob);
      } else {
        console.warn(`[BoardView] Image not found: ${imageId}`);
      }
    };

    // Handle incoming images from peers
    const handleImageReceived = async (imageId: string, blob: Blob, senderId: string) => {
      console.log(`[BoardView] Image received: ${imageId} from ${senderId}`);

      // Store the image locally
      try {
        await storage.images.put(imageId, blob);
      } catch (error) {
        console.error("[BoardView] Failed to store received image:", error);
      }
    };

    // Send existing board images to newly joined peer
    const handlePeerJoined = async (peer: PeerInfo) => {
      if (!board) return;

      console.log(`[BoardView] Peer joined: ${peer.name}, sending images...`);

      // Collect all image IDs from board items
      const imageIds = new Set<string>();
      for (const item of board.items) {
        if (item.imageId) {
          imageIds.add(item.imageId);
        }
      }

      // Send each image
      for (const imageId of imageIds) {
        const blob = await storage.images.get(imageId);
        if (blob) {
          await network.sendImage(imageId, blob);
        }
      }
    };

    network.on("image:request", handleImageRequest);
    network.on("image:received", handleImageReceived);
    network.on("peer:joined", handlePeerJoined);

    return () => {
      network.off("image:request", handleImageRequest);
      network.off("image:received", handleImageReceived);
      network.off("peer:joined", handlePeerJoined);
    };
  }, [network, board]);

  // Build image URL map
  const itemImages = React.useMemo(() => {
    const map = new Map<string, string>();
    // Would load images from store in real implementation
    return map;
  }, []);

  // Move item between tiers using Automerge change
  const handleItemMove = useCallback(
    async (itemId: string, fromTierId: string, toTierId: string) => {
      if (!board) return;

      console.log("[BoardView] Moving item:", itemId, "from:", fromTierId, "to:", toTierId);

      // Use Automerge's change function - automatically syncs to peers
      change((doc) => {
        console.log("[BoardView] Change callback called for move");
        // Remove from source tier
        const sourceTier = doc.tiers.find((t) => t.id === fromTierId);
        if (sourceTier) {
          sourceTier.itemIds = sourceTier.itemIds.filter((id) => id !== itemId);
        }

        // Add to target tier (if not unplaced)
        if (toTierId !== "unplaced") {
          const targetTier = doc.tiers.find((t) => t.id === toTierId);
          if (targetTier) {
            targetTier.itemIds.push(itemId);
          }
        }

        doc.updatedAt = Date.now();
        console.log("[BoardView] Move completed");
      });
    },
    [board, change],
  );

  // Create room and connect Automerge Repo
  const handleCreateRoom = useCallback(async () => {
    if (!network || !boardUrl) return;

    try {
      // Create room with document URL stored on server
      const { code } = await createRoom({ documentUrl: boardUrl });

      // Connect Automerge Repo to the existing P2PNetwork
      const success = await connectToRoom(network);

      if (success) {
        setRoomCode(code);
        console.log("[BoardView] Created room with document URL:", code, boardUrl);
      } else {
        console.error("[BoardView] Failed to connect Automerge Repo");
        await leaveRoom();  // Clean up P2P room if repo connection failed
      }
    } catch (error) {
      console.error("[BoardView] Failed to create room:", error);
    }
  }, [network, createRoom, connectToRoom, leaveRoom, boardUrl]);

  // Join room and connect Automerge Repo
  const handleJoinRoom = useCallback(
    async (code: string, password?: string) => {
      if (!network) return;

      try {
        // Join room and get document URL from server
        const { documentUrl } = await joinRoom(code, password ? { password } : undefined);

        // Set the document URL so useBoardDocument can find the right document
        if (documentUrl) {
          setRoomDocumentUrl(documentUrl);
          console.log("[BoardView] Received document URL from room:", documentUrl);
        }

        // Connect Automerge Repo to the existing P2PNetwork
        const success = await connectToRoom(network);

        if (success) {
          setRoomCode(code);
          console.log("[BoardView] Connected Automerge Repo to room:", code);
        } else {
          console.error("[BoardView] Failed to connect Automerge Repo");
          await leaveRoom();  // Clean up P2P room if repo connection failed
        }
      } catch (error) {
        console.error("[BoardView] Failed to join room:", error);
      }
    },
    [network, joinRoom, connectToRoom, leaveRoom],
  );

  // Leave room and disconnect Automerge Repo
  const handleLeaveRoom = useCallback(async () => {
    // Disconnect Automerge Repo first
    await disconnectFromRoom();

    // Then leave P2P room
    await leaveRoom();
    setRoomCode(null);
    setRoomDocumentUrl(null);  // Clear document URL
  }, [disconnectFromRoom, leaveRoom]);

  // Handle kicking peer (host only)
  const handleKickPeer = useCallback(
    async (peerId: string) => {
      if (!network) return;
      try {
        await kickPeer(peerId);
      } catch (error) {
        console.error("Failed to kick peer:", error);
      }
    },
    [network, kickPeer],
  );

  // Handle closing room (host only)
  const handleCloseRoom = useCallback(async () => {
    if (!network) return;
    try {
      await closeRoom();
      setRoomCode(null);
    } catch (error) {
      console.error("Failed to close room:", error);
    }
  }, [network, closeRoom]);

  // Handle image upload (multiple images)
  const handleImagesSelected = useCallback(
    async (results: UploadResult[]) => {
      setShowImageUploader(false);

      if (results.length === 0 || !network) return;

      // Add items for each uploaded image using Automerge change
      for (const result of results) {
        change((doc) => {
          doc.items.push({
            id: crypto.randomUUID(),
            name: result.filename.split(".")[0] || "New Item",
            imageId: result.id,
            createdAt: Date.now(),
            createdBy: network.id,
            metadata: {},
          });
          doc.updatedAt = Date.now();
        });

        // Sync image to peers if connected (images are separate from Automerge)
        if (network.getStatus() === "connected") {
          const blob = await storage.images.get(result.id);
          if (blob) {
            await network.sendImage(result.id, blob).catch((err) => {
              console.error("Failed to sync image to peers:", err);
            });
          }
        }
      }
    },
    [network, change],
  );

  // Add new item manually using Automerge change
  const handleAddItem = useCallback(() => {
    if (!newItemName.trim()) return;

    console.log("[BoardView] Adding item:", newItemName.trim());
    change((doc) => {
      console.log("[BoardView] Change callback called, items before:", doc.items.length);
      doc.items.push({
        id: crypto.randomUUID(),
        name: newItemName.trim(),
        createdAt: Date.now(),
        createdBy: network?.id || "unknown",
        metadata: {},
      });
      doc.updatedAt = Date.now();
      console.log("[BoardView] Items after:", doc.items.length);
    });
    setNewItemName("");
  }, [newItemName, change, network]);

  // Export board
  const handleExport = useCallback(async () => {
    if (!board) return;

    const blob = await storage.boards.exportBoard(board.id);
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${board.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [board]);

  // Delete board
  const handleDelete = useCallback(async () => {
    if (!board) return;

    if (confirm(`Are you sure you want to delete "${board.name}"?`)) {
      await storage.boards.deleteBoard(board.id);
      // Navigate to home after deletion
      window.location.href = "/";
    }
  }, [board]);

  // Show loading while board loads
  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px",
          minHeight: "400px",
        }}
      >
        <div>Loading tier list...</div>
      </div>
    );
  }

  // Show error if document failed to load
  if (docError) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px",
          minHeight: "400px",
        }}
      >
        <div style={{ color: "red" }}>Error: {docError.message}</div>
      </div>
    );
  }

  // Board should always exist now (auto-created by route)
  if (!board) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px",
          minHeight: "400px",
        }}
      >
        <div>Creating tier list...</div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "0",
      }}
    >
      {/* Show connection error with retry option */}
      {repoConnectionError && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              textAlign: "center",
            }}
          >
            <div style={{ color: "red", marginBottom: "16px" }}>
              <p style={{ fontWeight: 600, marginBottom: "8px", fontSize: "18px" }}>Failed to connect to room</p>
              <p style={{ fontSize: "14px", color: "#666" }}>{repoConnectionError.message}</p>
            </div>
            <button
              onClick={async () => {
                await retry();
              }}
              disabled={isRepoConnecting}
              style={{
                padding: "10px 20px",
                background: isRepoConnecting ? "#ccc" : "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: isRepoConnecting ? "not-allowed" : "pointer",
                fontWeight: 500,
                fontSize: "16px",
              }}
            >
              {isRepoConnecting ? "Retrying..." : "Retry Connection"}
            </button>
          </div>
        </div>
      )}

      {/* Presence bar at top */}
      <PeerPresenceBar peers={allPeers} roomCode={roomCode} />

      {/* Main content */}
      <div style={{ padding: "24px" }}>
        {/* Header with inline editable name */}
        <div style={{ marginBottom: "24px" }}>
          <input
            type="text"
            value={board.name}
            onChange={(e) => {
              console.log("[BoardView] Renaming board to:", e.target.value);
              change((doc) => {
                console.log("[BoardView] Change callback called for rename");
                doc.name = e.target.value;
                doc.updatedAt = Date.now();
              });
            }}
            style={{
              fontSize: "28px",
              fontWeight: 700,
              padding: "8px 12px",
              border: "2px solid transparent",
              borderRadius: "8px",
              width: "100%",
              maxWidth: "500px",
              background: "transparent",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#2196F3";
              e.target.style.background = "#f5f5f5";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "transparent";
              e.target.style.background = "transparent";
            }}
            placeholder="Untitled Tier List"
          />
          {board.description && (
            <p style={{ color: "#666", fontSize: "14px", marginTop: "8px" }}>
              {board.description}
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "24px",
          flexWrap: "wrap",
        }}
      >
        <ConnectionStatusIndicator
          status={status}
          peerCount={peers.length}
          syncStatus={syncStatus}
          connectedPeers={connectedPeers}
        />

        {!roomCode ? (
          <>
            <button
              onClick={handleCreateRoom}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                background: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              <Share size={18} />
              Create Room
            </button>

            <button
              onClick={() => setShowJoinModal(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                background: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              <SignIn size={18} />
              Join Room
            </button>
          </>
        ) : (
          <button
            onClick={handleLeaveRoom}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              background: "#FF4444",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <SignIn size={18} weight="bold" />
            Leave Room
          </button>
        )}

        <button
          onClick={handleExport}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            background: "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          <Download size={18} />
          Export
        </button>

        <button
          onClick={handleDelete}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            background: "#FF4444",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          <Trash size={18} />
          Delete
        </button>
      </div>

      {/* Room Code */}
      {roomCode && (
        <div style={{ marginBottom: "24px" }}>
          <RoomCodeDisplay code={roomCode} />
        </div>
      )}

      {/* Connected Peers */}
      {roomCode && peers.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <PeerList
            peers={peers}
            currentPeerId={network?.id}
            isHost={network?.getIsHost()}
            onKickPeer={handleKickPeer}
            onCloseRoom={handleCloseRoom}
          />
        </div>
      )}

      {/* Add Item Section */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          marginBottom: "24px",
          alignItems: "flex-end",
        }}
      >
        <div style={{ flex: 1 }}>
          <label
            htmlFor="new-item-name"
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 500,
              marginBottom: "4px",
              color: "#666",
            }}
          >
            Add New Item
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              id="new-item-name"
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Item name..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddItem();
                }
              }}
              style={{
                flex: 1,
                padding: "10px 14px",
                fontSize: "14px",
                border: "2px solid #e0e0e0",
                borderRadius: "6px",
              }}
            />
            <button
              onClick={handleAddItem}
              disabled={!newItemName.trim()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                background: newItemName.trim() ? "#4CAF50" : "#ccc",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: newItemName.trim() ? "pointer" : "not-allowed",
                fontWeight: 500,
              }}
            >
              <Plus size={18} weight="bold" />
              Add
            </button>
          </div>
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 500,
              marginBottom: "4px",
              color: "#666",
            }}
          >
            Or Upload Image
          </label>
          <button
            onClick={() => setShowImageUploader(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              background: "#9C27B0",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <Plus size={18} weight="bold" />
            Upload Image
          </button>
        </div>
      </div>

      {/* Image Uploader Modal */}
      {showImageUploader && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowImageUploader(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "500px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: "16px", fontSize: "20px" }}>Upload Image</h2>
            <ImageUploader onImagesSelected={handleImagesSelected} />
            <button
              onClick={() => setShowImageUploader(false)}
              style={{
                marginTop: "16px",
                padding: "8px 16px",
                background: "#f5f5f5",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tier List */}
      <TierList board={board} itemImages={itemImages} onItemMove={handleItemMove} />

      {/* Unplaced Items Gallery */}
      <ItemGallery board={board} itemImages={itemImages} onItemMove={handleItemMove} />

      {/* Join Room Modal */}
      <JoinRoomModal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onJoin={handleJoinRoom}
      />
    </div>
  );
}
