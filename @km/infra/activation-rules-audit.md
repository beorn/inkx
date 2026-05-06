---
mentions:
  - km
  - Bjørn
id: "@km/infra/activation-rules-audit"
aliases:
  - km-infra.activation-rules-audit
  - km-infra-activation-rules-audit
created_by: Bjørn Stabell
created_at: 2026-04-15T14:41:28Z
closed_at: 2026-04-15T15:31:50Z
close_reason: "Completed in commit fa5144c1028277f4667c546d08d03142b6dbdb1e.
  Added 'Before working in <pkg>' pre-flight sections to 6 package CLAUDE.md
  files (all new): apps/km-tui/CLAUDE.md, packages/km-storage/CLAUDE.md,
  packages/km-markdown/CLAUDE.md, packages/km-board/CLAUDE.md,
  packages/km-commands/CLAUDE.md, packages/km-core/CLAUDE.md. Also augmented
  root CLAUDE.md 'Never' boundary to forbid reimplementing silvery primitives
  and point at .claude/skills/tui/silvery-components.md as the audit gate
  (sibling agent creates that file). Each pre-flight follows a consistent shape:
  (1) read first, in order; (2) do NOT reimplement; (3) invariants; (4)
  anti-patterns. 213 insertions across 7 files; self-verified every relative
  link resolves (except silvery-components.md, intentionally referenced ahead of
  sibling agent's work)."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-infra.activation-rules-audit
    depends_on_id: km-session.0415a
    type: parent-child
    created_at: 2026-04-15T08:25:29Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-session.0415a
---

# [x] Audit activation rules: CLAUDE.md pre-flight checks for every package @km/infra #task #P2 @Bjørn Stabell

blocks:: [[@km/session/0415a]]

## Audit CLAUDE.md activation rules

## Why

This session burned ~700 LOC reimplementing silvery primitives because there was no procedural trigger to check silvery/CLAUDE.md before building new @km/tui components. The /why analysis in this session's chat concluded:

> Root cause: no audit gate. Every new km component needs a "did you check silvery?" check before implementation. The fix is procedural, not code-level.

## What to build

A simple, uniform set of activation rules in each package's CLAUDE.md that say "before doing work in this area, read X first". Specifically:

1. **@km/tui work** — must read:
  - vendor/silvery/CLAUDE.md (components, hooks, The Silvery Way)
  - .claude/skills/tui/silvery-components.md (the audit gate lookup doc, landing in @km/tui/omnibox-use-silvery companion work)
  - The Silvery Way: vendor/silvery/docs/guide/the-silvery-way.md
  - Styling: vendor/silvery/docs/guide/styling.md
2. **Storage work (@km/storage)** — must read:
  - Storage CLAUDE.md (if exists)
  - packages/@km/storage/CLAUDE.md invariants
3. **Markdown work (@km/markdown)** — must read:
  - packages/@km/markdown/CLAUDE.md
  - mdast / micromark external refs
4. **Board/commands work** — must read:
  - packages/@km/_orphan/board/CLAUDE.md (if exists)
  - docs/design/data-model.md
  - docs/design/selection-model.md

## Shape of the rule

Each package's CLAUDE.md should have a top-level **Before working in this package** section with:

- What to read first (single-paragraph)
- What NOT to duplicate (list of silvery/external primitives this package should consume, not reimplement)
- Known anti-patterns specific to this package

Then km/CLAUDE.md references each package's CLAUDE.md from the Boundaries section with a "Never" rule enforced via skill activation.

## Acceptance

- Every major package has a "Before working here" pre-flight checklist in its CLAUDE.md
- km/CLAUDE.md lists the activation rules for each package under Boundaries
- .claude/skills/tui/silvery-components.md is referenced from anywhere an agent would touch @km/tui
- A spot-check test: grep for "reimplement" / "from scratch" in recent commits; new code that could have used silvery should trigger the audit gate

## Depends on

- @km/tui/omnibox-use-silvery (which lands silvery-components.md)

## Related

- @km/review/silvery-gap-analysis (complementary — surfaces the duplicates this rule prevents)

