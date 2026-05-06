---
mentions:
  - km
  - claude
id: "@km/silvery/unicode-plateau/phase-3"
aliases:
  - km-silvery.unicode-plateau.phase-3
  - km-silvery-unicode-plateau-phase-3
created_by: claude:c6244087
created_at: 2026-04-23T15:46:40Z
closed_at: 2026-04-23T16:13:44Z
close_reason: "Phase 3 shipped. lint-env-reads allowlist 6->4 files
  (detection.ts + text-sizing.ts removed). Bonus: absorbed detectCursor into
  caps.cursor (last env read in detection.ts is gone). README.md +
  docs/reference/text-sizing.md synced to caps-based API. 4 new contract tests
  pin caps.cursor. 323 silvery tests pass. Silvery e1980971."
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.unicode-plateau.phase-3
    depends_on_id: km-silvery.unicode-plateau
    type: parent-child
    created_at: 2026-04-23T08:46:40Z
    created_by: claude:c6244087
    metadata: "{}"
  - issue_id: km-silvery.unicode-plateau.phase-3
    depends_on_id: km-silvery.unicode-plateau.phase-2
    type: blocks
    created_at: 2026-04-23T08:46:40Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.unicode-plateau
      - type: link
        target: km-silvery.unicode-plateau.phase-2
---

# [x] Unicode plateau Phase 3: lint rule + docs sync @km/silvery #task #P1 @claude:c6244087

blocks:: [[@km/silvery/unicode-plateau]], [[@km/silvery/unicode-plateau/phase-2]]

Tighten the env-read lint rule now that Phases 1-2 purged ambient env reads from detection.ts and text-sizing.ts. Sync public docs + README.

Changes:
  scripts/lint-env-reads.ts:
    - ALLOWED_FILES: remove packages/ansi/src/detection.ts (no env reads left after Phase 1)
    - ALLOWED_FILES: remove packages/ag-term/src/text-sizing.ts (no env reads left after Phase 2)
    - Keep profile.ts, termtest.ts, storybook.ts on allowlist (diagnostic tools; already documented).
  vendor/silvery/packages/ansi/README.md line 103 — remove detectUnicode from the Detection row (functions gone).
  vendor/silvery/docs/reference/ansi.md — any references to detectUnicode/detectExtendedUnderline replaced with profile.caps.unicode / profile.caps.underlineStyles.
  vendor/silvery/docs/reference/terminal-matrix.md — verify unicode detection description matches profile path.
  vendor/silvery/docs/reference/text-sizing.md — isTextSizingLikelySupported signature update (if referenced).

/complete criteria:
  bun scripts/lint-env-reads.ts → 0 violations
  rg -n 'detectUnicode|detectExtendedUnderline' vendor/silvery/docs/ vendor/silvery/packages/*/README.md → 0 hits (in prose — historical mentions in internal comments OK if scoped)
  bun run lint passes

