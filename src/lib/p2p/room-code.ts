/**
 * Room Code Encoding/Decoding
 * 
 * Embeds Automerge document URLs in room codes to eliminate server-side storage.
 * 
 * Format: <short-code>-<base64-encoded-document-url>
 * Example: TIER-ABC123-YXV0b21lcmdlOjRaVXlKcHhvOWlRaDhrQ0RXZllhUzVmREF1dw==
 * 
 * Free tier: Full embedded codes (40+ characters)
 * Pro tier: Shortened codes via Cloudflare Short Links (6 characters)
 */

import type { AutomergeUrl } from "@automerge/react";

/**
 * Encode a room code with embedded document URL using URL-safe base64
 * Uses double-dash (--) as separator to distinguish from dashes in short codes
 */
export function encodeRoomCode(shortCode: string, documentUrl: string): string {
  // Use URL-safe base64 encoding (replace + with -, / with _, remove =)
  const encoded = btoa(documentUrl)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  // Use double-dash as separator to avoid confusion with dashes in short codes
  return `${shortCode}--${encoded}`;
}

/**
 * Decode a room code to extract the document URL
 * Returns null if the code doesn't contain an embedded URL
 */
export function decodeRoomCode(fullCode: string): { shortCode: string; documentUrl: string } | null {
  try {
    // Look for double-dash separator
    const separatorIndex = fullCode.indexOf('--');
    if (separatorIndex === -1) return null;
    
    const shortCode = fullCode.substring(0, separatorIndex);
    const encoded = fullCode.substring(separatorIndex + 2);
    
    // Restore base64 padding and convert URL-safe chars back
    const base64 = encoded
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const documentUrl = atob(base64);
    
    // Validate it looks like an automerge URL
    if (!documentUrl.startsWith('automerge:')) return null;
    
    return { shortCode, documentUrl };
  } catch {
    return null;
  }
}

/**
 * Check if a room code contains an embedded document URL
 */
export function hasEmbeddedUrl(code: string): boolean {
  // Room codes with embedded URLs use double-dash separator
  return code.includes('--');
}

/**
 * Extract just the short code prefix from a full room code
 * For codes with embedded URLs, extracts everything before the double-dash separator
 */
export function extractShortCode(fullCode: string): string {
  const separatorIndex = fullCode.indexOf('--');
  if (separatorIndex === -1) return fullCode;
  return fullCode.substring(0, separatorIndex);
}

/**
 * Generate a short room code (6 characters)
 */
export function generateShortCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 1, 0 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
