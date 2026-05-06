---
aliases:
  - km-silvercode.notification-vocabulary-migration
  - km-silvercode-notification-vocabulary-migration
created_at: 2026-05-06T23:07:40.920Z
type: task
priority: P1
status: open
---

# [ ] Complete Silvercode notification vocabulary migration @km/silvercode #task #P1

Standardize the remaining Silvercode planning and operational vocabulary around notifications.

Current state:

- `apps/silvercode/src`, `apps/silvercode/tests`, `apps/silvercode/storybook`, and `apps/silvercode/docs` use notification terminology for the current implementation.
- `apps/silvercode/src/chat/types.ts` has first-class `notification.received`, `ChatLeafType = "notification"`, and `channel = "notification"`.
- Current planning docs use `ChatPane` for the pane and `ChatBlock` for rendered transcript/UI blocks.
- Several older bead ids and historical close reasons still contain old terms. Renaming those safely requires a focused bead-id/reference migration, not opportunistic edits during feature work.

Scope:

- Rename active Silvercode planning beads and references from old background-context wording to notification wording.
- Decide whether to rename legacy bead ids/files or keep them as historical aliases with an explicit boundary note.
- Update any open or wip beads that mention legacy ChatPane/component/header naming when they describe current architecture.
- Leave literal protocol bytes alone if the provider/API still uses them; document those as provider-wire terms, not Silvercode UI vocabulary.

ChatEvent coverage invariant:

Every `ChatEventType` in `apps/silvercode/src/chat/types.ts` must have an explicit projection outcome. A ChatEvent may:

- update canonical chat state only, when the state has a visible owner elsewhere;
- project to one or more normal ChatBlocks in the relevant channel;
- project to a `debug` channel ChatBlock that is hidden from the normal transcript by default but available when the Debug channel is enabled;
- be intentionally ignored only with a documented reason and a test fixture that proves the ignore is deliberate.

Current coverage matrix:

| ChatEventType | Primary state owner | Default projection |
| --- | --- | --- |
| `message.started` | `ChatSession.messages` | state only; opens/updates message element |
| `message.part.added` | `ChatMessage.parts` | transcript text, reasoning, attachment, recap, or tool-ref leaf by part role/type |
| `message.completed` | `ChatSession.messages` | state only; closes/updates message element |
| `tool.started` | `ChatSession.tools` | activity/tool leaf when user-relevant; otherwise debug leaf |
| `tool.updated` | `ChatSession.tools` | updates existing activity/tool leaf; raw output available in detail view |
| `tool.completed` | `ChatSession.tools` | read/search/patch/command/tool leaf by tool class; failure projects to error channel |
| `permission.requested` | `ChatSession.permissions` | permission channel leaf, expanded by default while pending |
| `permission.resolved` | `ChatSession.permissions` | updates permission leaf/state; no duplicate transcript line |
| `plan.updated` | `ChatSession.plan` | plan channel leaf only when useful; otherwise state-only task list update |
| `queue.updated` | `ChatSession.queue` | queue channel leaf only when useful; otherwise state-only queue update |
| `notification.received` | `ChatSession.notifications` | notification channel leaf, collapsed/muted by default |
| `session.updated` | `ChatSession.metadata` | state-only title/model/mode/cwd update unless Debug is enabled |
| `status.updated` | `ChatSession.status` | status channel leaf when user-relevant; otherwise state-only |
| `error.raised` | `ChatSession.errors` | error channel leaf, expanded by default |
| `debug.recorded` | `ChatSession.debug` | debug channel leaf, hidden by default and expandable with raw detail |

Side-panel channel rule:

- The Notifications section lists Debug as a channel toggle, not as a provider/source.
- Debug is off by default because it reveals raw/local/provider detail that should not compete with normal narration.
- Enabling Debug reveals debug-channel ChatBlocks in transcript context; it does not change what the agent receives.
- Until the ChatEvent projection owns all debug leaves, the Debug toggle mirrors the existing `/debug` view so the switch has a visible effect today.

Historical/provider-wire exceptions:

| Paths | Owner | Reason | Action |
| --- | --- | --- | --- |
| `@km/silvercode/claude-acp-wire-bugs.md`, `@km/silvercode/queue-stuck-thinking.md`, `@km/silvercode/liveness-deadlock-detector.md` | Historical closed bug beads | Preserve old symptom names and close reasons so session history remains searchable. | Keep until a dedicated historical bead-id/reference migration exists. |
| `@km/silvercode/acp-channels.md`, `@km/silvercode/acp-multi-agent.md`, `@km/silvercode/acp-session-prompt.md` | Provider/protocol boundary docs | These describe literal prompt-resource URI/meta fields and old ACP wire framing. | Keep as provider-wire terms; do not rename protocol bytes opportunistically. |
| `@km/silvercode/layout-corrupt-during-stream-with-queue.md`, `@km/silvercode/overflow-at-root.md`, `@km/silvercode/tool-block-collapsed-truncation.md`, `@km/silvercode/tool-input-markdown-render.md`, `@km/silvercode/welcome-card-hidden.md`, `@km/silvercode/welcome-claude-hardcoded.md`, `@km/silvercode/sidepanel-skeleton-mount.md`, `@km/silvercode/pane-drag-move.md`, `@km/silvercode/m0-first-session-card.md` | Historical closed layout/component beads | These refer to removed/renamed component paths from the implementation that existed when the bugs shipped. | Keep as historical references unless the bead id itself is migrated. |

Acceptance:

- `rg -n "\\b(Ambient|ambient)\\b|SessionCard|WelcomeCard|card stream|card boundary|header strip|single-row strip|tab strip" @km/silvercode apps/silvercode/docs apps/silvercode/src apps/silvercode/tests apps/silvercode/storybook -g '!ambient-*' -g '!claude-code-transcript-parity/**' -g '!notification-vocabulary-migration.md'` returns only documented historical/provider-wire exceptions.
- Any exceptions are listed in this bead with owner, reason, and whether to migrate or keep.
- No new source/docs/tests use old Silvercode UI vocabulary.
- Projection tests fail when a `ChatEventType` is added without a matching state/projection/debug/ignore outcome.
- The Debug channel can be toggled on to inspect hidden debug leaves in transcript context, including raw provider/local details.
