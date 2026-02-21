import { EventEmitter } from "eventemitter3";
import { getIceServers } from "./ice-servers";
import { validateP2PMessage } from "./types";
import { createId } from "../ids";
import type {
  P2PMessage,
  PeerInfo,
  ConnectionStatus,
  SyncStats,
  SyncMessage,
  FullSyncMessage,
  ConnectionQuality,
  ImageChunkMessage,
} from "./types";
import { p2pRateLimiter } from "./rate-limiter";
import {
  createRoom as createRoomFn,
  joinRoom as joinRoomFn,
  submitOffer,
  getAnswer,
  getOffer,
  submitAnswer,
  submitCandidate,
  getCandidates,
  leaveRoom as leaveRoomFn,
  kickPeer as kickPeerFn,
} from "../../routes/api/-signaling";

interface P2PEvents {
  "peer:joined": (peer: PeerInfo) => void;
  "peer:left": (peer: PeerInfo) => void;
  "sync:received": (delta: Uint8Array, senderId: string) => void;
  "sync:request": (boardId: string, requesterId: string) => void;
  "fullsync:received": (document: Uint8Array, senderId: string) => void;
  "message:received": (message: P2PMessage) => void;
  "status:changed": (status: ConnectionStatus) => void;
  "image:received": (imageId: string, blob: Blob, senderId: string) => void;
  "image:request": (imageId: string, senderId: string) => void;
  error: (error: Error) => void;
}

export interface P2POptions {
  turnToken?: string;
  turnUsername?: string;
  peerName?: string;
}

/**
 * P2P Network Manager using WebRTC
 */
export class P2PNetwork extends EventEmitter<P2PEvents> {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private status: ConnectionStatus = "disconnected";
  private peers: Map<string, PeerInfo> = new Map();
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private sequence: number = 0;
  private peerSequence: Map<string, number> = new Map();
  private options: P2POptions;
  private currentRoomCode: string | null = null;
  private isHost: boolean = false;
  private candidatePollInterval: ReturnType<typeof setInterval> | null = null;
  private answerPollInterval: ReturnType<typeof setInterval> | null = null;

  // Image transfer state
  private pendingImages: Map<
    string,
    {
      chunks: Uint8Array[];
      totalChunks: number;
      receivedChunks: number;
      imageId: string;
      senderId: string;
    }
  > = new Map();
  private imageBytesSent: number = 0;
  private imageBytesReceived: number = 0;

  readonly id: string;

  constructor(options: P2POptions = {}) {
    super();
    this.id = createId();  // Use cuid2 for compatibility with Zod schemas
    this.options = {
      peerName: `Peer-${this.id.slice(0, 6)}`,
      ...options,
    };

    this.initializePeerConnection();
  }

  private initializePeerConnection(): void {
    const iceServers = getIceServers({
      cloudflareToken: this.options.turnToken,
      cloudflareUsername: this.options.turnUsername,
    });

    this.pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
    });

    this.setupPeerConnectionHandlers();
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.pc) return;

    this.pc.onicecandidate = async (event) => {
      // null candidate = end-of-candidates signal, don't send to server
      if (!event.candidate) return;

      // Skip if candidate string is empty (another end-of-candidates signal)
      const candidateString = event.candidate.candidate;
      if (!candidateString) return;

      // Skip if connection is already established
      if (this.pc?.connectionState === "connected") return;

      // Convert RTCIceCandidate to plain object for serialization
      const candidate: RTCIceCandidateInit = {
        candidate: candidateString,
        sdpMid: event.candidate.sdpMid || undefined,
        sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
        usernameFragment: event.candidate.usernameFragment || undefined,
      };

      this.pendingCandidates.push(candidate);

      // Send candidate to signaling server if in a room
      if (this.currentRoomCode) {
        try {
          const result = await submitCandidate({
            data: {
              code: this.currentRoomCode,
              candidate,
              from: this.isHost ? "host" : "client",
            },
          });
          // Handle error response from server
          if (result && 'success' in result && !result.success) {
            console.warn("[P2PNetwork] ICE candidate submission failed:", result.error);
          }
        } catch (error) {
          console.error("[P2PNetwork] Failed to send ICE candidate:", error);
        }
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;

      const state = this.pc.connectionState;
      console.log("P2P connection state:", state);

      switch (state) {
        case "connected":
          this.setStatus("connected");
          break;
        case "disconnected":
        case "failed":
        case "closed":
          this.setStatus("disconnected");
          break;
        case "connecting":
          this.setStatus("connecting");
          break;
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return;

      const iceState = this.pc.iceConnectionState;
      console.log("ICE state:", iceState);

      // Determine connection type based on ICE state
      let iceConnectionType: "direct" | "stun" | "turn" | undefined;
      let quality: ConnectionQuality = "fair";

      if (iceState === "connected" || iceState === "completed") {
        // Check if we're using relay (TURN) or direct/stun
        const hasLocalCandidate = this.pendingCandidates.some(
          (c) => c.candidate?.includes("srflx") || c.candidate?.includes("host"),
        );
        const hasRelayCandidate = this.pendingCandidates.some((c) =>
          c.candidate?.includes("relay"),
        );

        if (hasRelayCandidate) {
          iceConnectionType = "turn";
          quality = "fair";
        } else if (hasLocalCandidate) {
          iceConnectionType = "direct";
          quality = "excellent";
        } else {
          iceConnectionType = "stun";
          quality = "good";
        }
      } else if (iceState === "disconnected" || iceState === "failed") {
        quality = "poor";
      }

      // Update all peers with connection quality
      this.peers.forEach((peer) => {
        peer.connectionQuality = quality;
        peer.iceConnectionType = iceConnectionType;
      });
    };

    this.pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;

    channel.onopen = () => {
      console.log("Data channel opened");
      this.sendPendingCandidates();
    };

    channel.onclose = () => {
      console.log("Data channel closed");
      this.setStatus("disconnected");
    };

    channel.onerror = (error) => {
      console.error("Data channel error:", error);
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    };

    // State for receiving two-part messages
    let pendingSyncMetadata: {
      boardId: string;
      timestamp: number;
      senderId: string;
      sequence: number;
      byteLength: number;
    } | null = null;
    
    let pendingAutomergeMetadata: {
      targetPeerId: string;
      timestamp: number;
      senderId: string;
    } | null = null;

    channel.onmessage = (event) => {
      if (typeof event.data === "string") {
        // Metadata message
        try {
          const metadata = JSON.parse(event.data);
          if (metadata.type === "sync" && metadata.byteLength) {
            pendingSyncMetadata = metadata;
          } else if (metadata.type === "automerge") {
            console.log("[automerge] Received metadata from:", metadata.senderId, "target:", metadata.targetPeerId);
            pendingAutomergeMetadata = metadata;
          } else {
            this.handleMessage(event.data);
          }
        } catch (error) {
          console.warn("[message] Failed to parse metadata");
          this.handleMessage(event.data);
        }
      } else if (pendingSyncMetadata) {
        // Binary delta following sync metadata
        const delta = new Uint8Array(event.data);
        const syncMessage = {
          type: "sync" as const,
          boardId: pendingSyncMetadata.boardId,
          delta,
          timestamp: pendingSyncMetadata.timestamp,
          senderId: pendingSyncMetadata.senderId,
          sequence: pendingSyncMetadata.sequence,
        };
        pendingSyncMetadata = null;
        this.handleSyncMessage(syncMessage);
      } else if (pendingAutomergeMetadata) {
        // Binary data following automerge metadata
        const data = new Uint8Array(event.data);
        console.log("[automerge] Received binary data, size:", data.length);
        this.emit("message:received", {
          type: "automerge",
          targetPeerId: pendingAutomergeMetadata.targetPeerId,
          timestamp: pendingAutomergeMetadata.timestamp,
          senderId: pendingAutomergeMetadata.senderId,
          data,
        });
        console.log("[automerge] Emitted message:received event");
        pendingAutomergeMetadata = null;
      } else {
        // Other binary message
        this.handleMessage(event.data);
      }
    };
  }

  private handleMessage(data: string | ArrayBuffer): void {
    try {
      let parsed: unknown;

      if (typeof data === "string") {
        parsed = JSON.parse(data);
      } else {
        // Handle binary messages (sync deltas)
        this.emit("sync:received", new Uint8Array(data), "unknown");
        return;
      }

      const result = validateP2PMessage(parsed);
      if (!result.success) {
        console.warn("Invalid P2P message:", result.error);
        return;
      }

      const message = result.data;
      this.emit("message:received", message);

      // Handle specific message types
      switch (message.type) {
        case "sync":
          this.handleSyncMessage(message);
          break;
        case "sync:request":
          this.emit("sync:request", message.boardId, message.senderId);
          break;
        case "fullsync":
          this.handleFullSyncMessage(message);
          break;
        case "peer:join":
          this.handlePeerJoin(message);
          break;
        case "peer:leave":
          this.handlePeerLeave(message);
          break;
        case "chat":
          this.handleChatMessage(message);
          break;
        case "image:chunk":
          this.handleImageChunk(message);
          break;
        case "image:request":
          this.emit("image:request", message.imageId, message.senderId);
          break;
        case "image:complete":
          this.handleImageComplete(message);
          break;
        case "automerge":
          // Automerge message - binary data follows in channel.onmessage handler
          break;
      }
    } catch (error) {
      console.error("Failed to handle message:", error);
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async handleSyncMessage(message: SyncMessage): Promise<void> {
    // Rate limit sync messages
    const result = await p2pRateLimiter.executeWithRateLimit(message.senderId, async () => {
      // Validate timestamp
      const now = Date.now();
      const maxAge = 3600000; // 1 hour
      if (Math.abs(message.timestamp - now) > maxAge) {
        console.warn("[sync] Timestamp out of range");
        return false;
      }

      // Track sequence to detect missing messages
      const lastSeq = this.peerSequence.get(message.senderId) || 0;
      if (message.sequence <= lastSeq) {
        console.warn("[sync] Duplicate or out-of-order message, seq:", message.sequence);
        return false;
      }

      // Check for gaps in sequence
      const expectedSeq = lastSeq + 1;
      if (message.sequence !== expectedSeq) {
        console.warn("[sync] Sequence gap: expected", expectedSeq, "got", message.sequence);
      }

      this.peerSequence.set(message.senderId, message.sequence);
      this.emit("sync:received", message.delta, message.senderId);
      return true;
    });

    if (result === null) {
      console.warn("[sync] Rate limited");
    }
  }

  private handleFullSyncMessage(message: FullSyncMessage): void {
    console.log("[fullsync] Received document from:", message.senderId, "size:", message.document.length);
    this.emit("fullsync:received", message.document, message.senderId);
  }

  private handlePeerJoin(message: { peerId: string; peerName: string }): void {
    const peer: PeerInfo = {
      id: message.peerId,
      name: message.peerName,
      role: "client",
      connectedAt: Date.now(),
      capabilities: {
        canHost: true,
        canRelay: true,
        supportsVideo: false,
      },
    };

    this.peers.set(peer.id, peer);
    this.emit("peer:joined", peer);
  }

  private handlePeerLeave(message: { peerId: string }): void {
    const peer = this.peers.get(message.peerId);
    if (peer) {
      this.peers.delete(message.peerId);
      
      // Clean up any pending images from this peer
      for (const [key] of this.pendingImages) {
        if (key.endsWith(`-${message.peerId}`)) {
          this.pendingImages.delete(key);
          console.log("[P2PNetwork] Cleaned up pending image for leaving peer:", message.peerId);
        }
      }
      
      this.emit("peer:left", peer);
    }
  }

  private handleChatMessage(message: {
    type: "chat";
    boardId: string;
    content: string;
    timestamp: number;
    senderId: string;
  }): void {
    // Emit chat message event for hook to handle
    this.emit("chat:received", message, message.senderId);
  }

  private handleImageChunk(message: ImageChunkMessage): void {
    const key = `${message.imageId}-${message.senderId}`;
    let pending = this.pendingImages.get(key);

    if (!pending) {
      pending = {
        chunks: Array.from({ length: message.totalChunks }),
        totalChunks: message.totalChunks,
        receivedChunks: 0,
        imageId: message.imageId,
        senderId: message.senderId,
      };
      this.pendingImages.set(key, pending);
    }

    // Store chunk
    pending.chunks[message.chunkIndex] = message.data;
    pending.receivedChunks++;
    this.imageBytesReceived += message.data.length;

    // Check if all chunks received
    if (pending.receivedChunks === pending.totalChunks) {
      // Combine chunks into blob
      const blob = new Blob(pending.chunks, { type: "image/*" });
      this.emit("image:received", message.imageId, blob, message.senderId);
      this.pendingImages.delete(key);
    }
  }

  private handleImageComplete(message: { imageId: string; senderId: string }): void {
    // Clean up any pending image data
    const key = `${message.imageId}-${message.senderId}`;
    this.pendingImages.delete(key);
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.emit("status:changed", status);
  }

  /**
   * Create a new room as host
   */
  async createRoom(options?: {
    password?: string;
    maxPeers?: number;
    documentUrl?: string;
  }): Promise<{ code: string; room: P2PNetwork; documentUrl?: string }> {
    this.setStatus("connecting");

    // Create room on signaling server
    const roomInfo = await createRoomFn({
      data: {
        peerId: this.id,
        peerName: this.options.peerName,
        password: options?.password,
        maxPeers: options?.maxPeers,
        documentUrl: options?.documentUrl,
      },
    });

    this.currentRoomCode = roomInfo.code;
    this.isHost = true;

    // Create data channel for hosting
    this.dataChannel = this.pc?.createDataChannel("tierboard", {
      ordered: true,
      reliable: true,
    });

    if (this.dataChannel) {
      this.setupDataChannel(this.dataChannel);
    }

    // Create SDP offer
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await this.waitForIceGathering();

    // Submit offer to signaling server (convert to plain object for serialization)
    const localDesc = this.pc!.localDescription!;
    await submitOffer({
      data: {
        code: roomInfo.code,
        offer: { type: localDesc.type, sdp: localDesc.sdp },
      },
    });

    // Start polling for client answer
    this.startAnswerPolling(roomInfo.code);

    // Start polling for ICE candidates
    this.startCandidatePolling(roomInfo.code);

    // Add self as peer
    this.peers.set(this.id, {
      id: this.id,
      name: this.options.peerName || "You",
      role: "host",
      connectedAt: Date.now(),
      capabilities: {
        canHost: true,
        canRelay: true,
        supportsVideo: false,
      },
    });

    this.setStatus("connected");

    return { code: roomInfo.code, room: this, documentUrl: roomInfo.documentUrl };
  }

  /**
   * Join an existing room as client
   */
  async joinRoom(code: string, options?: { password?: string }): Promise<{ room: P2PNetwork; documentUrl?: string | null }> {
    this.setStatus("connecting");
    this.currentRoomCode = code;
    this.isHost = false;

    try {
      // Join room on signaling server and get document URL
      const joinResult = await joinRoomFn({
        data: {
          code,
          peerId: this.id,
          password: options?.password,
        },
      });

      // Poll for host offer
      const offerResult = await this.pollForOffer(code);
      if (!offerResult.offer) {
        throw new Error("No offer found from host");
      }

      // Set remote description (host's offer)
      await this.pc!.setRemoteDescription(new RTCSessionDescription(offerResult.offer));

      // Create answer
      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Submit answer to signaling server (convert to plain object for serialization)
      const localDesc = this.pc!.localDescription!;
      await submitAnswer({
        data: {
          code,
          answer: { type: localDesc.type, sdp: localDesc.sdp },
        },
      });

      // Send ICE candidates
      await this.sendCandidates(code);

      // Poll for host candidates
      this.startCandidatePolling(code);

      // Wait for connection to establish
      await this.waitForConnection();

      // Notify host that we've joined
      this.sendMessage({
        type: "peer:join",
        peerId: this.id,
        peerName: this.options.peerName || "Peer",
        timestamp: Date.now(),
      });

      // Add self as peer
      this.peers.set(this.id, {
        id: this.id,
        name: this.options.peerName || "You",
        role: "client",
        connectedAt: Date.now(),
        capabilities: {
          canHost: true,
          canRelay: true,
          supportsVideo: false,
        },
      });

      return { room: this, documentUrl: joinResult.documentUrl };
    } catch (error) {
      console.error("Failed to join room:", error);
      this.setStatus("failed");
      throw error;
    }
  }

  /**
   * Leave the current room
   */
  async leaveRoom(): Promise<void> {
    // Notify signaling server
    if (this.currentRoomCode) {
      try {
        await leaveRoomFn({
          data: {
            code: this.currentRoomCode,
            peerId: this.id,
          },
        });
      } catch (error) {
        console.error("Failed to notify signaling server:", error);
      }
    }

    // Stop polling
    this.stopPolling();

    // Notify peers
    this.sendMessage({
      type: "peer:leave",
      peerId: this.id,
      timestamp: Date.now(),
    });

    // Close connections
    this.dataChannel?.close();
    this.pc?.close();

    // Reset state
    this.dataChannel = null;
    this.pc = null;
    this.peers.clear();
    this.pendingCandidates = [];
    this.currentRoomCode = null;
    this.isHost = false;
    this.peerSequence.clear();
    this.pendingImages.clear();
    this.imageBytesSent = 0;
    this.imageBytesReceived = 0;
    this.sequence = 0;
    this.setStatus("disconnected");

    // Reinitialize for next use
    this.initializePeerConnection();
  }

  /**
   * Kick a peer from the room (host only)
   */
  async kickPeer(peerId: string): Promise<void> {
    if (!this.currentRoomCode || !this.isHost) {
      throw new Error("Only host can kick peers");
    }

    try {
      await kickPeerFn({
        data: {
          code: this.currentRoomCode,
          peerId,
          hostId: this.id,
        },
      });

      // Notify kicked peer via data channel
      this.sendMessage({
        type: "peer:leave",
        peerId,
        timestamp: Date.now(),
      });

      // Remove from local peers map
      this.peers.delete(peerId);
    } catch (error) {
      console.error("Failed to kick peer:", error);
      throw error;
    }
  }

  /**
   * Close the room (host only) - removes all peers
   */
  async closeRoom(): Promise<void> {
    if (!this.currentRoomCode || !this.isHost) {
      throw new Error("Only host can close room");
    }

    // Notify all peers
    for (const peer of this.peers.values()) {
      if (peer.id !== this.id) {
        this.sendMessage({
          type: "peer:leave",
          peerId: peer.id,
          timestamp: Date.now(),
        });
      }
    }

    // Leave room (will delete it since host is leaving)
    await this.leaveRoom();
  }

  /**
   * Wait for ICE gathering to complete
   */
  private async waitForIceGathering(timeout: number = 5000): Promise<void> {
    if (!this.pc) return;

    if (this.pc.iceGatheringState === "complete") {
      return;
    }

    return new Promise((resolve, _reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        resolve(); // Resolve anyway after timeout
      }, timeout);

      const checkState = () => {
        if (this.pc?.iceGatheringState === "complete") {
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        this.pc?.removeEventListener("icegatheringstatechange", checkState);
      };

      this.pc.addEventListener("icegatheringstatechange", checkState);
    });
  }

  /**
   * Poll for host offer (client side)
   */
  private async pollForOffer(
    code: string,
    maxAttempts: number = 60,
    interval: number = 500,
  ): Promise<{ offer: RTCSessionDescriptionInit | null }> {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await getOffer({ data: { code } });
      if (result.offer) {
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error("Timeout waiting for host offer");
  }

  /**
   * Poll for client answer (host side)
   */
  private startAnswerPolling(code: string): void {
    let answered = false;
    
    const poll = async () => {
      // Stop if already received answer
      if (answered) return;
      
      const result = await getAnswer({ data: { code } });
      if (result.answer && this.pc) {
        // Check if we're in a valid state to set remote description
        const signalingState = this.pc.signalingState;
        if (signalingState === "stable") {
          // Already connected, stop polling
          answered = true;
          if (this.answerPollInterval) {
            clearInterval(this.answerPollInterval);
            this.answerPollInterval = null;
          }
          return;
        }
        
        try {
          await this.pc.setRemoteDescription(new RTCSessionDescription(result.answer));
          console.log("[P2PNetwork] Received answer from client");
          answered = true;
          
          // Stop polling once we have the answer
          if (this.answerPollInterval) {
            clearInterval(this.answerPollInterval);
            this.answerPollInterval = null;
          }
        } catch (error) {
          console.error("[P2PNetwork] Failed to set remote description:", error);
        }
      }
    };

    // Initial poll
    poll();

    // Continue polling every 500ms
    this.answerPollInterval = setInterval(poll, 500);
  }

  /**
   * Poll for ICE candidates
   */
  private startCandidatePolling(code: string): void {
    const from: "host" | "client" = this.isHost ? "client" : "host";
    const seenCandidates = new Set<string>();

    const poll = async () => {
      const result = await getCandidates({ data: { code, from } });
      if (result.candidates && result.candidates.length > 0 && this.pc) {
        for (const candidate of result.candidates) {
          // Create a unique key for deduplication
          const candidateKey = JSON.stringify(candidate);
          if (seenCandidates.has(candidateKey)) continue;
          seenCandidates.add(candidateKey);

          try {
            await this.pc.addIceCandidate(candidate);
          } catch (error) {
            // Ignore errors for already-added candidates or when connection is stable
            if (!(error as DOMException)?.message?.includes("InvalidStateError")) {
              console.error("[P2PNetwork] Failed to add ICE candidate:", error);
            }
          }
        }
      }
      
      // Stop polling if connection is established
      if (this.pc?.connectionState === "connected") {
        if (this.candidatePollInterval) {
          clearInterval(this.candidatePollInterval);
          this.candidatePollInterval = null;
        }
      }
    };

    // Initial poll
    poll();

    // Continue polling every 1000ms
    this.candidatePollInterval = setInterval(poll, 1000);
  }

  /**
   * Stop all polling
   */
  private stopPolling(): void {
    if (this.answerPollInterval) {
      clearInterval(this.answerPollInterval);
      this.answerPollInterval = null;
    }
    if (this.candidatePollInterval) {
      clearInterval(this.candidatePollInterval);
      this.candidatePollInterval = null;
    }
  }

  /**
   * Send ICE candidates to signaling server
   */
  private async sendCandidates(code: string): Promise<void> {
    if (!this.pc) return;

    // Send any pending candidates
    for (const candidate of this.pendingCandidates) {
      await submitCandidate({
        data: {
          code,
          candidate,
          from: this.isHost ? "host" : "client",
        },
      });
    }
    this.pendingCandidates = [];
  }

  /**
   * Wait for connection to establish
   */
  private async waitForConnection(timeout: number = 10000): Promise<void> {
    if (!this.pc) return;

    if (this.pc.connectionState === "connected") {
      return;
    }

    return new Promise((resolve, _reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        resolve();
      }, timeout);

      const checkState = () => {
        if (this.pc?.connectionState === "connected") {
          cleanup();
          resolve();
        } else if (this.pc?.connectionState === "failed") {
          cleanup();
          reject(new Error("Connection failed"));
        }
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        this.pc?.removeEventListener("connectionstatechange", checkState);
      };

      this.pc.addEventListener("connectionstatechange", checkState);
    });
  }

  /**
   * Get current room code
   */
  getRoomCode(): string | null {
    return this.currentRoomCode;
  }

  /**
   * Check if this peer is the host
   */
  getIsHost(): boolean {
    return this.isHost;
  }

  /**
   * Get the name of this peer
   */
  getPeerName(): string {
    return this.options.peerName || "Anonymous";
  }

  /**
   * Get connected peers
   */
  getPeers(): PeerInfo[] {
    return Array.from(this.peers.values());
  }

  /**
   * Check if data channel is open and ready for sending
   */
  isDataChannelOpen(): boolean {
    return this.dataChannel?.readyState === "open";
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Send sync delta to all peers
   */
  sendSync(boardId: string, delta: Uint8Array): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      console.warn("[sync] Cannot send - channel not ready");
      return;
    }

    const sequence = ++this.sequence;
    const timestamp = Date.now();

    const metadata = {
      type: "sync",
      boardId,
      timestamp,
      senderId: this.id,
      sequence,
      byteLength: delta.length,
    };

    try {
      this.dataChannel.send(JSON.stringify(metadata));
      this.dataChannel.send(delta);
    } catch (error) {
      console.error("[sync] Send failed:", error instanceof Error ? error.message : String(error));
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Request full sync from peer (for initial sync when joining)
   */
  requestSync(boardId: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      console.warn("[sync] Cannot request - channel not ready");
      return;
    }

    const message = {
      type: "sync:request" as const,
      boardId,
      timestamp: Date.now(),
      senderId: this.id,
    };

    try {
      this.dataChannel.send(JSON.stringify(message));
      console.log("[sync] Sent sync request for board:", boardId);
    } catch (error) {
      console.error("[sync] Request failed:", error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Send full document to a specific peer (in response to sync:request)
   */
  sendFullDocument(boardId: string, document: Uint8Array, targetPeerId: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      console.warn("[sync] Cannot send - channel not ready");
      return;
    }

    const timestamp = Date.now();

    const message = {
      type: "fullsync" as const,
      boardId,
      document,
      timestamp,
      senderId: this.id,
    };

    try {
      this.dataChannel.send(JSON.stringify(message));
      console.log("[fullsync] Sent full document:", document.length, "bytes to", targetPeerId);
    } catch (error) {
      console.error("[sync] Full document send failed:", error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Send chat message to peers
   */
  sendChatMessage(boardId: string, content: string): void {
    this.sendMessage({
      type: "chat",
      boardId,
      content,
      timestamp: Date.now(),
      senderId: this.id,
    });
  }

  /**
   * Send image to peers (chunked transfer)
   */
  async sendImage(imageId: string, blob: Blob): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      console.warn("Cannot send image - data channel not ready");
      return;
    }

    const CHUNK_SIZE = 16384; // 16KB chunks
    const bytes = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(bytes);
    const totalChunks = Math.ceil(bytes.byteLength / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const chunk = uint8Array.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const message: ImageChunkMessage = {
        type: "image:chunk",
        imageId,
        chunkIndex: i,
        totalChunks,
        data: chunk,
        senderId: this.id,
      };

      try {
        // Send metadata as JSON
        this.dataChannel.send(JSON.stringify(message));
        // Send binary chunk
        this.dataChannel.send(chunk);
        this.imageBytesSent += chunk.length;

        // Small delay to avoid overwhelming the channel
        await new Promise((resolve) => setTimeout(resolve, 5));
      } catch (error) {
        console.error("Failed to send image chunk:", error);
        this.emit("error", error instanceof Error ? error : new Error(String(error)));
        return;
      }
    }

    // Send completion notification
    this.sendMessage({
      type: "image:complete",
      imageId,
      senderId: this.id,
    });
  }

  /**
   * Request image from peers
   */
  requestImage(imageId: string): void {
    this.sendMessage({
      type: "image:request",
      imageId,
      senderId: this.id,
    });
  }

  /**
   * Send Automerge sync message to specific peer
   * In 1:1 mode, this broadcasts to the single connected peer
   * In multi-peer mode, this sends to all peers (or specific peer if targetPeerId matches)
   * 
   * Note: We broadcast to all peers because Automerge peer IDs don't match P2PNetwork IDs.
   * The receiving side filters based on the targetPeerId in the message metadata.
   */
  sendAutomergeMessage(targetPeerId: string, data: Uint8Array): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      console.warn("[automerge] Cannot send - channel not ready, state:", this.dataChannel?.readyState);
      console.log("[automerge] Data channel:", this.dataChannel ? "exists" : "null");
      console.log("[automerge] Peers:", Array.from(this.peers.keys()));
      return;
    }

    const message = {
      type: "automerge" as const,
      targetPeerId,  // This is the Automerge peer ID, not P2PNetwork ID
      timestamp: Date.now(),
      senderId: this.id,
    };

    try {
      console.log("[automerge] Broadcasting message to:", targetPeerId, "size:", data.length, "peers count:", this.peers.size);
      // Send metadata first
      this.dataChannel.send(JSON.stringify(message));
      // Send binary data
      this.dataChannel.send(data);
      console.log("[automerge] Message broadcast successfully");
    } catch (error) {
      console.error("[automerge] Broadcast failed:", error instanceof Error ? error.message : String(error));
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Send generic P2P message
   */
  sendMessage(message: P2PMessage): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      console.warn("Cannot send message - data channel not ready");
      return;
    }

    try {
      this.dataChannel.send(JSON.stringify(message));
    } catch (error) {
      console.error("Failed to send message:", error);
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    }
  }

  private sendPendingCandidates(): void {
    for (const candidate of this.pendingCandidates) {
      this.sendMessage({
        type: "ice:candidate",
        candidate,
        senderId: this.id,
      });
    }
    this.pendingCandidates = [];
  }

  /**
   * Get sync statistics
   */
  getStats(): SyncStats {
    return {
      peers: this.peers.size,
      bytesSent: this.imageBytesSent,
      bytesReceived: this.imageBytesReceived,
      lastSyncAt: Date.now(),
    };
  }

  /**
   * Destroy the P2P network instance
   */
  destroy(): void {
    this.leaveRoom();
    this.removeAllListeners();
    p2pRateLimiter.cleanup(this.id);
  }
}
