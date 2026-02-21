import React, { useState, useCallback, useEffect } from "react";
import { debounce } from "@tanstack/pacer";
import type { BoardId } from "../../lib/documents";
import { storage } from "../../lib/storage";
import { useP2PNetwork } from "../../hooks/useP2PNetwork";
import { useBoardState, useRoomState, usePeerState } from "../../hooks";
import { useRoomConnection } from "../../hooks/useRoomConnection";
import { usePeerPresence } from "../../hooks/usePeerPresence";
import { useHostRoom } from "../../hooks/useHostRoom";
import { useJoinRoom } from "../../hooks/useJoinRoom";
import { useBoardDocument } from "../../lib/automerge";
import { TierList } from "../tier-list/TierList";
import { ItemGallery } from "../tier-list/ItemGallery";
import { ItemLightbox } from "../tier-list/ItemLightbox";
import { MatchDetailsLightbox } from "../bracket/MatchDetailsLightbox";
import { ImageEditorModal } from "../ui/ImageEditorModal";
import { ConnectionStatusIndicator } from "../p2p/ConnectionStatus";
import { RoomCodeDisplay, PeerList } from "../p2p";
import { JoinRoomModal } from "../p2p/JoinRoomModal";
import { PeerPresenceBar } from "../presence/PeerPresenceBar";
import { ImageUploader, type UploadResult } from "./ImageUploader";
import { Plus, Share, Download, Trash, SignIn } from "@phosphor-icons/react";
import type { PeerInfo } from "../../lib/p2p";
import { decodeRoomCode } from "../../lib/p2p/room-code";
import { appStore } from "../../stores";
import { boardActions } from "../../stores/appStore.actions";

interface BoardViewProps {
  boardId: BoardId;
}

export function BoardView({ boardId }: BoardViewProps) {
  const [showImageUploader, setShowImageUploader] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [boardNameInput, setBoardNameInput] = useState("");

  // TanStack Store hooks
  const {
    board,
    isLoading: boardLoading,
    error: boardError,
    syncStatus: storeSyncStatus,
    connectedPeers,
  } = useBoardState();

  const {
    roomCode,
    isHost: _isHost,
    isConnected: _isConnected,
    isConnecting,
    error: roomError,
  } = useRoomState();

  const {
    allPeers,
    peerCount,
  } = usePeerState();

  const _localPeer = usePeerPresence();

  // P2P Network hook (manages network instance, updates stores on events)
  const {
    network,
    getRoomCode,
    getIsHost,
  } = useP2PNetwork();

  // Room connection hook
  const {
    connectToRoom,
    disconnectFromRoom,
    retry,
    error: repoConnectionError,
  } = useRoomConnection();

  // Room creation/join hooks
  const { createRoom: hostRoom, isCreating, error: hostError } = useHostRoom();
  const { joinRoom: joinRoomFlow, isJoining, error: joinError } = useJoinRoom();

  // Decode document URL from room code if available
  const decodedDocumentUrl = roomCode ? decodeRoomCode(roomCode)?.documentUrl || null : null;

  // Use board document hook with Automerge Repo - pass documentUrl directly
  const {
    change,
    handle,
    isLoading: automergeLoading,
    error: docError,
    url: boardUrl,
  } = useBoardDocument(boardId, undefined, decodedDocumentUrl);

  // Debounced board name change handler (300ms)
  const debouncedBoardNameChange = useCallback(
    debounce((name: string) => {
      change((doc) => {
        doc.name = name;
        doc.updatedAt = Date.now();
      });
    }, { wait: 300 }),
    [change]
  );

  // Sync local input state with board name
  useEffect(() => {
    if (board?.name && board.name !== boardNameInput) {
      setBoardNameInput(board.name);
    }
  }, [board?.name]);

  // CRITICAL: Subscribe to DocHandle "change" event for reactive updates
  // This ensures UI updates even when automergeBoard reference doesn't change
  useEffect(() => {
    if (!handle) return;

    const handleChange = () => {
      const doc = handle.docSync();
      if (doc) {
        boardActions.setBoard(doc);
        console.log("[BoardView] Synced Automerge document to store via change event");
      }
    };

    handle.on("change", handleChange);

    // Initial sync
    const initialDoc = handle.docSync();
    if (initialDoc) {
      boardActions.setBoard(initialDoc);
    }

    return () => {
      handle.off("change", handleChange);
    };
  }, [handle]);

  // Cleanup board state on unmount
  useEffect(() => {
    return () => {
      boardActions.setBoard(null as any);
      boardActions.setLoading(false);
      boardActions.setError(null);
      boardActions.setDocumentUrl(null);
      console.log("[BoardView] Cleaned up board state on unmount");
    };
  }, []);

  // Sync loading state to store
  useEffect(() => {
    boardActions.setLoading(automergeLoading);
  }, [automergeLoading]);

  // Sync error state to store
  useEffect(() => {
    boardActions.setError(docError);
  }, [docError]);

  // Sync document URL to store
  useEffect(() => {
    boardActions.setDocumentUrl(boardUrl);
  }, [boardUrl]);

  // Sync room code from network
  useEffect(() => {
    const code = getRoomCode();
    if (code && code !== roomCode) {
      // Room code is now managed by store, this is just for initial sync
      console.log("[BoardView] Room code from network:", code);
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

  // Create room and connect Automerge Repo (HOST flow)
  const handleCreateRoom = useCallback(async () => {
    if (!network || !boardUrl) return;

    const { code, success } = await hostRoom({
      network,
      documentUrl: boardUrl,
      connectToRoom,
    });

    if (success) {
      // Room code is now set in store automatically via actions
      console.log("[BoardView] Created room:", code);
    }
  }, [network, boardUrl, hostRoom, connectToRoom]);

  // Join room and connect Automerge Repo (CLIENT flow)
  const handleJoinRoom = useCallback(
    async (code: string, password?: string) => {
      if (!network) return;

      const { documentUrl, success } = await joinRoomFlow({
        code,
        network,
        connectToRoom,
        password,
      });

      if (success) {
        console.log("[BoardView] Joined room:", code, "Document:", documentUrl);
      }
    },
    [network, joinRoomFlow, connectToRoom],
  );

  // Leave room and disconnect Automerge Repo
  const handleLeaveRoom = useCallback(async () => {
    // Disconnect Automerge Repo first
    await disconnectFromRoom();

    // Then leave P2P room
    await network?.leaveRoom();
  }, [disconnectFromRoom, network]);

  // Handle kicking peer (host only)
  const handleKickPeer = useCallback(
    async (peerId: string) => {
      if (!network) return;
      try {
        await network.kickPeer(peerId);
      } catch (error) {
        console.error("Failed to kick peer:", error);
      }
    },
    [network],
  );

  // Handle closing room (host only)
  const handleCloseRoom = useCallback(async () => {
    if (!network) return;
    try {
      await network.closeRoom();
    } catch (error) {
      console.error("Failed to close room:", error);
    }
  }, [network]);

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

  // Handle image editor save
  const handleImageEditorSave = useCallback(async (editedImageUrl: string) => {
    const imageEditor = appStore.state.ui.imageEditor;
    const itemId = imageEditor.itemId;
    if (!itemId) return;

    try {
      // Convert data URL to blob
      const response = await fetch(editedImageUrl);
      const blob = await response.blob();

      // Store the edited image in IndexedDB
      await storage.images.put(itemId, blob);

      // Sync to peers if connected
      if (network && network.getStatus() === "connected") {
        await network.sendImage(itemId, blob).catch((err) => {
          console.error("Failed to sync edited image to peers:", err);
        });
      }
    } catch (error) {
      console.error("Failed to save edited image:", error);
    }
  }, [network]);

  // Show loading while board loads
  if (boardLoading || automergeLoading) {
    return (
      <div className="flex items-center justify-center p-16 min-h-[400px]">
        <div>Loading tier list...</div>
      </div>
    );
  }

  // Show error if document failed to load
  if (docError || boardError) {
    return (
      <div className="flex items-center justify-center p-16 min-h-[400px]">
        <div className="text-red-500">Error: {(docError || boardError)?.message}</div>
      </div>
    );
  }

  // Board should always exist now (auto-created by route)
  if (!board) {
    return (
      <div className="flex items-center justify-center p-16 min-h-[400px]">
        <div>Creating tier list...</div>
      </div>
    );
  }

  // Determine sync status - prefer store status, fallback to P2P status
  const syncStatus = storeSyncStatus;

  // Combine errors
  const combinedError = roomError || hostError || joinError || repoConnectionError;
  const isLoading = isCreating || isJoining || isConnecting;

  return (
    <div className="max-w-[1200px] mx-auto p-0">
      {/* Show connection error with retry option */}
      {combinedError && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-[400px] w-[90%] text-center">
            <div className="text-red-500 mb-4">
              <p className="font-semibold mb-2 text-lg">
                {hostError ? "Failed to create room" : joinError ? "Failed to join room" : "Failed to connect to room"}
              </p>
              <p className="text-sm text-gray-500">
                {combinedError.message}
              </p>
            </div>
            <button
              onClick={async () => {
                await retry();
              }}
              disabled={isLoading}
              className={`px-5 py-2.5 text-white border-none rounded-md font-medium text-base ${isLoading ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#2196F3] cursor-pointer'}`}
            >
              {isLoading ? "Retrying..." : "Retry Connection"}
            </button>
          </div>
        </div>
      )}

      {/* Presence bar at top */}
      <PeerPresenceBar peers={allPeers} roomCode={roomCode} />

      {/* Main content */}
      <div className="p-6">
        {/* Header with inline editable name */}
        <div className="mb-6">
          <input
            type="text"
            value={boardNameInput}
            onChange={(e) => {
              setBoardNameInput(e.target.value);
              debouncedBoardNameChange(e.target.value);
            }}
            className="text-3xl font-bold px-3 py-2 border-2 border-transparent rounded-lg w-full max-w-[500px] bg-transparent focus:border-[#2196F3] focus:bg-gray-100 outline-none"
            placeholder="Untitled Tier List"
          />
          {board.description && (
            <p className="text-gray-500 text-sm mt-2">
              {board.description}
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <ConnectionStatusIndicator
          status={network?.getStatus() || "disconnected"}
          peerCount={peerCount}
          syncStatus={syncStatus}
          connectedPeers={connectedPeers}
        />

        {!roomCode ? (
          <>
            <button
              onClick={handleCreateRoom}
              disabled={isCreating}
              className={`flex items-center gap-2 px-4 py-2 text-white border-none rounded-md font-medium ${isCreating ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#2196F3] cursor-pointer'}`}
            >
              <Share size={18} />
              {isCreating ? "Creating..." : "Create Room"}
            </button>

            <button
              onClick={() => setShowJoinModal(true)}
              disabled={isJoining}
              className={`flex items-center gap-2 px-4 py-2 text-white border-none rounded-md font-medium ${isJoining ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#4CAF50] cursor-pointer'}`}
            >
              <SignIn size={18} />
              {isJoining ? "Joining..." : "Join Room"}
            </button>
          </>
        ) : (
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-2 px-4 py-2 text-white border-none rounded-md font-medium bg-[#FF4444] cursor-pointer"
          >
            <SignIn size={18} weight="bold" />
            Leave Room
          </button>
        )}

        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 text-white border-none rounded-md font-medium bg-[#4CAF50] cursor-pointer"
        >
          <Download size={18} />
          Export
        </button>

        <button
          onClick={handleDelete}
          className="flex items-center gap-2 px-4 py-2 text-white border-none rounded-md font-medium bg-[#FF4444] cursor-pointer"
        >
          <Trash size={18} />
          Delete
        </button>
      </div>

      {/* Room Code */}
      {roomCode && (
        <div className="mb-6">
          <RoomCodeDisplay code={roomCode} />
        </div>
      )}

      {/* Connected Peers */}
      {roomCode && peerCount > 1 && (
        <div className="mb-6">
          <PeerList
            peers={network?.getPeers() || []}
            currentPeerId={network?.id}
            isHost={getIsHost()}
            onKickPeer={handleKickPeer}
            onCloseRoom={handleCloseRoom}
          />
        </div>
      )}

      {/* Add Item Section */}
      <div className="flex gap-4 mb-6 items-end">
        <div className="flex-1">
          <label
            htmlFor="new-item-name"
            className="block text-sm font-medium mb-1 text-gray-500"
          >
            Add New Item
          </label>
          <div className="flex gap-2">
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
              className="flex-1 px-3.5 py-2.5 text-sm border-2 border-gray-200 rounded-md"
            />
            <button
              onClick={handleAddItem}
              disabled={!newItemName.trim()}
              className={`flex items-center gap-2 px-5 py-2.5 text-white border-none rounded-md font-medium ${newItemName.trim() ? 'bg-[#4CAF50] cursor-pointer' : 'bg-gray-300 cursor-not-allowed'}`}
            >
              <Plus size={18} weight="bold" />
              Add
            </button>
          </div>
        </div>

        <div>
          <label
            className="block text-sm font-medium mb-1 text-gray-500"
          >
            Or Upload Image
          </label>
          <button
            onClick={() => setShowImageUploader(true)}
            className="flex items-center gap-2 px-5 py-2.5 text-white border-none rounded-md font-medium bg-[#9C27B0] cursor-pointer"
          >
            <Plus size={18} weight="bold" />
            Upload Image
          </button>
        </div>
      </div>

      {/* Image Uploader Modal */}
      {showImageUploader && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowImageUploader(false)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-[500px] w-[90%]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-xl">Upload Image</h2>
            <ImageUploader onImagesSelected={handleImagesSelected} />
            <button
              onClick={() => setShowImageUploader(false)}
              className="mt-4 px-4 py-2 bg-gray-100 border-none rounded-md cursor-pointer"
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

      {/* Lightboxes */}
      <ItemLightbox itemImages={itemImages} />
      <MatchDetailsLightbox />
      <ImageEditorModal onSave={handleImageEditorSave} />
    </div>
  );
}
