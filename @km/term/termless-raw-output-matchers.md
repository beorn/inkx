---
id: "@km/term/termless-raw-output-matchers"
aliases:
  - km-term.termless-raw-output-matchers
  - km-term-termless-raw-output-matchers
created_at: 2026-04-30T08:25:39.951Z
type: task
priority: P1
closed_at: 2026-04-30T08:35:40Z
---

# [x] Add lazy raw output matchers to termless

Termless has lazy screen/buffer views, but tests for terminal protocols such as Kitty graphics still hand-roll stdout capture and waits. Add a first-class raw output view (term.out) plus lazy Vitest matchers and docs so protocol-output tests can assert bytes canonically.

## Resolution

Implemented in termless commit `e5b483d`:

- Added `term.out` raw output capture before terminal parsing.
- Added lazy `toContainOutput()` Vitest matcher.
- Updated Termless README, writing-tests guide, best-practices guide, matcher index, VitePress nav, and matcher docs.

Integrated in silvery commit `008c9f66`:

- Replaced hand-rolled stdout wrapping in Kitty image tests with `term.out` and `toContainOutput()`.

Verification:

- `bun vitest run` in `vendor/termless` passed via commit hook: 35 files, 1021 tests.
- `bun run typecheck` in `vendor/termless` passed.
- `bun run typecheck` in `vendor/silvery` passed.
- `bun vitest run --project vendor vendor/silvery/tests/features/image-stdout-routing.test.tsx vendor/silvery/tests/features/image-placement-plan.test.ts vendor/silvery/tests/features/image-no-retransmit-on-move.test.tsx` passed.
