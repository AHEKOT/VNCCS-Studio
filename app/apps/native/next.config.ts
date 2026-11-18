import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  distDir: "node_modules/.studio-next",
  transpilePackages: ["@workspace/ui", "@workspace/core", "@workspace/vnccs"],
  turbopack: {
    resolveAlias: {
      sharp: { browser: "./src/lib/node-only.ts" },
      ws: { browser: "./src/lib/node-only.ts" },
    },
  },
};

export default nextConfig;
