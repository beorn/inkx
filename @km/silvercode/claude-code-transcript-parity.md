---
id: "@km/silvercode/claude-code-transcript-parity"
aliases:
  - km-silvercode.claude-code-transcript-parity
  - km-silvercode-claude-code-transcript-parity
created_at: 2026-05-06T18:36:50.952Z
---

# [ ] [epic] Silvercode transcript/tool output parity with Claude Code #epic #P1 ^claude-code-transcript-parity

Make Silvercode's transcript, tool output, and debug/event treatment reach same-or-better usability versus Claude Code, using the May 6 side-by-side screenshots as the baseline.

## Problem

Silvercode should be a strict superset of Claude Code for transcript review: easier to scan, at least as faithful chronologically, and better at exposing raw detail on demand. The May 6 side-by-side screenshots show that Silvercode currently has more debug/event noise and weaker expanded tool rendering, especially for edits and command output.

The target is not pixel cloning. It is same-or-better task reconstruction: a reviewer should be able to read a session transcript, understand what the agent did, inspect every meaningful detail, and ignore internal machinery unless Debug is enabled.

## Baseline Evidence

- `/Users/beorn/Desktop/claude-code-parity.png`
- Session examples referenced during triage:
  - `019dfaa0-5e7c-7770-8c19-7871be863f5b`
  - `019ddfc8-0749-7da1-b892-b2e1c6`
  - `f9eb64dc-d982-4a46-9a8e-da5fd882ac5f`

## Observed Gaps

| Area                      | Current Silvercode behavior                                                                                                                        | Same-or-better target                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Debug/internal events     | Title, queue, task reminder, permission mode, hook info, file snapshots, and similar blocks appear as transcript content or near-transcript noise. | Internal events are hidden by default or grouped as subtle Debug blocks. Debug mode exposes all raw events and context.                                                                                                                           |
| User/assistant separation | Some assistant narration or internal records can visually resemble user prompt content.                                                            | User prompts, assistant narration, status, tool work, and debug events have distinct primitives. Nothing raw/internal is styled as user input.                                                                                                    |
| Edit output               | Expanded edit summaries are flatter text dumps, often repeating paths and showing local hunk counters.                                             | Render one polished operation block per edit/file, e.g. Update(path), with added/removed counts and useful summary.                                                                                                                               |
| Diff display              | Diff details are less readable: limited syntax highlighting, saturated red/green text, repeated file names, weak line-number context.              | Syntax-highlighted diff/code view with real source line numbers, muted unchanged context, changed-line backgrounds, and wrapped long lines.                                                                                                       |
| Command output            | Ran N commands can expand to little/no useful detail or raw output that is hard to scan.                                                           | Compact command summary by default; expand/cmd-hover reveals command, cwd, exit status, stdout, stderr, timing, and raw event payload. (NOTE: Claude code seems to expand file edits by default while collapsing shell commands - probably good.) |
| Search/read output        | Aggregated activity summaries are useful but can lose chronological context.                                                                       | Preserve compact summaries such as Read 4 files, Edited 2 files, Ran 3 commands, while making per-operation detail available in context.                                                                                                          |
| Commit/push status        | Commit and push events can be indistinct from general prose or debug blocks.                                                                       | First-class muted status blocks for commits, pushes, and other important lifecycle events.                                                                                                                                                        |
| Tables/prose              | Markdown/table rendering can be visually heavier than Claude Code and must never truncate important cell content.                                  | Neutral tables, wrapping cells, consistent linkification, and no clipped content in normal transcript width.                                                                                                                                      |
| Raw details               | Raw inspectors are valuable but can occlude the wrong material or fail to show enough.                                                             | Every nontrivial block is expandable or supports cmd-hover raw detail. Inspectors are contextual, complete, and avoid covering the content being inspected when possible.                                                                         |

## Target Model

The feature is **Chat Transcript Tree**.

Canonical flow:

```text
AgentEvent -> normalizeAgentEvent(...) -> ChatEvent -> apply(ChatEvent) -> ChatState
                                                               |
                                                               v
                                                  projectChatTranscript(...)
                                                               |
                                                               v
                                                       ChatSession.tree
```

`AgentEvent` is the adapter/runtime boundary. `apply(...)` should see canonical `ChatEvent`s, not provider-native records or app queue internals.

Use these terms consistently:

- `AgentEvent`: adapter/runtime event from Claude, Codex, ACP, local hooks, queue machinery, replay, or restore. This is outside the core reducer.
- `ChatEvent`: normalized chronological fact in a Silvercode chat session. This is what `apply(...)` accepts.
- `ChatState`: accumulated canonical state after applying ChatEvents.
- `ChatSession`: chat session state, including canonical data, channels, and the projected tree.
- `ChatTree`: projected transcript tree.
- `ChatNode`: any node in the projected transcript tree.
- `ChatElement`: ChatNode with `children`; examples: root, turn, message, work, subtask.
- `ChatLeaf`: ChatNode without `children`; a renderable transcript leaf.
- `ChatChannel`: filter/routing metadata on leaves, not tree structure.
- `ChatMessage`: role-bearing user/assistant/system content.
- `ChatMessagePart`: typed content inside a ChatMessage.
- `ChatTreeState`: UI state for the tree, keyed by node id where needed, such as disclosure, selection, hover/raw detail.
- `projectChatTranscript(...)`: the central projection/transformation. Do not introduce a separate policy abstraction.

`ChatBlock` may remain a React component family name for rendering a ChatLeaf. It is not the data model.

## Data Modeling Alignment

All new data modeling for Silvercode chat/transcript work should use this vocabulary, even when the work is not directly about rendering.

Use the suffixes consistently:

| Suffix | Meaning | Examples |
| ------ | ------- | -------- |
| `Event` | Canonical chronological fact accepted by `apply(...)` | `ChatEvent` |
| `State` | Accumulated mutable model state | `ChatState`, `ChatTreeState` |
| `Session` | Projected session view that the UI consumes | `ChatSession` |
| `Tree` | Projected transcript tree | `ChatTree` |
| `Node` | Any node in the transcript tree | `ChatNode` |
| `Element` | Tree node with children | `ChatElement` |
| `Leaf` | Renderable tree node without children | `ChatLeaf` |
| `Channel` | Filter/routing lane for leaves | `ChatChannel`, `ChatChannelState` |
| `Message` | Role-bearing chat content | `ChatMessage` |
| `Part` | Typed content inside a message | `ChatMessagePart` |

Avoid introducing parallel names for the same concepts. In particular:

- Do not model rendered transcript data as blocks; model it as ChatNodes and ChatLeaves.
- Do not model channels as tree parents; channels are filters on leaves.
- Do not add a policy object for projection rules; put the transformation in `projectChatTranscript(...)` until concrete configuration needs appear.
- Do not let adapter names become canonical chat-state names.
- Do not add `Entry`, `Item`, `Row`, or `Record` types for this model unless they describe a real boundary distinct from event/state/node/leaf.

## Vocabulary Migration

Migrate Silvercode transcript work to the target vocabulary above before implementing new renderer behavior.

Known vocabulary issues:

- The current `AgentEvent` type in `packages/agent-harness/src/events.ts` is a legacy adapter boundary. The core chat reducer should receive `ChatEvent`.
- ACP `SessionUpdate` is an adapter input shape. Do not let ACP naming leak into ChatState or ChatSession tree types.
- Current `MessageEntry`, `MessageOp`, activity segment, and transcript-slice types predate the ChatNode model. Rename or isolate them during the vocabulary phase.
- `Chat.Turn.*` is UI component vocabulary only. New canonical model fields should not depend on provider `turnId`.
- Pre-ChatTree `entry`, `row`, and `item` names remain in older components/tests. Isolate or rename them during the vocabulary phase so canonical data modeling uses ChatEvent, ChatNode, ChatElement, and ChatLeaf.
- UI vocabulary is `ChatPane` for the session pane and `ChatBlock` for rendered transcript/UI blocks. `ChatBlock` is UI-only; do not use it for the canonical data model.

Refactoring rules for this epic:

- Vocabulary migration is Phase 1, not a cleanup task. New renderers and projection behavior should not start until the vocabulary gate passes.
- Keep mechanical rename work separate from behavior changes.
- Sweep the seven rename layers from the refactor workflow: data/fixtures, types, functions, files, comments, docs, and tests.
- Do not leave soft-migration aliases or old-name wrappers as the long-term path. If a legacy boundary must remain for a phase, list it explicitly and create the cleanup bead before closing that phase.
- `/complete` criteria must include exact grep commands and actual counts, not only passing tests.

## Target `types.ts`

Phase 1 should add a type-only substrate at `apps/silvercode/src/chat/types.ts`. The first implementation should be close to this shape:

```ts
export type Brand<T, Name extends string> = T & { readonly __brand: Name }

export type AgentEventId = Brand<string, "AgentEventId">
export type ChatEventId = Brand<string, "ChatEventId">
export type ChatSessionId = Brand<string, "ChatSessionId">
export type ChatNodeId = Brand<string, "ChatNodeId">
export type ChatMessageId = Brand<string, "ChatMessageId">
export type ChatMessagePartId = Brand<string, "ChatMessagePartId">
export type ChatToolId = Brand<string, "ChatToolId">
export type ChatChannelId = Brand<string, "ChatChannelId">

export type ChatRole = "user" | "assistant" | "system"
export type ChatSeverity = "info" | "warning" | "error"
export type ChatStatus = "pending" | "running" | "done" | "failed" | "cancelled"
export type ChatDisclosure = "expanded" | "collapsed" | "adaptive"
export type ChatWidth = "prose" | "wide" | "full"

export type ChatEvent = {
  id: ChatEventId
  type: ChatEventType
  ts: number
  sessionId: ChatSessionId
  agentEventId?: AgentEventId
  payload: ChatEventPayload
  rawRefs: readonly ChatRawRef[]
}

export type ChatEventType =
  | "message.started"
  | "message.part.added"
  | "message.completed"
  | "tool.started"
  | "tool.updated"
  | "tool.completed"
  | "permission.requested"
  | "permission.resolved"
  | "plan.updated"
  | "queue.updated"
  | "session.updated"
  | "status.updated"
  | "error.raised"
  | "debug.recorded"

export type ChatEventPayload = Record<string, unknown>

export type ChatRawRef = {
  id: string
  source: "agent" | "adapter" | "local" | "replay" | "restore"
  label?: string
}

export type ChatMessage = {
  id: ChatMessageId
  role: ChatRole
  partIds: readonly ChatMessagePartId[]
  eventIds: readonly ChatEventId[]
}

export type ChatMessagePart =
  | { id: ChatMessagePartId; type: "text"; text: string; eventIds: readonly ChatEventId[] }
  | { id: ChatMessagePartId; type: "reasoning"; text: string; eventIds: readonly ChatEventId[] }
  | { id: ChatMessagePartId; type: "attachment"; attachment: ChatAttachment; eventIds: readonly ChatEventId[] }
  | { id: ChatMessagePartId; type: "tool-ref"; toolId: ChatToolId; eventIds: readonly ChatEventId[] }

export type ChatAttachment = {
  kind: "file" | "image" | "url" | "resource"
  label: string
  uri?: string
  mimeType?: string
}

export type ChatElementType = "root" | "turn" | "message" | "work" | "subtask"

export type ChatLeafType =
  | "user-text"
  | "assistant-text"
  | "reasoning"
  | "attachment"
  | "recap"
  | "read"
  | "search"
  | "patch"
  | "command"
  | "tool"
  | "permission"
  | "plan-update"
  | "queue"
  | "session-status"
  | "file-snapshot"
  | "hook"
  | "mcp"
  | "usage"
  | "error"
  | "unknown"

export type ChatNode = ChatElement | ChatLeaf

export type ChatElement = {
  id: ChatNodeId
  type: ChatElementType
  children: readonly ChatNodeId[]
  eventIds: readonly ChatEventId[]
  summary?: string
}

export type ChatLeaf = {
  id: ChatNodeId
  type: ChatLeafType
  channel: ChatChannelId
  eventIds: readonly ChatEventId[]
  messageIds?: readonly ChatMessageId[]
  partIds?: readonly ChatMessagePartId[]
  toolIds?: readonly ChatToolId[]
  summary?: string
  status?: ChatStatus
  severity?: ChatSeverity
  width: ChatWidth
  defaultDisclosure: ChatDisclosure
  detailAccess: readonly ChatDetailAccess[]
  rawRefs: readonly ChatRawRef[]
  props: ChatLeafProps
}

export type ChatDetailAccess = "expand" | "cmd-hover" | "side-panel"
export type ChatLeafProps = Record<string, unknown>

export type ChatChannelState = {
  id: ChatChannelId
  label: string
  visible: boolean
  muted: boolean
}

export type ChatTree = {
  rootId: ChatNodeId
  nodes: Readonly<Record<ChatNodeId, ChatNode>>
  state: ChatTreeState
}

export type ChatTreeState = {
  disclosureByNodeId: Readonly<Record<ChatNodeId, ChatDisclosure>>
  selectedNodeId?: ChatNodeId
  rawInspector?: { nodeId: ChatNodeId; rawRefId: string }
}

export type ChatState = {
  session: ChatSession
}

export type ChatSession = {
  id: ChatSessionId
  events: readonly ChatEvent[]
  messages: Readonly<Record<ChatMessageId, ChatMessage>>
  messageParts: Readonly<Record<ChatMessagePartId, ChatMessagePart>>
  tools: Readonly<Record<ChatToolId, ChatTool>>
  plan: ChatPlan
  queue: ChatQueue
  permissions: ChatPermissions
  tree: ChatTree
  channels: Readonly<Record<ChatChannelId, ChatChannelState>>
}

export type ChatTool = Record<string, unknown>
export type ChatPlan = Record<string, unknown>
export type ChatQueue = Record<string, unknown>
export type ChatPermissions = Record<string, unknown>
```

Design notes:

- `type` is the discriminator for both elements and leaves. The structural difference is whether `children` exists.
- Channels are filters and routing metadata. They do not shape the tree.
- Debug records are not grouped by default. They are chronological ChatLeaf nodes with `channel = debug`.
- Work grouping is represented by `ChatElement` nodes only when grouping improves the primary transcript, such as compact read/edit/run summaries.
- `alien-projections` can help maintain flat keyed views such as visible leaves, pending permissions, running tools, or channel-filtered lists.
- `alien-trees` is appropriate if the ChatSession tree needs stable per-node subscriptions or descendant aggregates. The domain owner is still `projectChatTranscript(...)`, not the alien primitive.

Example tree:

```text
root
  turn:t1
    message:m1
      user-text:u1          channel=transcript
      attachment:att1       channel=transcript
    message:m2
      assistant-text:a1     channel=transcript
    work:w1                 summary="Read 4 files"
      read:r1               channel=activity
      search:s1             channel=activity
    file-snapshot:f1        channel=debug
    work:w2                 summary="Edited 2 files"
      patch:p1              channel=activity
      patch:p2              channel=activity
    error:e1                channel=error
```

## Projection Rules

`projectChatTranscript(...)` is the central transformation. It owns:

- event classification into ChatNode types
- turn/message/work tree grouping
- channel assignment
- summary text such as `Read 4 files`, `Edited 2 files`, `Ran 3 commands`
- default disclosure and width
- raw/detail access
- chronological placement

Default rules:

- User prompts and assistant narration are expanded prose leaves by default.
- Recaps are visible as `RECAP &middot; ...`; long recaps collapse with full detail available.
- Patch/edit leaves are expanded in detail when small, but bounded/collapsed when huge.
- Shell command output is collapsed by default. Failures show concise inline error text while preserving full stdout/stderr on expand.
- Read/search/fetch work can be grouped under a `work` element with a compact summary.
- Permission requests are expanded while actionable and collapsed after resolution.
- Plan, title, mode, usage, and queue updates update their UI state first; transcript leaves are created only when user-relevant, failed, or Debug-visible.
- Debug records are hidden or muted by channel state, but remain chronological leaves when Debug is visible.
- Unknown records become Debug leaves with complete raw payload. They must not masquerade as prompt/prose.
- Grouping must not cross user prompts unless the tree explicitly represents the interleaving.
- Every nontrivial leaf must be expandable or cmd-hover inspectable, even if hidden behind Debug by default.

## Implementation Plan

1. **Vocabulary and types cutover.** Rebase related beads/docs, audit current naming across the seven rename layers, add `apps/silvercode/src/chat/types.ts`, migrate docs/stories/fixtures/tests/touched source to the ChatEvent/ChatNode/ChatElement/ChatLeaf vocabulary, and add grep checks for rejected design terms.
2. **Fixture and inventory.** Build a replay fixture from the May 6 parity sessions and screenshots, covering user/assistant text, recaps, patch/edit output, shell output, read/search activity, queue events, title/config updates, task reminders, file snapshots, hooks, MCP/skill diagnostics, and unknown raw events.
3. **ChatEvent normalization substrate.** Add adapter-owned normalization from AgentEvent/ACP/Codex records into ChatEvents. `apply(...)` sees only ChatEvents.
4. **Transcript projection.** Implement `projectChatTranscript(...)` and the ChatSession tree projection with snapshot tests. Avoid a separate policy abstraction.
5. **State-first routing and channels.** Route title/mode/usage/queue/plan/liveness to UI state first, assign leaf channels, and make channel visibility/muting drive filtering.
6. **Core leaf renderers.** Implement renderers for user/assistant text, recap, patch, command, read/search, permission, plan-update, debug leaves, and errors before polishing rarer leaf types.
7. **Raw detail contract.** Ensure every nontrivial leaf has click expansion or cmd-hover raw detail, with complete raw refs and contextual placement that does not hide the inspected leaf.
8. **Visual parity review.** Run replay/termless snapshots and screenshot comparison against Claude Code for scanability, chronology, density, detail availability, and debug noise. Silvercode should be same-or-better, not a pixel clone.

## Refactor Phase Plan

Use the `/refactor` workflow for this epic. Each phase is sequential and independently shippable. Phase beads should repeat the mandatory first step: read `docs/lessons/refactoring.md` in full before editing.

**Phase 1: Vocabulary and types cutover**

Rebase related beads/docs, complete the mechanical vocabulary migration, and add the type-only model substrate before presentation behavior changes.

Delete or isolate:

- Stale transcript vocabulary in docs, beads, tests, stories, fixtures, snapshots, comments, and touched Silvercode source.
- New data-model names that introduce a parallel taxonomy for events, nodes, leaves, channels, or projected transcript state.
- Legacy implementation names unless they live in a documented source boundary with a cleanup bead.

New tests:

- `apps/silvercode/tests/chat-vocabulary.test.ts`
- `apps/silvercode/tests/chat-vocabulary.reject.txt`
- `apps/silvercode/tests/chat-types.test.ts`

Definition of done:

- `apps/silvercode/src/chat/types.ts` exists and exports the target `ChatState`, `ChatSession`, `ChatTree`, `ChatTreeState`, `ChatEvent`, `ChatNode`, `ChatElement`, `ChatLeaf`, `ChatChannel`, `ChatMessage`, and `ChatMessagePart` model.
- All new data modeling in this area uses the target vocabulary. Do not add alternate names for the same concepts.
- Standard vocabulary is used across new docs/tests/stories/fixtures and touched source.
- Every allowed legacy boundary is listed in one source-boundary doc with owner, reason, and cleanup bead id.
- No renderer, projection, or state-routing behavior changes are included except what is required to keep the rename compiling.

`/complete`:

- `rg -n -f apps/silvercode/tests/chat-vocabulary.reject.txt @km/silvercode apps/silvercode/docs apps/silvercode/storybook apps/silvercode/tests apps/silvercode/src` -> 0 stale-vocabulary hits outside explicitly allowed boundary docs.
- `bun vitest run apps/silvercode/tests/chat-vocabulary.test.ts apps/silvercode/tests/chat-types.test.ts`
- `npx tsc --noEmit`

**Phase 2: Replay fixture and event inventory**

Create the May 6 replay fixture and inventory all observed adapter/runtime records before building renderers.

Delete or isolate:

- Ad hoc screenshot-only classification notes that are not represented in fixture data or inventory tests.

New tests:

- Replay/inventory fixture tests covering the May 6 sessions and screenshots.

Definition of done:

- Fixture includes text, recaps, edits, commands, read/search activity, queue/title/config updates, task reminders, file snapshots, hooks, MCP/skill diagnostics, and unknown raw events.
- Inventory maps every observed input form to a `ChatEvent`, ChatSession state update, Debug leaf, or intentionally ignored record.

`/complete`:

- `bun vitest run apps/silvercode/tests/chat-replay-fixture.test.ts`
- `rg -n "TODO.*fixture|TODO.*inventory" apps/silvercode/tests apps/silvercode/docs @km/silvercode` -> 0 untracked fixture gaps.

**Phase 3: ChatEvent normalization substrate**

Normalize adapter/runtime records into canonical ChatEvents after Phase 1 passes.

Delete or isolate:

- Core reducer dependence on provider-native record shapes.
- Duplicate local event/message unions that bypass `ChatEvent`, `ChatMessage`, or `ChatMessagePart`.

New tests:

- Normalizer tests proving representative Claude, Codex, ACP, queue, hook, and replay records produce ChatEvents.

Definition of done:

- `apply(...)` accepts ChatEvents for the new path.
- Agent/runtime naming is confined to adapter/normalizer boundaries.
- Any retained legacy stream boundary has a cleanup bead created before this phase closes.

`/complete`:

- `rg -n "AgentEvent|SessionUpdate|MessageEntry|MessageOp" apps/silvercode/src/chat apps/silvercode/tests/chat --glob '!**/*source-boundary*'` -> 0 hits outside documented adapter boundaries.
- `bun vitest run apps/silvercode/tests/chat-normalize.test.ts`
- `npx tsc --noEmit`

**Phase 4: Transcript projection**

Implement `projectChatTranscript(...)` as the central ChatState -> ChatSession tree transformation.

Delete or isolate:

- Scattered classification, grouping, channel assignment, summary, width, and detail decisions in parser labels, activity summaries, tool-call rendering, and raw/detail components when they duplicate projection decisions.
- Any separate policy/config abstraction that reifies projection rules before the implementation needs it.

New tests:

- Projection snapshot tests for representative ChatEvents and ChatSession trees.
- Tree shape tests covering interleaved prompts/responses, work grouping, chronological debug leaves, channel filtering, and error visibility.

Definition of done:

- `projectChatTranscript(...)` owns event classification, tree grouping, channel assignment, summaries, default disclosure, width, and raw/detail affordances.
- New ChatEvent classifications fail tests until assigned a ChatNode outcome or intentionally ignored handling.
- Summary text such as `Read N files`, `Edited N files`, and `Ran N commands` is owned by projection tests.

`/complete`:

- `bun vitest run apps/silvercode/tests/chat-transcript-projection.test.ts`
- `rg -n "Read [0-9]+ files|Edited [0-9]+ files|Ran [0-9]+ commands|Activity" apps/silvercode/src --glob '!**/chat-transcript*' --glob '!**/*test*'` -> 0 projection-owned summary literals outside the projection surface.
- `npx tsc --noEmit`

**Phase 5: Channels and state-first routing**

Route title, mode, usage, queue, plan, liveness, hooks, MCP/skills, and file snapshots to ChatSession state or channel-filtered leaves.

Delete or isolate:

- Rendering of handled state/control updates as normal user/assistant transcript content.
- Channel-specific tree structures. Channels are metadata and filters, not parent nodes.

New tests:

- Channel toggle tests and state-routing tests.

Definition of done:

- Queue events never render as user prompts.
- Task/plan reminders update plan UI when handled.
- Debug mode exposes complete chronological debug leaves without structural debug grouping.

`/complete`:

- `bun vitest run apps/silvercode/tests/chat-state-routing.test.ts apps/silvercode/tests/chat-channels.test.ts`
- Replay fixture proves handled state/control updates are absent from normal transcript output and present in Debug/detail output when the channel is visible.

**Phase 6: Core leaf renderers and raw detail**

Implement same-or-better renderers for patches, commands, reads/searches, recaps, errors, and unknown debug payloads.

Delete or isolate:

- Raw text dumps where a specialized ChatLeaf renderer exists.
- Wide-width summaries that should use prose width.

New tests:

- Render tests for patch, command, read/search, recap, error, debug, table wrapping, and cmd-hover/raw detail leaves.

Definition of done:

- Every nontrivial leaf is expandable or cmd-hover inspectable.
- Expanded command/edit/read output contains complete detail and wraps long lines.

`/complete`:

- `bun vitest run apps/silvercode/tests/chat-leaf-rendering.test.ts`
- Visual replay comparison checklist passes against the Claude Code baseline.

## Acceptance Criteria

1. A synthetic visual fixture or replay fixture exists for the May 6 comparison scenario, including user prompts, assistant narration, edit output, shell output, queue/title/config updates, debug metadata, task reminders, file snapshots, hooks/MCP/skills, and recap/summary events.
2. `apps/silvercode/src/chat/types.ts` defines the target ChatEvent/ChatSession/ChatNode/ChatElement/ChatLeaf/ChatChannel data model before projection/rendering behavior lands.
3. New data modeling in this area aligns with the target vocabulary; no parallel names are introduced for events, projected tree nodes, leaves, channels, or UI state.
4. `apply(...)` sees ChatEvents for the new path. Provider/runtime records stay in adapter/normalizer code.
5. `projectChatTranscript(...)` is the central ChatState -> ChatSession tree transformation. It owns classification, tree grouping, channel assignment, summaries, default disclosure, width, and raw/detail affordances.
6. The transcript tree preserves prompt/response/work/debug chronology. Channels filter/mute leaves; they do not shape the tree.
7. Debug/internal metadata does not render as user/assistant transcript content. When Debug is visible, debug records are chronological leaves with complete raw detail.
8. Expanded edit results render as operation leaves with:
  - one clear header per operation/file, e.g. `Update(apps/km-cli/src/commands/bd.ts)`
  - added/removed counts
  - real source line numbers
  - syntax-highlighted code/diff content
  - no repeated path boilerplate inside the leaf body
  - wrapped long lines without layout breakage
9. Command, search, and read leaves render compact summaries by default and expand to complete details: command/query/path, cwd where relevant, exit status, stdout, stderr, timing, and raw payload.
10. `away_summary` renders as a recap leaf, using the agreed text shape: `RECAP &middot; summary text`.
11. `custom-title` is preferred over agent name when both exist. The active session name is visible near the top of the UI and can expose secondary title/name metadata on expansion.
12. Queue events are separated from user prompts and reconciled with Silvercode's own queue state. The UI must make lifecycle/state ownership clear enough to debug queued prompts.
13. Tables and prose in transcript content wrap instead of clipping, including links and long paths in table cells.
14. Visual review against Claude Code screenshots passes a checklist for scanability, chronology, useful density, detail availability, and debug noise. Silvercode should be same-or-better, not merely different.
15. Termless/render tests cover patch leaves, table wrapping/linkification, channel toggle behavior, recap rendering, and raw cmd-hover expansion.
16. Every implementation phase has `/complete` criteria with exact grep commands, expected counts, tests, and docs updates. No phase can close on "mostly done" naming cleanup.

## Likely Implementation Areas

- `apps/silvercode/src/chat/types.ts`
- `apps/silvercode/src/chat/normalize.ts`
- `apps/silvercode/src/chat/project-transcript.ts`
- `apps/silvercode/src/chat/channels.ts`
- `apps/silvercode/src/chat/tree.ts`
- `apps/silvercode/src/components/ToolCall.tsx`
- `apps/silvercode/src/components/ToolCallStatusTitle.tsx`
- `apps/silvercode/src/components/TurnActivitySummary.tsx`
- `apps/silvercode/src/components/SessionUpdateList.tsx`
- `apps/silvercode/src/components/NotificationEventRow.tsx`
- `apps/silvercode/src/components/Content.tsx`
- `apps/silvercode/src/components/MarkdownView.tsx`
- `apps/silvercode/packages/agent-harness/src/parse.ts`

Likely new/extracted components:

- Chat leaf renderers for edit/update operations.
- Debug leaf renderer for internal event payloads.
- Recap leaf renderer for `away_summary`.
- Event inventory doc/test fixture under `apps/silvercode/tests` or an adjacent docs path.
- ChatEvent normalizers for provider-neutral canonical events, plus a documented cleanup plan for any retained legacy adapter boundary.
- ChatNode/ChatElement/ChatLeaf types for the transcript tree.
- `projectChatTranscript(...)` for tree projection, grouping, channel assignment, summaries, expansion defaults, width, and raw-detail rules.
- Chat leaf component dispatcher for custom/smart transcript leaves.

## Related Beads

- `@km/silvercode/acp-tool-call-sweep`
- `@km/silvercode/opencode-parity`
- `@km/silvercode/raw-entry-inspector`
- `@km/silvercode/chat-prose-width-layout`
- `@km/silvery/diff-code-accordion`
- `@km/silvery/comp-code`

## Follow-up Sub-beads To Split

- Add `apps/silvercode/src/chat/types.ts` and migrate standard vocabulary across docs, beads, tests, stories, fixtures, and touched source; add grep gates.
- Build May 6 replay fixture and visual comparison checklist.
- Add ChatEvent normalizers, with explicit cleanup bead for any retained legacy adapter boundary.
- Add `projectChatTranscript(...)` and ChatSession tree projection tests.
- Route title/mode/usage/queue/plan/liveness as state-first updates.
- Implement channel filtering/muting and Debug visibility behavior.
- Implement patch/diff leaf parity.
- Implement command leaf expanded output parity.
- Implement read/search leaf compact summaries and details.
- Implement recap leaf and session-title/header treatment.
- Harden raw-detail expansion/cmd-hover for every nontrivial leaf.
- Run same-or-better visual parity review against Claude Code.
