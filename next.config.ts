import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "usage-answer-double-worker.trycloudflare.com",
  ] as string[],
};

export default nextConfig;
