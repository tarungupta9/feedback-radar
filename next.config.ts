import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Parent directories may contain unrelated lockfiles.
    root: __dirname,
  },
};

export default nextConfig;
