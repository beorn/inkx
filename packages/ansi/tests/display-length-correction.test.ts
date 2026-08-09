/**
 * `displayLength` must measure what the renderer paints
 * (@si/apportion-consolidation — the `@silvery/ansi` half of the width
 * consolidation, approved by @cto as `fe4c393e`).
 *
 * There were two independent width implementations in this framework wrapping
 * the same `string-width` dependency. `displayWidth` in `@silvery/ag-term`
 * corrects text-presentation emoji — characters that are Extended_Pictographic
 * without Emoji_Presentation, which Unicode East Asian Width calls 1 column and
 * which every modern terminal paints as 2. `displayLength` here did not, so the
 * two disagreed on the SAME input:
 *
 *     displayLength("⚠")  ->  1   (raw string-width)
 *     displayWidth("⚠")   ->  2   (what actually gets painted)
 *
 * The duplicate was structurally forced rather than careless: `@silvery/ansi`
 * sits BELOW `@silvery/ag-term` in the dependency graph and cannot import it,
 * so the correction was unreachable from here. The fix is therefore structural
 * too — the corrected primitive moves DOWN to this package, where `stripAnsi`
 * and the `string-width` dependency already live, and `ag-term` keeps its cache
 * and per-`Measurer` scoping layered on top.
 *
 * This is a behaviour FIX, not a silent unification: `displayLength` returns
 * different numbers than it used to, and the old numbers were wrong.
 */

import { describe, expect, test } from "vitest"
import { displayLength, isTextPresentationEmoji } from "../src/utils"

/**
 * Text-presentation emoji: Extended_Pictographic, no Emoji_Presentation, but
 * RGI when followed by VS16. Terminals paint these two columns wide.
 */
const TEXT_PRESENTATION = ["⚠", "☑", "✈", "❤"]

/** Emoji-presentation characters string-width already measures correctly. */
const EMOJI_PRESENTATION = ["📁", "🎉"]

describe("displayLength — text-presentation emoji correction", () => {
  test("text-presentation emoji measure 2 columns, as terminals paint them", () => {
    for (const ch of TEXT_PRESENTATION) {
      expect(displayLength(ch), `${ch} (U+${ch.codePointAt(0)!.toString(16).toUpperCase()})`).toBe(
        2,
      )
    }
  })

  test("the correction survives inside a real string, alongside ANSI", () => {
    // "⚠ warning" is 1 (emoji, corrected to 2) + 1 space + 7 letters = 10.
    expect(displayLength("⚠ warning")).toBe(10)
    expect(displayLength("\x1b[31m⚠ warning\x1b[0m")).toBe(10)
  })

  test("emoji-presentation characters are unchanged — the correction is narrow", () => {
    for (const ch of EMOJI_PRESENTATION) {
      expect(displayLength(ch), ch).toBe(2)
    }
  })

  test("plain and wide text are unaffected", () => {
    expect(displayLength("hello")).toBe(5)
    expect(displayLength("")).toBe(0)
    expect(displayLength("韓語")).toBe(4)
    expect(displayLength("\x1b[31mred\x1b[0m")).toBe(3)
  })

  test("the predicate is exported so ag-term can layer scoping on the same rule", () => {
    for (const ch of TEXT_PRESENTATION) expect(isTextPresentationEmoji(ch), ch).toBe(true)
    for (const ch of EMOJI_PRESENTATION) expect(isTextPresentationEmoji(ch), ch).toBe(false)
    // Multi-codepoint clusters are already correct in string-width; the
    // predicate must not claim them, or the VS16/VS15 pair below would both
    // resolve from one cached base codepoint and depend on call order.
    expect(isTextPresentationEmoji("⏸︎")).toBe(false)
    expect(isTextPresentationEmoji("⚠️")).toBe(false)
  })
})
