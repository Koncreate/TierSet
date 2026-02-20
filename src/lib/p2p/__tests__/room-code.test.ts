/**
 * Room Code Encoding/Decoding Unit Tests
 * =======================================
 *
 * Tests for the room code embedding logic that stores Automerge document URLs
 * directly in room codes.
 */

import { describe, it, expect } from "vitest";
import {
  encodeRoomCode,
  decodeRoomCode,
  hasEmbeddedUrl,
  extractShortCode,
  generateShortCode,
} from "../room-code";

describe("room-code", () => {
  const testDocumentUrl = "automerge:4ZUyJpxo9iQh8kCDWfVYaS5fDAuw" as const;

  describe("encodeRoomCode", () => {
    it("should encode room code with document URL", () => {
      const shortCode = "TIER-ABC123";
      const fullCode = encodeRoomCode(shortCode, testDocumentUrl);

      expect(fullCode).toContain("TIER-ABC123-");
      expect(fullCode).not.toContain("="); // No padding
      expect(fullCode).not.toContain("+"); // URL-safe
      expect(fullCode).not.toContain("/"); // URL-safe
    });

    it("should produce URL-safe base64 encoding", () => {
      const shortCode = "TIER-TEST";
      // Document URL with characters that would produce +, /, = in standard base64
      const urlWithSpecialChars = "automerge:<<<>>>???";
      const fullCode = encodeRoomCode(shortCode, urlWithSpecialChars);

      expect(fullCode).not.toContain("+");
      expect(fullCode).not.toContain("/");
      expect(fullCode).not.toMatch(/=+$/);
    });

    it("should handle empty document URL", () => {
      const shortCode = "TIER-EMPTY";
      const fullCode = encodeRoomCode(shortCode, "");

      expect(fullCode).toBe("TIER-EMPTY--");
    });
  });

  describe("decodeRoomCode", () => {
    it("should decode room code with document URL", () => {
      const shortCode = "TIER-ABC123";
      const fullCode = encodeRoomCode(shortCode, testDocumentUrl);

      const decoded = decodeRoomCode(fullCode);

      expect(decoded).not.toBeNull();
      expect(decoded?.shortCode).toBe(shortCode);
      expect(decoded?.documentUrl).toBe(testDocumentUrl);
    });

    it("should handle URL-safe base64 decoding", () => {
      const shortCode = "TIER-URL-SAFE";
      const fullCode = encodeRoomCode(shortCode, testDocumentUrl);

      // Manually verify URL-safe chars were used
      expect(fullCode).not.toContain("+");
      expect(fullCode).not.toContain("/");

      const decoded = decodeRoomCode(fullCode);
      expect(decoded?.documentUrl).toBe(testDocumentUrl);
    });

    it("should return null for code without embedded URL", () => {
      const decoded = decodeRoomCode("TIER-SHORT");

      expect(decoded).toBeNull();
    });

    it("should return null for invalid base64", () => {
      const decoded = decodeRoomCode("TIER-INVALID!!!");

      expect(decoded).toBeNull();
    });

    it("should return null for non-automerge URL", () => {
      const fullCode = encodeRoomCode("TIER-TEST", "https://example.com");

      const decoded = decodeRoomCode(fullCode);

      expect(decoded).toBeNull();
    });

    it("should handle codes with multiple dashes", () => {
      const shortCode = "TIER-ABC-DEF";
      const fullCode = encodeRoomCode(shortCode, testDocumentUrl);

      const decoded = decodeRoomCode(fullCode);

      expect(decoded?.shortCode).toBe(shortCode);
      expect(decoded?.documentUrl).toBe(testDocumentUrl);
    });
  });

  describe("hasEmbeddedUrl", () => {
    it("should return true for code with embedded URL", () => {
      const fullCode = encodeRoomCode("TIER-TEST", testDocumentUrl);

      expect(hasEmbeddedUrl(fullCode)).toBe(true);
    });

    it("should return false for short code without URL", () => {
      expect(hasEmbeddedUrl("TIER-ABC123")).toBe(false);
    });

    it("should return false for code with only one dash", () => {
      expect(hasEmbeddedUrl("TIER-SINGLE")).toBe(false);
    });

    it("should return false for code with multiple dashes but no separator", () => {
      expect(hasEmbeddedUrl("TIER-ABC-DEF-GHI")).toBe(false);
    });
  });

  describe("extractShortCode", () => {
    it("should extract short code from full code", () => {
      const shortCode = "TIER-ABC123";
      const fullCode = encodeRoomCode(shortCode, testDocumentUrl);

      const extracted = extractShortCode(fullCode);

      expect(extracted).toBe(shortCode);
    });

    it("should return code unchanged if no dash", () => {
      const code = "TIERCODE";

      const extracted = extractShortCode(code);

      expect(extracted).toBe(code);
    });

    it("should extract first part for code with one dash", () => {
      const code = "TIER-ABC123";

      const extracted = extractShortCode(code);

      expect(extracted).toBe("TIER-ABC123");
    });

    it("should handle codes with multiple dashes", () => {
      const shortCode = "TIER-ABC-DEF";
      const fullCode = encodeRoomCode(shortCode, testDocumentUrl);

      const extracted = extractShortCode(fullCode);

      expect(extracted).toBe(shortCode);
    });
  });

  describe("generateShortCode", () => {
    it("should generate 6-character code", () => {
      const code = generateShortCode();

      expect(code).toHaveLength(6);
    });

    it("should use valid alphabet", () => {
      const code = generateShortCode();

      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
    });

    it("should exclude confusing characters", () => {
      const code = generateShortCode();

      expect(code).not.toContain("I");
      expect(code).not.toContain("O");
      expect(code).not.toContain("1");
      expect(code).not.toContain("0");
    });

    it("should generate unique codes", () => {
      const codes = new Set([
        generateShortCode(),
        generateShortCode(),
        generateShortCode(),
        generateShortCode(),
        generateShortCode(),
      ]);

      // Probability of collision is very low with 32^6 possible codes
      expect(codes.size).toBe(5);
    });
  });

  describe("round-trip encoding/decoding", () => {
    it("should preserve document URL through encode/decode cycle", () => {
      const shortCode = "TIER-ROUND";
      const documentUrl = "automerge:test123";

      const fullCode = encodeRoomCode(shortCode, documentUrl);
      const decoded = decodeRoomCode(fullCode);

      expect(decoded?.documentUrl).toBe(documentUrl);
      expect(decoded?.shortCode).toBe(shortCode);
    });

    it("should preserve long document URLs", () => {
      const shortCode = "TIER-LONG";
      const longUrl = "automerge:" + "a".repeat(100);

      const fullCode = encodeRoomCode(shortCode, longUrl);
      const decoded = decodeRoomCode(fullCode);

      expect(decoded?.documentUrl).toBe(longUrl);
    });

    it("should preserve special automerge characters", () => {
      const shortCode = "TIER-SPECIAL";
      const urlWithSpecial = "automerge:!@#$%^&*()_+-=[]{}|;':\",./<>?";

      const fullCode = encodeRoomCode(shortCode, urlWithSpecial);
      const decoded = decodeRoomCode(fullCode);

      expect(decoded?.documentUrl).toBe(urlWithSpecial);
    });
  });

  describe("integration scenarios", () => {
    it("should handle typical host flow", () => {
      // Host creates room with document URL
      const shortCode = "TIER-HOST";
      const documentUrl = "automerge:4ZUyJpxo9iQh8kCDWfVYaS5fDAuw";
      const fullCode = encodeRoomCode(shortCode, documentUrl);

      // Client receives full code and decodes it
      const decoded = decodeRoomCode(fullCode);

      expect(decoded?.documentUrl).toBe(documentUrl);
      expect(extractShortCode(fullCode)).toBe(shortCode);
    });

    it("should handle pro tier short code (future)", () => {
      // Pro tier would have short code without embedded URL
      const shortCode = "TIER-PRO";

      expect(hasEmbeddedUrl(shortCode)).toBe(false);
      expect(decodeRoomCode(shortCode)).toBeNull();
      expect(extractShortCode(shortCode)).toBe("TIER-PRO");
    });
  });
});
