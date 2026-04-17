import { describe, expect, test } from "vitest"
import { parseLinkHref, stringifyLinkRef } from "../src/klink-ref.ts"

describe("parseLinkHref — km: named refs", () => {
  test("plain name", () => {
    const ref = parseLinkHref("km:Alice")
    expect(ref.isKm).toBe(true)
    expect(ref.isSelfRef).toBe(false)
    expect(ref.isExternal).toBe(false)
    expect(ref.name).toBe("alice")
    expect(ref.displayName).toBe("Alice")
    expect(ref.segments).toEqual(["alice"])
    expect(ref.fragment).toBeNull()
    expect(ref.anchor).toBeNull()
  })

  test("hierarchical name — / as path separator", () => {
    const ref = parseLinkHref("km:Project/Alpha")
    expect(ref.displayName).toBe("Project/Alpha")
    expect(ref.name).toBe("project/alpha")
    expect(ref.segments).toEqual(["project", "alpha"])
  })

  test("section anchor", () => {
    const ref = parseLinkHref("km:Note#Meeting Notes")
    expect(ref.displayName).toBe("Note")
    expect(ref.fragment).toBe("Meeting Notes")
    expect(ref.anchor).toEqual({ kind: "section", value: "Meeting Notes" })
  })

  test("block anchor", () => {
    const ref = parseLinkHref("km:Note#^abc123")
    expect(ref.displayName).toBe("Note")
    expect(ref.anchor).toEqual({ kind: "block", value: "abc123" })
  })

  test("sigil @ in name — passes through unencoded", () => {
    const ref = parseLinkHref("km:@Alice")
    expect(ref.displayName).toBe("@Alice")
    expect(ref.name).toBe("@alice")
  })

  test("sigil + in name — passes through unencoded", () => {
    const ref = parseLinkHref("km:+cleanup")
    expect(ref.displayName).toBe("+cleanup")
    expect(ref.name).toBe("+cleanup")
  })

  test("sigil # in name — percent-encoded canonical form", () => {
    const ref = parseLinkHref("km:%23urgent")
    expect(ref.displayName).toBe("#urgent")
    expect(ref.name).toBe("#urgent")
  })

  test("sigil # in name — raw form also parses (forgiving)", () => {
    const ref = parseLinkHref("km:#urgent")
    expect(ref.displayName).toBe("#urgent")
    expect(ref.name).toBe("#urgent")
    expect(ref.fragment).toBeNull()
  })

  test("section anchor on sigil-prefixed node", () => {
    const ref = parseLinkHref("km:%23urgent#Section")
    expect(ref.displayName).toBe("#urgent")
    expect(ref.fragment).toBe("Section")
  })

  test("literal # in fragment is percent-encoded", () => {
    const ref = parseLinkHref("km:Note#%23section")
    expect(ref.displayName).toBe("Note")
    expect(ref.fragment).toBe("#section")
    expect(ref.anchor).toEqual({ kind: "section", value: "#section" })
  })
})

describe("parseLinkHref — self-ref", () => {
  test("bare fragment", () => {
    const ref = parseLinkHref("#Section")
    expect(ref.isSelfRef).toBe(true)
    expect(ref.isKm).toBe(false)
    expect(ref.isExternal).toBe(false)
    expect(ref.fragment).toBe("Section")
    expect(ref.anchor).toEqual({ kind: "section", value: "Section" })
  })

  test("block self-ref", () => {
    const ref = parseLinkHref("#^abc")
    expect(ref.isSelfRef).toBe(true)
    expect(ref.anchor).toEqual({ kind: "block", value: "abc" })
  })
})

describe("parseLinkHref — external", () => {
  test("https url", () => {
    const ref = parseLinkHref("https://example.com/path")
    expect(ref.isExternal).toBe(true)
    expect(ref.scheme).toBe("https")
    expect(ref.external?.href).toBe("https://example.com/path")
  })

  test("mailto", () => {
    const ref = parseLinkHref("mailto:alice@example.com")
    expect(ref.isExternal).toBe(true)
    expect(ref.scheme).toBe("mailto")
  })

  test("malformed non-km scheme throws", () => {
    expect(() => parseLinkHref("not a url")).toThrow()
  })
})

describe("parseLinkHref — edge cases", () => {
  test("empty href throws", () => {
    expect(() => parseLinkHref("")).toThrow(TypeError)
  })

  test("km: with empty path throws", () => {
    expect(() => parseLinkHref("km:")).toThrow(SyntaxError)
  })
})

describe("stringifyLinkRef — roundtrip", () => {
  test.each([
    "km:Alice",
    "km:Project/Alpha",
    "km:Note#Meeting",
    "km:Note#^abc",
    "km:@Alice",
    "km:+cleanup",
    "km:%23urgent",
    "km:%23urgent#Section",
    "km:Note#%23section",
    "#Section",
    "#^abc",
    "https://example.com/",
    "mailto:alice@example.com",
  ])("roundtrips: %s", (href) => {
    const ref = parseLinkHref(href)
    const round = stringifyLinkRef(ref)
    // Reparse ensures semantic equality (some forms normalize, e.g. km:#foo → km:%23foo after canonicalization)
    expect(parseLinkHref(round)).toEqual(ref)
  })

  test("raw km:#foo canonicalizes to km:%23foo on stringify", () => {
    const ref = parseLinkHref("km:#urgent")
    expect(stringifyLinkRef(ref)).toBe("km:%23urgent")
  })
})
