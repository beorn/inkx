/**
 * AmbientEventRow stories.
 *
 * Two variants:
 *   1. `all-sources` — one row per supported source kind, side-by-side, so
 *      the visual treatment per source is comparable in one frame.
 *   2. `inline-sequence` — full chat sequence (user → assistant → ambient
 *      rows interleaved → user → assistant) demonstrating how ambient
 *      observations drop into the scrollback at their actual timestamp,
 *      between turns.
 *
 * Sample payloads are deliberately benign — see the design doc on content
 * quarantine. NEVER paste literal trigger tokens into storybook fixtures.
 *
 * Bead: km-silvercode.ambient-inline-display.
 */

import React, { useState } from "react"
import { Box, Prose, Screen, Text } from "silvery"
import { AmbientEventRow, type AmbientStreamEntry } from "../../src/components/AmbientEventRow.tsx"
import { LinkifiedText } from "../../src/components/LinkifiedText.tsx"
import { MarkdownView } from "../../src/components/MarkdownView.tsx"
import type { Story } from "../types.ts"

const NOW = 1_700_000_000_000
const at = (offsetSec: number): number => NOW + offsetSec * 1000

/**
 * One row per supported source. Payloads are short, benign, and self-
 * descriptive so the visual story communicates "this is the row for
 * source X" without requiring any backstory.
 */
const ALL_SOURCES_FIXTURES: AmbientStreamEntry[] = [
  {
    kind: "ambient",
    id: "amb-tribe-1",
    source: "tribe",
    timestamp: at(0),
    content: "peer alice opened PR #42 in DZ/decker — review requested on the auth refactor",
  },
  {
    kind: "ambient",
    id: "amb-ci-1",
    source: "ci",
    timestamp: at(60),
    content: "CI passed: 245 tests, 0 failures, run took 3m 12s on main",
  },
  {
    kind: "ambient",
    id: "amb-recall-1",
    source: "recall",
    timestamp: at(120),
    content: "recall hit: feedback-quiet-tribe-ack — relevance 0.82",
  },
  {
    kind: "ambient",
    id: "amb-subagent-1",
    source: "sub-agent",
    timestamp: at(180),
    content: "sub-agent finished: 3 files searched, 12 matches in apps/silvercode",
    actionable: false,
  },
  {
    kind: "ambient",
    id: "amb-filewatch-1",
    source: "file-watch",
    timestamp: at(240),
    content: "file-watch: apps/silvercode/src/controller.ts changed (saved by editor)",
  },
  {
    kind: "ambient",
    id: "amb-telegram-1",
    source: "telegram",
    timestamp: at(300),
    content: "telegram message from approved channel: weekly digest ready for review",
  },
]

export const ambientEventRowAllSources: Story = {
  id: "AmbientEventRow/all-sources",
  component: "AmbientEventRow",
  variant: "all-sources",
  description: "One row per source — tribe / ci / recall / sub-agent / file-watch / telegram.",
  knobs: [
    {
      kind: "toggle",
      id: "expanded",
      label: "Expanded",
      default: false,
    },
  ],
  render(knobs) {
    const expanded = knobs.expanded === true
    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" padding={1} gap={0}>
          {ALL_SOURCES_FIXTURES.map((entry) => (
            <AmbientEventRow
              key={entry.id}
              entry={entry}
              expanded={expanded}
              onToggleExpand={() => {
                /* fixture story — no real toggle handler */
              }}
            />
          ))}
        </Box>
      </Screen>
    )
  },
}

/**
 * Minimal user / assistant rows — local stand-ins so the sequence story
 * doesn't depend on the full SessionUpdateList machinery (turn ids,
 * scrollback policy, status sentinel). The visual treatment matches
 * SessionUpdateList's UserRow / AssistantRow closely enough to read as
 * a real exchange. The point of this story is to verify ambient rows
 * render correctly between turns at their actual timestamps.
 */
function StoryUserRow({ text }: { text: string }): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1} backgroundColor="$bg-surface-subtle" paddingX={1} paddingY={0}>
      <Text bold color="$accent">
        {">"}
      </Text>
      <Prose flexGrow={1}>
        <LinkifiedText text={text} role="user" />
      </Prose>
    </Box>
  )
}

function StoryAssistantRow({ text }: { text: string }): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1} paddingX={1}>
      <Text bold color="$primary">
        ●
      </Text>
      <Prose flexGrow={1}>
        <MarkdownView source={text} />
      </Prose>
    </Box>
  )
}

/**
 * The full inline sequence: user prompt, assistant response, two ambient
 * observations arriving while the next turn is composed, then a follow-up
 * user prompt and assistant response. The ambient rows sit BETWEEN the
 * second user prompt and its response — they belong to the time window
 * after the prior turn and before the next one, which is when the
 * ambient pipeline actually injects them into the agent's context.
 */
export const ambientEventRowInlineSequence: Story = {
  id: "AmbientEventRow/inline-sequence",
  component: "AmbientEventRow",
  variant: "inline-sequence",
  description: "Full chat sequence with ambient observations interleaved between turns.",
  render() {
    return <InlineSequenceStory />
  },
}

function InlineSequenceStory(): React.ReactElement {
  // Local expand state so the story is interactive — clicking an ambient
  // row toggles its body inline, just like in the live app.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const ambient1: AmbientStreamEntry = {
    kind: "ambient",
    id: "seq-1",
    source: "tribe",
    timestamp: at(0),
    content: "peer alice opened PR #42 in DZ/decker — review requested on the auth refactor",
  }
  const ambient2: AmbientStreamEntry = {
    kind: "ambient",
    id: "seq-2",
    source: "ci",
    timestamp: at(15),
    content: "CI passed: 245 tests on main, run took 3m 12s",
  }

  return (
    <Screen flexDirection="column">
      <Box flexDirection="column" padding={1} gap={1}>
        <StoryUserRow text="what's on the team's plate today?" />
        <StoryAssistantRow text="Here's what I can see so far. Let me check the channel feed." />

        <AmbientEventRow
          entry={ambient1}
          expanded={expanded.has(ambient1.id)}
          onToggleExpand={() => toggle(ambient1.id)}
        />
        <AmbientEventRow
          entry={ambient2}
          expanded={expanded.has(ambient2.id)}
          onToggleExpand={() => toggle(ambient2.id)}
        />

        <StoryUserRow text="anything else come in while you were thinking?" />
        <StoryAssistantRow text="Two ambient observations landed: a peer PR (alice/#42) and a green CI run on main. Want me to summarise the PR diff?" />
      </Box>
    </Screen>
  )
}
