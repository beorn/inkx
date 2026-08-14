/**
 * `fileBrowserIcons` / `useFileBrowserIcons`
 *
 * The module exists because the directory/file pair is a RESOLUTION, not a
 * constant. These tests assert the two properties a consumer depends on — the
 * branches are distinguishable, and each is safe on the terminal it is chosen
 * for — plus the documented default when no Term is in scope, per the
 * defaults-contract convention.
 *
 * Deliberately NOT pinned: the exact codepoints. Pinning them would re-freeze
 * the choice this module exists to keep open, and would fail on an honest
 * retune of the icon set. What matters is that a patched-font terminal never
 * receives emoji and an unpatched one never receives Private Use Area glyphs.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { fileBrowserIcons, useFileBrowserIcons, Text } from "silvery"

/** Where every Nerd Font glyph lives — unrenderable without a patched font. */
const PRIVATE_USE_AREA = /[\u{E000}-\u{F8FF}]/u
/** Emoji presentation — renders anywhere, occupies two cells. */
const EMOJI_PRESENTATION = /[\u{1F300}-\u{1FAFF}]/u

describe("fileBrowserIcons", () => {
  test("a patched-font terminal gets glyphs, never emoji", () => {
    const icons = fileBrowserIcons(true)

    expect(icons.directory).toMatch(PRIVATE_USE_AREA)
    expect(icons.file).toMatch(PRIVATE_USE_AREA)
    expect(icons.directory).not.toMatch(EMOJI_PRESENTATION)
    expect(icons.file).not.toMatch(EMOJI_PRESENTATION)
  })

  test("a terminal without a patched font gets emoji, never Private Use Area", () => {
    const icons = fileBrowserIcons(false)

    expect(icons.directory).toMatch(EMOJI_PRESENTATION)
    expect(icons.file).toMatch(EMOJI_PRESENTATION)
    expect(icons.directory).not.toMatch(PRIVATE_USE_AREA)
    expect(icons.file).not.toMatch(PRIVATE_USE_AREA)
  })

  test("the two kinds are distinguishable in both branches", () => {
    // A resolver that returned one glyph for both kinds would satisfy every
    // assertion above and tell a reader nothing about what they are looking at.
    for (const nerdFont of [true, false]) {
      const icons = fileBrowserIcons(nerdFont)
      expect(icons.directory).not.toBe(icons.file)
    }
  })

  test("the branches do not collide", () => {
    expect(fileBrowserIcons(true)).not.toEqual(fileBrowserIcons(false))
  })
})

describe("useFileBrowserIcons", () => {
  test("contract: defaults to the portable pair with no Term in scope", () => {
    // `createRenderer` has no Term, which is also the shape of a non-terminal
    // target. Tofu is the worse of the two failures, so the portable pair wins.
    function Probe(): React.ReactElement {
      const icons = useFileBrowserIcons()
      return <Text>{`${icons.directory}|${icons.file}`}</Text>
    }

    const app = createRenderer({ cols: 40, rows: 3 })(<Probe />)

    expect(app.text).toContain(
      `${fileBrowserIcons(false).directory}|${fileBrowserIcons(false).file}`,
    )
    expect(app.text).not.toMatch(PRIVATE_USE_AREA)
  })
})
