/**
 * TanStack Store - User Settings Store
 *
 * Persists user preferences (theme, username, audio/video settings) to IndexedDB.
 * Settings survive page reloads and are restored on app initialization.
 */

import { Store } from "@tanstack/store";
import { subscribeToStoreChanges } from "../lib/persistence/storePersistence";
import type { UnsubscribeFn } from "../lib/persistence/types";

// ============================================================================
// State Types
// ============================================================================

export type ThemeMode = "light" | "dark" | "auto";

export interface UserSettingsState {
  /** User's display name */
  username: string;
  /** UI theme preference */
  theme: ThemeMode;
  /** Whether audio is enabled for P2P calls */
  audioEnabled: boolean;
  /** Whether video is enabled for P2P calls */
  videoEnabled: boolean;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: UserSettingsState = {
  username: "",
  theme: "auto",
  audioEnabled: true,
  videoEnabled: true,
};

// ============================================================================
// Main Store
// ============================================================================

export const userSettingsStore = new Store<UserSettingsState>(initialState);

// ============================================================================
// Actions
// ============================================================================

export const userSettingsActions = {
  /**
   * Set username
   */
  setUsername: (username: string) => {
    userSettingsStore.setState((prev) => ({
      ...prev,
      username,
    }));
  },

  /**
   * Set theme mode
   */
  setTheme: (theme: ThemeMode) => {
    userSettingsStore.setState((prev) => ({
      ...prev,
      theme,
    }));
  },

  /**
   * Set audio enabled state
   */
  setAudioEnabled: (enabled: boolean) => {
    userSettingsStore.setState((prev) => ({
      ...prev,
      audioEnabled: enabled,
    }));
  },

  /**
   * Set video enabled state
   */
  setVideoEnabled: (enabled: boolean) => {
    userSettingsStore.setState((prev) => ({
      ...prev,
      videoEnabled: enabled,
    }));
  },

  /**
   * Update multiple settings at once
   */
  updateSettings: (updates: Partial<UserSettingsState>) => {
    userSettingsStore.setState((prev) => ({
      ...prev,
      ...updates,
    }));
  },

  /**
   * Reset all settings to defaults
   */
  reset: () => {
    userSettingsStore.setState(() => ({
      ...initialState,
    }));
  },

  /**
   * Load settings from a snapshot (used on app init)
   */
  loadFromSnapshot: (snapshot: Partial<UserSettingsState>) => {
    userSettingsStore.setState((prev) => ({
      ...prev,
      ...snapshot,
    }));
  },
};

// ============================================================================
// Persistence
// ============================================================================

let userSettingsUnsubscribe: UnsubscribeFn | null = null;

/**
 * Setup auto-save for userSettingsStore
 * Call once on app initialization
 */
export function setupUserSettingsPersistence(): void {
  if (userSettingsUnsubscribe) {
    return; // Already setup
  }

  userSettingsUnsubscribe = subscribeToStoreChanges(
    "userSettingsStore",
    userSettingsStore as unknown as Store<Record<string, unknown>>
  );
}

/**
 * Load userSettingsStore state from snapshot
 * Call on app initialization before setupUserSettingsPersistence
 */
export async function loadUserSettingsFromSnapshot(): Promise<void> {
  const { loadStoreSnapshot } = await import("../lib/persistence/storePersistence");
  const result = await loadStoreSnapshot<Partial<UserSettingsState>>("userSettingsStore");

  if (result.found && result.valid && result.data) {
    userSettingsStore.setState((prev) => ({
      ...prev,
      ...result.data,
    }));
  }
}

/**
 * Cleanup userSettingsStore persistence subscription
 */
export function cleanupUserSettingsPersistence(): void {
  if (userSettingsUnsubscribe) {
    userSettingsUnsubscribe();
    userSettingsUnsubscribe = null;
  }
}
