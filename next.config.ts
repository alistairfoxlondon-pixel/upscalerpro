import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["sharp", "onnxruntime-node"],
  // ship the AI model file inside the serverless function bundle
  outputFileTracingIncludes: {
    "/api/upscale": ["./models/realesr-general-x4v3.onnx"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
