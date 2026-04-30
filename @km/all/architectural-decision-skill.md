---
id: "@km/all/architectural-decision-skill"
aliases:
  - km-all.architectural-decision-skill
  - km-all-architectural-decision-skill
created_at: 2026-04-30T07:49:25.046Z
type: feature
priority: P1
---

# /arch skill: doc-first architectural-decision protocol with required retro

## Goal

Ship `/arch <topic>` as a skill (not just an agent invocation) that **enforces** the doc-first protocol for architectural decisions and **requires** a retro after each consultation.

## Problem this solves

Session 2026-04-30 demonstrated the failure mode:

1. I (lead) drafted a 5-step refactor of bead identity, treating user iteration as plan approval.
2. First arch agent invocation: grep'd 31/31 sample files, missed the close-reasons + canonical model docs, gave a "5-8 hours / 5 phases" sizing that was overstated 3x.
3. I accepted that as authoritative without verifying scope of the agent's reading.
4. Took the user explicitly stopping me ("we do not want to change the architecture/identity of things without a solid understanding of what we have and what we planned — it has wide-ranging consequences") to halt.
5. Plus the additional realization that `hub/<project>/design/*` is draft territory, not authoritative — so even citing close-reasons that referenced hub/ docs was unsound.

The lead-and-arch-agent dynamic has no procedural gate. It's a habit, not a contract. Architectural mistakes leak through.

## What `/arch` should do

```
/arch <topic>
  Phase 1 — Discovery (lead's own context):
    [a] List ALL canonical docs touching <topic>:
        - docs/design/model/*.md
        - docs/architecture.md
        - docs/principles.md
        - docs/lessons/*.md
        - vendor/*/docs/<area>/*.md
    [b] Explicitly EXCLUDE hub/<project>/design/* (draft territory per CLAUDE.md promotion flow)
    [c] List ALL related closed beads (search by keyword + tag).
        Required: read close-reason field, NOT just frontmatter closed_at.
    [d] Build a 'canonical context bundle' file at /tmp/arch-<topic>.md
        with: docs read, close-reasons quoted, current code state cited

  Phase 2 — Arch agent invocation:
    Spawn arch agent with the bundle as input. Agent does NOT re-discover;
    it OPINES on the curated bundle. Required output:
      - Direct quotes from canonical docs (5+ minimum, with file:line)
      - Direct quotes from close-reasons (3+ minimum, verbatim)
      - Reconciliation of contradictions
      - Recommendation with effort estimate

  Phase 3 — Mandatory retro (lead, post-arch):
    [a] Cite which canonical docs were actually read (line numbers)
    [b] Cite which close-reasons were actually read (verbatim)
    [c] Identify any contradictions between arch's report and the docs
    [d] If the proposed plan REVERSES prior framing, label
        'REVERSAL FROM PRIOR FRAMING' with diff
    [e] Save the retro to .claude/arch-decisions/<date>-<topic>.md

  Phase 4 — Gating:
    Block /max for any code changes touching the topic until /arch concludes
    AND retro Phase 3 is complete. Skill enforces; not optional.
```

## Acceptance

- `.claude/skills/arch/SKILL.md` exists with the protocol above (mirrored to `.agents/skills/arch/SKILL.md` per the repo's dual-harness rule).
- `/arch <topic>` invocable; it walks the lead through phases 1-3 with explicit checklist gates.
- A drift-checker prevents `/max` from running on identity/storage/persistence/loader changes without a recent `/arch` run referenced.
- Retros archived under `.claude/arch-decisions/`.

## Triggers (when /arch is mandatory)

- Any change to `packages/km-core/`, `packages/km-storage/`, identity-related code in `packages/km-beads/`
- Any change to schema, frontmatter contracts, on-disk shape, KNode shape, KTree shape
- Cross-cutting concerns: pipeline boundaries, layout engine, rendering output phase
- Public API changes (exports of any package, CLI command shape)

## Effort

Skill design + drafting: 2-3 hours. Drift-checker: 1-2 hours. Total ~half day.

## Related

- Memory: `feedback-architectural-decisions-need-big-before-max.md`
- Memory: `feedback-verify-agent-investigation-scope.md`
- Memory: `feedback-hub-docs-are-drafts-not-canonical.md`
- Origin session: 2026-04-30 (during bead-domain-interface plateau push)
