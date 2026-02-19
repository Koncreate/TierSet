import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import wasm from "vite-plugin-wasm";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const reactNativeShim = fileURLToPath(new URL("./src/lib/shims/react-native.ts", import.meta.url));
const isTest = process.env.VITEST === "true";

const config = defineConfig({
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: reactNativeShim },
      { find: /^react-native\/.*$/, replacement: reactNativeShim },
      { find: "tiny-warning", replacement: "tiny-warning/dist/tiny-warning.esm.js" },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx,js,jsx}"],
    exclude: ["**/node_modules/**", "vendor/**", "dist/**", "tests/**"],
    passWithNoTests: true,
  },
  plugins: [
    !isTest && devtools(),
    !isTest &&
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/paraglide",
        strategy: ["url", "baseLocale"],
      }),
    !isTest && cloudflare({ viteEnvironment: { name: "ssr" } }),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    !isTest && tanstackStart(),
    viteReact({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    wasm(),
  ].filter(Boolean),
});

export default config;
