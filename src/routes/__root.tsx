import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { useEffect } from "react";

import Header from "../components/Header";
import { TanStackStoreDevTools } from "../components/TanStackStoreDevTools";

import TanStackQueryProvider from "../integrations/tanstack-query/root-provider";

import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";

import StoreDevtools from "../lib/demo-store-devtools";

import { AutomergeRepoProvider } from "../lib/automerge/AutomergeRepoProvider";

import { initializePersistence } from "../lib/persistence/storePersistence";
import { loadAppStoreFromSnapshot, setupAppStorePersistence, cleanupAppStorePersistence } from "../stores/appStore";
import { loadUserSettingsFromSnapshot, setupUserSettingsPersistence, cleanupUserSettingsPersistence } from "../stores/userSettingsStore";

import appCss from "../styles.css?url";

import type { QueryClient } from "@tanstack/react-query";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "TierBoard",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  // Initialize persistence on mount (client-side only)
  useEffect(() => {
    async function initPersistence() {
      try {
        // Initialize persistence layer (cleanup expired snapshots)
        await initializePersistence();

        // Load snapshots and restore state
        await loadAppStoreFromSnapshot();
        await loadUserSettingsFromSnapshot();

        // Setup auto-save subscriptions
        setupAppStorePersistence();
        setupUserSettingsPersistence();
      } catch (error) {
        console.error("[RootDocument] Failed to initialize persistence:", error);
      }
    }

    initPersistence();

    // Cleanup on unmount
    return () => {
      cleanupAppStorePersistence();
      cleanupUserSettingsPersistence();
    };
  }, []);

  // Always use "en" for SSR to ensure hydration match
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <TanStackQueryProvider>
          <AutomergeRepoProvider>
            <TanStackStoreDevTools enabled={!import.meta.env.PROD}>
              <Header />
              {children}
            </TanStackStoreDevTools>
            <TanStackDevtools
              config={{
                position: "bottom-right",
              }}
              plugins={[
                {
                  name: "Tanstack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                },
                TanStackQueryDevtools,
                StoreDevtools,
              ]}
            />
          </AutomergeRepoProvider>
        </TanStackQueryProvider>
        <Scripts />
      </body>
    </html>
  );
}
