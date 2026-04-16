/**
 * Tests for normalizeNodeName and normalizeRefHref
 *
 * These two functions are the single sources of truth for:
 * - normalizeNodeName: heading title → node `name` field
 * - normalizeRefHref: notation form + label → canonical `href`
 *
 * The critical invariant: normalizeNodeName must produce keys that match
 * the name index lookup (lowercased, .md stripped) used by resolveByName.
 * In particular, sigil prefixes (@, +, #) must be preserved so that heading
 * nodes resolve against folder nodes with the same sigiled name.
 */

import { describe, expect, it } from "vitest"
import { normalizeNodeName, normalizeRefHref, slugify } from "../src/parser.ts"
import type { MdForm } from "../src/parser.ts"

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
// normalizeRefHref
// =============================================================================

describe("normalizeRefHref", () => {
  describe("wiki form", () => {
    it("wraps bare name in km: scheme", () => {
      expect(normalizeRefHref("wiki", "Note")).toBe("km:Note")
    })

    it("preserves fragment (# section)", () => {
      expect(normalizeRefHref("wiki", "Note#Section")).toBe("km:Note#Section")
    })

    it("converts block ref caret to #^ anchor", () => {
      expect(normalizeRefHref("wiki", "Note^abc")).toBe("km:Note#^abc")
    })
  })

  describe("mention form", () => {
    it("strips @ and wraps in km: scheme", () => {
      expect(normalizeRefHref("mention", "@Alice")).toBe("km:Alice")
    })

    it("handles name without @ prefix", () => {
      // Edge case: if label somehow doesn't have @
      expect(normalizeRefHref("mention", "Alice")).toBe("km:Alice")
    })
  })

  describe("tag form", () => {
    it("strips # and wraps in km: scheme", () => {
      expect(normalizeRefHref("tag", "#urgent")).toBe("km:urgent")
    })

    it("handles name without # prefix", () => {
      expect(normalizeRefHref("tag", "urgent")).toBe("km:urgent")
    })
  })

  describe("project form", () => {
    it("strips + and wraps in km: scheme", () => {
      expect(normalizeRefHref("project", "+cleanup")).toBe("km:cleanup")
    })

    it("handles name without + prefix", () => {
      expect(normalizeRefHref("project", "cleanup")).toBe("km:cleanup")
    })
  })

  describe("external URL forms", () => {
    it("bare URLs pass through unchanged", () => {
      expect(normalizeRefHref("bare", "https://example.com")).toBe("https://example.com")
    })

    it("mdlink URLs pass through unchanged", () => {
      expect(normalizeRefHref("mdlink", "https://example.com")).toBe("https://example.com")
    })

    it("autolink URLs pass through unchanged", () => {
      expect(normalizeRefHref("autolink", "https://example.com")).toBe("https://example.com")
    })

    it("mailto links pass through unchanged", () => {
      expect(normalizeRefHref("autolink", "mailto:a@b.com")).toBe("mailto:a@b.com")
    })
  })

  describe("all MdForm variants covered", () => {
    const forms: MdForm[] = ["wiki", "mdlink", "autolink", "bare", "tag", "mention", "project"]
    for (const form of forms) {
      it(`handles form: ${form}`, () => {
        // Should not throw for any valid form
        const result = normalizeRefHref(form, "test")
        expect(typeof result).toBe("string")
        expect(result.length).toBeGreaterThan(0)
      })
    }
  })

  describe("design doc examples (docs/design/links.md)", () => {
    // From the "Markdown → Ref" table in the design doc
    it("[[Note]] → km:Note", () => {
      expect(normalizeRefHref("wiki", "Note")).toBe("km:Note")
    })
    it("[[Note#Section]] → km:Note#Section", () => {
      expect(normalizeRefHref("wiki", "Note#Section")).toBe("km:Note#Section")
    })
    it("[[Note^abc]] → km:Note#^abc", () => {
      expect(normalizeRefHref("wiki", "Note^abc")).toBe("km:Note#^abc")
    })
    it("@Alice → km:Alice", () => {
      expect(normalizeRefHref("mention", "@Alice")).toBe("km:Alice")
    })
    it("#foo → km:foo", () => {
      expect(normalizeRefHref("tag", "#foo")).toBe("km:foo")
    })
    it("+bar → km:bar", () => {
      expect(normalizeRefHref("project", "+bar")).toBe("km:bar")
    })
    it("https://x.com (bare) → https://x.com", () => {
      expect(normalizeRefHref("bare", "https://x.com")).toBe("https://x.com")
    })
    it("https://x.com (mdlink) → https://x.com", () => {
      expect(normalizeRefHref("mdlink", "https://x.com")).toBe("https://x.com")
    })
    it("https://x.com (autolink) → https://x.com", () => {
      expect(normalizeRefHref("autolink", "https://x.com")).toBe("https://x.com")
    })
    it("mailto:a@b.com (autolink) → mailto:a@b.com", () => {
      expect(normalizeRefHref("autolink", "mailto:a@b.com")).toBe("mailto:a@b.com")
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
