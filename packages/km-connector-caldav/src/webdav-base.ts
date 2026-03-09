/**
 * WebDAV Base Client
 *
 * Shared functionality for CalDAV and CardDAV clients.
 */

import { createLogger } from "loggily"

const log = createLogger("km:webdav:base")

/**
 * Create Basic Auth header from credentials
 */
export function createBasicAuthHeader(username: string, password: string): string {
  const credentials = `${username}:${password}`
  return `Basic ${Buffer.from(credentials).toString("base64")}`
}

/**
 * Make a WebDAV request
 */
export async function webdavRequest(
  method: string,
  url: string,
  authHeader: string,
  body?: string,
  headers?: Record<string, string>,
): Promise<Response> {
  log.debug?.(`${method} ${url}`)
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/xml; charset=utf-8",
      ...headers,
    },
    body,
  })

  if (!response.ok && response.status !== 207) {
    log.debug?.("request failed", {
      method,
      url,
      status: response.status,
      statusText: response.statusText,
    })
    throw new Error(`WebDAV request failed: ${response.status} ${response.statusText}`)
  }

  log.debug?.(`${method} ${url} → ${response.status}`)
  return response
}

/**
 * Discover principal URL using PROPFIND
 */
export async function discoverPrincipal(baseUrl: string, authHeader: string): Promise<string | null> {
  const propfind = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:current-user-principal/>
  </D:prop>
</D:propfind>`

  const response = await webdavRequest("PROPFIND", baseUrl, authHeader, propfind, {
    Depth: "0",
  })

  const text = await response.text()
  const principalMatch = text.match(/<D:href>([^<]+)<\/D:href>/)
  const result = principalMatch?.[1] ?? null
  log.debug?.(`discoverPrincipal: ${baseUrl} → ${result ?? "(not found)"}`)
  return result
}
