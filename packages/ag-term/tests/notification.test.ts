/**
 * @failure Unsupported terminals silently receive BEL instead of a typed refusal.
 * @level l2
 * @consumer @si/app/21102-desktop-notification-target
 */

import { Buffer } from "node:buffer"
import { createRenderer, createTermless } from "@silvery/test"
import type { NotificationActivation, NotificationTarget } from "silvery"
import { describe, expect, test } from "vitest"
import {
  captureNotificationStory,
  NOTIFICATION_STORIES,
  NOTIFICATION_STORY_SCENARIOS,
} from "../../../examples/apps/storybook/stories/Notification.story"
import { createNotificationTarget } from "../src/ansi/notification"
import * as agTerm from "../src/index"

const REQUEST = { id: "build", title: "Build", body: "Done" } as const

const EXACT_BYTES = {
  osc9: "\x1b]9;Done\x07",
  osc777: "\x1b]777;notify;Build;Done\x07",
  osc99:
    "\x1b]99;i=build:d=0:e=1:p=title;QnVpbGQ=\x1b\\" +
    "\x1b]99;i=build:d=1:e=1:p=body;RG9uZQ==\x1b\\",
} as const

const ACTION_REQUEST = {
  id: "build",
  body: "Done",
  actions: [
    { id: "logs", label: "Open logs" },
    { id: "dismiss", label: "Dismiss" },
  ],
} as const

const EXACT_ACTION_BYTES =
  "\x1b]99;i=build:a=report:d=0:e=1:p=buttons;T3BlbiBsb2dz4oCoRGlzbWlzcw==\x1b\\" +
  "\x1b]99;i=build:a=report:d=1:e=1:p=body;RG9uZQ==\x1b\\"

function asTarget(target: NotificationTarget): NotificationTarget {
  return target
}

function sendRawInput(target: unknown, data: string): void {
  ;(target as { sendInput(data: string): void }).sendInput(data)
}

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

  test("emits exact OSC 99 button bytes and maps the reply to the domain action id", () => {
    using term = createTermless({
      cols: 40,
      rows: 8,
      caps: { notifications: "osc99" },
    })
    const target = asTarget(term)
    const activations: NotificationActivation[] = []
    const keys: string[] = []
    target.onNotificationActivation((activation) => activations.push(activation))
    term.input?.onKey((event) => keys.push(event.input))
    term.out.clear()

    const delivery = target.notify(ACTION_REQUEST)
    sendRawInput(term, "\x1b]99;i=build;")
    expect(activations).toEqual([])
    expect(keys).toEqual([])
    sendRawInput(term, "2\x1b\\")

    expect(delivery).toEqual({ status: "emitted", protocol: "osc99" })
    expect(term.out.getChunks().join("")).toBe(EXACT_ACTION_BYTES)
    expect(activations).toEqual([{ id: "build", kind: "action", actionId: "dismiss" }])
    expect(keys).toEqual([])
  })

  test("registers the activation route before a synchronous target can reply", () => {
    let receiveReply: ((reply: { id: string; button?: number }) => void) | undefined
    const target = createNotificationTarget(
      { notifications: "osc99" },
      () => receiveReply?.({ id: "build", button: 1 }),
      (handler) => {
        receiveReply = handler
        return () => {
          receiveReply = undefined
        }
      },
    )
    const activations: NotificationActivation[] = []
    target.onNotificationActivation((activation) => activations.push(activation))

    using _target = target
    const delivery = target.notify(ACTION_REQUEST)

    expect(delivery).toEqual({ status: "emitted", protocol: "osc99" })
    expect(activations).toEqual([{ id: "build", kind: "action", actionId: "logs" }])
  })

  test("reports whole-notification activation through the same target-neutral event", () => {
    using term = createTermless({
      cols: 40,
      rows: 8,
      caps: { notifications: "osc99" },
    })
    const target = asTarget(term)
    const activations: NotificationActivation[] = []
    target.onNotificationActivation((activation) => activations.push(activation))
    term.out.clear()

    const delivery = target.notify({ id: "build", body: "Done", reportActivation: true })
    sendRawInput(term, "\x1b]99;i=build;\x1b\\")

    expect(delivery).toEqual({ status: "emitted", protocol: "osc99" })
    expect(term.out.getChunks().join("")).toBe(
      "\x1b]99;i=build:a=report:d=1:e=1:p=body;RG9uZQ==\x1b\\",
    )
    expect(activations).toEqual([{ id: "build", kind: "notification" }])
  })

  test("refuses actions on non-OSC-99 targets without emitting fallback bytes", () => {
    using term = createTermless({
      cols: 40,
      rows: 8,
      caps: { notifications: "osc777" },
    })
    term.out.clear()

    const delivery = term.notify(ACTION_REQUEST)

    expect(delivery).toEqual({ status: "unsupported", reason: "notification-actions" })
    expect(term.out.getChunks()).toEqual([])
  })

  test("requires a stable id before requesting an activation reply", () => {
    using term = createTermless({
      cols: 40,
      rows: 8,
      caps: { notifications: "osc99" },
    })
    term.out.clear()

    expect(() => term.notify({ body: "Done", reportActivation: true })).toThrow(
      "activation replies require a notification id",
    )
    expect(term.out.getChunks()).toEqual([])
  })

  test("registers Storybook scenarios backed by exact real-target captures", () => {
    expect(NOTIFICATION_STORIES.map((story) => story.variant)).toEqual([
      "osc9",
      "osc777",
      "osc99-actions",
      "unsupported",
      "unsupported-actions",
    ])

    const render = createRenderer({ cols: 100, rows: 8 })
    for (const scenario of NOTIFICATION_STORY_SCENARIOS) {
      expect(captureNotificationStory(scenario)).toEqual({
        delivery: scenario.expectedDelivery,
        bytes: scenario.expectedBytes,
      })
      const story = NOTIFICATION_STORIES.find((candidate) => candidate.variant === scenario.variant)
      expect(story, `missing ${scenario.variant} story`).toBeDefined()
      if (story === undefined) throw new Error(`Missing ${scenario.variant} notification story`)
      const frame = render(story.render({}))
      for (const token of story.expectedTokens ?? []) {
        expect(frame.text, `${story.id} should render ${token}`).toContain(token)
      }
    }
  })
})
