/**
 * Hook for managing bracket documents with Automerge CRDT
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import * as automerge from "@automerge/automerge";
import type { ChangeFn } from "@automerge/automerge";
import { storage } from "../storage";
import type { P2PNetwork } from "../p2p";
import type { BracketDocument, BracketId } from "./types";

interface UseBracketDocumentOptions {
  network?: P2PNetwork | null;
}

interface UseBracketDocumentResult {
  doc: BracketDocument | null;
  change: (changeFn: ChangeFn<BracketDocument>) => void;
  isLoading: boolean;
  syncStatus: "disconnected" | "connecting" | "connected" | "syncing";
  connectedPeers: number;
}

/**
 * Hook for managing bracket documents with Automerge CRDT and P2P sync
 */
export function useBracketDocument(
  bracketId: BracketId | null,
  options: UseBracketDocumentOptions = {},
): UseBracketDocumentResult {
  const { network } = options;
  const [doc, setDoc] = useState<BracketDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<
    "disconnected" | "connecting" | "connected" | "syncing"
  >("disconnected");
  const [connectedPeers, setConnectedPeers] = useState(0);

  // Load bracket from storage
  useEffect(() => {
    let mounted = true;

    async function loadBracket() {
      if (!bracketId) {
        if (mounted) {
          setDoc(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const bracket = await storage.brackets.getBracket(bracketId);
        if (mounted) {
          setDoc(bracket ?? null);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to load bracket:", error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadBracket();

    return () => {
      mounted = false;
    };
  }, [bracketId]);

  // Handle P2P sync
  useEffect(() => {
    if (!network || !bracketId) {
      setSyncStatus("disconnected");
      setConnectedPeers(0);
      return;
    }

    const handleStatusChange = () => {
      const status = network.getStatus();
      setSyncStatus(status === "connected" ? "connected" : status === "connecting" ? "connecting" : "disconnected");
      setConnectedPeers(network.getPeers().length);
    };

    network.on("status:change", handleStatusChange);
    handleStatusChange();

    return () => {
      network.off("status:change", handleStatusChange);
    };
  }, [network, bracketId]);

  // Change function for updating the bracket
  const change = useCallback(
    (changeFn: ChangeFn<BracketDocument>) => {
      if (!bracketId || !doc) return;

      try {
        // Apply change to Automerge document
        const newDoc = automerge.change(doc, changeFn);
        setDoc(newDoc);

        // Save to storage
        storage.brackets.saveBracket(bracketId, newDoc);

        // Sync to peers if connected
        if (network && network.getStatus() === "connected") {
          // In a real implementation, this would sync via Automerge over P2P
          console.log("[Bracket] Syncing changes to peers...");
        }
      } catch (error) {
        console.error("Failed to apply bracket change:", error);
      }
    },
    [bracketId, doc, network],
  );

  return {
    doc,
    change,
    isLoading,
    syncStatus,
    connectedPeers,
  };
}

/**
 * Create a new bracket and save it to storage
 */
export async function createBracket(params: {
  name: string;
  participants: string[];
  createdBy: string;
}): Promise<BracketId> {
  const { createBracketDocument } = await import("./types");
  const bracketDoc = createBracketDocument(params);
  await storage.brackets.saveBracket(bracketDoc.id, bracketDoc);
  return bracketDoc.id;
}
