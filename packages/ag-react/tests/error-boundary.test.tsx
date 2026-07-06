import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { SilveryErrorBoundary } from "../src/error-boundary"
import { Text } from "../src/components/Text"

function Thrower(): React.ReactElement {
  const err = new Error(
    '[\n  {\n    "origin": "string",\n    "code": "too_small",\n    "message": "Too small"\n  }\n]',
  )
  err.stack = [
    "Error: validation failed",
    "    at renderRootSync (node_modules/react-reconciler/cjs/react-reconciler.development.js:15080:11)",
    "    at performWorkOnRoot (node_modules/react-reconciler/cjs/react-reconciler.development.js:14245:35)",
  ].join("\n")
  throw err
}

describe("SilveryErrorBoundary", () => {
  test("renders multiline error messages and stack frames as readable rows", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const app = createRenderer({ cols: 140, rows: 24 })(
        <SilveryErrorBoundary>
          <Thrower />
          <Text>unreachable</Text>
        </SilveryErrorBoundary>,
      )

      expect(app.text).toContain("ERROR")
      const lines = app.text.split("\n").map((line) => line.trimEnd())
      const errorLineIndex = lines.findIndex((line) => line.includes("ERROR"))
      expect(errorLineIndex).toBeGreaterThanOrEqual(0)
      expect(lines[errorLineIndex]).not.toContain("[")
      expect(lines.slice(errorLineIndex + 1).find((line) => line.trim().length > 0)?.trim()).toBe("[")
      expect(app.text).toContain("[")
      expect(app.text).toContain('"origin": "string"')
      expect(app.text).toContain("- renderRootSync")
      expect(app.text).not.toContain("-renderRootSync")
      expect(app.text).toContain("- performWorkOnRoot")
      expect(app.text).not.toContain("-performWorkOnRoot")
    } finally {
      errorSpy.mockRestore()
    }
  })
})
