import React, { useState, useCallback, useEffect } from "react";
import { createBoardDocument, type BoardId } from "../../lib/documents";
import { storage } from "../../lib/storage";
import { useP2PNetwork } from "../../hooks/useP2PNetwork";
import { useBoardDocument } from "../../hooks/useBoardDocument";
import { useImageStore } from "../../hooks/useImageStore";
import { TierList } from "../tier-list/TierList";
import { ItemGallery } from "../tier-list/ItemGallery";
import { ConnectionStatusIndicator } from "../p2p/ConnectionStatus";
import { RoomCodeDisplay, PeerList } from "../p2p";
import { JoinRoomModal } from "../p2p/JoinRoomModal";
import { ImageUploader } from "./ImageUploader";
import { Plus, Share, Download, Trash, SignIn } from "@phosphor-icons/react";
import type { PeerInfo } from "../../lib/p2p";

interface BoardViewProps {
  boardId?: BoardId;
  onCreateBoard?: (name: string) => void;
}

export function BoardView({ boardId, onCreateBoard }: BoardViewProps) {
  const [localBoardId, setLocalBoardId] = useState<BoardId | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
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
  const { storeImage } = useImageStore();

  // Use board document hook with P2P sync
  const boardIdToUse = boardId ?? localBoardId;
  const {
    doc: board,
    change,
    isLoading,
    syncStatus,
    connectedPeers,
  } = useBoardDocument(boardIdToUse, { network });

  // Sync room code from network
  useEffect(() => {
    const code = getRoomCode();
    if (code && code !== roomCode) {
      setRoomCode(code);
    }
  }, [getRoomCode, roomCode]);

  // Handle P2P image sync
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

  // Create new board
  const handleCreateBoard = useCallback(
    async (name: string) => {
      // Generate a local ID for board creation (P2P not required)
      const localId = network?.id || crypto.randomUUID();

      const boardDoc = createBoardDocument({
        name,
        createdBy: localId,
      });

      await storage.boards.saveBoard(boardDoc.id, boardDoc);
      setLocalBoardId(boardDoc.id);
      onCreateBoard?.(boardDoc.id);
    },
    [network, onCreateBoard],
  );

  // Move item between tiers
  const handleItemMove = useCallback(
    async (itemId: string, fromTierId: string, toTierId: string) => {
      if (!board) return;

      change((doc) => {
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
      });
    },
    [board, change],
  );

  // Create/join room
  const handleCreateRoom = useCallback(async () => {
    if (!network || !board) return;

    const { code } = await createRoom();
    setRoomCode(code);
  }, [network, board, createRoom]);

  // Handle joining room
  const handleJoinRoom = useCallback(
    async (code: string, password?: string) => {
      if (!network) return;

      await joinRoom(code, password ? { password } : undefined);
      setRoomCode(code);
    },
    [network, joinRoom],
  );

  // Handle leaving room
  const handleLeaveRoom = useCallback(async () => {
    await leaveRoom();
    setRoomCode(null);
  }, [leaveRoom]);

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

  // Handle image upload
  const handleImageSelected = useCallback(
    async (file: File, _croppedBlob: Blob) => {
      const id = await storeImage(file);
      setShowImageUploader(false);

      // Add new item with image
      if (!network) return;

      change((doc) => {
        doc.items.push({
          id: crypto.randomUUID(),
          name: file.name.split(".")[0] || "New Item",
          imageId: id,
          createdAt: Date.now(),
          createdBy: network.id,
          metadata: {},
        });
        doc.updatedAt = Date.now();
      });

      // Sync image to peers if connected
      if (network.getStatus() === "connected") {
        const blob = await storage.images.get(id);
        if (blob) {
          await network.sendImage(id, blob).catch((err) => {
            console.error("Failed to sync image to peers:", err);
          });
        }
      }
    },
    [network, storeImage, change],
  );

  // Add new item manually
  const handleAddItem = useCallback(() => {
    if (!network || !newItemName.trim()) return;

    change((doc) => {
      doc.items.push({
        id: crypto.randomUUID(),
        name: newItemName.trim(),
        createdAt: Date.now(),
        createdBy: network.id,
        metadata: {},
      });
      doc.updatedAt = Date.now();
    });
    setNewItemName("");
  }, [network, newItemName, change]);

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
      setBoard(null);
    }
  }, [board]);

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px",
        }}
      >
        <div>Loading...</div>
      </div>
    );
  }

  // Show create board form if no board
  if (!board) {
    return (
      <div
        style={{
          maxWidth: "600px",
          margin: "0 auto",
          padding: "32px",
        }}
      >
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            marginBottom: "24px",
            textAlign: "center",
          }}
        >
          Create New Tier List
        </h1>
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Enter tier list name..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCreateBoard(newItemName);
              }
            }}
            style={{
              flex: 1,
              padding: "12px 16px",
              fontSize: "16px",
              border: "2px solid #e0e0e0",
              borderRadius: "8px",
            }}
          />
          <button
            onClick={() => handleCreateBoard(newItemName)}
            disabled={!newItemName.trim()}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              fontWeight: 600,
              background: newItemName.trim() ? "#4CAF50" : "#ccc",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: newItemName.trim() ? "pointer" : "not-allowed",
            }}
          >
            Create
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "24px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              marginBottom: "4px",
            }}
          >
            {board.name}
          </h1>
          {board.description && (
            <p style={{ color: "#666", fontSize: "14px" }}>{board.description}</p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
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
            <ImageUploader onImageSelected={handleImageSelected} />
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
