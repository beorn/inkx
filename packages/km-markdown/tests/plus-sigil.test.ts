/**
 * `+` Bullet Sigil Tests — km-beads.bead-sigil-elevation
 *
 * The `+` bullet marker is a load-bearing sigil meaning "elevated sub-bead":
 * a sub-list-item that should be treated as a first-class bead despite living
 * deeper than the depth-2 default in `@km/<scope>/<name>`.
 *
 * Contract:
 * - `+ foo`            → node.name === "+"          (sigil, no anchor)
 * - `+ foo ^abc`       → node.name === "+abc"       (sigil + anchor literal)
 * - `- foo`            → node.name === undefined    (no sigil, no anchor)
 * - `- foo ^abc`       → node.name === "abc"        (anchor only)
 * - `* foo`            → node.name === undefined    (other markers stay verbatim
 *                                                    via _mdBullet only)
 *
 * Both sigil-bearing names round-trip through the serializer:
 * - `+abc` → ` ^abc` anchor + bullet `+` (from _mdBullet)
 * - `+`    → no anchor emitted, bullet `+` (from _mdBullet)
 *
 * Other bullet chars (`-`, `*`) keep their existing behavior — bullet
 * preservation via `data._mdBullet` only, no name-prefix sigil.
 */

import { describe, test, expect } from "vitest"
import { roundtrip, parse, normalizeMarkdown } from "./helpers/test-utils.ts"

describe("Parser: `+` bullet → +-prefixed name", () => {
  test("plain + bullet item gets name === '+'", () => {
    const nodes = parse(`+ Elevated sub-bead`)
    const li = nodes.find((n) => n.type === "p" && n.item != null)
    expect(li).toBeDefined()
    expect(li!.name).toBe("+")
    expect(li!.content).toBe("Elevated sub-bead")
    expect(li!.data?._mdBullet).toBe("+")
  })

  test("+ bullet with anchor gets name === '+anchor'", () => {
    const nodes = parse(`+ Elevated with anchor ^abc1`)
    const li = nodes.find((n) => n.type === "p" && n.item != null)
    expect(li).toBeDefined()
    expect(li!.name).toBe("+abc1")
    expect(li!.content).toBe("Elevated with anchor")
  })

  test("+ bullet task gets name === '+'", () => {
    const nodes = parse(`+ [ ] Elevated task`)
    const task = nodes.find((n) => n.type === "p" && n.item?.task)
    expect(task).toBeDefined()
    expect(task!.name).toBe("+")
    expect(task!.content).toBe("Elevated task")
  })

  test("+ bullet task with anchor gets name === '+anchor'", () => {
    const nodes = parse(`+ [ ] Elevated task ^k7m2`)
    const task = nodes.find((n) => n.type === "p" && n.item?.task)
    expect(task).toBeDefined()
    expect(task!.name).toBe("+k7m2")
    expect(task!.content).toBe("Elevated task")
  })

  test("- bullet has no sigil prefix in name", () => {
    const nodes = parse(`- Regular item`)
    const li = nodes.find((n) => n.type === "p" && n.item != null)
    expect(li).toBeDefined()
    expect(li!.name).toBeUndefined()
  })

  test("* bullet has no sigil prefix in name", () => {
    const nodes = parse(`* Star bullet`)
    const li = nodes.find((n) => n.type === "p" && n.item != null)
    expect(li).toBeDefined()
    expect(li!.name).toBeUndefined()
    expect(li!.data?._mdBullet).toBe("*")
  })

  test("- bullet with anchor has plain anchor in name", () => {
    const nodes = parse(`- Regular ^abc1`)
    const li = nodes.find((n) => n.type === "p" && n.item != null)
    expect(li).toBeDefined()
    expect(li!.name).toBe("abc1")
  })

  test("ordered list does not get + sigil even if marker is +", () => {
    // Defensive: + in ordered context should be impossible (mdast wouldn't
    // parse "+1." as ordered), but check the predicate is bullet-specific.
    const nodes = parse(`1. First item`)
    const li = nodes.find((n) => n.type === "p" && n.item?.list === "1.")
    expect(li).toBeDefined()
    expect(li!.name).toBeUndefined()
  })
})

describe("Predicate: node.name?.startsWith('+') identifies elevated sub-beads", () => {
  test("matches plain elevated item", () => {
    const nodes = parse(`+ Elevated`)
    const li = nodes.find((n) => n.type === "p" && n.item != null)
    expect(li!.name?.startsWith("+")).toBe(true)
  })

  test("matches elevated item with anchor", () => {
    const nodes = parse(`+ Elevated ^x9`)
    const li = nodes.find((n) => n.type === "p" && n.item != null)
    expect(li!.name?.startsWith("+")).toBe(true)
  })

  test("does not match regular item", () => {
    const nodes = parse(`- Regular`)
    const li = nodes.find((n) => n.type === "p" && n.item != null)
    expect(li!.name?.startsWith("+") ?? false).toBe(false)
  })

  test("does not match anchor-only item", () => {
    const nodes = parse(`- Regular ^abc`)
    const li = nodes.find((n) => n.type === "p" && n.item != null)
    expect(li!.name?.startsWith("+") ?? false).toBe(false)
  })
})

describe("Round-trip: `+` bullet survives parse → serialize", () => {
  test("plain + bullet round-trips", () => {
    const md = `+ Elevated sub-bead\n`
    expect(normalizeMarkdown(roundtrip(md))).toBe(normalizeMarkdown(md))
  })

  test("+ bullet with anchor round-trips", () => {
    const md = `+ Elevated with anchor ^abc1\n`
    expect(normalizeMarkdown(roundtrip(md))).toBe(normalizeMarkdown(md))
  })

  test("+ bullet task round-trips", () => {
    const md = `+ [ ] Elevated task\n`
    expect(normalizeMarkdown(roundtrip(md))).toBe(normalizeMarkdown(md))
  })

  test("+ bullet task with anchor round-trips", () => {
    const md = `+ [ ] Elevated task ^k7m2\n`
    expect(normalizeMarkdown(roundtrip(md))).toBe(normalizeMarkdown(md))
  })

  test("mixed list with + and - markers preserves both", () => {
    const md = `- Regular\n+ Elevated\n- Another regular\n`
    expect(normalizeMarkdown(roundtrip(md))).toBe(normalizeMarkdown(md))
  })
})
