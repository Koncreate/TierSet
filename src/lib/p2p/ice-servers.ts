/**
 * ICE Server Configuration for WebRTC NAT Traversal
 * Uses Google STUN (free) + Cloudflare TURN (1TB free)
 */

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Google STUN servers (free, no auth required)
 */
export const GOOGLE_STUN: IceServerConfig[] = [
  { urls: ["stun:stun.l.google.com:19302"] },
  { urls: ["stun:stun1.l.google.com:19302"] },
  { urls: ["stun:stun2.l.google.com:19302"] },
  { urls: ["stun:stun3.l.google.com:19302"] },
  { urls: ["stun:stun4.l.google.com:19302"] },
];

/**
 * Cloudflare TURN servers configuration
 * Requires authentication token (generated server-side)
 * 1TB free egress per month
 */
export function getCloudflareTurnConfig(token: string, username: string): IceServerConfig[] {
  return [
    {
      urls: [
        "turns:global.turn.cloudflare.com:443?transport=tcp",
        "turn:global.turn.cloudflare.com:80?transport=tcp",
      ],
      username,
      credential: token,
    },
  ];
}

/**
 * Combined ICE server list
 * Order: STUN first (free), TURN last (paid)
 */
export function getIceServers(options?: {
  cloudflareToken?: string;
  cloudflareUsername?: string;
}): RTCIceServer[] {
  const servers: RTCIceServer[] = [...GOOGLE_STUN];

  // Add Cloudflare TURN if credentials provided
  if (options?.cloudflareToken && options?.cloudflareUsername) {
    servers.push(...getCloudflareTurnConfig(options.cloudflareToken, options.cloudflareUsername));
  }

  return servers;
}
