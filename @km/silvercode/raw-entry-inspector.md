---
mentions:
  - km
id: "@km/silvercode/raw-entry-inspector"
aliases:
  - km-silvercode.raw-entry-inspector
  - km-silvercode-raw-entry-inspector
created_by: claude:cd034ca4
created_at: 2026-04-26T23:38:54Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.raw-entry-inspector
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-26T16:39:09Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [ ] silvercode — per-entry raw inspector (popover + below/above modes) @km/silvercode #feature #P2

blocks:: [[@km/silvercode]]

Generalize today's /raw toggle (currently shows hidden context for user messages only) into a per-entry inspector that exposes the raw JSONL line for ANY chat entry — user messages, agent messages, tool calls, thinking blocks, plans, usage updates, etc.

## Today

- /raw / /debug toggles `showRaw`, which inlines `additionalContext` (system-reminders, hook output, isMeta) under user messages only.
- Other entries (agent text, tool calls, thinking) have no raw view.

## What user wants

'When looking at the chat session — could we have an option to show the raw content of that entry below/above/in-popover?'

The chat is rendered from JSONL → ACP SessionUpdate → typed React component. Each rendered entry has a corresponding source line.

## Design options

**A. Inline below — Accordion expand**
Each component renders a small chevron/badge ('⏵ raw'). Press Enter / hover-and-click to expand a collapsed Accordion below showing the raw JSON.

- Pros: discoverable, consistent with existing /raw inline pattern, scales for long entries
- Cons: shifts layout; multiple opens crowd the message stream

**B. Popover on hover/click**
Hover entry → popover anchored to the entry showing pretty-printed JSON. Already have <Popover> primitive.

- Pros: doesn't shift layout, lightweight
- Cons: ephemeral (closes on hover-out), unwieldy for very long entries

**C. /raw global mode but extended to all entries**
Press /raw → every entry inlines its raw JSON in a styled <Code> block below the rendered form (uses the new shiki <Code> for syntax highlight).

- Pros: simple, matches existing toggle semantics, batch-inspect
- Cons: noisy when not needed

**D. Keyboard chord per entry**
Cursor up/down through entries; press 'i' (inspect) to open a side-panel-overlay with the raw JSON.

- Pros: tidy, scales to large entries
- Cons: requires per-entry cursor (we have selection but not per-entry-cursor for chat)

## Recommendation

v1 = **B + C combined**. /raw toggle still works (batch). Hover any entry shows popover with truncated raw (first 20 lines + ⏎ to expand). Right-click or press 'r' on focused entry → modal/overlay with full raw.

## Acceptance

- Each chat entry component (UserMessageChunk, AgentMessageChunk, ToolCall, ThinkingBlock, PlanUpdate, UsageUpdate) accepts a `raw?: unknown` prop
- SessionUpdateList threads `raw` from the original SessionUpdate (preserved through wire.ts boundary)
- /raw mode renders raw JSON below each entry as <Code language="json">
- Hover popover shows raw JSON (truncated to 20 lines + ⌘+click for full)
- Test: a SessionUpdate sample renders both the typed component AND the raw inline when /raw is on

## Related

- /raw existing toggle — apps/silvercode/src/App.tsx (showRaw state)
- @silvery/syntax just shipped (commit 0ccd144cf) — use for JSON syntax highlight
- Bead @km/silvercode/resume-show-everything-collapsed — origin of /raw

## Why this matters

Debugging a verbose-tool-result issue or a thinking-loop bug (e.g., @km/silvercode/thinking-loop-after-bash) requires seeing what the wire actually delivered. Today this requires opening the JSONL file directly. A per-entry inspector closes that gap.

