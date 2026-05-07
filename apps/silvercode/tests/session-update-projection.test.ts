import { describe, expect, test } from "vitest"
import type { MessageEntry, MessageOp, ToolUseId } from "@km/agent-harness"
import type { NotificationStreamEntry } from "../src/notification-stream.ts"
import {
  isChatLifecycleItem,
  isChatNotificationGroup,
  isTranscriptMessageEntry,
  projectSessionUpdateTranscript,
} from "../src/chat/session-update-projection.ts"

function message(id: string, role: MessageEntry["role"], ops: MessageOp[], ts: number): MessageEntry {
  const out: Record<string, unknown> = { id, role, ops, ts }
  Object.defineProperty(out, "text", {
    get() {
      return ops.flatMap((op) => (op.kind === "text" ? [op.text] : [])).join("")
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolCalls", {
    get() {
      return ops.flatMap((op) => (op.kind === "tool" ? [op.toolCall] : []))
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolResults", {
    get() {
      return ops.flatMap((op) => (op.kind === "tool" && op.result ? [op.result] : []))
    },
    enumerable: true,
    configurable: true,
  })
  return out as unknown as MessageEntry
}

function text(text: string, ts: number): MessageOp {
  return { kind: "text", text, ts }
}

function tool(id: string, ts: number): MessageOp {
  return {
    kind: "tool",
    toolCall: { id: id as ToolUseId, name: "Bash", input: { command: "echo ok" } },
    result: { id: id as ToolUseId, output: "ok" },
    ts,
  }
}

function notification(id: string, ts: number): NotificationStreamEntry {
  return { kind: "notification", id, source: "test", content: id, ts }
}

describe("projectSessionUpdateTranscript", () => {
  test("places session.resumed before live prompt after loaded history", () => {
    const projected = projectSessionUpdateTranscript({
      messages: [
        message("loaded", "assistant", [text("loaded history", 900)], 900),
        message("live", "user", [text("new prompt", 2_100)], 2_100),
      ],
      sessionMetadata: {
        cwd: "/tmp/project",
        spawnedAt: 2_000,
        resumeId: "f9eb64dc-d982-4a46-9a8e-da5fd882ac5f",
        replayCompletedAt: 1_000,
        replayMessageCount: 1,
        replayBoundaryMessageId: "loaded",
      },
      showActivity: false,
    })

    const loadedIndex = projected.visibleItems.findIndex(
      (item) => isChatLifecycleItem(item) && item.data.kind === "loaded",
    )
    const liveIndex = projected.visibleItems.findIndex((item) => isTranscriptMessageEntry(item) && item.id === "live")

    expect(loadedIndex).toBeGreaterThan(-1)
    expect(liveIndex).toBeGreaterThan(-1)
    expect(loadedIndex).toBeLessThan(liveIndex)
  })

  test("interleaves notifications between timestamped assistant operation slices", () => {
    const projected = projectSessionUpdateTranscript({
      messages: [message("assistant", "assistant", [text("before", 100), tool("tool-1", 300)], 100)],
      notificationEntries: [notification("note-1", 200)],
      showActivity: false,
    })

    const messageIndexes = projected.merged.flatMap((item, index) => (isTranscriptMessageEntry(item) ? [index] : []))
    const notificationIndex = projected.merged.findIndex(isChatNotificationGroup)

    expect(messageIndexes.length).toBe(2)
    expect(notificationIndex).toBeGreaterThan(messageIndexes[0] ?? -1)
    expect(notificationIndex).toBeLessThan(messageIndexes[1] ?? -1)
  })
})
