/**
 * TanStack Store - Public API
 */

export {
  appStore,
  canEditStore,
  allPeersStore,
  peerCountStore,
  roomCodeDisplayStore,
  appLoadingStore,
  appErrorStore,
  lightboxOpenStore,
  lightboxCurrentItemStore,
  imageEditorOpenStore,
  batchUpdates,
  type AppState,
  type BoardState,
  type RoomState,
  type PeerState,
  type UIState,
  type LightboxState,
  type ImageEditorState,
  setupAppStorePersistence,
  loadAppStoreFromSnapshot,
  cleanupAppStorePersistence,
} from './appStore';

export {
  userSettingsStore,
  userSettingsActions,
  setupUserSettingsPersistence,
  loadUserSettingsFromSnapshot,
  cleanupUserSettingsPersistence,
  type UserSettingsState,
  type ThemeMode,
} from './userSettingsStore';

export {
  boardActions,
  roomActions,
  peerActions,
  uiActions,
  initializeHostRoom,
  joinRoomAsClient,
  leaveRoom,
  handleConnectionError,
} from './appStore.actions';
