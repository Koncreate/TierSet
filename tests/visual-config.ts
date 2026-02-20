/**
 * Visual Testing Configuration
 * 
 * Configuration for screenshot-based visual regression testing
 * using Playwright's built-in screenshot comparison.
 */

export const visualConfig = {
  /**
   * Visual regression detection threshold (0-1)
   * 0 = exact match required
   * 1 = completely different images are considered equal
   * Recommended: 0.05-0.1 for most UIs
   */
  threshold: 0.08,

  /**
   * Viewport configurations for different device types
   */
  viewports: {
    desktop: { width: 1920, height: 1080 },
    laptop: { width: 1366, height: 768 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 812 },
  },

  /**
   * Screenshot options
   */
  screenshotOptions: {
    fullPage: false,
    animations: 'disabled' as const,
    caret: 'hide' as const,
    scale: 'device' as const,
  },

  /**
   * Paths for screenshot storage
   */
  paths: {
    baseline: 'tests/screenshots/baseline',
    current: 'tests/screenshots/current',
  },

  /**
   * Components to test visually
   */
  components: {
    boardView: {
      name: 'board-view',
      description: 'Main board rendering view',
    },
    tierList: {
      name: 'tier-list',
      description: 'Tier list layout component',
    },
    chatPanel: {
      name: 'chat-panel',
      description: 'P2P chat panel component',
    },
    mobileLayout: {
      name: 'mobile-layout',
      description: 'Mobile responsive layouts',
    },
    connectionStatus: {
      name: 'connection-status',
      description: 'P2P connection status indicators',
    },
    imageUploader: {
      name: 'image-uploader',
      description: 'Image upload modal',
    },
  },

  /**
   * Theme variations to test
   */
  themes: ['light', 'dark'],

  /**
   * States to capture for each component
   */
  states: {
    boardView: ['empty', 'with-items', 'with-tiers'],
    tierList: ['empty', 'with-items', 'dragging'],
    chatPanel: ['closed', 'open-empty', 'open-with-messages'],
    connectionStatus: ['disconnected', 'connecting', 'connected'],
  },
};

export type VisualConfig = typeof visualConfig;
export type ComponentName = keyof typeof visualConfig.components;
