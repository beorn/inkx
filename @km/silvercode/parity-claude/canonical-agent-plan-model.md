---
mentions:
  - km
aliases:
  - "@km/silvercode/canonical-agent-plan-model"
  - km-silvercode.canonical-agent-plan-model
  - km-silvercode-canonical-agent-plan-model
created_at: 2026-05-05T20:12:19.442Z
type: feature
priority: P0
status: done
closed_at: 2026-05-06T22:54:23.471Z
closeReason: "Shipped/verified cbadc97f2. Canonical AgentPlan covers Claude
  TodoWrite, ACP plan-update, Codex plan_update/plan_delta and update_plan, with
  side panel demoted to count/help and in-session PlanDrawer above composer.
  PlanDrawer is right-aligned at 60% prose width, active/pending first,
  completed tail collapsed. Tests: bun vitest run
  apps/silvercode/tests/codex-resume.test.ts
  apps/silvercode/packages/agent-harness/tests/parse.test.ts
  apps/silvercode/tests/content-layout.test.tsx
  apps/silvercode/tests/chat-model.test.ts
  apps/silvercode/tests/turn-activity-summary.test.tsx
  apps/silvercode/tests/notification-event-row.test.tsx
  apps/silvercode/tests/visual/message-list-sticky-bottom.test.tsx (169 passed /
  1 skipped); npx tsc --noEmit --pretty false."
---

# [x] Canonical agent plan model and in-session plan drawer @km/silvercode #feature #P0

Unify Claude Code TodoWrite, Codex plan_update/update_plan, ACP/OpenCode plan updates, and Silvercode UI around one canonical Plan data model. Render the current plan in a collapsible bottom-right box inside the session, above the command box, instead of using the side panel as the primary plan surface.

User request 2026-05-05: adopt the best todo/plan data model across Claude, Codex, OpenCode/ACP; include showing the plan in a collapsible box in the bottom-right corner, width 60% of prose, above the command box instead of the side panel.

## Problem

Silvercode currently has multiple plan/todo representations:

- Claude Code `TodoWrite` input is parsed into `SessionState.todos`.
- `acp-session.ts` translates Claude `TodoWrite` into an ACP-shaped `Plan`.
- ACP/OpenCode can emit typed `sessionUpdate: "plan"` updates.
- Codex exposes plan-like data through `plan_update` / `plan_delta` rollout events and `update_plan`-style tool activity.
- Transcript rendering still treats plan/todo updates mostly as generic tool activity (`ToolKind: "think"`), while the side panel shows the latest todo count/snapshot.

That makes the UI and state model unclear: the same concept appears as side-panel todos, activity-summary tool rows, ACP plan entries, and provider-specific raw payloads.

## Goal

Create one canonical Silvercode `Plan` model, normalize every provider into it, and render the current plan as a first-class in-session surface.

The plan should feel like a lightweight task drawer attached to the active session, not a quota/status side-panel section and not just another generic tool call.

## Canonical Model

Recommended shape:

```ts
export type PlanSource = "claude-todowrite" | "codex-plan" | "acp-plan" | "opencode-plan" | "manual"

export type PlanStatus = "active" | "completed" | "abandoned"

export type PlanEntryStatus = "pending" | "in_progress" | "completed" | "cancelled"

export type PlanEntryPriority = "high" | "medium" | "low"

export type AgentPlan = {
  id: string
  sessionId: string
  scope: AgentPlanScope
  source: PlanSource
  version: number
  status: PlanStatus
  entries: AgentPlanEntry[]
  updatedAt: number
}

export type AgentPlanScope = {
  sessionId: string
  /**
   * Best-effort UI/provenance anchor only. ACP and most provider event
   * streams do not define canonical turns, and async prompts/background
   * activity can overlap. Do not use this as ownership.
   */
  renderAnchorId?: string
  messageId?: string
  activityId?: string
  toolCallId?: string
}

export type AgentPlanEntry = {
  id: string
  content: string
  status: PlanEntryStatus
  activeForm?: string
  priority?: PlanEntryPriority
  parentId?: string
  order: number
  startedAt?: number
  completedAt?: number
  sourceRef?: {
    toolCallId?: string
    messageId?: string
    providerEntryId?: string
  }
}
```

Field rules:

- `content` is the stable task label.
- `activeForm` is optional provider wording for the active/in-progress row, e.g. Claude Code's "Stripping loader.ts" versus stable content "Strip loader.ts".
- `status` is semantic state; never infer state from display glyphs.
- `id` should use provider ids when present. If absent, derive from normalized content plus source/order, stable across snapshot updates as much as possible.
- `version` increments for each provider snapshot or delta application.
- `parentId` is optional in v1 but present so nested plans can land without redesigning the model.
- `sourceRef` keeps raw transcript/tool traceability without making the transcript the source of truth.
- `scope.renderAnchorId` is a presentation/provenance anchor only. The canonical plan belongs to the session, not to a protocol turn.

## Turn / Session Boundary

Conclusion from the chat refactor discussion: Silvercode can keep `Chat.Turn.*` as the UI vocabulary, but a Silvercode chat turn means an idle-delimited burst of session activity, not "one prompt plus its response" and not a provider-supplied turn id.

ACP currently has session updates and messages, not a formal turn object. Codex rollout can provide optional `turn_id` on some task lifecycle events, but it is provider-specific and not guaranteed across all events. Claude mostly provides message / JSONL UUIDs that Silvercode has historically mapped into a legacy `turnId`. OpenCode/ACP should be treated as session/message/update streams unless the adapter proves a stronger id.

A user prompt may be followed by interleaved assistant narration, tool activity, plan updates, notification events, and additional user prompts. In a pure async bidirectional flow, we cannot prove that a specific assistant message/activity belongs to a specific prompt. We can only group ordered flurries of prompts and activity into turns punctuated by idleness on both sides.

Rules:

- Canonical `AgentPlan` state is session-scoped.
- Transcript placement is a projection. Show plan updates in the current visible chat turn/segment by stream order when useful, but do not imply prompt ownership.
- If a plan update cannot be attached cleanly, render it as session metadata/notification or only update the in-session plan drawer.
- Do not make `turnId` required for plan storage, reducer logic, adapter mapping, or persistence.
- Prefer names like `Chat.Turn`, `Chat.Segment`, `Chat.Entry`, and `turnKey` for UI projection work, while documenting that this is a Silvercode presentation turn rather than a protocol turn.

## Provider Mapping

Claude Code:

- Source: `TodoWrite` tool input, `todos: [{ content, status, activeForm? }]`.
- Map to `source: "claude-todowrite"`.
- Use `todo.content`, `todo.status`, `todo.activeForm`.
- `priority` is absent unless Claude starts sending it.
- Treat each `TodoWrite` as a full snapshot: replace entries and increment `version`.
- Preserve `toolCallId` in `sourceRef`.

Codex:

- Source: `plan_update` / `plan_delta` rollout/session events and `update_plan` tool-style activity.
- Map to `source: "codex-plan"`.
- Normalize provider step text to `content`.
- Normalize provider status conservatively:
  - active / started / in_progress -> `in_progress`
  - done / completed -> `completed`
  - pending / todo -> `pending`
  - cancelled / skipped -> `cancelled`
  - unknown -> `pending`, with raw payload available in debug.
- Prefer provider step ids. If absent, derive stable ids from content/order.
- Apply deltas when the payload is a delta; replace snapshot when it is a full update.

ACP / OpenCode:

- Source: typed `sessionUpdate: "plan"` with `entries: [{ content, priority, status }]`.
- Map ACP-native agents to `source: "acp-plan"`; OpenCode ACP to `source: "opencode-plan"` when the adapter identity is known.
- Use ACP `content`, `priority`, `status` directly.
- `activeForm` is absent unless ACP gains it.
- ACP is flat today; keep `parentId` available for future nesting.

## UI

Primary placement:

- Show the current active plan in a collapsible box in the bottom-right of the session pane.
- Position it above the command box/composer.
- Width: 60% of the prose measure, responsive down to available space on narrow panes.
- Align the right edge with the prose lane / command-box content edge, not the full terminal edge.
- Keep it inside the session content layout, not in the side panel.

Collapsed state:

- One compact row with the active item plus counts, e.g.:
  - `▸ Stripping loader.ts · 2 pending · 3 completed`
- If no active item, show the next pending item plus counts.
- Hide entirely when no plan entries exist.

Expanded state:

- Group entries by status:
  - active/in-progress first, using `activeForm ?? content`
  - pending next, using `content`
  - completed last, dimmed/struck and collapsed behind a `+N completed` footer when there are many
  - cancelled/skipped last, muted
- Use provider-neutral glyphs:
  - `▸` in progress
  - `□` pending
  - `✓` completed
  - `×` cancelled
- Preserve raw/debug affordance back to the originating provider payload.

Side panel:

- Do not use the side panel as the primary plan/todo surface.
- Remove or demote the side-panel todo section once the in-session drawer exists.
- The side panel may keep a tiny count only if it is useful for navigation, but it must not duplicate the full plan.

Transcript:

- Render provider plan updates as a first-class plan update component, not as generic `TurnActivitySummary` / `ToolKind: "think"` rows.
- When provenance allows, the plan update may appear inside a visible chat envelope/segment as a presentation detail. The underlying canonical plan remains session-scoped.
- Raw `TodoWrite`, `update_plan`, and ACP plan payloads remain available in raw/debug mode.

## Acceptance Criteria

- [ ] One canonical `AgentPlan` / `AgentPlanEntry` model exists in the agent harness or shared Silvercode session model.
- [ ] Claude Code `TodoWrite` normalizes into `AgentPlan`, preserving `content`, `status`, `activeForm`, order, and tool-call traceability.
- [ ] Codex `plan_update` / `plan_delta` and `update_plan` normalize into `AgentPlan`.
- [ ] ACP/OpenCode `sessionUpdate: "plan"` normalizes into `AgentPlan`.
- [ ] `AgentPlan` is session-scoped and does not require or imply a canonical provider turn.
- [ ] Any render anchor stored on a plan is documented and tested as best-effort provenance only, not a provider turn id.
- [ ] Existing `SessionState.todos` and ACP `Plan` duplication is removed or reduced to compatibility projections from the canonical model.
- [ ] Plan rendering uses provider-neutral components and does not branch on Claude/Codex/OpenCode in UI code.
- [ ] The active plan appears in a collapsible bottom-right in-session box above the command box.
- [ ] The box is 60% of prose measure, right-aligned to the session/prose content edge, responsive on narrow panes, and does not overlap transcript text or composer controls.
- [ ] Collapsed box shows active/current work plus pending/completed counts.
- [ ] Expanded box groups active, pending, completed, and cancelled entries with stable glyphs and uses `activeForm ?? content` for the active row.
- [ ] The side panel no longer shows the full todo/plan list as the primary surface.
- [ ] Transcript plan updates render as first-class plan UI, not generic think/tool activity, without forcing ambiguous updates into a fake turn.
- [ ] Tests cover Claude `TodoWrite`, Codex plan events/tool updates, and ACP/OpenCode plan updates mapping into the same model.
- [ ] Tests cover collapsed and expanded in-session plan box layout, including bottom-right placement above the command box and 60%-of-prose width.
- [ ] Tests cover `activeForm` display for in-progress Claude todos.
- [ ] Tests cover hiding the drawer when there are no plan entries.
- [ ] Architecture docs are updated to describe canonical session-scoped plans and provider mapping boundaries.
- [ ] Design docs are updated to describe the in-session plan drawer, collapsed/expanded behavior, and side-panel demotion.
- [ ] Any docs that mention plan/todo ownership by turn are corrected to session-scoped plan state plus chat-turn projection placement.

## Implementation Notes

2026-05-05:

- Added canonical `AgentPlan` / `AgentPlanEntry` model to the agent harness session model.
- Normalized Claude `TodoWrite`, ACP `sessionUpdate: "plan"`, and generic Codex `plan_update` / `plan_delta` payloads into `state.plan`.
- Kept `SessionState.todos` as a compatibility projection from `AgentPlan` for older UI surfaces.
- Added an in-session `Chat.PlanDrawer` above the composer and demoted the side-panel todo surface to a small plan count.
- Added Storybook states for collapsed, expanded, completed, and abandoned plans, plus the Chat state matrix plan-update example.

2026-05-05 later:

- Normalized `update_plan` tool-use payloads into the same canonical `AgentPlan` model with `source: "codex-plan"`.
- Preserved `SessionState.todos` as a projection from the canonical plan for compatibility only.
- Historical transcript replay now asserts canonical plan entries have renderable content and that compatibility todos mirror plan entry text.
- Verification: `apps/silvercode/packages/agent-harness/tests/parse.test.ts` covers Claude `TodoWrite`, provider `plan-update`, and `update_plan` tool-use; focused plan run passed 5 tests.

