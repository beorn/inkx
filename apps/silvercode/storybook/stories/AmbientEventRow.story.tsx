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

const TRIBE_CONCISE_FIXTURES: AmbientStreamEntry[] = [
  {
    kind: "ambient",
    id: "tribe-commit",
    source: "tribe",
    timestamp: at(0),
    content: "Committed: e9dc1650e chore(beads): close shipped/superseded storage cleanup beads",
  },
  {
    kind: "ambient",
    id: "tribe-process-count-1",
    source: "tribe",
    timestamp: at(5),
    content:
      "[dm ci-fix] Process count warning: 53 bun/node processes (threshold: 50). ci-fix: 205.5% /nix/store/4ry96w6s7jql71336lf, 52.9% /nix/store/4ry96w6s7jql71336lf, 47.2% /nix/store/4ry96w6s7jql71336lf, 37.1% /nix/store/4ry96w6s7jql71336lf",
  },
  {
    kind: "ambient",
    id: "tribe-process-count-2",
    source: "tribe",
    timestamp: at(6),
    content:
      "[dm ci-fix] Process count warning: 54 bun/node processes (threshold: 50). ci-fix: 59.9% /nix/store/4ry96w6s7jql71336lf, 57.2% /nix/store/4ry96w6s7jql71336lf, 56.9% /nix/store/4ry96w6s7jql71336lf",
  },
  {
    kind: "ambient",
    id: "tribe-process-count-3",
    source: "tribe",
    timestamp: at(7),
    content:
      "[dm ci-fix] Process count warning: 55 bun/node processes (threshold: 50). ci-fix: 56.3% (bun), 54.9% /nix/store/4ry96w6s7jql71336lf, 53.9% /nix/store/4ry96w6s7jql71336lf",
  },
  {
    kind: "ambient",
    id: "tribe-cpu-warning",
    source: "tribe",
    timestamp: at(10),
    content:
      "CPU warning: load 20.55 exceeds 14.4 (18 cores x 0.8) for 30s. beads: 56.7% /nix/store/4ry96w6s7jql71336lf, 56.3% (bun), 52.1% node /Users/beorn/Code/pim/km/ | unattributed: 49.3% bun /Users/beorn/Code/pim/km",
  },
  {
    kind: "ambient",
    id: "tribe-session-join",
    source: "tribe",
    timestamp: at(20),
    content: "[session tribe] silvercode-2 joined (member) pid=27286 ~/Code/pim/km/apps/silvercode",
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

export const ambientEventRowTribeConcise: Story = {
  id: "AmbientEventRow/tribe-concise",
  component: "AmbientEventRow",
  variant: "tribe-concise",
  description: "Noisy Tribe payloads collapsed to concise rows, with full details available when expanded.",
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
            {TRIBE_CONCISE_FIXTURES.map((entry) => (
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
          <AmbientNotificationStack entries={TRIBE_CONCISE_FIXTURES} />
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
