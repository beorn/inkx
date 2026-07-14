/**
 * @failure Desktop notifications select protocols from ambient terminal identity,
 *   bypass Term-owned output, and silently turn unsupported delivery into BEL.
 * @level l3
 * @consumer @si/app/21102-desktop-notification-target, km board error notifications
 */

import { describe, expect, test } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import {
  createTerm,
  createTerminalNotificationTarget,
  notify,
  type Term,
  type TerminalNotificationProtocol,
} from "../../src/index.js"
import { NOTIFICATION_TARGET_STORIES } from "../../examples/apps/storybook/stories/NotificationTarget.story.js"

const REQUEST = { id: "build-42", title: "km", body: "Build done" } as const
const OSC_9 = "\x1b]9;Build done\x07"
const OSC_777 = "\x1b]777;notify;km;Build done\x07"
const OSC_99 =
  "\x1b]99;i=build-42:d=0:e=1:p=title;a20=\x1b\\" +
  "\x1b]99;i=build-42:d=1:e=1:p=body;QnVpbGQgZG9uZQ==\x1b\\"

function createMockTerm(protocol: TerminalNotificationProtocol | false): {
  readonly term: Term
  readonly chunks: string[]
} {
  const chunks: string[] = []
  const stdout = {
    isTTY: false,
    columns: 80,
    rows: 24,
    write(data: string | Uint8Array) {
      chunks.push(typeof data === "string" ? data : new TextDecoder().decode(data))
      return true
    },
    on() {
      return stdout
    },
    off() {
      return stdout
    },
  } as unknown as NodeJS.WriteStream
  const stdin = {
    isTTY: false,
    on() {
      return stdin
    },
    off() {
      return stdin
    },
  } as unknown as NodeJS.ReadStream
  return {
    term: createTerm({ stdout, stdin, caps: { notifications: protocol } }),
    chunks,
  }
}

describe("notification target", () => {
  test.each([
    ["osc99", OSC_99],
    ["osc9", OSC_9],
    ["osc777", OSC_777],
  ] as const)("emits exact %s bytes through the Term owner", async (protocol, expected) => {
    const harness = createMockTerm(protocol)
    using term = harness.term

    const delivery = await notify(createTerminalNotificationTarget(term), REQUEST)

    expect(delivery).toMatchObject({ status: "sent", protocol })
    expect(harness.chunks.join("")).toBe(expected)
  })

  test("refuses an unsupported target without writing BEL or any other bytes", async () => {
    const harness = createMockTerm(false)
    using term = harness.term

    const delivery = await notify(createTerminalNotificationTarget(term), REQUEST)

    expect(delivery).toEqual({ status: "unsupported", reason: "notifications" })
    expect(harness.chunks).toEqual([])
  })

  test("refuses actions on protocols without action replies", async () => {
    const harness = createMockTerm("osc777")
    using term = harness.term

    const delivery = await notify(createTerminalNotificationTarget(term), {
      ...REQUEST,
      actions: [{ id: "open", label: "Open" }],
    })

    expect(delivery).toEqual({ status: "unsupported", reason: "actions" })
    expect(harness.chunks).toEqual([])
  })

  test("Kitty actions use OSC 99 reporting and map the reply to the domain action id", async () => {
    const chunks: string[] = []
    const reply = "\x1b]99;i=build-42;1\x1b\\"
    const term = {
      caps: { notifications: "osc99" },
      output: {},
      input: {
        active: true,
        async probe<T>({
          query,
          parse,
        }: {
          query: string
          parse: (input: string) => { result: T; consumed: number } | null
          timeoutMs: number
        }): Promise<T | null> {
          chunks.push(query)
          return parse(reply)?.result ?? null
        },
      },
      write(data: string) {
        chunks.push(data)
      },
    } as unknown as Pick<Term, "caps" | "input" | "output" | "write">

    const delivery = await notify(createTerminalNotificationTarget(term), {
      ...REQUEST,
      actions: [
        { id: "open", label: "Open" },
        { id: "dismiss", label: "Dismiss" },
      ],
    })

    expect(delivery).toMatchObject({ status: "sent", protocol: "osc99" })
    expect(chunks.join("")).toBe(
      "\x1b]99;i=build-42:d=0:e=1:p=title;a20=\x1b\\" +
        "\x1b]99;i=build-42:d=0:e=1:p=body;QnVpbGQgZG9uZQ==\x1b\\" +
        "\x1b]99;i=build-42:d=1:e=1:p=buttons:a=report;T3BlbuKAqERpc21pc3M=\x1b\\",
    )
    if (delivery.status !== "sent") throw new Error("expected sent delivery")
    expect(await delivery.reply).toEqual({ type: "activated", actionId: "open" })
  })

  test("termless observes the same exact OSC 777 bytes through Term.write", async () => {
    using term = createTermless({
      cols: 40,
      rows: 8,
      caps: { notifications: "osc777" },
    })
    const before = term.out.getChunks().length

    const delivery = await notify(createTerminalNotificationTarget(term), REQUEST)

    expect(delivery).toMatchObject({ status: "sent", protocol: "osc777" })
    expect(term.out.getChunks().slice(before).join("")).toBe(OSC_777)
  })

  test("Storybook renders the production target's exact protocol and unsupported outcomes", () => {
    expect(NOTIFICATION_TARGET_STORIES.map((story) => story.variant)).toEqual(["protocol-matrix"])

    const render = createRenderer({ cols: 120, rows: 24 })
    for (const story of NOTIFICATION_TARGET_STORIES) {
      const frame = render(story.render({}))
      for (const token of story.expectedTokens ?? []) {
        expect(frame.text, `${story.id} should render ${token}`).toContain(token)
      }
    }
  })
})
