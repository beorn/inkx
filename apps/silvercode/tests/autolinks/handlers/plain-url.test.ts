/**
 * Plain-URL pipeline test — proves that an unconfigured `https://...` URL
 * in displayed text flows through the handler registry as a virtual rule,
 * routed via the `https:` scheme to a webcard preview.
 *
 * Bead: km-silvercode.autolinks-uri-pivot
 *
 * This is the "plain URL pipeline confirmation" required by the bead. Two
 * layers are exercised:
 *   1. `detectAutolinks` emits a virtual autolink for any URL-shaped token
 *      not already covered by a configured rule.
 *   2. `resolvePreview` routes that detection through `parseResolvesTo` and
 *      the handler registry, dispatching on the `https:` scheme to produce
 *      the v1 webcard placeholder body.
 *
 * Note: in the full DetectionText pipeline, `mergeDetections` shadows the
 * autolink-virtual detection with the built-in `kind: "url"` detection from
 * `detection.ts`. That's intentional in v1 — replacing the built-in URL
 * popover with the registry-driven one is a follow-up. The pipeline below
 * proves the registry handles plain URLs correctly when reached.
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

  test("mergeDetections still shadows virtual URL autolinks with built-in url detections (v1 behavior)", () => {
    // Documents the v1 layering: detection.ts produces kind=url for plain URLs
    // and mergeDetections gives builtins priority over autolinks. The virtual
    // detection from detectAutolinks is dropped here. This is by design in v1
    // — the URL popover renderer is independent of the registry. Once the URL
    // popover migrates to use the registry, this test will flip.
    const text = "see https://github.com/foo/bar for details"
    const builtins = detectReferences(text)
    const autolinks = detectAutolinks(text, [])
    const merged = mergeDetections(builtins, autolinks)
    const kinds = merged.map((d) => d.kind)
    expect(kinds).toContain("url")
    expect(kinds).not.toContain("autolink")
  })
})
