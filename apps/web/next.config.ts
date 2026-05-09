import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@domino-poker/core"],
  turbopack: {
    root: join(configDir, "../..")
  }
};

export default nextConfig;
