/**
 * Plain-URL pipeline test — proves that an unconfigured `https://...` URL
 * in displayed text flows through the handler registry as a virtual rule,
 * routed via the `https:` scheme to a webcard preview.
 *
 * Beads: km-silvercode.autolinks-uri-pivot,
 *        km-silvercode.url-detection-via-handlers
 *
 * Three layers are exercised:
 *   1. `detectAutolinks` emits a virtual autolink for any URL-shaped token
 *      not already covered by a configured rule.
 *   2. After `mergeDetections` (no longer shadowed by a builtin URL kind),
 *      the virtual detection is what reaches `<DetectionText/>`.
 *   3. `resolvePreview` routes that detection through `parseResolvesTo` and
 *      the handler registry, dispatching on the `https:` scheme to produce
 *      the v1 webcard placeholder body.
 */

import { describe, expect, test } from "vitest"
import { detectAutolinks, mergeDetections } from "../../../src/autolinks/match.ts"
import { detectReferences } from "../../../src/detection.ts"
import { resolvePreview, clearPreviewCache } from "../../../src/autolinks/previews.ts"

describe("plain URL → handler registry", () => {
  test("detectAutolinks emits a virtual autolink for an unconfigured URL", () => {
    // No configured rules — only the virtual URL detector should fire.
    const detections = detectAutolinks("see https://github.com/foo/bar for details", [])
    const autolinks = detections.filter((d) => d.kind === "autolink")
    expect(autolinks).toHaveLength(1)
    const d = autolinks[0]!
    expect(d.match).toBe("https://github.com/foo/bar")
    expect(d.payload.virtual).toBe("1")
    expect(d.payload.resolves_to).toBe("https://github.com/foo/bar")
    expect(d.payload.source).toBe("<virtual:plain-url>")
  })

  test("the virtual autolink resolves through the https handler to a webcard preview", () => {
    clearPreviewCache()
    const detections = detectAutolinks("see https://github.com/foo/bar", [])
    const autolinks = detections.filter((d) => d.kind === "autolink")
    expect(autolinks).toHaveLength(1)
    const d = autolinks[0]!
    const result = resolvePreview({
      preview: d.payload.preview ?? "https",
      resolvesTo: d.payload.resolves_to ?? "",
      cacheKey: d.payload.cache_key ?? d.match,
    })
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    expect(result.format).toBe("text")
    expect(result.body).toContain("https://github.com/foo/bar")
    expect(result.body).toContain("github.com")
    expect(result.body).toMatch(/webcard fetch not yet implemented/i)
  })

  test("a configured rule that matches the URL takes priority over the virtual detection", () => {
    // Configured rule literal-matches the same URL — virtual detection should
    // be deduped because the configured one has lower rule_idx and wins.
    const rules = [
      {
        source: "https://github.com/foo/bar",
        regex: /https:\/\/github\.com\/foo\/bar/g,
        resolvesTo: "/local/foo/bar",
        preview: "readme" as const,
      },
    ]
    const detections = detectAutolinks("see https://github.com/foo/bar", rules)
    const autolinks = detections.filter((d) => d.kind === "autolink")
    expect(autolinks).toHaveLength(1)
    expect(autolinks[0]!.payload.resolves_to).toBe("/local/foo/bar")
    expect(autolinks[0]!.payload.virtual).toBeUndefined()
  })

  test("multiple plain URLs each get their own virtual detection", () => {
    const detections = detectAutolinks("compare https://example.com/a and https://example.com/b please", [])
    const autolinks = detections.filter((d) => d.kind === "autolink")
    expect(autolinks).toHaveLength(2)
    expect(autolinks.map((d) => d.match)).toEqual(["https://example.com/a", "https://example.com/b"])
    // Distinct cache keys.
    expect(autolinks[0]!.payload.cache_key).not.toBe(autolinks[1]!.payload.cache_key)
  })

  test("text without any URLs and no rules → empty detection list", () => {
    expect(detectAutolinks("just some prose with no URLs", [])).toEqual([])
  })

  test("after the URL→handler-registry migration, mergeDetections preserves virtual URL autolinks", () => {
    // Post-migration layering: detection.ts no longer produces a builtin
    // `kind: "url"`, so mergeDetections lets the virtual autolink through
    // to the renderer. The autolink popover then resolves through the
    // https handler. Bead: km-silvercode.url-detection-via-handlers.
    const text = "see https://github.com/foo/bar for details"
    const builtins = detectReferences(text)
    const autolinks = detectAutolinks(text, [])
    const merged = mergeDetections(builtins, autolinks)
    const kinds = merged.map((d) => d.kind)
    expect(kinds).not.toContain("url")
    expect(kinds).toContain("autolink")

    // The autolink that survives is the virtual one for the URL itself.
    const url = merged.find((d) => d.kind === "autolink")
    expect(url).toBeDefined()
    expect(url?.match).toBe("https://github.com/foo/bar")
    expect(url?.payload.virtual).toBe("1")
    expect(url?.payload.resolves_to).toBe("https://github.com/foo/bar")
  })

  test("end-to-end: virtual detection → handler registry → webcard popover body", () => {
    // The pinned-limitation test above documented the v1 gap. This is the
    // end-to-end version that exercises the full chain: scan text, merge,
    // resolve through resolvePreview, expect handler-registry output.
    clearPreviewCache()
    const text = "open https://github.com/foo/bar to inspect"
    const builtins = detectReferences(text)
    const autolinks = detectAutolinks(text, [])
    const merged = mergeDetections(builtins, autolinks)

    // Exactly one detection survives: the virtual URL autolink.
    expect(merged).toHaveLength(1)
    const d = merged[0]!
    expect(d.kind).toBe("autolink")
    expect(d.payload.virtual).toBe("1")

    // resolvePreview routes through the https handler — the body is the
    // webcard placeholder, not the legacy "Fetch on-demand" line.
    const result = resolvePreview({
      preview: d.payload.preview ?? "https",
      resolvesTo: d.payload.resolves_to ?? "",
      cacheKey: d.payload.cache_key ?? d.match,
    })
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    expect(result.body).toContain("https://github.com/foo/bar")
    expect(result.body).toMatch(/webcard fetch not yet implemented/i)
    // The legacy popover used the line "Fetch on-demand: WebFetch resolves
    // on expand." — make sure it's gone.
    expect(result.body).not.toMatch(/Fetch on-demand/i)
    expect(result.body).not.toMatch(/WebFetch resolves on expand/i)
  })
})
