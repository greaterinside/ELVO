import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is per-user and read live, so component caching is off.
  // Keep the dev build cache in memory; the on-disk one grows by hundreds of MB.
  experimental: { turbopackFileSystemCacheForDev: false },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
