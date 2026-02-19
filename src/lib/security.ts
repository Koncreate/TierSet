/**
 * Security utilities for input sanitization and validation
 */

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHtml(input: string): string {
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Validate and sanitize user input
 */
export function sanitizeInput(
  input: string,
  options?: {
    maxLength?: number;
    allowEmoji?: boolean;
  },
): string {
  const maxLength = options?.maxLength ?? 500;

  // Trim whitespace
  let sanitized = input.trim();

  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  // Remove control characters (except newlines/tabs if needed)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return sanitized;
}

/**
 * Validate room code format
 */
export function isValidRoomCode(code: string): boolean {
  // Format: TIER-XXXXXX (6 alphanumeric chars, no I, O, 1, 0)
  const pattern = /^TIER-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
  return pattern.test(code);
}

/**
 * Validate tier label (S, A, B, C, D, F)
 */
export function isValidTierLabel(label: string): boolean {
  return /^[SABCDF]$/i.test(label);
}

/**
 * Validate hex color
 */
export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(color);
}

/**
 * Create debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * Create throttled function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Generate secure random string
 */
export function generateSecureRandom(length: number = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values)
    .map((value) => chars[value % chars.length])
    .join("");
}

/**
 * Hash string using SHA-256
 */
export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate file type
 */
export function isValidFileType(file: File, allowedTypes: string[]): boolean {
  return allowedTypes.some(
    (type) => file.type === type || file.name.endsWith(`.${type.split("/")[1]}`),
  );
}

/**
 * Validate file size
 */
export function isValidFileSize(file: File, maxSizeBytes: number): boolean {
  return file.size <= maxSizeBytes;
}
