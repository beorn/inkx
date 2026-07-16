/**
 * @failure Unsupported terminals silently receive BEL instead of a typed refusal.
 * @level l2
 * @consumer @si/app/21102-desktop-notification-target
 */

import { Buffer } from "node:buffer"
import { createTermless } from "@silvery/test"
import { describe, expect, test } from "vitest"
import * as agTerm from "../src/index"

const REQUEST = { id: "build", title: "Build", body: "Done" } as const

const EXACT_BYTES = {
  osc9: "\x1b]9;Done\x07",
  osc777: "\x1b]777;notify;Build;Done\x07",
  osc99:
    "\x1b]99;i=build:d=0:e=1:p=title;QnVpbGQ=\x1b\\" +
    "\x1b]99;i=build:d=1:e=1:p=body;RG9uZQ==\x1b\\",
} as const

describe("Term.notify", () => {
  test("keeps protocol-specific and free notification helpers private", () => {
    expect(agTerm).not.toHaveProperty("notify")
    expect(agTerm).not.toHaveProperty("notifyITerm2")
    expect(agTerm).not.toHaveProperty("notifyKitty")
  })

  test.each(["osc9", "osc777", "osc99"] as const)(
    "emits exact %s bytes through the Term owner",
    (protocol) => {
      using term = createTermless({
        cols: 40,
        rows: 8,
        caps: { notifications: protocol },
      })
      term.out.clear()

      const delivery = term.notify(REQUEST)

      expect(delivery).toEqual({ status: "emitted", protocol })
      expect(term.out.getChunks().join("")).toBe(EXACT_BYTES[protocol])
    },
  )

  test("refuses unsupported terminals without emitting any bytes", () => {
    using term = createTermless({
      cols: 40,
      rows: 8,
      caps: { notifications: false },
    })
    term.out.clear()

    const delivery = term.notify({
      id: "build",
      title: "Build",
      body: "Done",
      urgency: "normal",
    })

    expect(delivery).toEqual({ status: "unsupported", reason: "notifications" })
    expect(term.out.getChunks()).toEqual([])
  })

  test("refuses a headless Term that has no output writer", () => {
    using term = agTerm.createTerm({
      cols: 40,
      rows: 8,
      caps: { notifications: "osc9" },
    })

    const delivery = term.notify(REQUEST)

    expect(delivery).toEqual({ status: "unsupported", reason: "notifications" })
  })

  test("encodes OSC 99 urgency without exposing control bytes from the payload", () => {
    using term = createTermless({
      cols: 40,
      rows: 8,
      caps: { notifications: "osc99" },
    })
    term.out.clear()

    const delivery = term.notify({
      id: "build.safe",
      body: "Done\nnow",
      urgency: "critical",
    })

    expect(delivery).toEqual({ status: "emitted", protocol: "osc99" })
    expect(term.out.getChunks().join("")).toBe(
      "\x1b]99;i=build.safe:d=1:e=1:p=body:u=2;RG9uZQpub3c=\x1b\\",
    )
  })

  test("rejects unsafe OSC 99 identifiers before writing", () => {
    using term = createTermless({
      cols: 40,
      rows: 8,
      caps: { notifications: "osc99" },
    })
    term.out.clear()

    expect(() => term.notify({ id: "build/unsafe", body: "Done" })).toThrow(
      "OSC 99 notification ids",
    )
    expect(term.out.getChunks()).toEqual([])
  })

  test("chunks large OSC 99 bodies within the encoded payload limit", () => {
    using term = createTermless({
      cols: 40,
      rows: 8,
      caps: { notifications: "osc99" },
    })
    term.out.clear()
    const body = "x".repeat(3073)

    const delivery = term.notify({ id: "large-payload", body })

    expect(delivery).toEqual({ status: "emitted", protocol: "osc99" })
    const sequences = term.out
      .getChunks()
      .join("")
      .split("\x1b\\")
      .filter(Boolean)
      .map((sequence) => {
        const prefix = "\x1b]99;"
        const payloadStart = sequence.indexOf(";", prefix.length)
        return {
          metadata: sequence.slice(prefix.length, payloadStart),
          payload: sequence.slice(payloadStart + 1),
        }
      })
    expect(sequences.map((sequence) => sequence.metadata)).toEqual([
      "i=large-payload:d=0:e=1:p=body",
      "i=large-payload:d=1:e=1:p=body",
    ])
    expect(sequences.every((sequence) => sequence.payload.length <= 4096)).toBe(true)
    expect(
      Buffer.from(sequences.map((sequence) => sequence.payload).join(""), "base64").toString(),
    ).toBe(body)
  })
})
