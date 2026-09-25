import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "kennedy-mail-demonstrated-vessels.trycloudflare.com",
  ] as string[],
};

export default nextConfig;
