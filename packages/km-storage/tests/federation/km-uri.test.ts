/**
 * Tests for the km: cross-repo URI parser.
 *
 * Covers hub/km/storage-architecture.md §5.2 — the `km:/<alias>/<rest>` form.
 * The same-repo form `km:<name>` is intentionally handed off to
 * `parseLinkHref` in `@km/core/klink-ref`; we only check that we correctly
 * label it `km-self` and extract the raw rest of the path for delegation.
 */

import { describe, expect, test } from "vitest"

import { parseKmUri } from "../../src/federation/km-uri.ts"

describe("parseKmUri — cross-repo form", () => {
  test("km:/alias/rel/path parses alias + relPath", () => {
    const result = parseKmUri("km:/vault/notes/foo.md")
    expect(result).toEqual({
      kind: "km-uri",
      alias: "vault",
      relPath: "notes/foo.md",
      fragment: null,
    })
  })

  test("km:/alias/path#fragment captures fragment", () => {
    const result = parseKmUri("km:/vault/notes/foo.md#^abc")
    expect(result).toEqual({
      kind: "km-uri",
      alias: "vault",
      relPath: "notes/foo.md",
      fragment: "^abc",
    })
  })

  test("km:/alias with no path returns empty relPath", () => {
    const result = parseKmUri("km:/vault")
    expect(result).toEqual({
      kind: "km-uri",
      alias: "vault",
      relPath: "",
      fragment: null,
    })
  })

  test("km:/alias/ (trailing slash) normalizes to empty relPath", () => {
    const result = parseKmUri("km:/vault/")
    expect(result).toEqual({
      kind: "km-uri",
      alias: "vault",
      relPath: "",
      fragment: null,
    })
  })

  test("km:/alias/foo/ trims trailing slash", () => {
    const result = parseKmUri("km:/vault/foo/")
    expect(result).toEqual({
      kind: "km-uri",
      alias: "vault",
      relPath: "foo",
      fragment: null,
    })
  })

  test("percent-encoded alias decodes", () => {
    const result = parseKmUri("km:/my%20vault/notes")
    expect(result).toEqual({
      kind: "km-uri",
      alias: "my vault",
      relPath: "notes",
      fragment: null,
    })
  })

  test("percent-encoded path segments decode", () => {
    const result = parseKmUri("km:/vault/notes/hello%20world.md")
    expect(result).toEqual({
      kind: "km-uri",
      alias: "vault",
      relPath: "notes/hello world.md",
      fragment: null,
    })
  })

  test("alias with dashes/dots passes through unchanged", () => {
    const result = parseKmUri("km:/my-vault.v2/path")
    expect(result?.kind).toBe("km-uri")
    if (result?.kind !== "km-uri") throw new Error("expected km-uri")
    expect(result.alias).toBe("my-vault.v2")
    expect(result.relPath).toBe("path")
  })

  test("empty alias (km://) is malformed → null", () => {
    expect(parseKmUri("km:/")).toBeNull()
    expect(parseKmUri("km://")).toBeNull()
  })

  test("fragment without path", () => {
    const result = parseKmUri("km:/vault#^anchor")
    expect(result).toEqual({
      kind: "km-uri",
      alias: "vault",
      relPath: "",
      fragment: "^anchor",
    })
  })

  test("section fragment (no caret)", () => {
    const result = parseKmUri("km:/vault/foo.md#Section Name")
    expect(result?.fragment).toBe("Section Name")
  })
})

describe("parseKmUri — same-repo delegation", () => {
  test("km:name returns km-self with rawPath", () => {
    const result = parseKmUri("km:foo")
    expect(result).toEqual({
      kind: "km-self",
      relPath: "foo",
      fragment: null,
    })
  })

  test("km:name#fragment returns km-self + fragment", () => {
    const result = parseKmUri("km:foo#^abc")
    expect(result).toEqual({
      kind: "km-self",
      relPath: "foo",
      fragment: "^abc",
    })
  })

  test("km:@alice (sigil) returns km-self without surprises", () => {
    const result = parseKmUri("km:@alice")
    expect(result).toEqual({
      kind: "km-self",
      relPath: "@alice",
      fragment: null,
    })
  })
})

describe("parseKmUri — rejection / edge cases", () => {
  test("empty string → null", () => {
    expect(parseKmUri("")).toBeNull()
  })

  test("non-km scheme → null", () => {
    expect(parseKmUri("https://example.com")).toBeNull()
    expect(parseKmUri("mailto:a@b")).toBeNull()
  })

  test("self-ref #anchor → null (not a km: URI)", () => {
    expect(parseKmUri("#section")).toBeNull()
  })

  test("plain text → null", () => {
    expect(parseKmUri("not a uri at all")).toBeNull()
  })

  test("bare 'km:' → null", () => {
    expect(parseKmUri("km:")).toBeNull()
  })

  test("non-string inputs → null", () => {
    // @ts-expect-error — exercising runtime guard
    expect(parseKmUri(null)).toBeNull()
    // @ts-expect-error — exercising runtime guard
    expect(parseKmUri(undefined)).toBeNull()
    // @ts-expect-error — exercising runtime guard
    expect(parseKmUri(42)).toBeNull()
  })
})
