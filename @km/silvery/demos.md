---
id: "@km/silvery/demos"
aliases:
  - km-silvery.demos
  - km-silvery-demos
created_by: claude:f8196c1c
created_at: 2026-03-23T19:30:27Z
---

# [ ] Silvery demos: examples, showcases, and runnable demo apps @km/silvery #epic #P1

Silvery demo catalog: polished showcases for silvery.dev and bunx.

## Pipeline (the process)
Design LLM creates ANSI mockup → user approves → Claude implements mechanically → TTY diff verifies fidelity.
Workflow doc: .claude/skills/design-review/workflows/create.md

## Phases

### Phase 0 — Design Pipeline (P0)
Prove the mockup→implement pipeline works with non-OpenAI models (Claude Sonnet 4.6, Grok 4).
Already have 3 mockups on disk (dashboard approved, components-v2 needs review, chat exists).

### Phase 1 — Flagship Demos (P1)
Implement the 3 flagship demos from approved mockups to 10/10 quality:
- Dashboard (btop-style system monitor)
- Components (UI element showcase)
- AI Chat (coding assistant)
Fix showcase interaction bugs (rendering corruption, scrolling).

### Phase 2 — Ship & Distribute (P2)
- Clean up examples dir (thin demos → docs, delete web/showcases/)
- bunx silvery example <name> — runnable CLI
- AI agent driving a TUI demo

### Phase 3 — Expand Catalog (P3, backlog)
New demos built using the proven pipeline:
- Theme explorer, log viewer, image gallery, terminal kitchensink, browser playground

## Mockup files
- vendor/silvery/docs/public/screenshots/dashboard-mockup.ansi (APPROVED)
- vendor/silvery/docs/public/screenshots/components-mockup-v2.ansi (needs review)
- vendor/silvery/docs/public/screenshots/chat-mockup.ansi (exists, may use existing aichat instead)

## Model benchmarks (for review, not design)
- Grok 4 ($0.03) = harsh honest reviewer
- Claude Sonnet 4.6 ($0.08) = good ASCII mockup generator
- Terminal-excuse prompts inflate ratings 3-4 pts — never use