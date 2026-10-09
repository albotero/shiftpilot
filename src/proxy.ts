import { NextResponse, type NextRequest } from "next/server"
import { SHARED_NOT_FOUND_PATH, shouldBlockPublicShareRequest } from "@/lib/calendar/shared-access"

export function proxy(request: NextRequest) {
  const blocked = shouldBlockPublicShareRequest({
    method: request.method,
    pathname: request.nextUrl.pathname,
    host: request.headers.get("host"),
    cloudflareRay: request.headers.get("cf-ray"),
    shareBaseUrl: process.env.SHIFTPILOT_SHARE_URL,
  })
  if (!blocked) return NextResponse.next()

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse(null, { status: 404 })
  }
  return NextResponse.rewrite(new URL(SHARED_NOT_FOUND_PATH, request.url))
}
