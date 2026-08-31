import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  // node-fetch uses dynamic require("punycode") which tsup cannot bundle in ESM.
  // Keeping it external lets Node.js resolve it from node_modules at runtime.
  external: ["node-fetch"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
