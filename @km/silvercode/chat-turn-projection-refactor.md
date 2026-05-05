---
id: "@km/silvercode/chat-turn-projection-refactor"
aliases:
  - km-silvercode.chat-turn-projection-refactor
  - km-silvercode-chat-turn-projection-refactor
created_at: 2026-05-05T20:20:15.903Z
type: task
priority: P0
status: in_progress
---

# [ ] Chat turn/burst projection model and component refactor @km/silvercode #task #P0

Make Silvercode's chat/session rendering explicit about the difference between canonical stream/session data and derived UI envelopes.

## Problem

We want chat grouping components because they make transcript rendering readable: prompts, narration, tool activity, summary, and stats naturally compose into visible turns/bursts of work. It is fine to call this visible unit a "turn", but it must not mean "one prompt plus its response." In Silvercode, a UI turn is an idle-delimited burst and may contain multiple prompts, assistant messages, activities, plan updates, permissions, and notifications.

ACP and provider streams do not reliably expose a canonical "turn" object or "turn id". In a pure async bidirectional flow, we cannot prove that a specific assistant activity/message belongs to a specific prompt. Async prompts, resumed sessions, background activity, plan updates, ambient notifications, and idle transitions can all blur the boundary.

The previous `Chat.Turn.*` component hierarchy bead established useful UI primitives, but the model still needs a sharper contract so future features do not store fake prompt-owned turns as canonical state. `Chat.Turn.*` can remain the component vocabulary if documented as an idle-delimited burst, not a provider turn id and not one-prompt ownership.

## Conclusion

Chat turns/bursts are a presentation projection, not the persistence/protocol model.

Canonical state should stay in session/message/activity/plan/update records with provider provenance. A Silvercode chat turn is a view model assembled from stream order plus idle boundaries on both sides. Prompts, assistant messages, activities, plan updates, and notifications inside a turn are peers in a time window, not parent/child records. If the projection is ambiguous, keep entries as ordered session-level entries inside the turn instead of inventing ownership.

Provider reality:

- ACP does not provide canonical turns.
- Codex rollout can provide optional `turn_id` on some task lifecycle events, but it is provider-specific and partial.
- Claude stream/jsonl primarily provides message/jsonl UUIDs. Silvercode has historically mapped those into `turnId`, but that is adapter terminology, not proof of a provider turn model.
- Therefore `turnId` should not appear in new canonical model shapes. Use `messageId`, `activityId`, `providerEventId`, or a UI-only `turnKey` depending on intent.

## Target Model

Use names like:

```ts
type ChatProjection = {
  sessionId: string
  entries: ChatEntry[]
}

type ChatEntry =
  | ChatPromptEntry
  | ChatAssistantSegmentEntry
  | ChatActivitySegmentEntry
  | ChatPlanUpdateEntry
  | ChatNotificationEntry
  | ChatSessionMetadataEntry

type ChatTurn = {
  turnKey: string
  entries: ChatEntry[]
  segments: ChatSegment[]
  summary?: ChatSummary
  stats?: ChatStats
  provenance: ChatProjectionProvenance
}

type ChatSegment = {
  id: string
  narration: ChatAssistantSegmentEntry[]
  activities: ChatActivitySegmentEntry[]
  planUpdates: ChatPlanUpdateEntry[]
}
```

Naming is flexible, but the invariant is not: `ChatTurn` is derived from canonical session entries and can be rebuilt.

## Projection Rules

- Start a new visible turn when the previous turn has reached quiescence: no active assistant stream, no running tool/activity, no pending permission, and no queued user input that belongs to the same active flow.
- Add prompts, assistant messages, activities, plan updates, and notifications to the current turn by stream order while either side is active.
- Multiple prompts submitted while the assistant is active remain separate prompt entries inside the same turn; do not assign already-running assistant output to a later prompt.
- A later prompt after both sides are idle starts a new turn.
- Ambient notifications and session metadata are session entries. They may visually appear between turns, but should not become turn-owned data.
- Plan updates update the canonical session plan; they may also appear inside the nearest segment when provenance/order makes that useful.
- Tool activity can be shown after nearby narration by stream order when that improves readability, but this is presentation adjacency, not ownership. Activity groups may be collapsed independently inside an expanded turn.
- `toolCount >= 8` aggregation applies to collapsed summaries. Expanded details should preserve narration/activity order, with nested summaries only for dense activity groups that actually save space.

## Component Contract

- `Chat.Root` / `Chat.Transcript` own session-level structure.
- `Chat.Notification` and `Chat.Metadata` render session-level entries in the prose lane.
- `Chat.Turn.Root` renders one idle-delimited turn and owns disclosure state.
- `Chat.Turn.Prompt` renders each prompt bubble inside the turn.
- `Chat.Turn.Segment` renders sequential narration + activity + plan updates.
- `Chat.Turn.Activity` renders one activity segment and may contain nested dense summaries.
- `Chat.Turn.ToolGroup` renders inline commands/tool calls when summary would not save space.
- `Chat.Turn.Summary` renders conclusion text when available.
- `Chat.Turn.Stats` renders elapsed time, tools, changed files, tokens/cost when available.

## Acceptance Criteria

- [ ] Code documents that Silvercode chat turns are idle-delimited derived UI projections, not canonical protocol state.
- [ ] New canonical model shapes do not use `turnId`; they use provider-specific ids or UI-only `turnKey` for presentation.
- [ ] Canonical session data can be projected into chat turn components without losing stream order.
- [ ] Expanded views show narration and tool/activity segments interleaved in original order.
- [ ] Collapsed views may group dense activity, but only when the summary saves space.
- [ ] A single tool/activity renders inline instead of as "Ran 1 command" / equivalent summary.
- [ ] Queued async prompts are represented explicitly inside the active turn and are not incorrectly treated as owning already-running assistant activity.
- [ ] Ambient notifications and session metadata stay session-level and render in the prose lane.
- [ ] Plan updates integrate with the canonical `AgentPlan` bead without requiring a turn id.
- [ ] Stats have a source model for elapsed time and tokens/cost when provider data exists; absent data is hidden, not guessed.
- [ ] Storybook covers prompt-only, narration-only, narration+activity+narration, dense activity, queued prompt, notification, plan update, summary, and stats cases.
- [ ] Tests live in existing chat/session regression files where practical, not one-off prop smoke-test files.
- [ ] Architecture docs are updated to distinguish canonical session entries from derived Silvercode chat turns.
- [ ] Design docs are updated to define a chat turn as an idle-delimited burst that may contain multiple prompts and activities.
- [ ] Existing docs/design notes that imply one prompt owns one assistant turn are corrected or explicitly marked legacy.
- [ ] Component docs/examples describe `turnKey` as UI projection identity only, not provider identity.

## Implementation Notes

2026-05-05:

- Added `turnKey` and `prompts[]` to the chat projection view model.
- Updated `buildChatTurns()` so multiple prompts submitted while the assistant is active remain in one idle-delimited UI turn; a later prompt after assistant idleness starts a new turn.
- Documented that Silvercode chat turns are derived idle-delimited presentation groups in `docs/chat-session-model.md`, README, and agent-harness docs.
- Added Storybook coverage for idle-delimited turns and a compact Chat state matrix covering prompt-only, narration-only, narration/activity/narration, dense activity, queued prompt, notification, plan update, summary, and stats.
- Fixed disclosure scroll anchoring for direct one-tool rows by notifying the transcript list from `ToolCall` expansion and freezing ListView row-space position when follow mode is disengaged.

2026-05-05 later:

- Added opt-in local historical transcript replay coverage for the chat projection, gated by `SILVERCODE_HISTORICAL_TRANSCRIPTS=1`.
- Added root script `bun run test:silvercode-historical` and app script `bun run test:historical`; optional roots are `SILVERCODE_HISTORICAL_CLAUDE_ROOT` and `SILVERCODE_HISTORICAL_CODEX_ROOT`.
- Exported `replayCodexTranscriptFile()` so tests can replay local Codex rollout files directly without copying transcripts into the repo.
- Verified local historical Claude/Codex stores replay into `buildChatTurns()` without parser errors or rendered Codex control prompts.
- Verification: `bun run test:silvercode-historical` passed locally, 1 historical sweep test, 10 skipped normal chat-model tests.
