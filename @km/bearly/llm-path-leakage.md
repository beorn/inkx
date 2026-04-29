---
id: "@km/bearly/llm-path-leakage"
aliases:
  - km-bearly.llm-path-leakage
  - km-bearly-llm-path-leakage
created_by: claude:cc081a9a
created_at: 2026-04-28T05:06:24Z
closed_at: 2026-04-28T06:30:14Z
close_reason: >-
  Fixed in @bearly/llm 0.10.0.


  ## Test

  - New regression suite:
  vendor/bearly/plugins/llm/tests/path-relativization.test.ts (8 tests)
    - Pure helper formatEnvelopeFile(): basename for /tmp paths, cwd-relative when under cwd, basename-fallback when relative would escape cwd via "..", verbatim under fullPaths=true, passthrough for already-relative inputs.
    - setFullPaths/isFullPaths flag flipping + reset.
    - End-to-end --json invocation with and without --full-paths through cli.ts main(); asserts envelope.file shape.
  - Updated dual-pro-failure-modes.test.ts to pass --full-paths so its
  readFileSync(envelope.file) keeps working under the new default.

  - All 305 plugin/llm tests pass (was 305 before, still 305 after).


  ## Fix

  - vendor/bearly/plugins/llm/src/lib/output-mode.ts:
    - Added pure helper formatEnvelopeFile(filePath, { fullPaths, cwd }) — explicit cwd makes it test-deterministic. Basename for outside-cwd; cwd-relative for inside-cwd; verbatim under fullPaths=true.
    - Added setFullPaths/isFullPaths singleton parallel to setJsonMode/isJsonMode.
    - resetOutputMode resets the new flag too.
  - vendor/bearly/plugins/llm/src/lib/format.ts: finalizeOutput and
  finishResponse-empty-response now route the file path through
  formatEnvelopeFile() before assigning envelope.file.

  - vendor/bearly/plugins/llm/src/cli.ts: setFullPaths(hasFlag("--full-paths"))
  at module scope (mirroring setJsonMode); --full-paths help text added.

  - vendor/bearly/plugins/llm/README.md: new "file field — relativized by
  default" section explaining default + --full-paths + how to recover full path
  (path.join(os.tmpdir(), envelope.file)).

  - vendor/bearly/plugins/llm/CHANGELOG.md: 0.10.0 entry calling out the
  user-visible behavior change.


  ## Version bump

  @bearly/llm 0.9.0 → 0.10.0 (envelope.file shape changed for default callers).


  ## Evidence

  - bearly: pushed bug/llm-path-leakage @
  54190736910e14fe3dac084a4359232f81b55ef0 (github.com/beorn/bearly)

  - km: pushed bug/llm-path-leakage @ cf8e1fe2badf9912388dabe4ce021794c39f0966
  (github.com/beorn/km), gitlink bumped vendor/bearly to 5419073

  - Tests: bunx vitest run plugins/llm/ → 20 files / 305 tests passed.

  - Typecheck: 2 pre-existing errors (injection-envelope adversarial test
  rootDir mismatch + silvery ansi types — both unchanged from baseline). Zero
  new TS errors from this change.
---

# [x] @bearly/llm: relativize file: path field in JSON envelope (path leakage R3) @km/bearly #bug #P3 @claude:cc081a9a

blocks:: [[@km/bearly]]
