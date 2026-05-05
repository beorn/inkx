import React from "react"
import { beforeAll, describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { isLayoutEngineInitialized, setLayoutEngine } from "@silvery/ag-react"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import { Box, Text } from "silvery"
import { AvailableCommandsPalette } from "../src/components/AvailableCommandsPalette.tsx"

beforeAll(() => {
  if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexilyZeroEngine())
})

describe("AvailableCommandsPalette", () => {
  test("aligns command slashes with the composer slash and wraps descriptions in a stable column", () => {
    const render = createRenderer({ cols: 58, rows: 10 })
    const app = render(
      <Box width={58} height={10} flexDirection="column">
        <AvailableCommandsPalette query="debug" onSubmit={() => {}} onClose={() => {}} />
        <Text>{" > /"}</Text>
      </Box>,
    )

    expect(app.text).not.toContain("Slash commands")
    const commandRow = app.lines.findIndex((line) => line.includes("/debug"))
    const promptRow = app.lines.findIndex((line) => line.includes("> /"))
    expect(commandRow).toBeGreaterThanOrEqual(0)
    expect(promptRow).toBeGreaterThanOrEqual(0)
    expect(app.lines[commandRow]!.indexOf("/debug")).toBe(app.lines[promptRow]!.indexOf("/"))

    const descriptionCol = app.lines[commandRow]!.indexOf("Toggle debug")
    expect(descriptionCol).toBeGreaterThan(app.lines[commandRow]!.indexOf("/debug"))
    const wrappedRow = app.lines.findIndex((line, i) => i > commandRow && line.includes("messages"))
    expect(wrappedRow).toBeGreaterThan(commandRow)
    expect(app.lines[wrappedRow]!.search(/\S/)).toBe(descriptionCol)
    expect(app.lines[commandRow - 1]?.trim()).toBe("")
  })

  test("does not render scroll chrome while navigating the inline slash palette", async () => {
    const render = createRenderer({ cols: 110, rows: 9 })
    const app = render(
      <Box width={110} height={9} flexDirection="column">
        <AvailableCommandsPalette query="/" onSubmit={() => {}} onClose={() => {}} />
        <Text>{" > /"}</Text>
      </Box>,
    )

    await app.press("ArrowUp")
    for (let i = 0; i < 4; i++) await app.press("ArrowDown")
    for (let i = 0; i < 4; i++) await app.press("ArrowUp")

    const paletteRows = app.lines.slice(0, 6)
    expect(paletteRows.some((line) => /[█▀▄]$/.test(line))).toBe(false)
    expect(paletteRows.some((line) => line.includes("▀▀▀"))).toBe(false)
    expect(app.text).toContain("/debug")
  })

  test("shows up to thirty commands in the popup", () => {
    const render = createRenderer({ cols: 96, rows: 40 })
    const remoteCommands = Array.from({ length: 40 }, (_, i) => `/remote-${String(i).padStart(2, "0")}`)
    const app = render(
      <Box width={96} height={40} flexDirection="column">
        <AvailableCommandsPalette
          query="remote-"
          remoteCommands={remoteCommands}
          onSubmit={() => {}}
          onClose={() => {}}
        />
        <Text>{" > /remote-"}</Text>
      </Box>,
    )

    expect(app.text).toContain("/remote-00")
    expect(app.text).toContain("/remote-29")
    expect(app.text).not.toContain("/remote-30")
  })
})
