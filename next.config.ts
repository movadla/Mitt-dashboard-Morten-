import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "salvation-penalties-retention-tent.trycloudflare.com",
  ] as string[],
};

export default nextConfig;