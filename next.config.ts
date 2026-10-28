import type { NextConfig } from "next";

const pages = process.env.NEXT_PUBLIC_DEPLOY_TARGET === "github-pages";
const nextConfig: NextConfig = {
  devIndicators: false,
  ...(pages ? {
    output: "export",
    basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "/kousatsubako",
    trailingSlash: true,
    images: { unoptimized: true },
    turbopack: { root: process.env.PAGES_BUILD_ROOT ?? process.cwd() },
  } as NextConfig : {}),
  // These parsers run only in the Node backend. Preserve their native optional
  // dependencies instead of bundling a DOM/CSS engine into Route Handlers.
  serverExternalPackages: ["@mozilla/readability", "linkedom", "robots-parser"],
};

export default nextConfig;
