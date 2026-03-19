# Git Worktree Management

**Keywords**: worktree, parallel, branch, submodule, isolation

Manages git worktrees for parallel development. Handles submodules, dependencies, and direnv automatically.

## Native vs Custom Worktrees

Claude Code 2.1.50+ supports `isolation: "worktree"` on the Task tool — agents get automatic temporary worktrees that auto-clean. The `WorktreeCreate` hook in `settings.json` handles submodule/dependency setup for these.

Use **native isolation** for: parallel agent edits on the same files (automatic, temporary).
Use **`bun worktree`** for: persistent development branches, merge workflow, manual parallel work.

## Why `bun worktree`?

Bare `git worktree add` doesn't handle:
- **Submodules** - need independent clones, not symlinks to main worktree
- **Dependencies** - `bun install` / `npm install` required per worktree
- **Hooks** - git hooks need reinstalling per worktree
- **Direnv** - needs `direnv allow` per worktree
- **Validation** - uncommitted changes would be missing from new worktree; unpushed submodule commits would fail to clone

**Tool location**: `vendor/tools/tools/worktree.ts` (also available as `bun worktree`)

## Quick Reference

```bash
# Show status and help
bun worktree

# Create worktree
bun worktree create <name> [branch]
bun worktree create my-feature          # New branch feat/my-feature
bun worktree create bugfix fix/cursor   # Specific branch
bun worktree create test main           # Track main

# Merge worktree branch into main, run tests, clean up
bun worktree merge <name>
bun worktree merge my-feature --keep-branch      # Keep branch after merge

# Remove worktree
bun worktree remove <name>
bun worktree remove my-feature --delete-branch   # Also delete branch

# Detailed status
bun worktree list         # Shows uncommitted changes
```

## How Worktrees Are Created

**Worktrees are created from your COMMITTED state, not your working tree.**

This ensures each worktree is an exact, reproducible copy. Before creating, the tool validates:

1. **No uncommitted changes** in main repo
2. **No uncommitted changes** in any submodule
3. **All submodule commits** are pushed to remote

If any check fails, you'll see an error with options:
- Commit your changes first
- Stash your changes: `git stash`
- Use `--allow-dirty` to bypass (creates worktree without local changes)

### Why These Checks?

Without these checks, you could create a worktree expecting it to have your current work, but it would only have what's committed. This leads to confusion about "which version of the code is where."

## Submodule Handling

Each worktree gets **independent submodule clones** (not symlinks):

- Submodules are cloned fresh via `git submodule update --init --recursive`
- Changes in one worktree's submodules don't affect others
- You can have different submodule states per worktree
- Each worktree can commit to submodules independently

### Submodule Validation

Before creating, the tool checks that all submodule commits exist on remote. This prevents the new worktree from failing to initialize submodules.

If you see "Found unpushed submodule commits":

```bash
# Push all submodules
git submodule foreach "git push origin HEAD || true"

# Then retry
bun worktree create my-feature
```

## Post-Create Setup

After creating the worktree, these steps run automatically:

1. `git submodule update --init --recursive` - Clone all submodules
2. `bun install` (or `npm install` if no bun.lock) - Install dependencies
3. `direnv allow` - Allow environment if .envrc present
4. `bun run prepare` - Install git hooks

Skip any step with flags:
- `--no-install` - Skip dependency installation
- `--no-direnv` - Skip direnv allow
- `--no-hooks` - Skip hook installation

## Worktree Locations

Worktrees are created at `../<repo>-<name>`:

```
/Users/beorn/Code/pim/
├── km/                    # Main worktree (main branch)
├── km-my-feature/         # Worktree for feat/my-feature
├── km-bugfix/             # Worktree for fix/cursor
└── km-infra/              # Worktree for feat/km-infra
```

## When to Use Worktrees

Use worktrees when you need to:
- **Work on multiple features** without stashing
- **Test changes in isolation** from your main working directory
- **Compare implementations** side by side
- **Run long tests** while continuing development
- **Parallel agents on foundational code** — changes to silvery, flexily, storage, or test infrastructure can break other agents working in the same repo. Use worktrees to isolate foundational work. See [max/SKILL.md](../max/SKILL.md#isolation-when-to-use-worktrees) for the blast-radius classification.

### Multi-Agent Awareness

**Don't assume you're the only agent.** Multiple Claude Code sessions or sub-agents may operate on the same repository concurrently. Worktrees prevent:
- Git index lock conflicts (`.git/index.lock`)
- Partial edits visible to other agents mid-change
- Test failures from incomplete changes in shared files
- Submodule pointer drift between concurrent edits

## Merging Back to Main

Use `bun worktree merge <name>` to merge a worktree's branch back into main. This single command:

1. Validates you're on the main worktree
2. Checks the worktree is clean (no uncommitted changes)
3. Merges with `--no-ff` (preserves branch history)
4. Runs `bun run test:fast` to verify
5. Removes the worktree
6. Deletes the branch

```bash
# From main worktree:
bun worktree merge my-feature

# Keep the branch after merging
bun worktree merge my-feature --keep-branch

# Run full test suite instead of fast tests
bun worktree merge my-feature --full-tests
```

If the merge has conflicts, it aborts and tells you to resolve manually. If tests fail, the merge stays but the worktree is not removed.

## Remove Safeguards

The `remove` command protects against data loss:
- **Checks for uncommitted changes** in main repo
- **Checks submodules** for uncommitted changes
- **Requires --force** to remove dirty worktrees
- **Protects main/master** branches from deletion

## WorktreeCreate Hook

Claude Code's `isolation: "worktree"` triggers the `WorktreeCreate` hook defined in `.claude/settings.json`. The hook at `.claude/hooks/worktree-create.sh` sets up submodules, dependencies, and direnv in the new worktree.

**Critical**: The hook MUST output JSON to stdout (e.g., `{"hookSpecificOutput": {"status": "success"}}`). Claude Code treats hooks with no stdout as failures ("WorktreeCreate hook failed: no successful output"). All exit paths must emit JSON.

## Common Issues

### "Cannot create worktree - uncommitted changes detected"

Your working tree has changes that won't be in the new worktree:

```bash
# Option 1: Commit first
git add . && git commit -m "WIP"
bun worktree create my-feature

# Option 2: Stash
git stash
bun worktree create my-feature
# Later: git stash pop

# Option 3: Create anyway (worktree won't have your changes)
bun worktree create my-feature --allow-dirty
```

### "Found unpushed submodule commits"

Push your submodule changes first:

```bash
cd vendor/silvery
git push
cd ../..
bun worktree create my-feature
```

### Beads/Database Conflicts

The `.beads/` database is shared across worktrees. When working in worktrees:

```bash
# Disable beads daemon to avoid conflicts
export BEADS_NO_DAEMON=1
```

## See Also

- [commit.md](commit.md) - Committing across worktrees with submodules
- [../../pm/](../pm/) - Issue tracking (beads) with worktrees
