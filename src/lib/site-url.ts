/** Public UI assets are rooted under the repository path on GitHub Pages. */
export const isPagesSite = process.env.NEXT_PUBLIC_DEPLOY_TARGET === "github-pages";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function siteAsset(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("SITE_ASSET_PATH_MUST_BE_ROOT_RELATIVE");
  return `${basePath}${path}`;
}
