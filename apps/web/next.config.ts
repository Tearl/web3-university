import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import type { PHASE_DEVELOPMENT_SERVER as DevelopmentPhase } from "next/constants";

for (const relativePath of ["../../.env.local", "../../.env"]) {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}

export default function nextConfig(phase: typeof DevelopmentPhase): NextConfig {
  return {
    // Keep `next dev` and `next build` from corrupting each other's CSS assets.
    distDir: phase === "phase-development-server" ? ".next-dev" : ".next",
    transpilePackages: ["@web3-university/shared"],
    webpack(config) {
      // Privy exposes optional Farcaster/Solana support, but this application
      // only enables email and EVM wallet login. Excluding the optional module
      // keeps the OpenNext Worker below Cloudflare's free-plan size limit.
      config.resolve.alias = {
        ...config.resolve.alias,
        "@farcaster/mini-app-solana": false,
      };
      return config;
    },
  };
}
