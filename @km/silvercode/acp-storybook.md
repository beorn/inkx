---
mentions:
  - km
  - claude
id: "@km/silvercode/acp-storybook"
aliases:
  - km-silvercode.acp-storybook
  - km-silvercode-acp-storybook
created_by: claude:cd034ca4
created_at: 2026-04-26T08:12:02Z
closed_at: 2026-04-26T10:03:45Z
close_reason: >-
  Storybook scaffold shipped — registry pattern + 12 reference stories.


  What shipped:

  - apps/silvercode/storybook/{runner.tsx,registry.ts,types.ts}

  - 12 reference stories under storybook/stories/ covering 8 components:
  Welcome, UserMessageBlock, AssistantBlock (basic+code), ActivityIndicator,
  ToolCallBlock (bash+edit+running), MessageList (empty+multi-turn),
  SlashCommandPalette, PermissionInbox

  - support/{fake-session-handle.ts, sample-messages.ts} for components needing
  SessionHandle / MessageEntry[] inputs

  - tests/registry.test.ts (6 tests — id uniqueness, knob defaults) +
  tests/stories.test.tsx (12 tests — smoke render every story via @silvery/test
  createRenderer)

  - README.md documenting how to add stories, drive ACP fixtures, and the queued
  tape integration

  - bun storybook script entry in apps/silvercode/package.json

  - tsconfig include widened to cover storybook/


  Silvery framework reuse:

  - Did NOT reuse vendor/silvery/examples/apps/storybook/ — that storybook is
  the design-system explorer (3-pane theme/scheme/token playground), not a
  generic story registry. Building on its frame would force chat/dialog stories
  into a token-centric layout that doesn't fit.

  - DID reuse silvery's static-registry pattern (mirrors
  vendor/silvery/examples/bin/registry.ts) and silvery primitives (Box,
  SelectList, Screen, Strong, Muted) so the runner is ~150 LOC of glue.


  Verification:

  - bun vitest run apps/silvercode/storybook/tests/ → 18/18 passing

  - bun fix → zero new errors (pre-existing km-mcp-server lint issues unchanged)

  - bunx tsc --noEmit -p apps/silvercode/tsconfig.json → zero new errors in
  storybook/


  Queued for follow-up beads (out of scope here, called out in
  component-parity-plan.md):

  - Tape recording / visual regression — stories.test.tsx is currently a no-op
  smoke harness; swap for tape snapshots once the components stabilize

  - Stories for the remaining ~30 silvercode components and ~15 silvery
  primitives in the parity plan — each future component bead adds its own
  *.story.tsx and registers it

  - Knob UI in the runner — v1 just renders default knob values; extending the
  runner to expose knob toggles is straightforward but not required for design
  iteration (stories with knobs document them in the registry header, and tests
  can resolve knob values directly)

  - ACP-fake-driven stories — the README documents the createFakeAcpSession +
  createAcpSession pattern; reference stories use plain props because v0
  silvercode components don't yet consume AcpSession signals


  Constraints honored:

  - Touched only apps/silvercode/storybook/ (new dir),
  apps/silvercode/package.json (script entry), apps/silvercode/tsconfig.json
  (include path)

  - Did NOT modify any component file in apps/silvercode/src/components/

  - Did NOT touch packages/* or other workspaces

  - No conflict with parallel acp-multi-agent agent (its work is in
  src/{cross-agent-state,coordinator-mcp,controller}.ts) or acp-adapter-claude
  (in agent-harness package)
started_at: 2026-04-26T09:52:19Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-storybook
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T01:12:02Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-storybook
    depends_on_id: km-silvercode.acp-fake
    type: blocks
    created_at: 2026-04-26T02:04:57Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-storybook
    depends_on_id: km-silvercode.acp-session
    type: blocks
    created_at: 2026-04-26T01:12:03Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode.acp
      - type: link
        target: km-silvercode.acp-fake
      - type: link
        target: km-silvercode.acp-session
---

# [x] Silvercode component storybook — visual showcase for design iteration @km/silvercode #feature #P2 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-fake]], [[@km/silvercode/acp-session]]

Storybook-style showcase of all silvercode components for design iteration. Each component rendered in isolation with realistic ACP fixture data, multiple states, and live theme/typography knobs. Modeled after silvery's existing storybook (vendor/silvery — see project-silvery-showcase-app.md for prior art).

## Components to showcase (driven by ACP SessionUpdate variants + capability surfaces)

### Streaming-update renderers (one per SessionUpdate variant — 11 total)

- UserMessage / AssistantMessage / ThinkingBlock
- ToolCallBlock (with status badge + body slot, all 4 statuses)
- PlanView (entries with priority + status icons, nested via alien-tree)
- SlashCommandPalette (AvailableCommandsUpdate)
- ModeIndicator (CurrentModeUpdate)
- SessionConfigPanel (ConfigOptionUpdate, typed selectors)
- UsageBadge (UsageUpdate, tokens + cost)

### Tool-call body renderers (one per ToolKind)

- FilePreview (read), DiffView (edit), TerminalPane (execute), SearchResults (search), FsOpSummary (move/delete), GenericToolCall (other/fallback)

### Content-block renderers (one per ContentBlock variant)

- TextContent (markdown), ImageContent, AudioContent, ResourceLink, EmbeddedResource

### Capability-surface renderers

- PermissionDialog (RequestPermissionRequest, all PermissionOptionKind variants)
- WorkspaceProvider (FS handlers — virtualized vs real-disk modes)
- TerminalBackend (needs @silvery/pty)

### Session/connection plumbing

- SessionPicker / SessionHistory, AuthMethodPicker

## Why

- Design iteration speed — change components without running real agents
- Visual regression — tape-record snapshots of every story (silvery's mdtest tape pattern)
- Onboarding — new contributors see the full component surface in one place
- Debugging — reproduce edge cases (long thinking blocks, deeply-nested plans, failed tool calls) on demand

## Approach

- Fixture set: realistic ACP messages from real Claude Code sessions, anonymized
- Each story is a silvery component tree consuming a fixed ACP message stream
- Reuse silvery's existing storybook framework if it exists; build a thin wrapper if not

## Reference

- Component inventory: hub/silvery/future/ai-terminal/10-agent-router-landscape.md § Component inventory
- Silvery storybook prior art: vendor/silvery/ (see Storybook integration in recent silvery commits)

