import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    auto: "src/auto.ts",
    index: "src/index.ts",
  },
  format: "esm",
  minify: true,
  platform: "neutral",
  target: "esnext",
  sourcemap: true,
  dts: true,
});
