/**
 * Tests for normalizeNodeName and normalizeLinkHref
 *
 * These two functions are the single sources of truth for:
 * - normalizeNodeName: heading title → node `name` field
 * - normalizeLinkHref: notation form + label → canonical `href`
 *
 * The critical invariant: normalizeNodeName must produce keys that match
 * the name index lookup (lowercased, .md stripped) used by resolveByName.
 * In particular, sigil prefixes (@, +, #) must be preserved so that heading
 * nodes resolve against folder nodes with the same sigiled name.
 *
 * Under the v4 link model (docs/design/links.md), MdForm is closed to
 * 4 values ('wiki' | 'mdlink' | 'autolink' | 'bare'); sigil-prefixed names
 * flow through `bare` and are percent-encoded where needed.
 */

import { describe, expect, it } from "vitest"
import { normalizeNodeName, slugify } from "../src/parser.ts"
import { normalizeLinkHref } from "../src/link-href.ts"
import type { MdForm } from "@km/core"

// =============================================================================
// normalizeNodeName
// =============================================================================

describe("normalizeNodeName", () => {
  it("preserves plain text", () => {
    expect(normalizeNodeName("inbox")).toBe("inbox")
    expect(normalizeNodeName("My Notes")).toBe("My Notes")
  })

  it("preserves sigil prefixes (@, +, #)", () => {
    expect(normalizeNodeName("@office")).toBe("@office")
    expect(normalizeNodeName("@Alice")).toBe("@Alice")
    expect(normalizeNodeName("+cleanup")).toBe("+cleanup")
    expect(normalizeNodeName("#urgent")).toBe("#urgent")
  })

  it("strips task marker prefix", () => {
    expect(normalizeNodeName("- [x] Done task")).toBe("Done task")
    expect(normalizeNodeName("- [ ] Todo task")).toBe("Todo task")
    expect(normalizeNodeName("- [/] In progress")).toBe("In progress")
    expect(normalizeNodeName("- [-] Cancelled")).toBe("Cancelled")
  })

  it("strips markdown inline syntax (backticks, brackets)", () => {
    expect(normalizeNodeName("`code`")).toBe("code")
    expect(normalizeNodeName("[link text]")).toBe("link text")
    expect(normalizeNodeName("[[wikilink]]")).toBe("wikilink")
  })

  it("trims whitespace", () => {
    expect(normalizeNodeName("  spaced  ")).toBe("spaced")
    expect(normalizeNodeName("  @office  ")).toBe("@office")
  })

  it("handles combined cases", () => {
    expect(normalizeNodeName("- [x] @office")).toBe("@office")
    expect(normalizeNodeName("- [ ] `code` task")).toBe("code task")
  })

  it("does NOT lowercase (name index lowercases at lookup time)", () => {
    expect(normalizeNodeName("My Project")).toBe("My Project")
    expect(normalizeNodeName("@Office")).toBe("@Office")
  })

  describe("name index key compatibility", () => {
    // The name index in smart-resolver.ts keys on:
    //   row.name.toLowerCase().replace(/\.md$/i, "")
    // Folder nodes store name = entry.name (e.g., "@office")
    // Heading nodes must produce names that generate the same key.

    function nameIndexKey(name: string): string {
      return name.toLowerCase().replace(/\.md$/i, "")
    }

    it("@office heading matches @office folder in name index", () => {
      const headingName = normalizeNodeName("@office")
      const folderName = "@office" // raw entry.name from filesystem
      expect(nameIndexKey(headingName)).toBe(nameIndexKey(folderName))
    })

    it("+cleanup heading matches +cleanup folder in name index", () => {
      const headingName = normalizeNodeName("+cleanup")
      const folderName = "+cleanup"
      expect(nameIndexKey(headingName)).toBe(nameIndexKey(folderName))
    })

    it("#urgent heading matches #urgent folder in name index", () => {
      const headingName = normalizeNodeName("#urgent")
      const folderName = "#urgent"
      expect(nameIndexKey(headingName)).toBe(nameIndexKey(folderName))
    })

    it("plain name heading matches plain folder", () => {
      const headingName = normalizeNodeName("inbox")
      const folderName = "inbox"
      expect(nameIndexKey(headingName)).toBe(nameIndexKey(folderName))
    })
  })

  describe("regression: slugify vs normalizeNodeName", () => {
    // slugify strips sigils — this was the root cause of the bug.
    // normalizeNodeName must NOT strip sigils.

    it("slugify strips @ (the old broken behavior)", () => {
      expect(slugify("@office")).toBe("office")
    })

    it("normalizeNodeName preserves @ (the fix)", () => {
      expect(normalizeNodeName("@office")).toBe("@office")
    })

    it("slugify strips + (the old broken behavior)", () => {
      expect(slugify("+cleanup")).toBe("cleanup")
    })

    it("normalizeNodeName preserves + (the fix)", () => {
      expect(normalizeNodeName("+cleanup")).toBe("+cleanup")
    })

    it("slugify strips # (the old broken behavior)", () => {
      expect(slugify("#urgent")).toBe("urgent")
    })

    it("normalizeNodeName preserves # (the fix)", () => {
      expect(normalizeNodeName("#urgent")).toBe("#urgent")
    })
  })
})

// =============================================================================
// normalizeLinkHref
// =============================================================================

describe("normalizeLinkHref", () => {
  describe("wiki form", () => {
    it("wraps bare name in km: scheme", () => {
      expect(normalizeLinkHref("wiki", "Note")).toBe("km:Note")
    })

    it("preserves fragment (# section)", () => {
      expect(normalizeLinkHref("wiki", "Note#Section")).toBe("km:Note#Section")
    })

    it("converts block ref caret to #^ anchor", () => {
      expect(normalizeLinkHref("wiki", "Note^abc")).toBe("km:Note#^abc")
    })

    it("self-ref wiki form (starts with #) produces fragment-only href", () => {
      expect(normalizeLinkHref("wiki", "#Section")).toBe("#Section")
    })
  })

  describe("bare form with sigils (sigil-as-name, docs/design/links.md)", () => {
    it("@Alice preserves the sigil inside km: scheme", () => {
      expect(normalizeLinkHref("bare", "@Alice")).toBe("km:@Alice")
    })

    it("+cleanup preserves the sigil inside km: scheme", () => {
      expect(normalizeLinkHref("bare", "+cleanup")).toBe("km:+cleanup")
    })

    it("#urgent percent-encodes the sigil as %23", () => {
      expect(normalizeLinkHref("bare", "#urgent")).toBe("km:%23urgent")
    })

    it("plain bare name wraps in km: scheme", () => {
      expect(normalizeLinkHref("bare", "Note")).toBe("km:Note")
    })
  })

  describe("external URL forms", () => {
    it("bare URLs pass through unchanged", () => {
      expect(normalizeLinkHref("bare", "https://example.com")).toBe("https://example.com")
    })

    it("mdlink URLs pass through unchanged", () => {
      expect(normalizeLinkHref("mdlink", "https://example.com")).toBe("https://example.com")
    })

    it("autolink URLs pass through unchanged", () => {
      expect(normalizeLinkHref("autolink", "https://example.com")).toBe("https://example.com")
    })

    it("mailto links pass through unchanged", () => {
      expect(normalizeLinkHref("autolink", "mailto:a@b.com")).toBe("mailto:a@b.com")
    })
  })

  describe("all MdForm variants covered", () => {
    const forms: MdForm[] = ["wiki", "mdlink", "autolink", "bare"]
    for (const form of forms) {
      it(`handles form: ${form}`, () => {
        const result = normalizeLinkHref(form, "test")
        expect(typeof result).toBe("string")
        expect(result.length).toBeGreaterThan(0)
      })
    }
  })

  describe("design doc examples (docs/design/links.md)", () => {
    // From the "Markdown → KLink" table in the design doc
    it("[[Note]] → km:Note", () => {
      expect(normalizeLinkHref("wiki", "Note")).toBe("km:Note")
    })
    it("[[Note#Section]] → km:Note#Section", () => {
      expect(normalizeLinkHref("wiki", "Note#Section")).toBe("km:Note#Section")
    })
    it("[[Note^abc]] → km:Note#^abc", () => {
      expect(normalizeLinkHref("wiki", "Note^abc")).toBe("km:Note#^abc")
    })
    it("[[#Section]] → #Section (self-ref)", () => {
      expect(normalizeLinkHref("wiki", "#Section")).toBe("#Section")
    })
    it("@Alice (bare) → km:@Alice", () => {
      expect(normalizeLinkHref("bare", "@Alice")).toBe("km:@Alice")
    })
    it("#urgent (bare) → km:%23urgent", () => {
      expect(normalizeLinkHref("bare", "#urgent")).toBe("km:%23urgent")
    })
    it("+cleanup (bare) → km:+cleanup", () => {
      expect(normalizeLinkHref("bare", "+cleanup")).toBe("km:+cleanup")
    })
    it("https://x.com (bare) → https://x.com", () => {
      expect(normalizeLinkHref("bare", "https://x.com")).toBe("https://x.com")
    })
    it("https://x.com (mdlink) → https://x.com", () => {
      expect(normalizeLinkHref("mdlink", "https://x.com")).toBe("https://x.com")
    })
    it("https://x.com (autolink) → https://x.com", () => {
      expect(normalizeLinkHref("autolink", "https://x.com")).toBe("https://x.com")
    })
    it("mailto:a@b.com (autolink) → mailto:a@b.com", () => {
      expect(normalizeLinkHref("autolink", "mailto:a@b.com")).toBe("mailto:a@b.com")
    })
  })
})

// =============================================================================
// Round-trip: parse heading → normalizeNodeName → name index → resolve
// =============================================================================

describe("round-trip: heading with sigil → name field → name index key", () => {
  function nameIndexKey(name: string): string {
    return name.toLowerCase().replace(/\.md$/i, "")
  }

  // resolveByName normalizes the query the same way:
  //   name.toLowerCase().replace(/\.md$/i, "")
  function resolveByNameKey(query: string): string {
    return query.toLowerCase().replace(/\.md$/i, "")
  }

  it("@office heading resolves via name index", () => {
    const headingTitle = "@office"
    const nodeName = normalizeNodeName(headingTitle)
    const indexKey = nameIndexKey(nodeName)
    const resolveKey = resolveByNameKey("@office")
    expect(indexKey).toBe(resolveKey)
  })

  it("+cleanup heading resolves via name index", () => {
    const nodeName = normalizeNodeName("+cleanup")
    expect(nameIndexKey(nodeName)).toBe(resolveByNameKey("+cleanup"))
  })

  it("#urgent heading resolves via name index", () => {
    const nodeName = normalizeNodeName("#urgent")
    expect(nameIndexKey(nodeName)).toBe(resolveByNameKey("#urgent"))
  })

  it("heading with task marker resolves correctly", () => {
    const nodeName = normalizeNodeName("- [x] @office")
    // After normalization, name should be "@office"
    expect(nodeName).toBe("@office")
    expect(nameIndexKey(nodeName)).toBe(resolveByNameKey("@office"))
  })
})
