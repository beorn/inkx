/**
 * Memory-mode startup prompt — nudges user to initialize a vault.
 *
 * When `km view /path/without/.km/` runs, the CLI detects that no vault
 * exists at the target. Before entering the TUI (which hides the warning
 * in the alt-screen buffer), prompt the user:
 *
 *   This directory has no .km/ — initialize it? (Y/n/m)
 *     Y  initialize (create .km/ + GTD structure)  [default]
 *     n  cancel
 *     m  view in memory (edits will NOT persist)
 *
 * Bead: km-tui.memory-mode-silent-loss
 */

import { describe, test, expect } from "vitest"
import { promptMemoryModeInit } from "../src/memory-mode-prompt.ts"
import { PassThrough } from "stream"

/**
 * Helper — feed a sequence of lines into a mock stdin, capture stdout writes.
 */
function mockIO(input: string): {
  stdin: PassThrough
  stdout: PassThrough
  output: { value: string }
} {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const output = { value: "" }
  stdout.on("data", (chunk: Buffer | string) => {
    output.value += typeof chunk === "string" ? chunk : chunk.toString()
  })
  // Schedule the input after the prompt is rendered
  setImmediate(() => {
    stdin.end(input)
  })
  return { stdin, stdout, output }
}

describe("promptMemoryModeInit", () => {
  test("default (empty answer + newline) = initialize", async () => {
    const { stdin, stdout, output } = mockIO("\n")
    const result = await promptMemoryModeInit("/tmp/not-a-real-vault", {
      stdin: stdin as unknown as NodeJS.ReadableStream,
      stdout: stdout as unknown as NodeJS.WritableStream,
    })
    expect(result).toBe("init")
    expect(output.value).toContain("no .km/")
    expect(output.value.toLowerCase()).toContain("initialize")
  })

  test("y = initialize", async () => {
    const { stdin, stdout, output: _output } = mockIO("y\n")
    const result = await promptMemoryModeInit("/tmp/not-a-real-vault", {
      stdin: stdin as unknown as NodeJS.ReadableStream,
      stdout: stdout as unknown as NodeJS.WritableStream,
    })
    expect(result).toBe("init")
  })

  test("m = view in memory", async () => {
    const { stdin, stdout, output: _output } = mockIO("m\n")
    const result = await promptMemoryModeInit("/tmp/not-a-real-vault", {
      stdin: stdin as unknown as NodeJS.ReadableStream,
      stdout: stdout as unknown as NodeJS.WritableStream,
    })
    expect(result).toBe("memory")
  })

  test("n = cancel", async () => {
    const { stdin, stdout, output: _output } = mockIO("n\n")
    const result = await promptMemoryModeInit("/tmp/not-a-real-vault", {
      stdin: stdin as unknown as NodeJS.ReadableStream,
      stdout: stdout as unknown as NodeJS.WritableStream,
    })
    expect(result).toBe("cancel")
  })

  test("prompt mentions the target path so the user confirms what gets initialized", async () => {
    const { stdin, stdout, output } = mockIO("n\n")
    await promptMemoryModeInit("/tmp/some/specific/vault-path", {
      stdin: stdin as unknown as NodeJS.ReadableStream,
      stdout: stdout as unknown as NodeJS.WritableStream,
    })
    expect(output.value).toContain("/tmp/some/specific/vault-path")
  })

  test("unrecognized answer re-prompts (doesn't silently default)", async () => {
    // "zz" then "n" — expect a re-prompt before accepting cancel
    const { stdin, stdout, output } = mockIO("zz\nn\n")
    const result = await promptMemoryModeInit("/tmp/not-a-real-vault", {
      stdin: stdin as unknown as NodeJS.ReadableStream,
      stdout: stdout as unknown as NodeJS.WritableStream,
    })
    expect(result).toBe("cancel")
    // Warning or re-prompt should appear before the second read
    const promptCount = (output.value.match(/initialize/gi) ?? []).length
    expect(promptCount).toBeGreaterThanOrEqual(2)
  })
})
