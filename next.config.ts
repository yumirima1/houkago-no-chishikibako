import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // These parsers run only in the Node backend. Preserve their native optional
  // dependencies instead of bundling a DOM/CSS engine into Route Handlers.
  serverExternalPackages: ["@mozilla/readability", "linkedom", "robots-parser"],
};

export default nextConfig;
