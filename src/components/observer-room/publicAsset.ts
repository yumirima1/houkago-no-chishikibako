/** Next's basePath does not prefix URLs passed to Three's loaders. */
export function publicAsset(path: string) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
}
