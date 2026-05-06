---
mentions:
  - km
  - Bjørn
id: "@km/infra/skill-consolidation"
aliases:
  - km-infra.skill-consolidation
  - km-infra-skill-consolidation
created_by: Bjørn Stabell
created_at: 2026-04-12T18:00:51Z
closed_at: 2026-04-13T00:57:27Z
close_reason: Audit complete, 5 merges + 5 deletes executed. 57→~30 skills. Kept
  /pro /ask /fresh /big /tdd /deep /explore per user. /silverize updated with
  CLI typography + addHelpSection rules.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-infra.skill-consolidation
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-12T11:01:09Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] Consolidate 55 skills → ~15: /sop absorbs audits, merge thinking skills, delete granular wrappers @km/infra #task #P2 @Bjørn Stabell

blocks:: [[@km/infra]]

55 skills → ~12. /sop absorbs operational skills. Thinking skills stay separate for now. /silverize stays standalone.

## Core (~12 skills)

- /sop — all maintenance, organizational, operational (11 domains)
- /big — reframe the problem (stays separate)
- /why — root cause analysis (stays separate)
- /fresh — second opinion when stuck (stays separate)
- /discuss — pause and discuss (stays separate)
- /csw — decision matrix (stays separate)
- /explore — interactive TUI bug hunting
- /tribe — session coordination
- /max — parallel agents
- /recall — session history
- /ask — external LLMs (merged llm/pro/deep)
- /silverize — silvery alignment audit (standalone, references sop.code)

## Everything else absorbed into /sop

audit, review-all, complete, project-audit, project-cleanup, repo-health, infra, legal, npm, ink-compat, terminfo-update, fp-check, cpu, marketing, release, pm, code, tests, tdd, commit, systematize, skill-test, skill-improve, diagram, diagram-design, checkpoint, design-review

## Into /ask

llm, pro, deep (model selection modes)

## Into hooks (automatic)

checkpoint

## Implementation

1. Wire /sop v1 domains (absorb existing skills as check implementations)
2. Create /ask with model selection
3. Delete absorbed skills
4. Update CLAUDE.md references

