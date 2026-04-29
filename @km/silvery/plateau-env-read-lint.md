---
id: "@km/silvery/plateau-env-read-lint"
aliases:
  - km-silvery.plateau-env-read-lint
  - km-silvery-plateau-env-read-lint
created_by: claude:c6244087
created_at: 2026-04-23T09:49:02Z
closed_at: 2026-04-23T10:11:26Z
close_reason: |-
  Lint rule shipped in silvery a2806b5b + km bump 37aea09b7.

  Deliverable
  - scripts/lint-env-reads.ts — grep lint flagging process.env reads of
    TERM/TERM_PROGRAM/TERM_PROGRAM_VERSION/COLORTERM/COLORFGBG/
    KITTY_WINDOW_ID/WT_SESSION/NERDFONT/FORCE_COLOR/NO_COLOR outside
    the allowlist. Static + dynamic (process.env["X"]) both caught.
  - tests/lint-env-reads.test.ts — 6 tests: source clean, static
    violation caught, dynamic violation caught, test exemption, JSON
    output, --paths narrowing.
  - Wired into package.json "lint" script + standalone "lint:env-reads".

  Migrations (5 consumers, now caps-aware + route via detectTerminalCaps)
  - ag-term/scroll-region.ts:supportsScrollRegions(caps?) — also fixes
    Ghostty capitalization (was matching "ghostty" only).
  - ag-term/output.ts:notify(..., { caps? })
  - ag-term/non-tty.ts:isTTY(stdout, caps?) — CI vars remain direct
    (orthogonal to terminal caps).
  - ag-react/ui/image/kitty-graphics.ts:isKittyGraphicsSupported(caps?)
  - ag-react/ui/image/sixel-encoder.ts:isSixelSupported(caps?)

  Allowlist (6 files, each documented in scripts/lint-env-reads.ts)
  - packages/ansi/src/profile.ts (canonical)
  - packages/ansi/src/detection.ts (legacy shims → profile)
  - packages/ag-term/src/text-sizing.ts (LOOSER env fallback — pins
    test semantics, follow-up needed)
  - packages/ag-term/src/termtest.ts (diagnostic CLI — prints env)
  - packages/ag-term/src/ansi/storybook.ts (diagnostic CLI — prints env)
  - scripts/lint-env-reads.ts (self — regex strings)

  Evidence
  - Violations 24 → 0 across 900 files.
  - lint-env-reads tests: 6/6.
  - ansi/contracts/capability-matrix/text-sizing combined: 172/172
    (unchanged from baseline).
  - Full silvery vendor: 5912 passed, 15 pre-existing fails — same
    class as /big review reported (focus / useBoxMetrics / use-ag-node
    / click-to-position / measure-fit / text-frame / box-in-text-warning).

  Commits
  - silvery: a2806b5b
  - km: 37aea09b7
---

# [x] Lint rule: only @silvery/ansi/profile.ts may read process.env terminal signals @km/silvery #task #P3 @claude:c6244087

blocks:: [[@km/silvery]]

The terminal-profile-plateau refactor fixed the big entry points but not the long tail of env-readers. Grep TERM_PROGRAM/COLORTERM/KITTY_/FORCE_COLOR/NO_COLOR across vendor/silvery/ reveals consumer modules that re-derive terminal facts from env directly, bypassing TerminalProfile.

## Offending sites (as of 2026-04-23)

- vendor/silvery/packages/ag-term/src/text-sizing.ts:75 — FIXED in this review (accepts caps now)
- vendor/silvery/packages/ag-term/src/output.ts:285 — TERM_PROGRAM for backend fingerprinting
- vendor/silvery/packages/ag-term/src/scroll-region.ts:55 — TERM_PROGRAM for Apple_Terminal quirks
- vendor/silvery/packages/ag-term/src/ag.ts:256 — TERM_PROGRAM lookup
- vendor/silvery/packages/ag-term/src/term-def.ts:189,195 — private detectColorLevel()
- vendor/silvery/packages/ink/src/chalk.ts:45,103 — detectColor via process.stdout
- vendor/silvery/packages/ansi/src/detection.ts:30,90,97,103,108,119 — detectCursor/detectUnicode/detectExtendedUnderline still read env

## Reframe

'Single source of truth' only holds if consumers consume the source; if they re-derive from env, the source is one of many. The design where this class of bug can't happen:

1. Only `@silvery/ansi/profile.ts` may read `process.env.TERM*` / `COLORTERM` / `COLORFGBG` / `KITTY_WINDOW_ID` / `WT_SESSION` / `NERDFONT` / `FORCE_COLOR` / `NO_COLOR` / `TERM`.
2. Every other module accepts `TerminalCaps` or `TerminalProfile` as an argument.
3. Enforced by a Rust/oxlint rule or a CI grep check.

## Benefits

- Future browser/canvas/web targets: env reads blow up with 'process is not defined' at runtime. A build-time check prevents it.
- Test fixtures inject one mock profile and every consumer obeys.
- Adding a new cap to TerminalCaps doesn't require grepping 'every place that reads TERM_PROGRAM'.

## Plan

1. Audit — enumerate every process.env.$TERMINAL_SIGNAL read outside profile.ts (~10 sites).
2. Convert each — accept caps/profile via argument; refactor entry points to thread it.
3. Add lint rule OR CI grep that fails on new env reads outside profile.ts.

## Effort
~200 LOC + lint rule. Medium-large refactor, but each call site is small.

From /big review 2026-04-23 (H8 action item).