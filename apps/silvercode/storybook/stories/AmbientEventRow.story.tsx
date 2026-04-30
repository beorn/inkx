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

import React from "react"
import { Box, Screen } from "silvery"
import {
  AmbientEventRow,
  AmbientNotificationStack,
  type AmbientStreamEntry,
} from "../../src/components/AmbientEventRow.tsx"
import { SessionUpdateList } from "../../src/components/SessionUpdateList.tsx"
import { MULTI_TURN } from "../support/sample-messages.ts"
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
        {expanded ? (
          <Box flexDirection="column" gap={0}>
            {ALL_SOURCES_FIXTURES.map((entry) => (
              <AmbientEventRow
                key={entry.id}
                entry={entry}
                expanded
                onToggleExpand={() => {
                  /* fixture story — no real toggle handler */
                }}
              />
            ))}
          </Box>
        ) : (
          <AmbientNotificationStack entries={ALL_SOURCES_FIXTURES} />
        )}
      </Screen>
    )
  },
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
      <Box flexDirection="column" flexGrow={1} minHeight={0}>
        <SessionUpdateList
          messages={MULTI_TURN}
          ambientEntries={[ambient1, ambient2]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="ambient-inline-sequence"
          status="idle"
          turnStartedAt={null}
          inputTokens={1532}
          outputTokens={412}
          pendingPermissions={0}
          inFlightTool={null}
          follow={false}
        />
      </Box>
    </Screen>
  )
}
