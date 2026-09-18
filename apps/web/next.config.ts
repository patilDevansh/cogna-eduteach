import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@cogna/shared"],
  serverExternalPackages: [
    "@cogna/lesson-video",
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/cli",
    "@remotion/compositor-darwin-arm64",
    "@remotion/compositor-darwin-x64",
    "@remotion/compositor-linux-x64-gnu",
    "@remotion/compositor-linux-x64-musl",
    "@remotion/compositor-linux-arm64-gnu",
    "@remotion/compositor-win32-x64-msvc",
    "remotion",
    "esbuild",
    "webpack",
    "@aws-sdk/client-s3",
    "@nestjs/common",
    "@nestjs/core",
    "@nestjs/platform-express",
    "file-type",
    "load-esm",
  ],
};

export default nextConfig;
