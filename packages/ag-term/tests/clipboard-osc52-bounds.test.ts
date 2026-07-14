import { EventEmitter } from "node:events"
import { describe, expect, it, vi } from "vitest"
import { ProtocolError } from "@silvery/ansi"
import { MAX_OSC52_PAYLOAD_BYTES, parseClipboardResponse } from "../src/clipboard"
import { createTerminalInputDecoder } from "../src/protocol-segments"
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
    // The 1 MiB byte cap leaves one byte in its final base64 quantum, so the
    // maximum-valid encoded form ends in two padding characters.
    const atCap = `${"A".repeat(MAX_BASE64_LENGTH - 2)}==`
    expect(() => parseClipboardResponse(osc52Response(atCap))).not.toThrow()
  })

  it("rejects an unpadded encoded maximum that decodes past the byte cap", () => {
    expect(() => parseClipboardResponse(osc52Response("A".repeat(MAX_BASE64_LENGTH)))).toThrow(
      ProtocolError,
    )
  })

  it("decodes valid OSC 52 text without the Node Buffer global", () => {
    vi.stubGlobal("Buffer", undefined)
    try {
      expect(parseClipboardResponse(osc52Response("aGk="))).toBe("hi")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("preserves a leading UTF-8 BOM as clipboard content", () => {
    expect(parseClipboardResponse(osc52Response("77u/WA=="))).toBe("\uFEFFX")
  })

  it("accepts a maximum-valid payload when its ST terminator is split", () => {
    const decoder = createTerminalInputDecoder()
    const payload = `${"A".repeat(MAX_BASE64_LENGTH - 2)}==`

    expect(decoder.push(`${ESC}]52;c;${payload}${ESC}`)).toEqual([])
    const decoded = decoder.push("\\q")

    expect(decoded.map((segment) => segment.type)).toEqual(["clipboard", "raw"])
    expect(decoded[1]).toEqual({ type: "raw", data: "q" })
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

  it("rejects impossible base64 padding cardinality", () => {
    expect(() => parseClipboardResponse(osc52Response("A="))).toThrow(ProtocolError)
  })

  it("caps an unterminated stream, discards its tail, then resynchronizes", () => {
    const decoder = createTerminalInputDecoder()
    const huge = `${ESC}]52;c;${"A".repeat(MAX_BASE64_LENGTH + 1)}`

    const rejected = decoder.push(huge)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.type).toBe("invalid")
    if (rejected[0]?.type === "invalid") {
      expect(rejected[0].error.reason).toContain(`${MAX_OSC52_PAYLOAD_BYTES}`)
    }

    expect(decoder.push("still-payload")).toEqual([])
    expect(decoder.push(ESC)).toEqual([])
    expect(decoder.push("\\q")).toEqual([{ type: "raw", data: "q" }])
  })

  it("preserves a split ST prefix while entering oversize discard mode", () => {
    const decoder = createTerminalInputDecoder()
    const huge = `${ESC}]52;c;${"A".repeat(MAX_BASE64_LENGTH + 4)}${ESC}`

    expect(decoder.push(huge)[0]?.type).toBe("invalid")
    expect(decoder.push("\\q")).toEqual([{ type: "raw", data: "q" }])
  })

  it("bounds an unterminated query and resynchronizes after its terminator", () => {
    const decoder = createTerminalInputDecoder()
    const hugeQuery = `${ESC}]52;c;?${"A".repeat(MAX_BASE64_LENGTH + 1)}`

    expect(decoder.push(hugeQuery)[0]?.type).toBe("invalid")
    expect(decoder.push(`${BEL}q`)).toEqual([{ type: "raw", data: "q" }])
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
