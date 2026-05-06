---
mentions:
  - km
  - claude
id: "@km/bearly/injection-pointer-mode"
aliases:
  - km-bearly.injection-pointer-mode
  - km-bearly-injection-pointer-mode
created_by: claude:7e9436e8
created_at: 2026-04-21T19:42:11Z
closed_at: 2026-04-21T20:12:35Z
close_reason: "Phase 3 complete. retrieve_memory dispatcher at
  vendor/bearly/plugins/injection-envelope/src/retrieve.ts. Pointer mode is now
  the default in accountly (INJECTION_MODE=snippet for legacy). CLI companion at
  tools/retrieve-memory.ts. 7 new tests on pointer-mode body suppression +
  retrieve round-trip (53 envelope tests total). Commits: bearly d1f3d3a, km
  58f637ab5."
owner: bjorn@stabell.org
assignee: claude:7e9436e8
dependencies:
  - issue_id: km-bearly.injection-pointer-mode
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-21T12:42:11Z
    created_by: claude:7e9436e8
    metadata: "{}"
  - issue_id: km-bearly.injection-pointer-mode
    depends_on_id: km-bearly.injection-envelope-lib
    type: blocks
    created_at: 2026-04-21T12:42:43Z
    created_by: claude:7e9436e8
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-bearly
      - type: link
        target: km-bearly.injection-envelope-lib
---

# [x] Pointer-based injection — ambient awareness without body content @km/bearly #feature #P1 @claude:7e9436e8

blocks:: [[@km/bearly]], [[@km/bearly/injection-envelope-lib]]

## Phase 3 of @km/_orphan/ambot fix

Change recall injection from snippets (body prose with imperative shapes) to pointers (title + path + date + 1-line summary + entity tags). Model gets ambient awareness that prior context exists + where to find it, without the attack-surface prose landing in the user role.

## Rationale

User's formulation: 'other memory systems inject just pointers to more information — leaving it up to the agent to go and fetch the full details — this is perhaps a good way to shift more from user-context to tool-context without losing the ambientness.'

Maps to Pro's rank-4/5 ('one of the best make-impossible moves — destroys imperative force').

## What ships

- Pointer format: `<injected_context source="qmd">\n  - <title> (<date> · <path>) — <topic tags>. Fetch with retrieve_memory("<id>") for full content.\n</injected_context>`
- New tool: `retrieve_memory(id: string) → { content: string, source: string, date: string }` — returns full snippet content as tool_result when the model explicitly asks
- Pointer emission in both bearly/inject-core.ts AND accountly/recall.ts (after envelope-lib extraction)
- Imperative rewrite STILL applied — titles/tags can be adversarial too
- Backward-compat: keep body-emission mode behind env var `INJECTION_MODE=snippets` for fallback; default becomes `pointers`

## Acceptance

- [ ] Pointer emission shipped in both paths via shared envelope-lib
- [ ] retrieve_memory tool exists + wired through MCP or direct hook registration
- [ ] Model can successfully fetch and use memory when needed (eval)
- [ ] Imperative rewrite still applied to pointer titles/tags
- [ ] Incident-replay test: synthesize @km/_orphan/ambot attack → pointers don't contain imperative prose → gate has less to block
- [ ] A/B test pointer vs snippet mode on task-completion benchmarks (should be comparable)

## Dependencies

- **After**: @km/bearly/injection-envelope-lib

