import { EventEmitter } from "node:events"
import { describe, expect, it } from "vitest"
import { ProtocolError } from "@silvery/ansi"
import { MAX_OSC52_PAYLOAD_BYTES, parseClipboardResponse } from "../src/clipboard"
import { createInputOwner } from "../src/runtime/input-owner"

const ESC = "\x1b"
const BEL = "\x07"

// The base64 encoded length of the byte cap: base64 packs 3 bytes into 4 chars.
const MAX_BASE64_LENGTH = Math.ceil(MAX_OSC52_PAYLOAD_BYTES / 3) * 4

function osc52Response(base64: string): string {
  return `${ESC}]52;c;${base64}${BEL}`
}

function osc52FromText(text: string): string {
  return osc52Response(Buffer.from(text, "utf-8").toString("base64"))
}

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

describe("parseClipboardResponse OSC52 bounds (CONFIRMED-2)", () => {
  it("decodes a small valid payload", () => {
    expect(parseClipboardResponse(osc52FromText("hello"))).toBe("hello")
  })

  it("accepts an empty payload (clipboard clear)", () => {
    expect(parseClipboardResponse(osc52Response(""))).toBe("")
  })

  it("still returns null for a query marker (not a response)", () => {
    expect(parseClipboardResponse(`${ESC}]52;c;?${BEL}`)).toBeNull()
  })

  it("still returns null when the OSC52 prefix is absent", () => {
    expect(parseClipboardResponse("not an osc52 response")).toBeNull()
  })

  it("throws ProtocolError on an oversize payload instead of decoding it", () => {
    // Valid base64 alphabet, but longer than the cap allows.
    const huge = "A".repeat(MAX_BASE64_LENGTH + 4)
    expect(() => parseClipboardResponse(osc52Response(huge))).toThrow(ProtocolError)
    try {
      parseClipboardResponse(osc52Response(huge))
    } catch (err) {
      expect((err as ProtocolError).reason).toContain(`${MAX_OSC52_PAYLOAD_BYTES}`)
    }
  })

  it("accepts a payload exactly at the cap", () => {
    // All-"A" base64 of exactly the max length decodes cleanly (multiple of 4).
    const atCap = "A".repeat(MAX_BASE64_LENGTH)
    expect(() => parseClipboardResponse(osc52Response(atCap))).not.toThrow()
  })

  it("throws ProtocolError on malformed base64 instead of best-effort decoding", () => {
    // '@', '!', '#', whitespace are outside the base64 alphabet. Node's decoder
    // would silently drop them and hand back garbage — we reject instead.
    const malformed = osc52Response("@@not!base64##")
    expect(() => parseClipboardResponse(malformed)).toThrow(ProtocolError)
    try {
      parseClipboardResponse(malformed)
    } catch (err) {
      expect((err as ProtocolError).reason).toContain("valid base64")
    }
  })

  it("still throws ProtocolError on a missing terminator (unchanged behavior)", () => {
    expect(() => parseClipboardResponse(`${ESC}]52;c;aGVsbG8`)).toThrow(ProtocolError)
  })
})

describe("createInputOwner drops oversize/malformed OSC52 (not fired as paste)", () => {
  function run(chunk: string): { pastes: string[] } {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const pastes: string[] = []
    input.onPaste((event) => pastes.push(event.text))
    stdin.emit("data", chunk)
    input[Symbol.dispose]()
    return { pastes }
  }

  it("does not fire a paste for an oversize OSC52 response", () => {
    const huge = "A".repeat(MAX_BASE64_LENGTH + 4)
    expect(run(osc52Response(huge)).pastes).toEqual([])
  })

  it("does not fire a paste for a malformed-base64 OSC52 response", () => {
    expect(run(osc52Response("@@not!base64##")).pastes).toEqual([])
  })

  it("still fires a paste for a valid OSC52 response", () => {
    expect(run(osc52FromText("FROM_CLIPBOARD")).pastes).toEqual(["FROM_CLIPBOARD"])
  })
})
