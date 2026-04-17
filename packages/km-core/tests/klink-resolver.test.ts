import { describe, expect, test } from "vitest"
import { parseLinkHref } from "../src/klink-ref.ts"
import { createLinkResolver, type NameIndex } from "../src/klink-resolver.ts"

const idx: NameIndex = new Map<string, string[]>([
  ["alice", ["n1"]],
  ["project/alpha", ["n2"]],
  ["bob", ["n3", "n4"]], // ambiguous
  ["#urgent", ["n5"]], // sigil-prefixed target
])

describe("createLinkResolver — 5 cases", () => {
  test("external", () => {
    const r = createLinkResolver(idx, "host").resolve(parseLinkHref("https://example.com/"))
    expect(r.kind).toBe("external")
    if (r.kind === "external") {
      expect(r.url.href).toBe("https://example.com/")
    }
  })

  test("self-ref", () => {
    const r = createLinkResolver(idx, "host").resolve(parseLinkHref("#Section"))
    expect(r).toEqual({
      kind: "self",
      host: "host",
      anchor: { kind: "section", value: "Section" },
    })
  })

  test("self-ref with null host → broken", () => {
    const r = createLinkResolver(idx, null).resolve(parseLinkHref("#Section"))
    expect(r.kind).toBe("broken")
  })

  test("resolved — unambiguous target", () => {
    const r = createLinkResolver(idx, "host").resolve(parseLinkHref("km:Alice"))
    expect(r).toEqual({ kind: "resolved", target: "n1", anchor: null })
  })

  test("resolved with anchor", () => {
    const r = createLinkResolver(idx, "host").resolve(parseLinkHref("km:Project/Alpha#Section"))
    expect(r).toEqual({
      kind: "resolved",
      target: "n2",
      anchor: { kind: "section", value: "Section" },
    })
  })

  test("ambiguous — multiple targets", () => {
    const r = createLinkResolver(idx, "host").resolve(parseLinkHref("km:Bob"))
    expect(r.kind).toBe("ambiguous")
    if (r.kind === "ambiguous") {
      expect(r.targets).toEqual(["n3", "n4"])
    }
  })

  test("broken — unknown name", () => {
    const r = createLinkResolver(idx, "host").resolve(parseLinkHref("km:NotAThing"))
    expect(r).toEqual({ kind: "broken", name: "NotAThing" })
  })

  test("sigil-prefixed target resolves via encoded href", () => {
    const r = createLinkResolver(idx, "host").resolve(parseLinkHref("km:%23urgent"))
    expect(r).toEqual({ kind: "resolved", target: "n5", anchor: null })
  })

  test("sigil-prefixed target resolves via raw (forgiving) href", () => {
    const r = createLinkResolver(idx, "host").resolve(parseLinkHref("km:#urgent"))
    expect(r).toEqual({ kind: "resolved", target: "n5", anchor: null })
  })

  test("case-insensitive lookup, display preserves casing", () => {
    const r = createLinkResolver(idx, "host").resolve(parseLinkHref("km:ALICE"))
    expect(r).toEqual({ kind: "resolved", target: "n1", anchor: null })
  })
})
