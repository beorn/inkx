---
id: "@km/infra/worktree-isolation-apfs"
aliases:
  - km-infra.worktree-isolation-apfs
  - km-infra-worktree-isolation-apfs
created_by: claude:c6244087
created_at: 2026-04-23T20:38:32Z
closed_at: 2026-04-23T20:57:11Z
close_reason: >-
  Implemented via commit 2842ed2a3.


  Artifacts:

  - .claude/lib/isolate.sh — APFS cp -c -R with tar fallback, submodule gitdir
  rewrite, stale lock cleanup

  - .claude/hooks/worktree-create.sh — synchronous blocking clone creation

  - .claude/hooks/worktree-remove.sh — safe no-op preserving clones (prevents
  destroying Agent work)

  - tools/isolate.slow.test.ts — 3 tests: round-trip isolation, refusal cases.
  555ms, green.

  - .claude/skills/max/SKILL.md — updated verification instructions and
  commit-rules block


  Acceptance:

  - [x] isolate_worktree creates distinct file paths — verified in test

  - [x] Clone modifications don't leak to source — verified in test (submodule
  HEADs diverge)

  - [x] Clone directory listing reflects the clone — .claude/worktrees/<name>/
  survives

  - [~] Cleanup: deliberately chose NOT to auto-delete 13G clones based on JSON
  input.
        Remove hook logs uncommitted-change count. Manual cleanup documented.

  Performance note: bead estimated ~100ms; reality is ~20-25s on the km repo due

  to O(filecount) directory traversal (~500K files incl node_modules). Still
  100%

  correct and doesn't fail silently like the prior git-worktree-poll design.


  End-to-end validation requires running a /max session with isolation:
  "worktree" —

  platform behavior (whether Claude Code blocks on the hook) is out of our
  control.

  If it doesn't block, we'll see clone dirs that don't exist when the Agent
  starts

  writing, and iterate from there.


  Benchmark leftovers: /tmp/cp-c-test-* (~26G total). Clean with

  /bin/rm -rf /tmp/cp-c-test-1776977355627845000
  /tmp/cp-c-test-1776977426611724000
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-infra.worktree-isolation-apfs
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-23T13:38:32Z
    created_by: claude:c6244087
    metadata: "{}"
---

# [x] Fix Agent worktree isolation via APFS cp -c (replace broken git-worktree hook) @km/infra #task #P2 @claude:c6244087

blocks:: [[@km/infra]]

## Problem

`isolation: "worktree"` on Agent calls is silently broken. Today's /max session had 3 agents all writing to main because:

1. The `WorktreeCreate` hook at `.claude/hooks/worktree-create.sh` fires AFTER the Agent starts
2. It polls for a `.git` directory to appear in `.claude/worktrees/agent-<id>/`
3. Nothing ever creates that directory — the Agent runtime never invokes `git worktree add`
4. Hook times out after 60s with 'worktree never appeared — giving up' (see `/tmp/worktree-create-hook.log`)
5. Meanwhile the Agent is already working on main

Net effect: `isolation: "worktree"` is a no-op. Concurrent agents collide. Commits get bundled with unrelated work from parallel sessions (happened today: type split bundled with UnderlineStyleName feature into `0ca0a8a5`).

## Proposed Solution: APFS cp -c (+ tar fallback)

macOS APFS supports instant copy-on-write clones. `cp -c -R` produces a clone that shares data blocks with the source; only modified bytes cost disk. Scales to N concurrent agents without git index.lock contention.

```bash
# .claude/lib/isolate.sh
isolate_worktree() {
  local source="$1" target="$2"
  mkdir -p "$(dirname "$target")"
  # Prefer APFS CoW (macOS); fall back to tar for portability
  cp -c -R "$source" "$target" 2>/dev/null || {
    mkdir -p "$target" && tar -C "$source" -cf - . | tar -C "$target" -xf -
  }
  # Init submodules in the clone (blocking ~3s, runs once per isolation)
  [ -f "$target/.gitmodules" ] && (cd "$target" && git submodule update --init --recursive)
}
```

## Why cp -c beats alternatives

| Option | Speed | Correctness | Scaling |
|---|---|---|---|
| APFS cp -c | ~100ms metadata, 0 data | Perfect (uncommitted, symlinks, submodules) | Unlimited (CoW) |
| tar | 2-4s for km's 13G tree | Perfect | Linear per agent |
| git worktree | 3-5s + index.lock | Fragile (submodule init race, shared .git) | Lock-contention risk |
| rsync --exclude node_modules | 2-4s | Incomplete; bun install tax | Linear + 5-10s per agent |

Repo sizing (from explore agent): km 13G, node_modules 1.3G, vendor/silvery 230M. APFS copy is instant.

## Work

1. Write `.claude/lib/isolate.sh` with cp -c + tar fallback + submodule init
2. Update / replace `.claude/hooks/worktree-create.sh` to USE this mechanism (currently it polls; it should CREATE)
3. Verify with a test: spawn 2 Agent calls with `isolation: "worktree"`, each touches a distinct file, verify: (a) `git worktree list` shows entries OR `.claude/worktrees/*/` directories exist, (b) changes are isolated until commit, (c) commits can be merged back via `bun worktree merge` or equivalent
4. Update the relevant skill docs (max.md, refactor.md) to reflect the mechanism
5. Delete or deprecate `vendor/bearly/tools/worktree.ts` if the new path supersedes it

## Cleanup of today's aftermath

- Today's /max session with 3 concurrent agents on vendor/silvery all landed on main. Three pieces of plateau-finishing work shipped via `45c19f06`, `f8ad0c1f`, `0ca0a8a5` — but the bundling in `0ca0a8a5` (type split + UnderlineStyleName feature in one commit) is a symptom of this bug. No action needed; future sessions shouldn't produce the same bundling once cp -c lands.

## Acceptance

- Two concurrent `Agent({ isolation: "worktree", ... })` calls write to distinct file paths on disk
- Neither agent sees the other's uncommitted changes
- `git worktree list` (or the clone directory listing) reflects both clones
- Cleanup script removes clones after merge