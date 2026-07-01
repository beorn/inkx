import { EventEmitter } from "node:events"
import { describe, expect, it } from "vitest"
import { createInputOwner } from "../src/runtime/input-owner"

class FakeStdin extends EventEmitter {
  isTTY = true
  isRaw = false
  setRawMode(on: boolean): void {
    this.isRaw = on
  }
  resume(): void {}
  pause(): void {}
  setEncoding(_encoding: BufferEncoding): this {
    return this
  }
}

class FakeStdout {
  writes: string[] = []
  write(data: string): boolean {
    this.writes.push(data)
    return true
  }
}

function osc52ClipboardResponse(text: string): string {
  return `\x1b]52;c;${Buffer.from(text, "utf-8").toString("base64")}\x07`
}

describe("createInputOwner clipboard paste parsing", () => {
  it("decodes OSC52 clipboard responses into paste events before key parsing", () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const pastes: string[] = []
    const keys: string[] = []
    input.onPaste((event) => pastes.push(event.text))
    input.onKey((event) => keys.push(event.input))

    stdin.emit("data", osc52ClipboardResponse("FROM_CLIPBOARD"))

    expect(pastes).toEqual(["FROM_CLIPBOARD"])
    expect(keys).toEqual([])
    input[Symbol.dispose]()
  })
})
