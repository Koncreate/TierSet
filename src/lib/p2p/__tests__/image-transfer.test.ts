/**
 * Image Transfer Unit Tests
 * ==========================
 *
 * These tests cover the image chunking, transfer, and reassembly functionality
 * in the P2PNetwork module. They verify:
 * - Image chunking into 16KB pieces
 * - Chunk reassembly on receiver side
 * - Missing chunk detection/recovery
 * - Progress tracking during transfer
 * - Bytes sent/received statistics
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { P2PNetwork } from "../P2PNetwork";

// ============================================================================
// WebRTC API Mocks
// ============================================================================

class MockRTCDataChannel {
  readyState: "connecting" | "open" | "closing" | "closed" = "connecting";
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(public label: string) {
    setTimeout(() => {
      this.readyState = "open";
      this.onopen?.();
    }, 10);
  }

  send(_data: string | ArrayBuffer | Blob): void {}
  close(): void {
    this.readyState = "closed";
  }
}

class MockRTCSessionDescription implements RTCSessionDescription {
  type: RTCSdpType;
  sdp: string;
  constructor(init: RTCSessionDescriptionInit) {
    this.type = init.type || "offer";
    this.sdp = init.sdp || "";
  }
  toJSON(): RTCSessionDescriptionInit {
    return { type: this.type, sdp: this.sdp };
  }
}

class MockRTCPeerConnection {
  iceGatheringState: RTCIceGatheringState = "complete";
  iceConnectionState: RTCIceConnectionState = "connected";
  connectionState: RTCPeerConnectionState = "connected";
  localDescription: RTCSessionDescription | null = null;

  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;

  private static instances: MockRTCPeerConnection[] = [];
  constructor() {
    MockRTCPeerConnection.instances.push(this);
  }
  static wasCalled(): boolean {
    return MockRTCPeerConnection.instances.length > 0;
  }
  static clearInstances(): void {
    MockRTCPeerConnection.instances = [];
  }

  createDataChannel(label: string): RTCDataChannel {
    return new MockRTCDataChannel(label) as unknown as RTCDataChannel;
  }
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "v=0\r\no=- offer" };
  }
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: "v=0\r\no=- answer" };
  }
  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc as RTCSessionDescription;
  }
  async setRemoteDescription(_desc: RTCSessionDescriptionInit): Promise<void> {
    this.connectionState = "connected";
    this.iceConnectionState = "connected";
    this.onconnectionstatechange?.();
  }
  async addIceCandidate(): Promise<void> {}
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {
    this.connectionState = "closed";
  }
}

beforeAll(() => {
  // @ts-expect-error - Mocking
  global.RTCPeerConnection = MockRTCPeerConnection;
  // @ts-expect-error - Mocking
  global.RTCDataChannel = MockRTCDataChannel;
  // @ts-expect-error - Mocking
  global.RTCSessionDescription = MockRTCSessionDescription;
});

afterAll(() => {
  // @ts-expect-error - Restoring
  global.RTCPeerConnection = undefined;
  // @ts-expect-error - Restoring
  global.RTCDataChannel = undefined;
  // @ts-expect-error - Restoring
  global.RTCSessionDescription = undefined;
  MockRTCPeerConnection.clearInstances();
});

const waitFor = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a test image blob of specified size
 */
function createTestBlob(sizeInBytes: number): Blob {
  const uint8Array = new Uint8Array(sizeInBytes);
  // Fill with predictable pattern for verification
  for (let i = 0; i < sizeInBytes; i++) {
    uint8Array[i] = i % 256;
  }
  const blob = new Blob([uint8Array], { type: "image/png" });
  // Polyfill arrayBuffer() for jsdom
  if (!blob.arrayBuffer) {
    (blob as any).arrayBuffer = async () => uint8Array.buffer;
  }
  return blob;
}

/**
 * Get array buffer from blob (with jsdom polyfill support)
 */
async function getBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (blob.arrayBuffer) {
    return await blob.arrayBuffer();
  }
  // Fallback for jsdom
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Extract sent data from mock data channel
 */
function extractSentData(sentData: Array<string | ArrayBuffer | Blob>): {
  metadata: any;
  binary: Uint8Array;
} {
  const metadata = JSON.parse(sentData[0] as string);
  const binary = sentData[1] as Uint8Array;
  return { metadata, binary };
}

// ============================================================================
// Tests
// ============================================================================

describe("Image Transfer", () => {
  let network: P2PNetwork;
  let sentData: Array<string | ArrayBuffer | Blob> = [];
  let mockDataChannel: MockRTCDataChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    MockRTCPeerConnection.clearInstances();
    sentData = [];
    network = new P2PNetwork({ peerName: "TestPeer" });

    // Mock the data channel to capture sent data
    mockDataChannel = new MockRTCDataChannel("tierboard");
    const originalSend = mockDataChannel.send.bind(mockDataChannel);
    mockDataChannel.send = (data: string | ArrayBuffer | Blob) => {
      sentData.push(data);
      originalSend(data);
    };

    // Force data channel to open state
    mockDataChannel.readyState = "open";
    // @ts-expect-error - Accessing private property for testing
    network.dataChannel = mockDataChannel;
    // @ts-expect-error - Accessing private property for testing
    network.pc = new MockRTCPeerConnection();
  });

  afterEach(async () => {
    network?.destroy();
    sentData = [];
    await waitFor(50);
  });

  describe("Image Chunking", () => {
    it("should chunk small image into single chunk", async () => {
      const imageSize = 1000; // 1KB - smaller than 16KB chunk size
      const blob = createTestBlob(imageSize);
      const imageId = "test-image-1";

      await network.sendImage(imageId, blob);

      // Should send metadata + binary (2 sends) + complete message (1 send)
      expect(sentData.length).toBe(3);
      const { metadata } = extractSentData(sentData);

      expect(metadata).toMatchObject({
        type: "image:chunk",
        imageId,
        chunkIndex: 0,
        totalChunks: 1,
      });
    });

    it("should chunk large image into multiple 16KB chunks", async () => {
      const CHUNK_SIZE = 16384;
      const imageSize = CHUNK_SIZE * 3 + 5000; // ~53KB - should create 4 chunks
      const blob = createTestBlob(imageSize);
      const imageId = "test-image-large";

      sentData = []; // Reset to count accurately
      await network.sendImage(imageId, blob);

      const expectedChunks = Math.ceil(imageSize / CHUNK_SIZE);
      // Each chunk sends metadata + binary (2 sends per chunk) + complete message
      expect(sentData.length).toBe(expectedChunks * 2 + 1);

      // Verify first chunk metadata
      const { metadata: firstMetadata } = extractSentData(sentData.slice(0, 2));
      expect(firstMetadata.chunkIndex).toBe(0);
      expect(firstMetadata.totalChunks).toBe(expectedChunks);

      // Verify last chunk metadata
      const lastChunkStart = (expectedChunks - 1) * 2;
      const { metadata: lastMetadata } = extractSentData(
        sentData.slice(lastChunkStart, lastChunkStart + 2),
      );
      expect(lastMetadata.chunkIndex).toBe(expectedChunks - 1);
    });

    it("should use exactly 16KB chunk size", async () => {
      const CHUNK_SIZE = 16384;
      const imageSize = CHUNK_SIZE * 2; // Exactly 2 chunks
      const blob = createTestBlob(imageSize);

      sentData = [];
      await network.sendImage("test", blob);

      // Check second chunk size (should be exactly 16KB)
      const secondChunkBinary = sentData[3] as Uint8Array;
      expect(secondChunkBinary.byteLength).toBe(CHUNK_SIZE);
    });

    it("should handle exact chunk boundary (16KB exactly)", async () => {
      const CHUNK_SIZE = 16384;
      const blob = createTestBlob(CHUNK_SIZE);

      sentData = [];
      await network.sendImage("test-exact", blob);

      // Should be exactly 1 chunk (metadata + binary) + complete message
      expect(sentData.length).toBe(3);
      const { metadata } = extractSentData(sentData);
      expect(metadata.totalChunks).toBe(1);
      expect(metadata.chunkIndex).toBe(0);
    });
  });

  describe("Chunk Reassembly", () => {
    it("should reassemble image from chunks", async () => {
      const receiver = new P2PNetwork({ peerName: "ReceiverPeer" });
      const imageSize = 5000;
      const originalBlob = createTestBlob(imageSize);
      const imageId = "test-reassemble";
      const senderId = "sender-123";

      let receivedBlob: Blob | null = null;
      let receivedImageId: string | null = null;

      receiver.on("image:received", (imgId: string, blob: Blob) => {
        receivedBlob = blob;
        receivedImageId = imgId;
      });

      // Simulate receiving chunks
      const uint8Array = new Uint8Array(await getBlobArrayBuffer(originalBlob));
      const totalChunks = 1;

      const chunkMessage = {
        type: "image:chunk" as const,
        imageId,
        chunkIndex: 0,
        totalChunks,
        data: uint8Array,
        senderId,
      };

      // Simulate data channel message
      // @ts-expect-error - Accessing private method for testing
      receiver.handleImageChunk(chunkMessage);

      expect(receivedBlob).not.toBeNull();
      expect(receivedImageId).toBe(imageId);

      // Verify blob content
      const receivedArray = await getBlobArrayBuffer(receivedBlob!);
      const originalArray = await getBlobArrayBuffer(originalBlob);
      expect(new Uint8Array(receivedArray)).toEqual(new Uint8Array(originalArray));

      receiver.destroy();
    });

    it("should reassemble multi-chunk image in correct order", async () => {
      const receiver = new P2PNetwork({ peerName: "ReceiverPeer" });
      const CHUNK_SIZE = 16384;
      const imageSize = CHUNK_SIZE * 3;
      const originalBlob = createTestBlob(imageSize);
      const imageId = "test-multi-chunk";
      const senderId = "sender-456";

      let receivedBlob: Blob | null = null;

      receiver.on("image:received", (_imgId: string, blob: Blob) => {
        receivedBlob = blob;
      });

      const uint8Array = new Uint8Array(await getBlobArrayBuffer(originalBlob));
      const totalChunks = 3;

      // Simulate receiving chunks out of order: 2, 0, 1
      const chunkOrder = [2, 0, 1];

      for (const index of chunkOrder) {
        const chunk = uint8Array.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
        const chunkMessage = {
          type: "image:chunk" as const,
          imageId,
          chunkIndex: index,
          totalChunks,
          data: chunk,
          senderId,
        };
        // @ts-expect-error - Accessing private method for testing
        receiver.handleImageChunk(chunkMessage);
      }

      expect(receivedBlob).not.toBeNull();

      // Verify content matches original
      const receivedArray = await getBlobArrayBuffer(receivedBlob!);
      const originalArray = await getBlobArrayBuffer(originalBlob);
      expect(new Uint8Array(receivedArray)).toEqual(new Uint8Array(originalArray));

      receiver.destroy();
    });

    it("should emit event only after all chunks received", async () => {
      const receiver = new P2PNetwork({ peerName: "ReceiverPeer" });
      const CHUNK_SIZE = 16384;
      const imageSize = CHUNK_SIZE * 3;
      const originalBlob = createTestBlob(imageSize);
      const imageId = "test-partial";
      const senderId = "sender-789";

      let emitCount = 0;
      receiver.on("image:received", () => {
        emitCount++;
      });

      const uint8Array = new Uint8Array(await getBlobArrayBuffer(originalBlob));
      const totalChunks = 3;

      // Send first 2 chunks - should not emit yet
      for (let i = 0; i < 2; i++) {
        const chunk = uint8Array.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const chunkMessage = {
          type: "image:chunk" as const,
          imageId,
          chunkIndex: i,
          totalChunks,
          data: chunk,
          senderId,
        };
        // @ts-expect-error - Accessing private method for testing
        receiver.handleImageChunk(chunkMessage);
      }

      expect(emitCount).toBe(0);

      // Send last chunk - should emit now
      const lastChunk = uint8Array.slice(2 * CHUNK_SIZE);
      const chunkMessage = {
        type: "image:chunk" as const,
        imageId,
        chunkIndex: 2,
        totalChunks,
        data: lastChunk,
        senderId,
      };
      // @ts-expect-error - Accessing private method for testing
      receiver.handleImageChunk(chunkMessage);

      expect(emitCount).toBe(1);

      receiver.destroy();
    });
  });

  describe("Missing Chunk Handling", () => {
    it("should track pending images by imageId and senderId", async () => {
      const receiver = new P2PNetwork({ peerName: "ReceiverPeer" });
      const imageId = "test-pending";
      const senderId1 = "sender-1";
      const senderId2 = "sender-2";

      // Send first chunk from sender 1
      const chunkMessage1 = {
        type: "image:chunk" as const,
        imageId,
        chunkIndex: 0,
        totalChunks: 2,
        data: new Uint8Array(100),
        senderId: senderId1,
      };

      // @ts-expect-error - Accessing private property for testing
      receiver.handleImageChunk(chunkMessage1);

      // @ts-expect-error - Accessing private property for testing
      const pendingImages = receiver.pendingImages;
      expect(pendingImages.has(`${imageId}-${senderId1}`)).toBe(true);
      expect(pendingImages.has(`${imageId}-${senderId2}`)).toBe(false);

      receiver.destroy();
    });

    it("should initialize pending image state on first chunk", async () => {
      const receiver = new P2PNetwork({ peerName: "ReceiverPeer" });
      const imageId = "test-init";
      const senderId = "sender-init";

      const chunkMessage = {
        type: "image:chunk" as const,
        imageId,
        chunkIndex: 0,
        totalChunks: 3,
        data: new Uint8Array(100),
        senderId,
      };

      // @ts-expect-error - Accessing private method for testing
      receiver.handleImageChunk(chunkMessage);

      // @ts-expect-error - Accessing private property for testing
      const pending = receiver.pendingImages.get(`${imageId}-${senderId}`);
      expect(pending).toBeDefined();
      expect(pending.totalChunks).toBe(3);
      expect(pending.receivedChunks).toBe(1);
      expect(pending.chunks.length).toBe(3);
      expect(pending.chunks[0]).toBeDefined();

      receiver.destroy();
    });

    it("should handle duplicate chunks gracefully", async () => {
      const receiver = new P2PNetwork({ peerName: "ReceiverPeer" });
      const imageId = "test-duplicate";
      const senderId = "sender-dup";

      const chunkMessage = {
        type: "image:chunk" as const,
        imageId,
        chunkIndex: 0,
        totalChunks: 3, // Set to 3 so duplicates don't trigger completion
        data: new Uint8Array(100),
        senderId,
      };

      // Send same chunk twice
      // @ts-expect-error - Accessing private method for testing
      receiver.handleImageChunk(chunkMessage);
      // @ts-expect-error - Accessing private method for testing
      receiver.handleImageChunk(chunkMessage);

      // @ts-expect-error - Accessing private property for testing
      const pending = receiver.pendingImages.get(`${imageId}-${senderId}`);
      // Should still track as 2 received (not deduplicated)
      expect(pending.receivedChunks).toBe(2);

      receiver.destroy();
    });

    it("should clean up pending image on complete message", async () => {
      const receiver = new P2PNetwork({ peerName: "ReceiverPeer" });
      const imageId = "test-complete";
      const senderId = "sender-complete";

      const key = `${imageId}-${senderId}`;

      // Create pending state
      const chunkMessage = {
        type: "image:chunk" as const,
        imageId,
        chunkIndex: 0,
        totalChunks: 2,
        data: new Uint8Array(100),
        senderId,
      };

      // @ts-expect-error - Accessing private method for testing
      receiver.handleImageChunk(chunkMessage);

      // @ts-expect-error - Accessing private property for testing
      expect(receiver.pendingImages.has(key)).toBe(true);

      // Send complete message
      const completeMessage = {
        type: "image:complete" as const,
        imageId,
        senderId,
      };

      // @ts-expect-error - Accessing private method for testing
      receiver.handleImageComplete(completeMessage);

      // @ts-expect-error - Accessing private property for testing
      expect(receiver.pendingImages.has(key)).toBe(false);

      receiver.destroy();
    });
  });

  describe("Progress Tracking", () => {
    it("should track bytes sent during image transfer", async () => {
      const imageSize = 5000;
      const blob = createTestBlob(imageSize);

      // @ts-expect-error - Accessing private property for testing
      const initialBytesSent = network.imageBytesSent;

      await network.sendImage("test-progress", blob);

      // @ts-expect-error - Accessing private property for testing
      const finalBytesSent = network.imageBytesSent;

      expect(finalBytesSent - initialBytesSent).toBe(imageSize);
    });

    it("should track bytes received during image transfer", async () => {
      const receiver = new P2PNetwork({ peerName: "ReceiverPeer" });
      const imageSize = 3000;
      const originalBlob = createTestBlob(imageSize);
      const imageId = "test-bytes-received";
      const senderId = "sender-bytes";

      // @ts-expect-error - Accessing private property for testing
      const initialBytesReceived = receiver.imageBytesReceived;

      const uint8Array = new Uint8Array(await getBlobArrayBuffer(originalBlob));
      const chunkMessage = {
        type: "image:chunk" as const,
        imageId,
        chunkIndex: 0,
        totalChunks: 1,
        data: uint8Array,
        senderId,
      };

      // @ts-expect-error - Accessing private method for testing
      receiver.handleImageChunk(chunkMessage);

      // @ts-expect-error - Accessing private property for testing
      const finalBytesReceived = receiver.imageBytesReceived;

      expect(finalBytesReceived - initialBytesReceived).toBe(imageSize);

      receiver.destroy();
    });

    it("should accumulate bytes across multiple images", async () => {
      const blob1 = createTestBlob(1000);
      const blob2 = createTestBlob(2000);
      const blob3 = createTestBlob(1500);

      // @ts-expect-error - Accessing private property for testing
      const initialBytesSent = network.imageBytesSent;

      await network.sendImage("img-1", blob1);
      await network.sendImage("img-2", blob2);
      await network.sendImage("img-3", blob3);

      // @ts-expect-error - Accessing private property for testing
      const finalBytesSent = network.imageBytesSent;

      expect(finalBytesSent - initialBytesSent).toBe(1000 + 2000 + 1500);
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle complete image transfer flow", async () => {
      const sender = new P2PNetwork({ peerName: "SenderPeer" });
      const receiver = new P2PNetwork({ peerName: "ReceiverPeer" });

      const imageSize = 10000;
      const originalBlob = createTestBlob(imageSize);
      const imageId = "test-integration";

      let receiverGotImage = false;
      let receivedBlob: Blob | null = null;

      receiver.on("image:received", (_imgId: string, blob: Blob) => {
        receiverGotImage = true;
        receivedBlob = blob;
      });

      // Simulate sender sending chunks
      const uint8Array = new Uint8Array(await getBlobArrayBuffer(originalBlob));
      const totalChunks = 1;

      const chunkMessage = {
        type: "image:chunk" as const,
        imageId,
        chunkIndex: 0,
        totalChunks,
        data: uint8Array,
        senderId: sender.id,
      };

      // @ts-expect-error - Accessing private method for testing
      receiver.handleImageChunk(chunkMessage);

      expect(receiverGotImage).toBe(true);
      expect(receivedBlob).not.toBeNull();

      const receivedArray = await getBlobArrayBuffer(receivedBlob!);
      expect(new Uint8Array(receivedArray)).toEqual(new Uint8Array(await getBlobArrayBuffer(originalBlob)));

      sender.destroy();
      receiver.destroy();
    });

    it("should handle multiple concurrent image transfers", async () => {
      const receiver = new P2PNetwork({ peerName: "ReceiverPeer" });

      const image1Blob = createTestBlob(2000);
      const image2Blob = createTestBlob(3000);
      const imageId1 = "concurrent-1";
      const imageId2 = "concurrent-2";
      const senderId = "sender-concurrent";

      const receivedImages = new Map<string, Blob>();

      receiver.on("image:received", (imgId: string, blob: Blob) => {
        receivedImages.set(imgId, blob);
      });

      // Simulate receiving both images
      const array1 = new Uint8Array(await getBlobArrayBuffer(image1Blob));
      const array2 = new Uint8Array(await getBlobArrayBuffer(image2Blob));

      const chunkMessage1 = {
        type: "image:chunk" as const,
        imageId: imageId1,
        chunkIndex: 0,
        totalChunks: 1,
        data: array1,
        senderId,
      };

      const chunkMessage2 = {
        type: "image:chunk" as const,
        imageId: imageId2,
        chunkIndex: 0,
        totalChunks: 1,
        data: array2,
        senderId,
      };

      // @ts-expect-error - Accessing private method for testing
      receiver.handleImageChunk(chunkMessage1);
      // @ts-expect-error - Accessing private method for testing
      receiver.handleImageChunk(chunkMessage2);

      expect(receivedImages.size).toBe(2);
      expect(receivedImages.has(imageId1)).toBe(true);
      expect(receivedImages.has(imageId2)).toBe(true);

      receiver.destroy();
    });

    it("should handle very small images (edge case)", async () => {
      const receiver = new P2PNetwork({ peerName: "ReceiverPeer" });
      const tinyBlob = createTestBlob(1); // 1 byte
      const imageId = "test-tiny";
      const senderId = "sender-tiny";

      let receivedBlob: Blob | null = null;

      receiver.on("image:received", (_imgId: string, blob: Blob) => {
        receivedBlob = blob;
      });

      const uint8Array = new Uint8Array(await getBlobArrayBuffer(tinyBlob));
      const chunkMessage = {
        type: "image:chunk" as const,
        imageId,
        chunkIndex: 0,
        totalChunks: 1,
        data: uint8Array,
        senderId,
      };

      // @ts-expect-error - Accessing private method for testing
      receiver.handleImageChunk(chunkMessage);

      expect(receivedBlob).not.toBeNull();
      expect(receivedBlob!.size).toBe(1);

      receiver.destroy();
    });

    it("should handle zero-byte images (edge case)", async () => {
      const receiver = new P2PNetwork({ peerName: "ReceiverPeer" });
      const emptyBlob = createTestBlob(0);
      const imageId = "test-empty";
      const senderId = "sender-empty";

      let receivedBlob: Blob | null = null;

      receiver.on("image:received", (_imgId: string, blob: Blob) => {
        receivedBlob = blob;
      });

      const uint8Array = new Uint8Array(await getBlobArrayBuffer(emptyBlob));
      const chunkMessage = {
        type: "image:chunk" as const,
        imageId,
        chunkIndex: 0,
        totalChunks: 1,
        data: uint8Array,
        senderId,
      };

      // @ts-expect-error - Accessing private method for testing
      receiver.handleImageChunk(chunkMessage);

      expect(receivedBlob).not.toBeNull();
      expect(receivedBlob!.size).toBe(0);

      receiver.destroy();
    });
  });

  describe("Error Handling", () => {
    it("should handle data channel not ready", async () => {
      // Set data channel to closed state
      // @ts-expect-error - Accessing private property for testing
      network.dataChannel.readyState = "closed";

      const blob = createTestBlob(1000);

      // Should not throw, just warn
      await expect(network.sendImage("test-closed", blob)).resolves.toBeUndefined();
    });

    it("should emit error on send failure", async () => {
      const errorSpy = vi.fn();
      network.on("error", errorSpy);

      // Mock send to throw error
      mockDataChannel.send = () => {
        throw new Error("Send failed");
      };

      const blob = createTestBlob(1000);
      await network.sendImage("test-error", blob);

      expect(errorSpy).toHaveBeenCalled();
      const error = errorSpy.mock.calls[0][0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Send failed");
    });
  });
});
