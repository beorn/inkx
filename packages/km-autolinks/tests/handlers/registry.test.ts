/**
 * Handler-registry tests — covers the v1 hardcoded registry: scheme list,
 * dispatch, and unhandled-scheme fallback.
 *
 * Bead: km-silvercode.autolinks-uri-pivot
 */

import { describe, expect, test } from "vitest"
import { findHandler, registeredSchemes, resolveURI, type ResolveCtx } from "../../../src/autolinks/handlers/index.ts"

const CTX: ResolveCtx = { cacheKey: "test" }

describe("handler registry", () => {
  test("registers the v1 schemes: file, bd, shell, https, mcp", () => {
    const schemes = registeredSchemes()
    expect(schemes).toEqual(["file", "bd", "shell", "https", "mcp"])
  })

  test("findHandler picks the correct handler by scheme", () => {
    expect(findHandler(new URL("file:///x"))?.scheme).toBe("file")
    expect(findHandler(new URL("bd:foo.bar"))?.scheme).toBe("bd")
    expect(findHandler(new URL("https://example.com"))?.scheme).toBe("https")
    expect(findHandler(new URL("mcp:rfc.lookup"))?.scheme).toBe("mcp")
    expect(findHandler(new URL("shell://cmd"))?.scheme).toBe("shell")
  })

  test("unknown scheme returns null from findHandler", () => {
    expect(findHandler(new URL("ftp://example.com"))).toBeNull()
    expect(findHandler(new URL("unknown:empty"))).toBeNull()
  })

  test("resolveURI with unknown scheme returns a `no handler` error result", () => {
    const outcome = resolveURI(new URL("ftp://example.com"), CTX)
    expect(outcome.result.kind).toBe("error")
    if (outcome.result.kind !== "error") return
    expect(outcome.result.message).toMatch(/no handler for URI scheme `ftp`/)
    expect(outcome.watchPath).toBeUndefined()
  })

  test("resolveURI dispatches https URI to the https handler (generic webcard placeholder)", () => {
    // Use example.com — no per-host parser matches, so we land on the
    // generic webcard fallback. github.com is now intercepted by the
    // GitHub host parser (see host-parsers.test.ts).
    const outcome = resolveURI(new URL("https://example.com/foo/bar"), CTX)
    expect(outcome.result.kind).toBe("ok")
    if (outcome.result.kind !== "ok") return
    expect(outcome.result.format).toBe("text")
    expect(outcome.result.body).toContain("https://example.com/foo/bar")
    expect(outcome.result.body).toContain("example.com")
    // No fetcher implemented in v1 — placeholder copy.
    expect(outcome.result.body).toMatch(/webcard fetch not yet implemented/i)
  })

  test("resolveURI dispatches https://github.com/<owner>/<repo> through the GitHub host parser", () => {
    const outcome = resolveURI(new URL("https://github.com/foo/bar"), CTX)
    expect(outcome.result.kind).toBe("ok")
    if (outcome.result.kind !== "ok") return
    expect(outcome.result.format).toBe("text")
    expect(outcome.result.body).toBe("GitHub repo: foo/bar")
  })

  test("resolveURI dispatches mcp URI to the mcp handler stub", () => {
    const outcome = resolveURI(new URL("mcp:rfc.lookup"), CTX)
    expect(outcome.result.kind).toBe("error")
    if (outcome.result.kind !== "error") return
    expect(outcome.result.message).toMatch(/mcp preview not yet implemented/i)
    expect(outcome.result.message).toMatch(/km-silvercode\.autolinks-mcp-resolver/)
  })
})
