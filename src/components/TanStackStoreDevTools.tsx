/**
 * TanStack Store DevTools Provider
 * 
 * Wraps the app with TanStack DevTools for state inspection.
 * Only enabled in development mode.
 */

import { useEffect } from 'react';
import { appStore } from '../stores/appStore';

interface TanStackStoreDevToolsProps {
  children: React.ReactNode;
  enabled?: boolean;
}

export function TanStackStoreDevTools({ children, enabled = true }: TanStackStoreDevToolsProps) {
  useEffect(() => {
    // Only enable in development mode
    if (!enabled || import.meta.env.PROD) {
      return;
    }

    // Check if TanStack DevTools extension is available
    if (typeof window !== 'undefined' && (window as any).__TANSTACK_DEVTOOLS__) {
      // Register the store with DevTools
      const devtools = (window as any).__TANSTACK_DEVTOOLS__;
      
      // Connect to DevTools
      const connection = devtools.connect({
        name: 'TanStack Store - App Store',
      });

      if (connection) {
        // Subscribe to store changes and send updates to DevTools
        const unsubscribe = appStore.subscribe((state) => {
          connection.send({
            type: 'STATE_UPDATE',
            payload: state,
          });
        });

        // Initial state
        connection.init(appStore.state);

        return () => {
          unsubscribe();
          connection.disconnect();
        };
      }
    }
  }, [enabled]);

  return <>{children}</>;
}
