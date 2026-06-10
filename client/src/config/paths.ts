const contextRoot = (import.meta.env.VITE_CONTEXT_ROOT ?? "").replace(/^\/+|\/+$/g, "");

/** React Router basename, e.g. "/growth" or "" */
export const routerBasename = contextRoot ? `/${contextRoot}` : "";

/** Site-root API prefix for fetch(), e.g. "/growth/api" or "/api" */
export const apiPrefix = routerBasename ? `${routerBasename}/api` : "/api";

/** Absolute path for img/src/href that must start at site root */
export function absoluteApiPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${apiPrefix}${p}`;
}

/** Path to a file in Vite `public/` (honours `base` / context root at build time). */
export function publicAssetPath(file: string): string {
  const name = file.replace(/^\//, "");
  return `${import.meta.env.BASE_URL}${name}`;
}
