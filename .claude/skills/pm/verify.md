# /pm verify — executable acceptance criteria

`bd-verify` parses a bead's Acceptance / /complete section as command → expectation
pairs, executes each against the current tree, and reports pass/fail. It is the
teeth that keep close-reasons honest: prose claims like
"`grep recordPassCause = 0` hits" get re-run against reality and fail loudly when
the claim is wrong (which is how plateau-90 left several beads closed-but-broken).

## When to use

- **Before closing a bead** — re-run your own acceptance criteria. If `bd-verify`
  rejects them, the bead isn't ready.
- **During /complete** — sweep recently closed beads to confirm criteria still
  hold at HEAD. Catches drift introduced by later commits.
- **During /pm review** — when grooming the backlog, verify "closed" beads
  actually shipped what they claimed.

Phase 1 wraps the existing `bd` CLI — does not modify the binary. `km bd close`
integration is Phase 2 (separate bead).

## Usage

```bash
bun tools/bd-verify.ts <bead-id>
```

Exit codes:
- `0` — all executable criteria pass
- `1` — at least one criterion fails (claim disagrees with reality)
- `2` — no executable criteria found (prose-only acceptance; manual review needed)

## Acceptance section format

bd-verify recognizes a header line like:

```
## Acceptance       (markdown header, any depth)
Acceptance:         (plain-text header on own line)
## /complete
/complete:
```

Lines below are parsed as bullets. Each bullet becomes a criterion if it has a
recognizable `<cmd> → <expectation>` shape. Otherwise it is recorded as prose
and skipped (with a `?` warning marker).

In addition, the **Close reason** is split on `;` and `.` and each chunk is
parsed for `Acceptance verified: <cmd> → <expectation>` claims. This catches
the common case where the close-reason quotes a verification command.

## Recognized expectation phrases

The expectation comes after a separator (`→`, `->`, `—`, `=`, `returns`, `returned`).

| Phrase                                | Means                                     | Example                                          |
| ------------------------------------- | ----------------------------------------- | ------------------------------------------------ |
| `→ 0 hits` / `returns 0 hits` / `→ 0` | grep should produce no output (exit 0/1)  | `git grep recordPassCause → 0 hits`              |
| `→ N hits` / `returns N matches`      | command stdout has exactly N lines        | `git grep logPass → 21 sites`                    |
| `passes` / `pass` / `succeeds` / `ok` | command exits 0                           | `bun run test:fast passes`                       |
| (no separator)                        | command exits 0                           | `bun run typecheck`                              |

Trailing parentheticals like `(down from 13)` are stripped before matching.

## Recognized command tokens (head of cmd)

For a line to count as executable, the cmd must START with one of:
`grep, rg, git, bun, bd, node, npm, pnpm, yarn, cat, wc, test, find, ls, echo,
sh, bash, tsc, npx, bunx, vitest, playwright, curl, jq, head, tail, awk, sed`.

This guards against prose like "All 3 files use getActiveHandleCount" or
"STRICT >= 12298" being misparsed as commands.

## Writing executable acceptance criteria

**Do**:

```markdown
## Acceptance

- `git grep recordPassCause` → 0 hits
- `git grep logPass` → 21 sites
- `bun run test:fast` passes
- `rg -E 'Bun\.gc|globalThis\.gc' vendor/silvery/tests/memory/` → 0 hits
```

**Don't** (prose-only — bd-verify will skip with a warning):

```markdown
## Acceptance

- All 3 files in tests/memory/ use getActiveHandleCount, not GC observation
- STRICT >= 12298 (Round 5 baseline)
- C1 reaches L5
```

**Pitfalls**:

- `grep ... origin/main -- path` is a malformed `grep` command — `--` is `git
  grep`'s path separator, not regular `grep`'s. Use `git grep` or drop the `-- path`.
- Paths in the cmd are interpreted relative to the km repo root (where `.beads/`
  lives), not the bead author's `cwd` at the time. Use absolute or repo-rooted
  paths (`vendor/silvery/tests/memory/`, not `tests/memory/`).
- A grep that errors with exit 2 (e.g. path doesn't exist) is treated as FAIL,
  not "zero hits" — broken commands cannot silently green-light.

## Examples

```bash
# All criteria pass — bead is honestly closed
$ bun tools/bd-verify.ts km-foo.bar
✓ git grep oldName  →  0 stdout lines (exit 1)
✓ git grep newName  →  12 stdout lines (exit 0)
✓ 2/2 criteria pass

# Claim was wrong — close-reason said 0 hits, reality has 2
$ bun tools/bd-verify.ts km-silvery.feedback-trace-v31-integration
✗ git grep recordPassCause origin/main
  expected 0, got 2 line(s) (exit 0)
✗ 1/1 criteria FAIL

# Prose-only acceptance — bd-verify can't help here
$ bun tools/bd-verify.ts km-all.substrate-phasing-convention
⚠ no executable criteria — manual review needed
```

## Phase 2 (future, separate bead)

- `km bd close` runs `bd-verify` first; refuses to close if any criterion fails
- `bd lint` flags beads with prose-only acceptance at create-time
- May require upstream PR or fork
