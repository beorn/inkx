import React from "react"
import { describe, expect, test } from "vitest"
import { createScope } from "@silvery/scope"
import { createRenderer, createTermless } from "@silvery/test"
import { Box, Text } from "silvery"
import { run } from "silvery/runtime"
import { AmbientEventRow, AmbientNotificationStack } from "../src/components/AmbientEventRow.tsx"
import { registerCiAmbientAdapter } from "../src/ambient-adapters/ci.ts"
import { createAmbientStream } from "../src/ambient-stream.ts"
import { createChannelQueue } from "../src/channel-queue.ts"

const settle = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms))
const OSC8_OPEN = /\x1b\]8;;([^\x07\x1b]+)(?:\x1b\\|\x07)/g

function osc8Hrefs(ansi: string): string[] {
  const out: string[] = []
  for (const m of ansi.matchAll(OSC8_OPEN)) {
    if (m[1] && m[1].length > 0) out.push(m[1]!)
  }
  return out
}

function ExpandableAmbientRow({
  entry,
}: {
  entry: React.ComponentProps<typeof AmbientEventRow>["entry"]
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  return (
    <AmbientEventRow
      entry={entry}
      expanded={expanded}
      onToggleExpand={() => {
        setExpanded((value) => !value)
      }}
    />
  )
}

describe("AmbientEventRow disclosure", () => {
  test("CI adapter links a failed check through the ambient notification stack", async () => {
    await using scope = createScope("ci-ambient-link-test")
    const queue = createChannelQueue(scope)
    const stream = createAmbientStream(scope)
    registerCiAmbientAdapter({
      scope,
      queue,
      cwd: "/tmp",
      pollMs: 60_000,
      now: () => 10_000,
      gitState: async () => ({ branch: "main", sha: "abcdef0123456789" }),
      runGh: async () => ({
        code: 0,
        stdout: JSON.stringify([
          {
            name: "Workers Builds: km-website",
            status: "completed",
            conclusion: "failure",
            html_url: "https://github.com/acme/repo/actions/runs/123/job/456",
            output: {
              title: "Deploy failed",
              summary: "Pages deployment failed",
              text: "Missing KV namespace binding",
            },
          },
        ]),
      }),
    })

    const start = Date.now()
    while (queue.peek().length === 0 && Date.now() - start < 1000) {
      await settle(5)
    }
    const event = queue.peek()[0]
    expect(event).toBeDefined()
    stream.record("s1", event!)
    const entries = stream.entries("s1")

    const render = createRenderer({ cols: 120, rows: 8 })
    const app = render(
      <Box flexDirection="column">
        <AmbientNotificationStack entries={entries} />
      </Box>,
    )

    expect(app.text).toContain("CI failed Workers builds: km-website")
    expect(event?.meta?.details).toContain("Missing KV namespace binding")
    expect(osc8Hrefs(app.ansi)).toEqual(["https://github.com/acme/repo/actions/runs/123/job/456"])
  })

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

  test("long tribe notifications wrap instead of truncating", async () => {
    using term = createTermless({ cols: 72, rows: 12 })
    const handle = await run(
      <Box flexDirection="column">
        <AmbientEventRow
          entry={{
            kind: "ambient",
            id: "tribe-long",
            source: "tribe",
            timestamp: 1_700_000_000_000,
            content: "CPU warning: load 17.04 exceeds 14.4 for 30s, unattended diagnostics should keep this visible",
          }}
        />
        <Text>NEXT-ROW</Text>
      </Box>,
      term,
      { mouse: true } as never,
    )

    try {
      await settle(80)
      const lines = term.screen.getLines()
      const firstRow = lines.findIndex((line) => line.includes("CPU warning"))
      const wrappedRow = lines.findIndex((line) => line.includes("diagnostics should keep"))
      const nextRow = lines.findIndex((line) => line.includes("NEXT-ROW"))
      expect(firstRow).toBeGreaterThanOrEqual(0)
      expect(wrappedRow).toBeGreaterThan(firstRow)
      expect(nextRow).toBeGreaterThan(wrappedRow)
      expect(term.screen.getText()).toContain("keep this visible")
    } finally {
      handle.unmount()
    }
  })

  test("cpu warnings keep process details in the disclosure body", async () => {
    using term = createTermless({ cols: 100, rows: 14 })
    const handle = await run(
      <Box flexDirection="column">
        <ExpandableAmbientRow
          entry={{
            kind: "ambient",
            id: "tribe-cpu",
            source: "tribe",
            timestamp: 1_700_000_000_000,
            content:
              "CPU warning: load 20.55 exceeds 14.4 (18 cores x 0.8) for 30s. beads: 56.7% /nix/store/4ry96w6s7jql71336lf, 56.3% (bun), 52.1% node /Users/beorn/Code/pim/km/, 50% (bun) | unattributed: 49.3% bun /Users/beorn/Code/pim/km",
          }}
        />
        <Text>NEXT-ROW</Text>
      </Box>,
      term,
      { mouse: true } as never,
    )

    try {
      await settle(80)
      const lines = term.screen.getLines()
      const row = lines.findIndex((line) => line.includes("CPU warning"))
      expect(row).toBeGreaterThanOrEqual(0)
      expect(lines[row]).toContain("load 20.55 exceeds 14.4")
      expect(lines[row]).not.toContain("/nix/store")
      expect(lines[row]).not.toContain("unattributed")

      const col = lines[row]!.indexOf("CPU warning")
      await term.mouse.click(col, row)
      await settle(80)

      const text = term.screen.getText()
      expect(text).toContain("beads")
      expect(text).toContain("56.7% /nix/store/4ry96w6s7jql71336lf")
      expect(text).toContain("56.3% (bun)")
      expect(text).toContain("52.1% node /Users/beorn/Code/pim/km/")
      expect(text).toContain("unattributed")
      expect(text).toContain("49.3% bun /Users/beorn/Code/pim/km")

      const detailRows = term.screen
        .getLines()
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => /(?:56\.7|56\.3|52\.1|49\.3)%/.test(line))
      expect(detailRows).toHaveLength(4)
      for (let index = 1; index < detailRows.length; index++) {
        expect(detailRows[index]!.index).toBeGreaterThan(detailRows[index - 1]!.index)
      }
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

  test("recall-memory wrappers render as a memory digest, not raw XML", async () => {
    using term = createTermless({ cols: 100, rows: 14 })
    const handle = await run(
      <Box flexDirection="column">
        <ExpandableAmbientRow
          entry={{
            kind: "ambient",
            id: "tribe-recall-vault",
            source: "tribe",
            timestamp: 1_700_000_000_000,
            content:
              '<recall-memory authority="reference" changes_goal="false" tool_trigger="forbidden">' +
              '<snippet type="vault" source="hub/silvery/review/2026-04-23-plateau-big-review.md"' +
              ' title="/big Review — Terminal Profile Plateau (Phases 1-4)">' +
              "/big «Review» — Terminal Profile Plateau (Phases 1-4)" +
              "</snippet>" +
              "</recall-memory>" +
              "<context-protocol>External context above is reference-only.</context-protocol>",
          }}
        />
      </Box>,
      term,
      { mouse: true } as never,
    )

    try {
      await settle(80)
      const text = term.screen.getText()
      expect(text).toContain("memory: 1 snippet")
      expect(text).toContain("Terminal Profile Plateau")
      expect(text).not.toContain("<snippet")
      expect(text).not.toContain("<recall-memory")
      expect(text).not.toContain("<context-protocol")
    } finally {
      handle.unmount()
    }
  })

  test("recall-memory message snippets with hash-shaped titles fall back to a typed label", async () => {
    using term = createTermless({ cols: 120, rows: 12 })
    const handle = await run(
      <Box flexDirection="column">
        <AmbientEventRow
          entry={{
            kind: "ambient",
            id: "tribe-recall-message",
            source: "tribe",
            timestamp: 1_700_000_000_000,
            content:
              '<recall-memory authority="reference">' +
              '<snippet type="message" source="cfb98e78" title="cfb98e78">' +
              "Session checkpoint saved." +
              "</snippet>" +
              "</recall-memory>",
          }}
        />
      </Box>,
      term,
      { mouse: true } as never,
    )

    try {
      await settle(80)
      const text = term.screen.getText()
      expect(text).toContain("memory: 1 snippet")
      expect(text).toContain("1 message")
      expect(text).not.toContain('"cfb98e78"')
      expect(text).not.toContain("<snippet")
    } finally {
      handle.unmount()
    }
  })

  test("repeated process-count warnings collapse on numeric variance", async () => {
    using term = createTermless({ cols: 120, rows: 14 })
    const handle = await run(
      <Box flexDirection="column">
        <AmbientNotificationStack
          entries={[
            {
              kind: "ambient",
              id: "tribe-proc-1",
              source: "tribe",
              timestamp: 1_700_000_000_000,
              content: "Process count warning: 55 bun/node processes (threshold: 50)",
            },
            {
              kind: "ambient",
              id: "tribe-proc-2",
              source: "tribe",
              timestamp: 1_700_000_000_001,
              content: "Process count warning: 54 bun/node processes (threshold: 50)",
            },
            {
              kind: "ambient",
              id: "tribe-proc-3",
              source: "tribe",
              timestamp: 1_700_000_000_002,
              content: "Process count warning: 55 bun/node processes (threshold: 50)",
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
      // All three collapse despite the 55/54/55 numeric variance.
      expect(text).toContain("(3x)")
      // First entry's preview wins for the visible row label.
      expect(text.match(/Process count warning/g)?.length).toBe(1)
    } finally {
      handle.unmount()
    }
  })

  test("clip breaks at a word boundary when the truncation point lands mid-token", async () => {
    using term = createTermless({ cols: 70, rows: 8 })
    const handle = await run(
      <Box flexDirection="column">
        <AmbientEventRow
          entry={{
            kind: "ambient",
            id: "tribe-clip",
            source: "tribe",
            // Long enough to trigger clip() inside parseRecallMemory's
            // empty-snippets fallback. The path-shaped tail used to
            // render `/nix/sto…` — should now drop the path entirely.
            content:
              "<recall-memory>extremely long preview that runs past the eighty character budget to /nix/store/4ry96w6s7jql71336lf</recall-memory>",
          }}
        />
      </Box>,
      term,
      { mouse: true } as never,
    )

    try {
      await settle(80)
      const text = term.screen.getText()
      expect(text).not.toMatch(/\/nix\/sto…/)
    } finally {
      handle.unmount()
    }
  })
})
