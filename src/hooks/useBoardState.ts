/**
 * React Hook - useBoardState
 * 
 * Provides access to board-related state with TanStack Store.
 * Use this when you only need board state (lighter than useAppState).
 */

import { useStore } from '@tanstack/react-store';
import { appStore } from '../stores/appStore';
import { boardActions } from '../stores/appStore.actions';
import type { BoardDocument } from '../lib/documents';

export interface UseBoardStateReturn {
  board: BoardDocument | null;
  isLoading: boolean;
  error: Error | null;
  documentUrl: string | null;
  syncStatus: 'syncing' | 'synced' | 'error' | 'disconnected';
  connectedPeers: number;
  canEdit: boolean;
  actions: typeof boardActions;
}

export function useBoardState(): UseBoardStateReturn {
  const board = useStore(appStore, (state) => state.board.currentBoard);
  const isLoading = useStore(appStore, (state) => state.board.isLoading);
  const error = useStore(appStore, (state) => state.board.error);
  const documentUrl = useStore(appStore, (state) => state.board.documentUrl);
  const syncStatus = useStore(appStore, (state) => state.board.syncStatus);
  const connectedPeers = useStore(appStore, (state) => state.board.connectedPeers);
  const canEdit = useStore(
    appStore,
    (state) =>
      !state.board.isLoading &&
      state.board.currentBoard !== null
  );

  return {
    board,
    isLoading,
    error,
    documentUrl,
    syncStatus,
    connectedPeers,
    canEdit,
    actions: boardActions,
  };
}
