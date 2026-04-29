---
id: "@km/bearly/listener-docs"
aliases:
  - km-bearly.listener-docs
  - km-bearly-listener-docs
created_by: claude:fa4168d9
created_at: 2026-04-23T02:38:37Z
closed_at: 2026-04-23T02:44:34Z
close_reason: Shipped in bearly ca6b56d (example.ts template) + km 4f9edbd67
  (.claude/skills/claude-config/hooks.md skill doc, 175 lines). Skill doc covers
  quickstart, event vocab, context fields, ingest vs notify modes, testing
  pattern, enabling, settings.json wiring, anti-patterns. Cross-referenced from
  docs/design/hook-router.md. Pruned content that duplicated design doc
  (problem/why/decisions/composability/out-of-scope).
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.listener-docs
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-22T19:38:37Z
    created_by: claude:fa4168d9
    metadata: "{}"
---

# [x] Listener authoring docs + templates @km/bearly #task #P3

blocks:: [[@km/infra]]

Write docs for the bearly hook router: how to author a listener, the event vocabulary, enrichment flags, testing pattern. Provide example listener template(s) users can copy.

## Deliverables

- [ ] \`.claude/skills/claude-config/hooks.md\` (or similar) — skill-style reference for listener authoring
- [ ] Example template at \`vendor/bearly/tools/lib/hooks/listeners/example.ts\` (disabled by default, explicit opt-in via copy to \`~/.claude/hooks.d/\`)
- [ ] Event vocabulary table
- [ ] Enrichment flags reference
- [ ] Testing pattern (fire synthetic event via \`tribe hook ingest\` to verify listener)
- [ ] Update km's \`docs/design/hook-router.md\` to cross-reference the skill

## Acceptance

- [ ] A new user can follow the docs and ship a working listener in under 10 minutes
- [ ] Template renders correctly when dropped into \`~/.claude/hooks.d/\`