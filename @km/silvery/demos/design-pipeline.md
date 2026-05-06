---
mentions:
  - km
  - claude
id: "@km/silvery/demos/design-pipeline"
aliases:
  - km-silvery.demos.design-pipeline
  - km-silvery-demos-design-pipeline
created_by: claude:db326126
created_at: 2026-03-29T02:33:34Z
closed_at: 2026-03-29T07:29:14Z
close_reason: Closed
owner: bjorn@stabell.org
assignee: claude:db326126
---

# [x] Design pipeline: ANSI mockup > approve > implement (non-OpenAI) @km/silvery #task #P0 @claude:db326126

Prototype the ANSI mockup pipeline with non-OpenAI models.

## Problem

Claude cannot iterate on live app visuals. The proven workflow: design LLM creates ANSI mockup, user approves, Claude implements mechanically, TTY diff verifies.

## Approach

1. Test Claude Sonnet 4.6 and Grok 4 as ANSI mockup generators
2. Use dashboard as test case (approved mockup exists for comparison)
3. Run full loop: generate, user reviews, implement, TTY diff
4. Update create.md to remove OpenAI refs, document winning model
5. Prove process works before scaling to all demos

## Existing assets

- Workflow doc: .claude/skills/design-review/workflows/create.md
- Component catalog and anti-patterns documented there
- 3 existing mockups: dashboard (approved), components-v2 (needs review), chat (exists)

## Acceptance criteria

- One demo fully implemented from mockup with non-OpenAI model
- create.md updated with non-OpenAI model recommendations
- User confirms the process is smooth and repeatable

