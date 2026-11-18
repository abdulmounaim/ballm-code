/**
 * The console cookie uses the `__Host-` prefix on HTTPS, which pins it to the exact origin and
 * stops a compromised sibling subdomain from setting a broader cookie. Local HTTP development
 * keeps the unprefixed name because browsers reject `__Host-` cookies without `Secure`.
 */
export const LEGACY_BROWSER_COOKIE = "ballm_browser"

export function browserCookieName(publicUrl: string) {
  return publicUrl.startsWith("https://") ? "__Host-ballm_browser" : LEGACY_BROWSER_COOKIE
}
