/**
 * NotificationEventRow stories.
 *
 * Two variants:
 *   1. `all-sources` — one row per supported source kind, side-by-side, so
 *      the visual treatment per source is comparable in one frame.
 *   2. `inline-sequence` — full chat sequence (user → assistant → notification
 *      rows interleaved → user → assistant) demonstrating how notification
 *      observations drop into the scrollback at their actual timestamp,
 *      between turns.
 *
 * Sample payloads are deliberately benign — see the design doc on content
 * quarantine. NEVER paste literal trigger tokens into storybook fixtures.
 *
 * Bead: km-silvercode.notification-inline-display.
 */

import React from "react"
import { Box, Screen } from "silvery"
import { NotificationEventRow, NotificationStack } from "../../src/components/NotificationEventRow.tsx"
import type { ChannelNotification } from "../../src/notification-stream.ts"
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
const ALL_SOURCES_FIXTURES: ChannelNotification[] = [
  {
    kind: "notification",
    id: "amb-tribe-1",
    source: "tribe",
    timestamp: at(0),
    content: "peer alice opened PR #42 in DZ/decker — review requested on the auth refactor",
  },
  {
    kind: "notification",
    id: "amb-ci-1",
    source: "ci",
    timestamp: at(60),
    content: "CI passed: 245 tests, 0 failures, run took 3m 12s on main",
  },
  {
    kind: "notification",
    id: "amb-recall-1",
    source: "recall",
    timestamp: at(120),
    content: "recall hit: feedback-quiet-tribe-ack — relevance 0.82",
  },
  {
    kind: "notification",
    id: "amb-subagent-1",
    source: "sub-agent",
    timestamp: at(180),
    content: "sub-agent finished: 3 files searched, 12 matches in apps/silvercode",
    actionable: false,
  },
  {
    kind: "notification",
    id: "amb-filewatch-1",
    source: "file-watch",
    timestamp: at(240),
    content: "file-watch: apps/silvercode/src/controller.ts changed (saved by editor)",
  },
  {
    kind: "notification",
    id: "amb-telegram-1",
    source: "telegram",
    timestamp: at(300),
    content: "telegram message from approved channel: weekly digest ready for review",
  },
]

const TRIBE_CONCISE_FIXTURES: ChannelNotification[] = [
  {
    kind: "notification",
    id: "tribe-commit",
    source: "tribe",
    timestamp: at(0),
    content: "Committed: e9dc1650e chore(beads): close shipped/superseded storage cleanup beads",
  },
  {
    kind: "notification",
    id: "tribe-process-count-1",
    source: "tribe",
    timestamp: at(5),
    content:
      "[dm ci-fix] Process count warning: 53 bun/node processes (threshold: 50). ci-fix: 205.5% /nix/store/4ry96w6s7jql71336lf, 52.9% /nix/store/4ry96w6s7jql71336lf, 47.2% /nix/store/4ry96w6s7jql71336lf, 37.1% /nix/store/4ry96w6s7jql71336lf",
  },
  {
    kind: "notification",
    id: "tribe-process-count-2",
    source: "tribe",
    timestamp: at(6),
    content:
      "[dm ci-fix] Process count warning: 54 bun/node processes (threshold: 50). ci-fix: 59.9% /nix/store/4ry96w6s7jql71336lf, 57.2% /nix/store/4ry96w6s7jql71336lf, 56.9% /nix/store/4ry96w6s7jql71336lf",
  },
  {
    kind: "notification",
    id: "tribe-process-count-3",
    source: "tribe",
    timestamp: at(7),
    content:
      "[dm ci-fix] Process count warning: 55 bun/node processes (threshold: 50). ci-fix: 56.3% (bun), 54.9% /nix/store/4ry96w6s7jql71336lf, 53.9% /nix/store/4ry96w6s7jql71336lf",
  },
  {
    kind: "notification",
    id: "tribe-cpu-warning",
    source: "tribe",
    timestamp: at(10),
    content:
      "CPU warning: load 20.55 exceeds 14.4 (18 cores x 0.8) for 30s. beads: 56.7% /nix/store/4ry96w6s7jql71336lf, 56.3% (bun), 52.1% node /Users/beorn/Code/pim/km/ | unattributed: 49.3% bun /Users/beorn/Code/pim/km",
  },
  {
    kind: "notification",
    id: "tribe-session-join",
    source: "tribe",
    timestamp: at(20),
    content: "[session tribe] silvercode-2 joined (member) pid=27286 ~/Code/pim/km/apps/silvercode",
  },
]

export const notificationEventRowAllSources: Story = {
  id: "NotificationEventRow/all-sources",
  component: "NotificationEventRow",
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
              <NotificationEventRow
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
          <NotificationStack entries={ALL_SOURCES_FIXTURES} />
        )}
      </Screen>
    )
  },
}

export const notificationEventRowTribeConcise: Story = {
  id: "NotificationEventRow/tribe-concise",
  component: "NotificationEventRow",
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
              <NotificationEventRow
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
          <NotificationStack entries={TRIBE_CONCISE_FIXTURES} />
        )}
      </Screen>
    )
  },
}

/**
 * The full inline sequence: user prompt, assistant response, two notification
 * observations arriving while the next turn is composed, then a follow-up
 * user prompt and assistant response. The notification rows sit BETWEEN the
 * second user prompt and its response — they belong to the time window
 * after the prior turn and before the next one, which is when the
 * notification pipeline actually injects them into the agent's context.
 */
export const notificationEventRowInlineSequence: Story = {
  id: "NotificationEventRow/inline-sequence",
  component: "NotificationEventRow",
  variant: "inline-sequence",
  description: "Full chat sequence with notification observations interleaved between turns.",
  render() {
    return <InlineSequenceStory />
  },
}

function InlineSequenceStory(): React.ReactElement {
  const notification1: ChannelNotification = {
    kind: "notification",
    id: "seq-1",
    source: "tribe",
    timestamp: at(0),
    content: "peer alice opened PR #42 in DZ/decker — review requested on the auth refactor",
  }
  const notification2: ChannelNotification = {
    kind: "notification",
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
          notificationEntries={[notification1, notification2]}
          onApprove={() => {}}
          onDeny={() => {}}
          sessionId="notification-inline-sequence"
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
