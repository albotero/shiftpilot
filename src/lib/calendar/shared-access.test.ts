import { describe, expect, it } from "vitest"
import { getShareHost, shouldBlockPublicShareRequest } from "./shared-access"

const shareBaseUrl = "https://calendario.albotero.com"

function request(pathname: string, overrides: Partial<Parameters<typeof shouldBlockPublicShareRequest>[0]> = {}) {
  return {
    method: "GET",
    pathname,
    host: "calendario.albotero.com",
    cloudflareRay: null,
    shareBaseUrl,
    ...overrides,
  }
}

describe("shared access", () => {
  it("reads the public host from the share URL", () => {
    expect(getShareHost(shareBaseUrl)).toBe("calendario.albotero.com")
    expect(getShareHost("not a url")).toBeNull()
  })

  it("allows shared months and static assets on the public host", () => {
    expect(shouldBlockPublicShareRequest(request("/2026/10"))).toBe(false)
    expect(shouldBlockPublicShareRequest(request("/2026/10/"))).toBe(false)
    expect(shouldBlockPublicShareRequest(request("/_next/static/chunks/app.js"))).toBe(false)
    expect(shouldBlockPublicShareRequest(request("/favicon.ico", { method: "HEAD" }))).toBe(false)
  })

  it("blocks the rest of the app on the public host", () => {
    for (const pathname of ["/", "/calendar", "/finance", "/api/calendar", "/2026/10/extra", "/_next/image"]) {
      expect(shouldBlockPublicShareRequest(request(pathname))).toBe(true)
    }
    expect(shouldBlockPublicShareRequest(request("/2026/10", { method: "POST" }))).toBe(true)
  })

  it("treats any request coming through Cloudflare as public", () => {
    expect(shouldBlockPublicShareRequest(request("/calendar", { host: "172.17.20.129:3000", cloudflareRay: "abc" }))).toBe(true)
    expect(shouldBlockPublicShareRequest(request("/calendar", { shareBaseUrl: undefined, cloudflareRay: "abc" }))).toBe(true)
  })

  it("leaves the LAN app untouched", () => {
    expect(shouldBlockPublicShareRequest(request("/calendar", { host: "shiftpilot.albotero.com:3000" }))).toBe(false)
    expect(shouldBlockPublicShareRequest(request("/api/calendar", { host: "shiftpilot.albotero.com:3000", method: "POST" }))).toBe(false)
  })
})
