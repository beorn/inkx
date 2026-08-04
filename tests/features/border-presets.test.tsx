/**
 * Built-in border presets are one adapter-agnostic registry.
 *
 * The realistic-scale render runs under the suite's SILVERY_STRICT=2 default,
 * so every preset is exercised through incremental and fresh rendering with
 * enough nodes for border-state leaks to compound.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import {
  BUILT_IN_BORDER_PRESETS,
  builtInBorderPreset,
  type BuiltInBorderStyle,
} from "../../packages/ag/src/border-presets"
import { terminalAdapter } from "../../packages/ag-term/src/adapters/terminal-adapter"
import { getBorderChars } from "../../packages/ag-term/src/pipeline/render-helpers"

const styles = Object.keys(BUILT_IN_BORDER_PRESETS) as BuiltInBorderStyle[]

describe("built-in border presets", () => {
  test("the pipeline and terminal adapter consume the one canonical registry", () => {
    for (const style of styles) {
      const preset = builtInBorderPreset(style)
      expect(getBorderChars(style)).toBe(preset)
      expect(terminalAdapter.getBorderChars(style)).toBe(preset)
    }
  })

  test("all presets stay incremental=fresh across a realistic 56-row tree", () => {
    const render = createRenderer({ cols: 48, rows: 168 })
    const app = render(
      <Box flexDirection="column">
        {Array.from({ length: 56 }, (_, index) => {
          const style = styles[index % styles.length]!
          return (
            <Box key={index} width={32} borderStyle={style}>
              <Text>{`${style}-${index}`}</Text>
            </Box>
          )
        })}
      </Box>,
    )

    expect(app.text).toContain("hairline-7")
    expect(app.text).toContain("classic-54")
    expect(app.text.match(/▏/gu)?.length).toBeGreaterThan(0)
  })
})
