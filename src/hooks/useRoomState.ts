/**
 * React Hook - useRoomState
 * 
 * Provides access to room-related state with TanStack Store.
 * Use this when you only need room state.
 */

import { useStore } from '@tanstack/react-store';
import { appStore } from '../stores/appStore';
import { roomActions } from '../stores/appStore.actions';

export interface UseRoomStateReturn {
  roomCode: string | null;
  isHost: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  displayCode: string | null;
  actions: typeof roomActions;
}

export function useRoomState(): UseRoomStateReturn {
  const roomCode = useStore(appStore, (state) => state.room.roomCode);
  const isHost = useStore(appStore, (state) => state.room.isHost);
  const isConnected = useStore(appStore, (state) => state.room.isConnected);
  const isConnecting = useStore(appStore, (state) => state.room.isConnecting);
  const error = useStore(appStore, (state) => state.room.error);
  const displayCode = useStore(appStore, (state) => state.room.roomCode);

  return {
    roomCode,
    isHost,
    isConnected,
    isConnecting,
    error,
    displayCode,
    actions: roomActions,
  };
}
