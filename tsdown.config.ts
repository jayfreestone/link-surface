import { defineConfig } from "tsdown";

const shared = {
  minify: true,
  target: "esnext",
  sourcemap: false,
} as const;

export default defineConfig([
  // ESM for npm / bundler consumers. Each entry is built on its own so its
  // output is self-contained — no hashed shared chunk to import at runtime.
  {
    ...shared,
    entry: { index: "src/index.ts" },
    format: "esm",
    platform: "neutral",
    dts: true,
  },
  {
    ...shared,
    entry: { auto: "src/auto.ts" },
    format: "esm",
    platform: "neutral",
    dts: true,
  },
  // A single, self-contained file for a plain <script> tag. It auto-registers
  // <link-surface> on load and exposes the API on `window.linkSurface`.
  {
    ...shared,
    entry: { "link-surface": "src/auto.ts" },
    format: "iife",
    globalName: "linkSurface",
    platform: "browser",
    dts: false,
  },
]);
