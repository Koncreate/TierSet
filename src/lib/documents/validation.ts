import { z } from "zod";
import { isCuid } from "@paralleldrive/cuid2";
import type { BoardDocument, BoardItem, Tier, BoardSettings, PeerState } from "./types";

const cuidRefinement = (value: string) => isCuid(value);

export const BoardItemSchema: z.ZodType<BoardItem> = z.object({
  id: z.string().refine(cuidRefinement, "Invalid cuid2"),
  name: z.string().min(1, "Name cannot be empty").max(100, "Name too long"),
  imageId: z.string().refine(cuidRefinement, "Invalid cuid2").optional(),
  emoji: z.string().emoji().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.number(),
  createdBy: z.string().refine(cuidRefinement, "Invalid cuid2"),
});

export const TierSchema: z.ZodType<Tier> = z.object({
  id: z.string().refine(cuidRefinement, "Invalid cuid2"),
  name: z.string().min(1, "Tier name cannot be empty").max(50, "Tier name too long"),
  label: z.string().length(1, "Tier label must be a single character"),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid hex color"),
  itemIds: z.array(z.string().refine(cuidRefinement, "Invalid cuid2")),
  createdAt: z.number(),
});

export const BoardSettingsSchema: z.ZodType<BoardSettings> = z.object({
  allowPublicJoin: z.boolean(),
  requirePassword: z.boolean(),
  maxPeers: z.number().min(1, "Max peers must be at least 1").max(50, "Max peers too high"),
  theme: z.enum(["light", "dark", "auto"]),
});

export const PeerStateSchema: z.ZodType<PeerState> = z.object({
  id: z.string().refine(cuidRefinement, "Invalid cuid2"),
  name: z.string().min(1).max(50),
  connectedAt: z.number(),
  isHost: z.boolean(),
});

export const BoardDocumentSchema: z.ZodType<BoardDocument> = z.object({
  id: z.string().refine(cuidRefinement, "Invalid cuid2"),
  name: z.string().min(1, "Board name cannot be empty").max(100, "Board name too long"),
  description: z.string().max(500, "Description too long").optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  createdBy: z.string().refine(cuidRefinement, "Invalid cuid2"),
  tiers: z.array(TierSchema).max(26, "Too many tiers (max 26)"),
  items: z.array(BoardItemSchema).max(1000, "Too many items (max 1000)"),
  settings: BoardSettingsSchema,
  _peers: z.array(PeerStateSchema),
});

export function validateBoardDocument(data: unknown): BoardDocument {
  return BoardDocumentSchema.parse(data);
}

export function safeValidateBoardDocument(
  data: unknown,
): { success: true; data: BoardDocument } | { success: false; error: z.ZodError } {
  return BoardDocumentSchema.safeParse(data);
}
