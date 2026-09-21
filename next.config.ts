import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "edit-crops-regard-eos.trycloudflare.com",
  ] as string[],
};

export default nextConfig;