import { normalizeShareBaseUrl } from "./share-url"

export const SHARED_NOT_FOUND_PATH = "/shared-not-found"

const SHARED_MONTH_PATH = /^\/\d{4}\/\d{2}\/?$/
const SHARED_ASSET_PATH = /^\/(?:_next\/static\/.+|favicon\.ico)$/

type SharedRequest = {
  method: string
  pathname: string
  host: string | null
  cloudflareRay: string | null
  shareBaseUrl: string | undefined
}

export function getShareHost(shareBaseUrl: string | undefined) {
  const origin = normalizeShareBaseUrl(shareBaseUrl)
  return origin ? new URL(origin).host : null
}

export function isPublicShareRequest({ host, cloudflareRay, shareBaseUrl }: SharedRequest) {
  const shareHost = getShareHost(shareBaseUrl)
  return Boolean(cloudflareRay) || Boolean(shareHost && host?.toLowerCase() === shareHost)
}

export function isAllowedPublicShareRequest({ method, pathname }: SharedRequest) {
  if (method !== "GET" && method !== "HEAD") return false
  return SHARED_MONTH_PATH.test(pathname) || SHARED_ASSET_PATH.test(pathname)
}

export function shouldBlockPublicShareRequest(request: SharedRequest) {
  return isPublicShareRequest(request) && !isAllowedPublicShareRequest(request)
}
