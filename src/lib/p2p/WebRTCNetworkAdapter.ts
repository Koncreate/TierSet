import { NetworkAdapter, type PeerMetadata, type Message } from "@automerge/automerge-repo";
import type { P2PNetwork } from "./P2PNetwork";

/**
 * WebRTC Network Adapter for Automerge Repo
 *
 * This adapter wraps an existing P2PNetwork instance to provide Automerge-compatible networking.
 * The Repo handles all sync logic automatically - we just transport messages.
 *
 * Usage:
 * ```ts
 * const { network } = useP2PNetwork();
 * const adapter = new WebRTCNetworkAdapter(network);
 * repo.networkSubsystem.addNetworkAdapter(adapter);
 * ```
 */
export class WebRTCNetworkAdapter extends NetworkAdapter {
  private p2pNetwork: P2PNetwork | null = null;
  private messageQueue: Map<string, Uint8Array[]> = new Map();
  private cleanupHandlers: Array<() => void> = [];
  private ready = false;

  constructor(p2pNetwork?: P2PNetwork) {
    super();
    if (p2pNetwork) {
      this.p2pNetwork = p2pNetwork;
    }
  }

  /**
   * Check if the adapter is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Wait for the adapter to be ready
   */
  async whenReady(): Promise<void> {
    if (this.ready) return;
    return new Promise((resolve) => {
      const onReady = () => {
        this.off("ready" as any, onReady);
        resolve();
      };
      this.on("ready" as any, onReady);
    });
  }

  /**
   * Connect to the P2P network
   * The peerId comes from the Repo, we use it to identify ourselves
   */
  connect(peerId: string, _peerMetadata?: PeerMetadata): void {
    console.log("[WebRTCNetworkAdapter] Connect called with peerId:", peerId);
    this.peerId = peerId as any;
    this.ready = true;
    this.emit("ready" as any);
  }

  /**
   * Attach an existing P2PNetwork instance
   * Call this after construction or connect() when you have a P2PNetwork from useP2PNetwork()
   */
  attachP2PNetwork(network: P2PNetwork): void {
    console.log("[WebRTCNetworkAdapter] Attaching P2PNetwork");
    this.p2pNetwork = network;

    // Notify Repo about all existing peers
    const existingPeers = network.getPeers();
    if (existingPeers.length > 0) {
      console.log("[WebRTCNetworkAdapter] Notifying about", existingPeers.length, "existing peers");
      for (const peer of existingPeers) {
        this.emit("peer-candidate", {
          peerId: peer.id as any,
          peerMetadata: { isEphemeral: true },
        });
      }
    }

    // Set up message handler - forward received automerge messages to Repo
    const handleMessage = (message: any) => {
      if (message.type === "automerge" && message.data) {
        console.log("[WebRTCNetworkAdapter] Received automerge message from:", message.senderId, "size:", message.data.length);
        const repoMessage = {
          senderId: message.senderId as any,
          targetId: undefined as any,
          data: new Uint8Array(message.data),
        } as unknown as Message;
        console.log("[WebRTCNetworkAdapter] Emitting message event to Repo");
        this.emit("message", repoMessage);
        console.log("[WebRTCNetworkAdapter] Message event emitted");
      }
    };

    // Handle peer events
    const handlePeerJoined = (peer: any) => {
      console.log("[WebRTCNetworkAdapter] Peer joined:", peer.id);
      this.emit("peer-candidate", {
        peerId: peer.id as any,
        peerMetadata: { isEphemeral: true },
      });
    };

    const handlePeerLeft = (peer: any) => {
      console.log("[WebRTCNetworkAdapter] Peer left:", peer.id);
      this.emit("peer-disconnected", {
        peerId: peer.id as any,
      });
    };

    const handleStatusChanged = (status: string) => {
      console.log("[WebRTCNetworkAdapter] Status changed:", status);
      if (status === "connected" && !this.ready) {
        this.ready = true;
        this.emit("ready" as any);
      } else if (status === "disconnected" || status === "failed") {
        this.ready = false;
        // Emit disconnect for all peers
        this.p2pNetwork?.getPeers().forEach((peer) => {
          this.emit("peer-disconnected", {
            peerId: peer.id as any,
          });
        });
      }
    };

    // Register listeners
    network.on("message:received", handleMessage);
    network.on("peer:joined", handlePeerJoined);
    network.on("peer:left", handlePeerLeft);
    network.on("status:changed", handleStatusChanged);

    // Store cleanup handlers
    this.cleanupHandlers = [
      () => network.off("message:received", handleMessage),
      () => network.off("peer:joined", handlePeerJoined),
      () => network.off("peer:left", handlePeerLeft),
      () => network.off("status:changed", handleStatusChanged),
    ];

    // If already connected, emit ready
    if (network.getStatus() === "connected") {
      this.ready = true;
      this.emit("ready" as any);
    }
  }

  /**
   * Disconnect from the P2P network
   */
  disconnect(): void {
    console.log("[WebRTCNetworkAdapter] Disconnecting");

    // Clean up event listeners
    for (const cleanup of this.cleanupHandlers) {
      cleanup();
    }
    this.cleanupHandlers = [];

    this.ready = false;
    this.p2pNetwork = null;
    this.emit("close");
  }

  /**
   * Send a message to a specific peer
   */
  send(message: Message): void {
    if (!this.p2pNetwork) {
      console.warn("[WebRTCNetworkAdapter] Cannot send - not connected");
      return;
    }

    const targetPeerId = message.targetId;
    if (!targetPeerId) {
      console.warn("[WebRTCNetworkAdapter] No target peerId in message");
      return;
    }

    if (!message.data) {
      console.warn("[WebRTCNetworkAdapter] No data in message");
      return;
    }

    console.log("[WebRTCNetworkAdapter] Sending message to:", targetPeerId, "size:", message.data.length);

    // Send via P2PNetwork data channel
    this.p2pNetwork.sendAutomergeMessage(targetPeerId as any, message.data);
  }

  /**
   * Get the underlying P2PNetwork instance
   */
  getP2PNetwork(): P2PNetwork | null {
    return this.p2pNetwork;
  }

  /**
   * Get connected peers
   */
  getPeers(): Array<{ id: string; name: string }> {
    if (!this.p2pNetwork) return [];
    return this.p2pNetwork.getPeers().map((peer) => ({
      id: peer.id,
      name: peer.name,
    }));
  }

  /**
   * Flush queued messages (called after connection is established)
   */
  flushMessageQueue(peerId: string): void {
    const queue = this.messageQueue.get(peerId);
    if (!queue || !this.p2pNetwork) return;

    console.log("[WebRTCNetworkAdapter] Flushing", queue.length, "queued messages to:", peerId);

    for (const message of queue) {
      this.p2pNetwork.sendAutomergeMessage(peerId, message);
    }

    this.messageQueue.delete(peerId);
  }
}
