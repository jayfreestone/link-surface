import { defineConfig } from "vite";

export default defineConfig({
  // Treat the demo as the site root while allowing it to import the package
  // source directly. Source and stylesheet edits then trigger Vite reloads.
  root: "demo",
  base: "./",
  build: {
    outDir: "../_site",
    emptyOutDir: true,
  },
});
