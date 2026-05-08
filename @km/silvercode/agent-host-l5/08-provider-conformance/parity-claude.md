---
aliases:
  - km-silvercode.parity-claude
  - km-silvercode-parity-claude
  - claude-code-transcript-parity
  - km-silvercode.claude-code-transcript-parity
  - km-silvercode-claude-code-transcript-parity
created_at: 2026-05-06T18:36:50.952Z
status: open
previous_closed_at: 2026-05-06T22:55:31.000Z
previous_closeReason: "Completed through cbadc97f2 and child bead closures. All
  child beads under @km/silvercode/claude-code-transcript-parity are closed;
  targeted vocabulary grep for deprecated transcript UI names across
  apps/silvercode source/tests/storybook/docs/packages and parity beads returns
  0 hits. Verification: bun vitest run
  apps/silvercode/tests/codex-resume.test.ts
  apps/silvercode/packages/agent-harness/tests/parse.test.ts
  apps/silvercode/tests/content-layout.test.tsx
  apps/silvercode/tests/chat-model.test.ts
  apps/silvercode/tests/chat-types.test.ts
  apps/silvercode/tests/turn-activity-summary.test.tsx
  apps/silvercode/tests/notification-event-row.test.tsx
  apps/silvercode/tests/visual/message-list-sticky-bottom.test.tsx (aggregate
  focused runs: 169 passed / 1 skipped plus chat-types slice 57 passed / 1
  skipped); npx tsc --noEmit --pretty false; npx oxfmt --check touched files."
reopened_at: 2026-05-06T23:55:00Z
reopenReason: The first closure reached useful UI patches and type vocabulary,
  but not the quality plateau. Live Silvercode rendering still flows through
  legacy MessageEntry/MessageOp projections; ChatSession.tree is not yet the
  reactive source of truth, Debug filtering does not own all raw records, and
  handled state/control events such as permission mode, queue, task reminders,
  file snapshots, and titles still need a complete classification and routing
  pass.
---

# [/] Claude parity tracker @km/silvercode #feature #P1 ^parity-claude

Track Silvercode parity with Claude across the legacy stream-json path, the `@km/claude-acp` server path, resume/replay, transcript quality, permissions, prompt injection, and local-agent/subsession behavior.

This bead moved over the previous `@km/silvercode/claude-code-transcript-parity` epic and preserves its detailed transcript parity body below.

## Not yet implemented / notes

- [ ] Projected ChatTree is not primary yet. `ChatPane` still renders legacy `SessionUpdateList`; projected transcript is compare/debug only. See `@km/silvercode/parity-claude/l5-chatblock-cutover`.
- [ ] Claude fixture inventory/fail-loud contract is still open. Parser still funnels unknown Claude shapes into raw metadata, and ACP replay skips several event classes silently. See `@km/silvercode/parity-claude/l5-fixture-inventory`.
- [ ] ACP Claude resume ownership is ambiguous: controller replays Claude JSONL before spawn, while `@km/claude-acp` `loadSession` also replays JSONL. Decide single owner or add dedupe.
- [ ] ACP Claude remains intentionally lossy: non-text prompt blocks are dropped, HTTP/SSE MCP servers are skipped, replay skips some events, and status/error/handoff/km-reference do not surface as `SessionUpdate`s.
- [ ] Live Claude permission shapes/modes are not fully locked down. Parser has a placeholder `permission-request` branch; wire supports permission requests once emitted. See `@km/silvercode/parity-claude/l5-control-event-state-routing`.
- [ ] Claude-specific fake backend coverage is open. Current fake profiles include `claude` / `claude-code`, but `@km/silvercode/backend-fakes-claude` asks for Claude init/tools/slash/skills/plugins/TodoWrite/permissions/config/live-mode contracts.
- [ ] Claude ACP docs drift behind implementation: README still says `loadSession: false` and permissions are not forwarded, while server/wire now implement both.
- [ ] ACP path does not yet match legacy Claude for prompt injectors/channels, multi-account config, or `--bare` threading. See `@km/silvercode/acp-channels`.
- [ ] Claude local-agent/subsession transcript view is not modeled yet. Parent Agent/Task records and child sidechain JSONL files need to feed `SubSessionHandle`; see `@km/silvercode/local-agent-subsessions`.

## Existing beads moved / linked

- Moved over: `@km/silvercode/claude-code-transcript-parity` -> `@km/silvercode/parity-claude`, including the child bead directory.
- Parent active L5 work here: `l5-fixture-inventory`, `l5-canonical-event-contract`, `l5-reactive-chat-session-store`, `l5-project-transcript-rules`, `l5-control-event-state-routing`, `l5-debug-channel-ui`, `l5-legacy-quarantine`, `l5-chatblock-cutover`, `l5-visual-replay-parity`; review `l5-duplicate-message-coalescing` for close-or-revise.
- Move/parent active provider coverage: `@km/silvercode/backend-fakes-claude`.
- Link/absorb completed Claude evidence: `@km/silvercode/acp-adapter-claude`, `@km/silvercode/acp-claude-server`, `@km/silvercode/acp-claude-acp-loadsession`, `@km/silvercode/claude-acp-wire-bugs`, `@km/silvercode/acp-resume-blank-screen`, `@km/silvercode/acp-permission-ui-wire`, and `@km/silvercode/permission-inline-prompt`.
- Link but keep under broader ACP/global trackers: `@km/silvercode/acp-session-load`, `@km/silvercode/acp-controller-wire`, `@km/silvercode/acp-channels`, and `@km/silvercode/backend-fakes`.
- Cleanup candidate: `@km/silvercode/defer-transcript-replay-blank-screen` is a stub; fold into Claude resume parity or replace it with a concrete replay bead.

## Historical transcript parity detail

Make Silvercode's transcript, tool output, and debug/event treatment reach same-or-better usability versus Claude Code, using the May 6 side-by-side screenshots as the baseline.

## Problem

Silvercode should be a strict superset of Claude Code for transcript review: easier to scan, at least as faithful chronologically, and better at exposing raw detail on demand. The May 6 side-by-side screenshots show that Silvercode currently has more debug/event noise and weaker expanded tool rendering, especially for edits and command output.

The target is not pixel cloning. It is same-or-better task reconstruction: a reviewer should be able to read a session transcript, understand what the agent did, inspect every meaningful detail, and ignore internal machinery unless Debug is enabled.

## Quality Plateau Reopen

The May 6 closure was too shallow. It shipped important primitives and visual fixes, but it did not complete the architectural refactor implied by this epic.

Current reality:

- `apps/silvercode/src/chat/types.ts` is a type substrate, not the live model.
- `ChatSession.tree` now has a reactive/signals-backed projection store, but the mature legacy transcript renderer remains the primary renderer during comparison.
- The live path is still mostly `AgentSession -> SessionStore.messages: MessageEntry[] -> SessionUpdateList -> Chat.* components`.
- `showDebug` now also controls projected Debug-channel visibility and hides legacy raw/system debug rows by default.
- `useNotificationStream(...)` currently filters notification entries by source only; that is a legacy bug, not the target model.
- `MessageOp.kind === "raw"` rows are filtered from the normal ChatPane legacy path when Debug is off; remaining work is to delete the legacy routing once the projected renderer reaches parity.
- Several control/state records have useful semantics and should be handled, not dumped: permission mode, queue operation, task reminder, file history snapshot, hook info, `custom-title`, `ai-title`, `away_summary`, usage/status, and unknown provider records.

Quality plateau means the system has one coherent path:

```text
AgentEvent -> normalizeAgentEvent(...) -> ChatEvent -> apply(ChatEvent) -> ChatSession state
                                                               |
                                                               v
                                                projectChatTranscript(...)
                                                               |
                                                               v
                                                reactive ChatSession.tree
                                                               |
                                                               v
                                                     ChatPane / ChatBlocks
```

The transcript is not considered done until ChatPane renders from the projected ChatTree, every projected ChatEvent has a channel, and every observed AgentEvent has an explicit classification outcome.

Pass-through alignment goal:

- Prefer making `AgentEvent` and `ChatEvent` structurally close enough that simple events pass through with only metadata added: `id`, `channel`, `rawRefs`, and canonical `type` naming.
- Avoid building a second hand-written translation layer for fields that already match. If a provider/runtime event already has the correct session id, timestamp, owner id, status, and payload shape, the adapter should validate and enrich it rather than rebuild it.
- Reserve bespoke normalization for genuine shape changes: aggregated assistant messages, content blocks, permission option labels, usage records, away summaries, queue lifecycle records, legacy `MessageOp` compatibility, and provider-specific raw/control shapes.
- Long term, the contract should read as "AgentEvent is the external envelope; ChatEvent is the validated UI/domain envelope" rather than two unrelated event systems.
- If the adapter starts growing large switch statements, stop and align the event names/payload shapes first.

Projection invariant:

- Do not filter the primary transcript using provider/source fields such as `entry.source`.
- Do not filter the primary transcript using legacy operation shape such as `op.kind === "raw"`.
- Normalize and project first. Filtering happens only over the projected model, using `event.channel`.
- Adapter/source/op-kind values are normalization inputs and raw-detail metadata. They are not UI routing rules.
- If a provider record cannot yet be projected, create a Debug-channel projected event/leaf with the complete raw payload rather than rendering the raw adapter record directly.

## 2026-05-07 Implementation Slice

Completed in this slice:

- Added strict `AgentEvent` validation at the `@km/agent-harness` public boundary via exported `parseAgentEvent` / `agentEventSchema`.
- `SessionStore` now retains a strict ordered `events` log alongside legacy `state.messages`.
- Added `normalizeAgentEventsToChatEvents(...)`, strict `ChatEvent` parsing, and an exhaustive `CHAT_EVENT_HANDLING` matrix.
- Added a reactive `createChatSessionProjectionStore(...)` using `alien-signals`.
- `ChatSession.session()` now accumulates messages, message parts, tools, plan, queue, permissions, and session metadata from the same canonical ChatEvents that feed `ChatSession.tree`.
- Added `projectChatTranscript(...)` and `visibleChatLeaves(...)`; filtering now operates on projected `event.channel`.
- Added `ChatBlockList`, a projected `ChatLeaf[]` renderer that preserves raw/detail expansion and uses existing `Chat.*`, `Content.*`, `SessionEntry`, and `ListView` primitives.
- ChatPane now keeps the stable `SessionUpdateList` renderer as primary while Debug mode shows a bounded `Projected ChatBlocks` comparison surface underneath it.
- Known raw/control records are no longer all dumped into generic `unknown`: permission mode, queue operation, custom/AI/agent title, recap/away summary, task notifications, file snapshots, hook info, MCP info, queue labels, and usage labels have semantic projection outcomes.
- Permission mode updates now route through `session.updated` on the `debug` channel: they update `ChatSession.mode` but do not render a standalone transcript block when Debug is off.
- Title metadata now carries an explicit source. `custom-title` is the visible/status title source and wins over agent-name / AI title metadata.
- Debug off hides legacy system/debug rows with `additionalContext`; Debug on shows them plus the projected ChatBlock comparison.
- The duplicate-message crash from the May 6 screenshot is covered: repeated assistant `turn-start` records with the same role coalesce into a Debug event instead of crashing projected transcripts.
- Test-sprawl cleanup: the standalone `chat-types.test.ts` file was retired; its channel/tree/type-guard coverage now lives in `chat-event-handling.test.ts` and `chat-transcript-projection.test.ts`.

Current intentional compromise:

- Legacy `SessionUpdateList` remains primary because it still has mature tool-call rendering, command coalescing, scroll/follow behavior, raw-inspector polish, and dense activity summaries. The projected renderer is now a live comparison surface, not a replacement.
- The next quality step is parity hardening: move mature tool/read/search/patch/command adapters into shared projection/render code, then flip ChatPane from compare mode to projected-primary mode.

Verification:

- `bun vitest run apps/silvercode/packages/agent-harness/tests apps/silvercode/tests/chat-agent-event-normalization.test.ts apps/silvercode/tests/chat-event-handling.test.ts apps/silvercode/tests/chat-transcript-projection.test.ts apps/silvercode/tests/chat-session-store.test.ts apps/silvercode/tests/chat-block-list.test.tsx`
- `bun vitest run apps/silvercode/packages/agent-harness/tests/session-store.test.ts apps/silvercode/tests/chat-event-handling.test.ts apps/silvercode/tests/chat-transcript-projection.test.ts apps/silvercode/tests/chat-session-store.test.ts apps/silvercode/tests/chat-agent-event-normalization.test.ts` — 5 files passed, 27 tests passed.
- `bun vitest run apps/silvercode/tests/content-layout.test.tsx` — 45 tests passed, including the ChatPane Debug toggle regression.
- `npx tsc --noEmit --pretty false` from `apps/silvercode` — passed.
- `npx oxfmt --check` on the touched Silvercode files — passed.
- `git diff --check` on the scoped files — passed.
- `bun tools/check-arch-required.ts` — passed with the public API change covered by `.claude/arch-decisions/2026-05-07-agent-harness-event-schema-public-api.md`.

## Raw And Control Event Routing Matrix

Every observed raw/control event must route to exactly one primary owner:

| Input / meaning                           | event.channel                                         | Primary owner                     | Normal transcript                                         | Debug-visible detail                               |
| ----------------------------------------- | ----------------------------------------------------- | --------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| User prompt text                          | transcript                                            | ChatMessage / transcript leaf     | user ChatBlock                                            | raw refs on cmd-hover/detail                       |
| Assistant narration                       | transcript                                            | ChatMessage / transcript leaf     | assistant ChatBlock                                       | raw refs on cmd-hover/detail                       |
| Tool call/read/search/edit/command        | activity or error                                     | ChatTool + activity leaves        | grouped/smart activity ChatBlocks                         | full input/output/raw refs                         |
| Permission request                        | permission                                            | ChatPermissions + permission leaf | expanded while pending, collapsed/resolved after decision | raw provider payload                               |
| Permission mode update, e.g. auto         | debug                                                 | session mode state                | no standalone row after state is reflected in UI          | raw detail via Debug/session detail only           |
| Queue operation / queued prompt lifecycle | queue when parsed as queue-operation; otherwise debug | ChatQueue state                   | queue leaf only when user-actionable or stuck             | raw lifecycle payload and ownership context        |
| Task reminder / plan update               | plan or debug                                         | ChatPlan state                    | no duplicate row when task list visibly updates           | Debug leaf with raw reminder if Debug is visible   |
| File history snapshot                     | debug                                                 | ChatSession debug/history state   | hidden by default                                         | Debug leaf with file/version snapshot detail       |
| Hook info                                 | debug or error                                        | hook/debug state                  | hidden by default unless failed/actionable                | Debug leaf with hook name, cwd, exit/output        |
| custom-title                              | status                                                | session title state               | reflected in top session title                            | Debug/detail shows source payload                  |
| ai-title                                  | debug                                                 | secondary title metadata          | sidebar/top detail only, not transcript prose             | Debug/detail shows source payload                  |
| Agent name/path/id                        | debug unless promoted to visible chrome               | session identity metadata         | top/session chrome, not transcript prose                  | expandable session metadata                        |
| away_summary                              | notification as recap.recorded                        | recap leaf                        | RECAP &middot; summary text                               | full raw summary payload                           |
| Usage/quota/status/liveness               | status or debug                                       | status/sidebar state              | muted status leaf only when user-relevant                 | Debug/detail payload                               |
| Unknown provider/runtime record           | debug                                                 | debug leaf                        | hidden by default                                         | chronological Debug leaf with complete raw payload |
| Ignored record                            | none, documented                                      | documented ignore table           | no row                                                    | test proves reason and source shape                |

Rules:

- Debug appears as `Debug` in the Notifications list. Do not display `Debug channel` or a secondary `channel` label in the row.
- Debug off means projected records whose `event.channel` is `debug` are filtered out of the normal transcript.
- Debug on means projected records whose `event.channel` is `debug` are visible in transcript context with complete raw detail.
- Handling a record means updating the visible owner state/UI. Once handled, the raw record should not also render as noise.
- Unknown is not a failure, but unknown must be Debug-only and inspectable.
- Silence is allowed only for intentionally ignored records with a documented reason and test fixture.

## Reactive Projection Requirements

The quality plateau requires a real reactive model, not a type-only shape.

- Add a `createChatSessionStore(scope, sessionId)` or equivalent owner for ChatState.
- Store canonical ChatEvents and accumulated ChatSession data in signal-backed state.
- Maintain `ChatSession.tree` as a derived projection from canonical ChatState, channel state, and tree UI state.
- Components render from ChatTree/ChatLeaves through selectors, not from ad hoc `MessageEntry[]` classification in `SessionUpdateList`.
- Channel toggles update ChatChannelState and derived visible events/leaves immediately.
- Channel filtering selectors read `event.channel`, never adapter source strings or legacy operation kinds.
- Disclosure/selection/raw-inspector state lives in `ChatTreeState`, keyed by ChatNodeId.
- `projectChatTranscript(...)` owns classification, grouping, `event.channel` assignment, width, summary text, and default disclosure.
- `@alien/projection` / `alien-signals` may be used for keyed derived views where they simplify subscriptions, but the domain boundary remains `projectChatTranscript(...)`.
- Tests must prove channel filtering and tree projection are reactive: toggling Debug should not require reparsing/replaying events.

Migration rule: while legacy `MessageEntry`/`MessageOp` still exists, it is a compatibility boundary. New transcript behavior must be implemented on the ChatEvent/ChatTree path, then old rendering branches should be deleted or isolated behind a named adapter with a cleanup bead.

## L5 Quality Plateau Work Breakdown

L5 means the old transcript model is no longer competing with the projected model. It is not enough to add a ChatEvent/ChatTree substrate beside the old UI. The old path must either be deleted or isolated as an adapter that produces ChatEvents before anything reaches ChatPane.

### L5.0 Reality Lock And Fixture Inventory

Goal: freeze the problem space so the refactor cannot declare victory while unknown raw records still leak.

Work:

- Build replay fixtures from the May 6 sessions and recent screenshots.
- Inventory every observed provider/local/control record, including:
  - user prompt text and attachments
  - assistant narration and reasoning
  - tool start/update/complete records
  - shell command stdout/stderr/exit/timing records
  - patch/edit/read/search records
  - permission requests and permission resolutions
  - permission mode updates such as `auto`
  - queue operations and queued prompt lifecycle records
  - plan/task reminder updates
  - file history snapshots
  - hook info and hook failures
  - MCP/skill diagnostics
  - `custom-title`, `ai-title`, agent name/id/path
  - `away_summary`
  - usage/quota/status/liveness updates
  - unknown provider/runtime records
- Record the classification outcome for each shape: handled state, visible event, Debug event, error event, or documented ignore.

Acceptance:

- Fixture tests fail when a known raw/control shape has no classification outcome.
- The inventory table in this bead or a linked doc names every observed raw/control shape and its `event.channel`.
- There is no "misc/raw" bucket that can render in the normal transcript.

### L5.1 Canonical Event Contract

Goal: every event that can affect transcript display is a ChatEvent with `event.channel`.

Work:

- Audit every current `ChatEventType` in `apps/silvercode/src/chat/types.ts` and decide its final handling before renderer cutover.
- Add `channel: ChatChannelId` to `ChatEvent` in `apps/silvercode/src/chat/types.ts`.
- Treat `ChatLeaf.channel` as a derived/cache field only, not an independent routing source.
- Align `AgentEvent` and `ChatEvent` names/payload structures before adding adapter plumbing. Simple events should validate/enrich/pass through; only genuinely different provider shapes should transform.
- Add exhaustive type/test coverage so new `ChatEventType` variants must specify:
  - channel
  - primary state owner
  - projection outcome
  - default disclosure/width
  - raw-detail availability
- Create normalizers for Claude/Codex/ACP/local/replay records that emit ChatEvents.
- Keep provider/source/op-kind only in adapter metadata and raw refs.

Acceptance:

- A checked-in ChatEvent handling matrix covers the entire `ChatEventType` union.
- `event.channel` exists on the real `ChatEvent` type and all construction sites compile through it.
- Tests prove `entry.source`, adapter labels, and `op.kind` are not used by channel-filter selectors.
- Adding a new `ChatEventType` without a channel/projection row fails a typecheck or focused test.

Required initial ChatEvent matrix:

| ChatEventType         | Required channel decision                          | Required owner/projection decision                                       |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| message.started       | usually transcript                                 | create/update ChatMessage state; no standalone leaf unless needed        |
| message.part.added    | transcript, activity, debug, or error by part kind | create ChatMessagePart and project typed content leaf                    |
| message.completed     | same message channel or debug                      | close/update ChatMessage state; no duplicate leaf                        |
| tool.started          | activity or debug                                  | create ChatTool state and optional activity leaf                         |
| tool.updated          | activity, debug, or error                          | update ChatTool state/leaf; output detail via raw refs                   |
| tool.completed        | activity or error                                  | finalize ChatTool and project command/read/search/patch/tool leaf        |
| permission.requested  | permission                                         | create pending permission state and visible actionable permission leaf   |
| permission.resolved   | permission or debug                                | update permission state; no duplicate visible row unless user-relevant   |
| plan.updated          | plan or debug                                      | update ChatPlan; project only meaningful plan leaf                       |
| queue.updated         | queue or debug                                     | update ChatQueue; project only actionable/stuck/user-visible queue leaf  |
| notification.received | notification, debug, or error                      | project notification leaf or state update based on source classification |
| recap.recorded        | notification or debug                              | project recap leaf with raw/detail payload                               |
| session.updated       | status or debug                                    | update title/model/mode/cwd/session metadata; visible chrome first       |
| status.updated        | status, debug, or error                            | update status/liveness state; visible status leaf only when useful       |
| error.raised          | error                                              | project visible error leaf with raw detail                               |
| debug.recorded        | debug                                              | project chronological Debug leaf, hidden unless Debug is visible         |

This matrix is not optional documentation. It is an implementation checklist. The eventual checked-in tests must prove the matrix is exhaustive against the real TypeScript union.

### L5.2 Reactive ChatSession Store

Goal: `ChatSession.tree` is the live projected state, not a static type example.

Work:

- Add `createChatSessionStore(scope, sessionId)` or equivalent owner.
- Store canonical ChatEvents and accumulated ChatSession state in signal-backed state.
- Implement `applyChatEvent(event)` as the only core mutation path for transcript-affecting state.
- Maintain `ChatSession.tree` as a derived projection from:
  - canonical events/state
  - channel state
  - ChatTreeState disclosure/selection/raw-inspector state
- Use `@alien/projection`/signals only as implementation primitives; the domain API remains ChatEvent -> ChatSession -> ChatTree.
- Add selectors for visible events/leaves by `event.channel`.

Acceptance:

- Toggling Debug changes visible projected events/leaves without reparsing provider records.
- Tests prove the same event list can be re-filtered by channel state reactively.
- No component needs provider raw records to decide whether a transcript block is visible.

### L5.3 `projectChatTranscript(...)`

Goal: classification, grouping, and presentation defaults live in one transformation.

Work:

- Implement `projectChatTranscript(...)` as the central projection.
- Move these rules into projection tests:
  - event classification into ChatNode/ChatLeaf types
  - turn/message/work grouping
  - `event.channel` assignment
  - summary text: `Read N files`, `Edited N files`, `Ran N commands`
  - default disclosure
  - width choice: prose/wide/full
  - raw/detail access
  - chronological placement
- Preserve prompt/response/work/debug interleaving. Channels filter; they do not reshape the tree.
- Unknown projected records become chronological Debug events/leaves.

Acceptance:

- Projection snapshot tests cover interleaved prompts/responses, grouped work, Debug leaves, queue events, permission events, recaps, and errors.
- Summary text literals are owned by projection tests, not scattered component code.
- Debug leaves never appear in the normal visible-event selector when Debug is off.

### L5.4 State-First Handling For Control Events

Goal: useful control records update state/UI instead of rendering as transcript noise.

Work:

- Permission mode updates change actual permission mode state/behavior and update visible session chrome.
- Queue operations reconcile with Silvercode queue state and render only when actionable, stuck, or explicitly Debug-visible.
- Task reminders/plan updates update plan/task state and avoid duplicate transcript rows when handled.
- File history snapshots are captured as Debug/history state and hidden by default.
- Hook info is Debug-only unless failed/actionable; hook failures use the error channel.
- `custom-title` becomes the preferred session title.
- `ai-title` is stored as secondary title metadata, available in expanded session metadata/sidebar detail.
- Agent name/id/path appear in session chrome/metadata, not prose transcript.
- `away_summary` projects to a recap leaf with `RECAP &middot; summary text`.
- Usage/quota/status/liveness update status/sidebar state; only user-relevant/failure states get visible status leaves.

Acceptance:

- Replay fixture proves each handled control event updates its owner state.
- Replay fixture proves handled records do not also render as ordinary assistant/user prose.
- Debug mode can still inspect the raw payload for every handled record.

### L5.5 ChatPane / ChatBlock Cutover

Goal: UI renders projected ChatBlocks from ChatTree, not legacy MessageEntry classification.

Work:

- Add ChatBlock renderers for:
  - user text
  - assistant text
  - reasoning
  - recap
  - read/search
  - patch/edit/diff
  - command
  - generic tool
  - permission
  - plan update
  - queue
  - notification
  - session/status/usage
  - file snapshot
  - hook/MCP/debug
  - error
  - unknown Debug payload
- Wire ChatPane to visible projected leaves.
- Keep raw/detail affordances attached to projected events/leaves through raw refs.
- Ensure every nontrivial ChatBlock is expandable or cmd-hover inspectable.
- Keep Markdown/table wrapping fixes in the projected renderer path.

Acceptance:

- `SessionUpdateList` no longer owns primary event classification, channel filtering, or summary semantics.
- Render tests cover all core ChatBlock types and channel toggle behavior.
- Visual replay comparison passes same-or-better scanability against Claude Code screenshots.

### L5.6 Delete Or Quarantine Legacy Path

Goal: no dual-path trap.

Work:

- Delete old classification/render branches after ChatPane cutover.
- If `MessageEntry`/`MessageOp` must remain for agent-harness compatibility, quarantine them behind a named adapter that emits ChatEvents.
- Remove direct transcript filtering by:
  - `entry.source`
  - `op.kind === "raw"`
  - provider-specific labels
  - parser/debug labels
- Remove stale docs/tests/storybook examples that describe the old path as primary.
- File any unavoidable L4 residue as an explicit cleanup bead before closing a substrate phase.

Acceptance:

- Grep for direct UI filtering by source/op-kind returns 0 outside adapter tests and documented compatibility boundary.
- New transcript behavior cannot bypass ChatEvent -> ChatSession -> ChatTree.
- Any remaining legacy adapter file has a linked cleanup bead and no direct UI rendering authority.

### L5.7 Completion Gates

The epic cannot close until all of these are true:

- `ChatEvent.channel` is the routing source for transcript visibility.
- `ChatSession.tree` is live, reactive projected state.
- Debug toggle filters projected events/leaves by `event.channel`, not legacy source/op-kind fields.
- Every observed raw/control event has a classified owner and `event.channel`.
- Handled state/control events update visible owner state/UI instead of rendering as transcript noise.
- Unknown events are Debug-only and complete enough to inspect.
- Every nontrivial ChatBlock has full detail available by expand or cmd-hover.
- Old transcript classification paths are deleted or quarantined behind a ChatEvent adapter with an open cleanup bead.
- Focused tests and visual replay pass.

Required `/complete` commands before closing:

```bash
rg -n "entry\\.source|op\\.kind === [\"']raw[\"']|kind === [\"']raw[\"']|source ===|muted\\.has\\(e\\.source\\)" apps/silvercode/src apps/silvercode/tests
bun vitest run apps/silvercode/tests/chat-types.test.ts apps/silvercode/tests/chat-normalize.test.ts apps/silvercode/tests/chat-transcript-projection.test.ts apps/silvercode/tests/chat-channels.test.ts apps/silvercode/tests/chat-state-routing.test.ts apps/silvercode/tests/chat-leaf-rendering.test.ts
npx tsc --noEmit --pretty false
```

Expected grep result: 0 hits outside explicitly named adapter-boundary files/tests listed in the bead at close time.

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

| Suffix  | Meaning                                             | Examples                      |
| ------- | --------------------------------------------------- | ----------------------------- |
| Event   | Canonical chronological fact accepted by apply(...) | ChatEvent                     |
| State   | Accumulated mutable model state                     | ChatState, ChatTreeState      |
| Session | Projected session view that the UI consumes         | ChatSession                   |
| Tree    | Projected transcript tree                           | ChatTree                      |
| Node    | Any node in the transcript tree                     | ChatNode                      |
| Element | Tree node with children                             | ChatElement                   |
| Leaf    | Renderable tree node without children               | ChatLeaf                      |
| Channel | Filter/routing lane for leaves                      | ChatChannel, ChatChannelState |
| Message | Role-bearing chat content                           | ChatMessage                   |
| Part    | Typed content inside a message                      | ChatMessagePart               |

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

Refactoring rules for this epic:

- UI vocabulary is `ChatPane` for the session pane and `ChatBlock` for rendered transcript/UI blocks. `ChatBlock` is UI-only; do not use it for the canonical data model.
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
  channel: ChatChannelId
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
  // Derived from the producing ChatEvent.channel. Keep only if it prevents
  // expensive event lookup in render selectors; it is not an independent
  // routing source.
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
- Channels are filters and routing metadata on projected ChatEvents. They do not shape the tree.
- Debug records are not grouped by default. They are chronological projected events with `event.channel = "debug"`, rendered as ChatLeaves only when Debug is visible.
- Work grouping is represented by `ChatElement` nodes only when grouping improves the primary transcript, such as compact read/edit/run summaries.
- `alien-projections` can help maintain flat keyed views such as visible leaves, pending permissions, running tools, or channel-filtered lists.
- `alien-trees` is appropriate if the ChatSession tree needs stable per-node subscriptions or descendant aggregates. The domain owner is still `projectChatTranscript(...)`, not the alien primitive.

Example tree:

```text
root
  turn:t1
    message:m1
      user-text:u1          event.channel=transcript
      attachment:att1       event.channel=transcript
    message:m2
      assistant-text:a1     event.channel=transcript
    work:w1                 summary="Read 4 files"
      read:r1               event.channel=activity
      search:s1             event.channel=activity
    file-snapshot:f1        event.channel=debug
    work:w2                 summary="Edited 2 files"
      patch:p1              event.channel=activity
      patch:p2              event.channel=activity
    error:e1                event.channel=error
```

## Projection Rules

`projectChatTranscript(...)` is the central transformation. It owns:

- event classification into ChatNode types
- turn/message/work tree grouping
- `event.channel` assignment
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
5. **State-first routing and channels.** Route title/mode/usage/queue/plan/liveness to UI state first, assign `event.channel`, and make channel visibility/muting drive filtering.
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

- Scattered classification, grouping, `event.channel` assignment, summary, width, and detail decisions in parser labels, activity summaries, tool-call rendering, and raw/detail components when they duplicate projection decisions.
- Any separate policy/config abstraction that reifies projection rules before the implementation needs it.

New tests:

- Projection snapshot tests for representative ChatEvents and ChatSession trees.
- Tree shape tests covering interleaved prompts/responses, work grouping, chronological debug leaves, channel filtering, and error visibility.

Definition of done:

- `projectChatTranscript(...)` owns event classification, tree grouping, `event.channel` assignment, summaries, default disclosure, width, and raw/detail affordances.
- New ChatEvent classifications fail tests until assigned a ChatNode outcome or intentionally ignored handling.
- Summary text such as `Read N files`, `Edited N files`, and `Ran N commands` is owned by projection tests.

`/complete`:

- `bun vitest run apps/silvercode/tests/chat-transcript-projection.test.ts`
- `rg -n "Read [0-9]+ files|Edited [0-9]+ files|Ran [0-9]+ commands|Activity" apps/silvercode/src --glob '!**/chat-transcript*' --glob '!**/*test*'` -> 0 projection-owned summary literals outside the projection surface.
- `npx tsc --noEmit`

**Phase 5: Channels and state-first routing**

Route title, mode, usage, queue, plan, liveness, hooks, MCP/skills, and file snapshots to ChatSession state or projected events filtered by `event.channel`.

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
5. `projectChatTranscript(...)` is the central ChatState -> ChatSession tree transformation. It owns classification, tree grouping, `event.channel` assignment, summaries, default disclosure, width, and raw/detail affordances.
6. The transcript tree preserves prompt/response/work/debug chronology. Channels filter/mute leaves; they do not shape the tree.
7. Debug/internal metadata does not render as user/assistant transcript content. When Debug is visible, debug records are chronological leaves with complete raw detail.
8. Expanded edit results render as operation leaves with:
- one clear header per operation/file, e.g. `Update(apps/km-cli/src/commands/bd.ts)`
- added/removed counts
- real source line numbers
- syntax-highlighted code/diff content
- no repeated path boilerplate inside the leaf body
- wrapped long lines without layout breakage
37. Command, search, and read leaves render compact summaries by default and expand to complete details: command/query/path, cwd where relevant, exit status, stdout, stderr, timing, and raw payload.
38. `away_summary` renders as a recap leaf, using the agreed text shape: `RECAP &middot; summary text`.
39. `custom-title` is preferred over agent name when both exist. The active session name is visible near the top of the UI and can expose secondary title/name metadata on expansion.
40. Queue events are separated from user prompts and reconciled with Silvercode's own queue state. The UI must make lifecycle/state ownership clear enough to debug queued prompts.
41. Tables and prose in transcript content wrap instead of clipping, including links and long paths in table cells.
42. Visual review against Claude Code screenshots passes a checklist for scanability, chronology, useful density, detail availability, and debug noise. Silvercode should be same-or-better, not merely different.
43. Termless/render tests cover patch leaves, table wrapping/linkification, channel toggle behavior, recap rendering, and raw cmd-hover expansion.
44. Every implementation phase has `/complete` criteria with exact grep commands, expected counts, tests, and docs updates. No phase can close on "mostly done" naming cleanup.

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
- `projectChatTranscript(...)` for tree projection, grouping, `event.channel` assignment, summaries, expansion defaults, width, and raw-detail rules.
- Chat leaf component dispatcher for custom/smart transcript leaves.

## Related Beads

- `@km/silvercode/acp-tool-call-sweep`
- `@km/silvercode/parity-kilo`
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

## Implemented checklist

- [x] Claude stream-json spawn path exists and mirrors real Claude Code by default, including `--resume`, `--model`, MCP config, verbose stream-json, and non-`--bare` default.
- [x] Claude parser normalizes init, text, thinking, tool use/results, assistant aggregates, resume JSONL, system-reminder stripping, task/todo metadata, hooks, titles, queue ops, and compact/recap records.
- [x] Normalized provider events have strict `AgentEvent` validation and ordered retention in `SessionStore.events`.
- [x] Claude ACP wrapper/server exists with registry aliases `claude` and `claude-code`, real session ids, `loadSession: true`, permission forwarding, TodoWrite-to-plan mapping, slash command updates, and ordered turn draining.
- [x] Claude resume preflight/replay handles real Claude JSONL, rejects old synthetic ACP ids, and injects a synthetic turn-end when replay ends active.
- [x] ChatEvent projection substrate exists: AgentEvent-to-ChatEvent normalization, exhaustive handling matrix, projected transcript leaves, visibility channels, and Debug hidden by default.
- [x] Completed Claude parity evidence includes resume reminders, raw/debug collapsed detail, thinking/tool rendering, markdown tables, OSC8 links, notifications, timestamps, ACP loadSession, and ACP permission UI.

| Input / meaning                           | event.channel                                         | Primary owner                     | Normal transcript                                         | Debug-visible detail                               |
| ----------------------------------------- | ----------------------------------------------------- | --------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| User prompt text                          | transcript                                            | ChatMessage / transcript leaf     | user ChatBlock                                            | raw refs on cmd-hover/detail                       |
| Assistant narration                       | transcript                                            | ChatMessage / transcript leaf     | assistant ChatBlock                                       | raw refs on cmd-hover/detail                       |
| Tool call/read/search/edit/command        | activity or error                                     | ChatTool + activity leaves        | grouped/smart activity ChatBlocks                         | full input/output/raw refs                         |
| Permission request                        | permission                                            | ChatPermissions + permission leaf | expanded while pending, collapsed/resolved after decision | raw provider payload                               |
| Permission mode update, e.g. auto         | debug                                                 | session mode state                | no standalone row after state is reflected in UI          | raw detail via Debug/session detail only           |
| Queue operation / queued prompt lifecycle | queue when parsed as queue-operation; otherwise debug | ChatQueue state                   | queue leaf only when user-actionable or stuck             | raw lifecycle payload and ownership context        |
| Task reminder / plan update               | plan or debug                                         | ChatPlan state                    | no duplicate row when task list visibly updates           | Debug leaf with raw reminder if Debug is visible   |
| File history snapshot                     | debug                                                 | ChatSession debug/history state   | hidden by default                                         | Debug leaf with file/version snapshot detail       |
| Hook info                                 | debug or error                                        | hook/debug state                  | hidden by default unless failed/actionable                | Debug leaf with hook name, cwd, exit/output        |
| custom-title                              | status                                                | session title state               | reflected in top session title                            | Debug/detail shows source payload                  |
| ai-title                                  | debug                                                 | secondary title metadata          | sidebar/top detail only, not transcript prose             | Debug/detail shows source payload                  |
| Agent name/path/id                        | debug unless promoted to visible chrome               | session identity metadata         | top/session chrome, not transcript prose                  | expandable session metadata                        |
| away_summary                              | notification as recap.recorded                        | recap leaf                        | RECAP · summary text                                      | full raw summary payload                           |
| Usage/quota/status/liveness               | status or debug                                       | status/sidebar state              | muted status leaf only when user-relevant                 | Debug/detail payload                               |
| Unknown provider/runtime record           | debug                                                 | debug leaf                        | hidden by default                                         | chronological Debug leaf with complete raw payload |
| Ignored record                            | none, documented                                      | documented ignore table           | no row                                                    | test proves reason and source shape                |

- [ ] Claude Code parity gap: per-subagent token/cost accounting is not available through the parent Task/Agent tool record we currently receive. Silvercode can show parent session tokens/cost/time, Task/Agent input, parent message timestamp, status, and final result/error when present; exact child/subagent token totals require Claude sidechain/subsession metadata or provider support.

| Input / meaning                           | event.channel                                         | Primary owner                     | Normal transcript                                         | Debug-visible detail                               |
| ----------------------------------------- | ----------------------------------------------------- | --------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| User prompt text                          | transcript                                            | ChatMessage / transcript leaf     | user ChatBlock                                            | raw refs on cmd-hover/detail                       |
| Assistant narration                       | transcript                                            | ChatMessage / transcript leaf     | assistant ChatBlock                                       | raw refs on cmd-hover/detail                       |
| Tool call/read/search/edit/command        | activity or error                                     | ChatTool + activity leaves        | grouped/smart activity ChatBlocks                         | full input/output/raw refs                         |
| Permission request                        | permission                                            | ChatPermissions + permission leaf | expanded while pending, collapsed/resolved after decision | raw provider payload                               |
| Permission mode update, e.g. auto         | debug                                                 | session mode state                | no standalone row after state is reflected in UI          | raw detail via Debug/session detail only           |
| Queue operation / queued prompt lifecycle | queue when parsed as queue-operation; otherwise debug | ChatPromptQueue state             | queue leaf only when user-actionable or stuck             | raw lifecycle payload and ownership context        |
| Task reminder / plan update               | plan or debug                                         | ChatPlan state                    | no duplicate row when task list visibly updates           | Debug leaf with raw reminder if Debug is visible   |
| File history snapshot                     | debug                                                 | ChatSession debug/history state   | hidden by default                                         | Debug leaf with file/version snapshot detail       |
| Hook info                                 | debug or error                                        | hook/debug state                  | hidden by default unless failed/actionable                | Debug leaf with hook name, cwd, exit/output        |
| custom-title                              | status                                                | session title state               | reflected in top session title                            | Debug/detail shows source payload                  |
| ai-title                                  | debug                                                 | secondary title metadata          | sidebar/top detail only, not transcript prose             | Debug/detail shows source payload                  |
| Agent name/path/id                        | debug unless promoted to visible chrome               | session identity metadata         | top/session chrome, not transcript prose                  | expandable session metadata                        |
| away_summary                              | notification as recap.recorded                        | recap leaf                        | RECAP · summary text                                      | full raw summary payload                           |
| Usage/quota/status/liveness               | status or debug                                       | status/sidebar state              | muted status leaf only when user-relevant                 | Debug/detail payload                               |
| Unknown provider/runtime record           | debug                                                 | debug leaf                        | hidden by default                                         | chronological Debug leaf with complete raw payload |
| Ignored record                            | none, documented                                      | documented ignore table           | no row                                                    | test proves reason and source shape                |

| ChatEventType         | Required channel decision                          | Required owner/projection decision                                            |
| --------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| message.started       | usually transcript                                 | create/update ChatMessage state; no standalone leaf unless needed             |
| message.part.added    | transcript, activity, debug, or error by part kind | create ChatMessagePart and project typed content leaf                         |
| message.completed     | same message channel or debug                      | close/update ChatMessage state; no duplicate leaf                             |
| tool.started          | activity or debug                                  | create ChatTool state and optional activity leaf                              |
| tool.updated          | activity, debug, or error                          | update ChatTool state/leaf; output detail via raw refs                        |
| tool.completed        | activity or error                                  | finalize ChatTool and project command/read/search/patch/tool leaf             |
| permission.requested  | permission                                         | create pending permission state and visible actionable permission leaf        |
| permission.resolved   | permission or debug                                | update permission state; no duplicate visible row unless user-relevant        |
| plan.updated          | plan or debug                                      | update ChatPlan; project only meaningful plan leaf                            |
| queue.updated         | queue or debug                                     | update ChatPromptQueue; project only actionable/stuck/user-visible queue leaf |
| notification.received | notification, debug, or error                      | project notification leaf or state update based on source classification      |
| recap.recorded        | notification or debug                              | project recap leaf with raw/detail payload                                    |
| session.updated       | status or debug                                    | update title/model/mode/cwd/session metadata; visible chrome first            |
| status.updated        | status, debug, or error                            | update status/liveness state; visible status leaf only when useful            |
| error.raised          | error                                              | project visible error leaf with raw detail                                    |
| debug.recorded        | debug                                              | project chronological Debug leaf, hidden unless Debug is visible              |

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
  channel: ChatChannelId
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
  // Derived from the producing ChatEvent.channel. Keep only if it prevents
  // expensive event lookup in render selectors; it is not an independent
  // routing source.
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
  promptQueue: ChatPromptQueue
  permissions: ChatPermissions
  tree: ChatTree
  channels: Readonly<Record<ChatChannelId, ChatChannelState>>
}

export type ChatTool = Record<string, unknown>
export type ChatPlan = Record<string, unknown>
export type ChatPromptQueue = Record<string, unknown>
export type ChatPermissions = Record<string, unknown>
```

- `apps/silvercode/src/components/ChatMessageSummary.tsx`

