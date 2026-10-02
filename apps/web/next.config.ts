import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const webRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(webRoot, "../..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  // lesson-video's browser entry (src/player.ts) is compiled for the interactive lesson player.
  transpilePackages: ["@cogna/shared", "@cogna/lesson-video"],
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/cli",
    "@remotion/compositor-darwin-arm64",
    "@remotion/compositor-darwin-x64",
    "@remotion/compositor-linux-x64-gnu",
    "@remotion/compositor-linux-x64-musl",
    "@remotion/compositor-linux-arm64-gnu",
    "@remotion/compositor-win32-x64-msvc",
    "esbuild",
    "webpack",
    "@aws-sdk/client-s3",
    "@nestjs/common",
    "@nestjs/core",
    "@nestjs/platform-express",
    "file-type",
    "load-esm",
  ],
  webpack(config) {
    // One remotion (and so one React) for the player and the lesson
    // compositions: lesson-video's own copy is bound to React 18 for server
    // rendering, and two copies would not share the player's frame context.
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      remotion$: require.resolve("remotion", { paths: [webRoot] }),
      "@cogna/lesson-video/player$": join(repoRoot, "packages/lesson-video/src/player.ts"),
    };
    return config;
  },
};

export default nextConfig;
