import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { Box, Text } from "silvery"
import { run } from "silvery/runtime"
import { AmbientEventRow, AmbientNotificationStack } from "../src/components/AmbientEventRow.tsx"

const settle = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms))

describe("AmbientEventRow disclosure", () => {
  test("plain one-line notifications are not clickable disclosures", async () => {
    using term = createTermless({ cols: 100, rows: 12 })
    let toggles = 0
    const handle = await run(
      <Box flexDirection="column">
        <AmbientEventRow
          entry={{
            kind: "ambient",
            id: "recall-1",
            source: "recall",
            timestamp: 1_700_000_000_000,
            content: "recall hit: feedback-quiet-tribe-ack — relevance 0.82",
          }}
          onToggleExpand={() => {
            toggles++
          }}
        />
        <Text>NEXT-ROW</Text>
      </Box>,
      term,
      { mouse: true } as never,
    )

    try {
      await settle(80)
      const before = term.screen.getLines()
      const row = before.findIndex((l) => l.includes("feedback-quiet-tribe-ack"))
      expect(row).toBeGreaterThanOrEqual(0)
      expect(before.findIndex((l) => l.includes("NEXT-ROW"))).toBe(row + 1)

      const col = before[row]!.indexOf("feedback-quiet-tribe-ack")
      await term.mouse.click(col + 1, row)
      await settle(80)

      const after = term.screen.getLines()
      expect(toggles).toBe(0)
      expect(after.findIndex((l) => l.includes("NEXT-ROW"))).toBe(row + 1)
      expect(after.filter((l) => l.includes("feedback-quiet-tribe-ack")).length).toBe(1)
    } finally {
      handle.unmount()
    }
  })

  test("empty channel notifications are muted and not clickable disclosures", async () => {
    using term = createTermless({ cols: 100, rows: 12 })
    let toggles = 0
    const handle = await run(
      <Box flexDirection="column">
        <AmbientEventRow
          entry={{
            kind: "ambient",
            id: "tribe-empty",
            source: "tribe",
            timestamp: 1_700_000_000_000,
            content: '<channel source="plugin:tribe:tribe" from="daemon" type="health"></channel>',
          }}
          onToggleExpand={() => {
            toggles++
          }}
        />
        <Text>NEXT-ROW</Text>
      </Box>,
      term,
      { mouse: true } as never,
    )

    try {
      await settle(80)
      const before = term.screen.getLines()
      const row = before.findIndex((l) => l.includes("health from daemon"))
      expect(row).toBeGreaterThanOrEqual(0)
      expect(before.findIndex((l) => l.includes("NEXT-ROW"))).toBe(row + 1)

      const bulletCol = before[row]!.indexOf("•")
      const labelCol = before[row]!.indexOf("Tribe")
      const previewCol = before[row]!.indexOf("health")
      expect(term.cell(row, labelCol).fg).toStrictEqual(term.cell(row, bulletCol).fg)
      expect(term.cell(row, previewCol).fg).toStrictEqual(term.cell(row, bulletCol).fg)

      await term.mouse.click(previewCol + 1, row)
      await settle(80)

      const after = term.screen.getLines()
      expect(toggles).toBe(0)
      expect(after.findIndex((l) => l.includes("NEXT-ROW"))).toBe(row + 1)
    } finally {
      handle.unmount()
    }
  })

  test("filewatch bursts aggregate into one Watch row", async () => {
    using term = createTermless({ cols: 100, rows: 12 })
    const handle = await run(
      <Box flexDirection="column">
        <AmbientNotificationStack
          entries={[
            {
              kind: "ambient",
              id: "watch-1",
              source: "filewatch",
              timestamp: 1_700_000_000_000,
              content: "src/a.ts",
            },
            {
              kind: "ambient",
              id: "watch-2",
              source: "filewatch",
              timestamp: 1_700_000_000_001,
              content: "src/b.ts",
            },
            {
              kind: "ambient",
              id: "watch-3",
              source: "filewatch",
              timestamp: 1_700_000_000_002,
              content: "src/c.ts",
            },
            {
              kind: "ambient",
              id: "watch-4",
              source: "filewatch",
              timestamp: 1_700_000_000_003,
              content: "src/d.ts",
            },
          ]}
        />
        <Text>NEXT-ROW</Text>
      </Box>,
      term,
      { mouse: true } as never,
    )

    try {
      await settle(80)
      const text = term.screen.getText()
      expect(text).toContain("Watch file (4x)")
      expect(text).not.toContain("src/a.ts")
      expect(text).not.toContain("src/b.ts")
      const lines = term.screen.getLines()
      const row = lines.findIndex((line) => line.includes("Watch file (4x)"))
      expect(row).toBeGreaterThanOrEqual(0)
      expect(lines.findIndex((line) => line.includes("NEXT-ROW"))).toBe(row + 1)
    } finally {
      handle.unmount()
    }
  })

  test("identical non-watch notifications aggregate even when interleaved inside the ambient cluster", async () => {
    using term = createTermless({ cols: 100, rows: 12 })
    const handle = await run(
      <Box flexDirection="column">
        <AmbientNotificationStack
          entries={[
            {
              kind: "ambient",
              id: "ci-1",
              source: "ci",
              timestamp: 1_700_000_000_000,
              content: "build failed",
            },
            {
              kind: "ambient",
              id: "recall-1",
              source: "recall",
              timestamp: 1_700_000_000_001,
              content: "memory: related note",
            },
            {
              kind: "ambient",
              id: "ci-2",
              source: "ci",
              timestamp: 1_700_000_000_002,
              content: "build failed",
            },
          ]}
        />
      </Box>,
      term,
      { mouse: true } as never,
    )

    try {
      await settle(80)
      const text = term.screen.getText()
      expect(text).toContain("CI build failed (2x)")
      expect(text).toContain("Recall memory: related note")
      expect(text.match(/build failed/g)?.length).toBe(1)
    } finally {
      handle.unmount()
    }
  })

  test("source labels suppress repeated leading source tags", async () => {
    using term = createTermless({ cols: 120, rows: 12 })
    const handle = await run(
      <Box flexDirection="column">
        <AmbientNotificationStack
          entries={[
            {
              kind: "ambient",
              id: "tribe-session",
              source: "tribe",
              timestamp: 1_700_000_000_000,
              content: "[session tribe] silvercode-2 joined (member) pid=27286 ~/Code/pim/km/apps/silvercode",
            },
            {
              kind: "ambient",
              id: "ci-failure",
              source: "ci",
              timestamp: 1_700_000_000_001,
              content: "[ci c8c98bf] failure: Workers Builds: km, Workers Builds: km-website",
            },
          ]}
        />
      </Box>,
      term,
      { mouse: true } as never,
    )

    try {
      await settle(80)
      const text = term.screen.getText()
      expect(text).toContain("Tribe member silvercode-2 joined")
      expect(text).toContain("CI failed Workers builds: km, km-website")
      expect(text).not.toContain("[session tribe]")
      expect(text).not.toContain("[ci c8c98bf]")
    } finally {
      handle.unmount()
    }
  })

  test("source labels suppress repeated tags for recall, subagent, filewatch, and telegram", async () => {
    using term = createTermless({ cols: 140, rows: 12 })
    const handle = await run(
      <Box flexDirection="column">
        <AmbientNotificationStack
          entries={[
            {
              kind: "ambient",
              id: "recall-tag",
              source: "recall",
              timestamp: 1_700_000_000_000,
              content: '[recall] 2 prior sessions discussed "layout": session abc12345 — content lanes',
            },
            {
              kind: "ambient",
              id: "subagent-tag",
              source: "subagent",
              timestamp: 1_700_000_000_001,
              content: "[subagent explorer] completed: checked layout primitives",
            },
            {
              kind: "ambient",
              id: "filewatch-prefix",
              source: "file-watch",
              timestamp: 1_700_000_000_002,
              content: "file-watch: apps/silvercode/src/components/Content.tsx changed",
            },
            {
              kind: "ambient",
              id: "telegram-prefix",
              source: "telegram",
              timestamp: 1_700_000_000_003,
              content: "telegram message from approved channel: weekly digest ready",
            },
          ]}
        />
      </Box>,
      term,
      { mouse: true } as never,
    )

    try {
      await settle(80)
      const text = term.screen.getText()
      expect(text).toContain('Recall 2 prior sessions discussed "layout"')
      expect(text).toContain("Agent completed: checked layout primitives")
      expect(text).toContain("Watch apps/silvercode/src/components/Content.tsx changed")
      expect(text).toContain("Telegram from approved channel: weekly digest ready")
      expect(text).not.toContain("[recall]")
      expect(text).not.toContain("[subagent explorer]")
      expect(text).not.toContain("Watch file-watch:")
      expect(text).not.toContain("Telegram telegram message")
    } finally {
      handle.unmount()
    }
  })
})
