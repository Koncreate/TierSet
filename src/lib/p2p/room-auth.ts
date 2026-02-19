import { customAlphabet } from "nanoid";
import { scrypt } from "@noble/hashes/scrypt.js";
import { randomBytes } from "@noble/hashes/utils.js";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I, O, 1, 0
const ROOM_CODE_LENGTH = 6;
const createRoomCodeId = customAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);

export interface RoomConfig {
  code: string;
  passwordHash?: string;
  hostId: string;
  createdAt: number;
  expiresAt: number;
  maxPeers: number;
}

/**
 * Generate room code
 */
export function generateRoomCode(): string {
  return `TIER-${createRoomCodeId()}`;
}

/**
 * Create room configuration
 */
export function createRoomConfig(options?: Partial<RoomConfig>): RoomConfig {
  return {
    code: generateRoomCode(),
    hostId: crypto.randomUUID(),
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    maxPeers: 10,
    ...options,
  };
}

/**
 * Hash password using scrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const params = { N: 2 ** 15, r: 8, p: 1, dkLen: 32 };
  const key = await scrypt(password, salt, params);

  return `scrypt:${params.N}:${params.r}:${params.p}:${toHex(salt)}:${toHex(key)}`;
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hashString: string): Promise<boolean> {
  try {
    const [_algo, n, r, p, saltHex, expectedKeyHex] = hashString.split(":");
    const params = { N: Number(n), r: Number(r), p: Number(p), dkLen: 32 };
    const salt = fromHex(saltHex);

    const key = await scrypt(password, salt, params);
    const actualKeyHex = toHex(key);

    return constantTimeEqual(actualKeyHex, expectedKeyHex);
  } catch {
    return false;
  }
}

/**
 * Convert Uint8Array to hex string
 */
function toHex(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert hex string to Uint8Array
 */
function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
