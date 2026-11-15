/**
 * The public address of the site, from NEXT_PUBLIC_SITE_URL. Tolerant on purpose: a bare host such as
 * "navodaya-cricket-league.up.railway.app" is read as https, a trailing slash or path is dropped, and a value that
 * cannot be a URL falls back instead of crashing the build.
 */
export function siteUrl(fallback = "http://localhost:3000"): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!raw) return fallback;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return fallback;
  }
}
