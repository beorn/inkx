# Git Worktree Management

**Keywords**: worktree, parallel, branch, submodule, isolation

Manages git worktrees for parallel development. Handles km's submodules, dependencies, and direnv automatically.

## Quick Reference

```bash
# Show status and help
bun worktree              # List worktrees with status + help

# Create worktree
bun worktree create <name> [branch]
bun worktree create my-feature          # New branch feat/my-feature
bun worktree create bugfix fix/cursor   # Specific branch
bun worktree create test main           # Track main

# Remove worktree
bun worktree remove <name>
bun worktree remove my-feature --delete-branch  # Also delete branch

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

## Remove Safeguards

The `remove` command protects against data loss:
- **Checks for uncommitted changes** in main repo
- **Checks submodules** for uncommitted changes
- **Requires --force** to remove dirty worktrees
- **Protects main/master** branches from deletion

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
cd vendor/beorn-inkx
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

## Integration with km

The `km worktree` command provides the same interface:

```bash
km worktree create my-feature
km worktree remove my-feature
km worktree list
```

Both `bun worktree` and `km worktree` use the same underlying implementation.

## See Also

- [commit.md](commit.md) - Committing across worktrees with submodules
- [../../pm/](../pm/) - Issue tracking (beads) with worktrees
