# Git Worktree Management

**Keywords**: worktree, parallel, branch, submodule, isolation

Manages git worktrees for parallel development. Handles km's submodules, dependencies, and direnv automatically.

## Quick Reference

```bash
# Show status
bun worktree              # List worktrees with quick status

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

## When to Use Worktrees

Use worktrees when you need to:
- **Work on multiple features** without stashing
- **Test changes in isolation** from your main working directory
- **Compare implementations** side by side
- **Run long tests** while continuing development

## Worktree Locations

Worktrees are created at `../<repo>-<name>`:

```
/Users/beorn/Code/pim/
├── km/                    # Main worktree (main branch)
├── km-my-feature/         # Worktree for feat/my-feature
├── km-bugfix/             # Worktree for fix/cursor
└── km-infra/              # Worktree for feat/km-infra
```

## What Create Does

The `create` command handles all km-specific setup:

1. **Validates submodules** - Ensures all submodule commits are pushed (prevents clone failures)
2. **Creates worktree** - Uses `git worktree add`
3. **Clones submodules** - Each worktree gets independent submodule copies
4. **Installs dependencies** - Runs `bun install`
5. **Allows direnv** - Runs `direnv allow` if .envrc exists
6. **Installs hooks** - Runs `bun run prepare`

### Create Options

| Option | Description |
|--------|-------------|
| `--no-install` | Skip `bun install` |
| `--no-direnv` | Skip `direnv allow` |
| `--no-hooks` | Skip hook installation |

## Submodule Handling

**Critical**: Submodule commits must be pushed before creating a worktree.

If you see "Found unpushed submodule commits":

```bash
# Push all submodules
git submodule foreach "git push origin HEAD || true"

# Then retry
bun worktree create my-feature
```

Each worktree gets **independent submodule clones**, not symlinks. This means:
- Changes in one worktree's submodules don't affect others
- Each worktree can have different submodule states
- Submodules must be committed and pushed separately per worktree

## Remove Safeguards

The `remove` command protects against data loss:
- **Checks for uncommitted changes** in main repo
- **Checks submodules** for uncommitted changes
- **Requires --force** to remove dirty worktrees
- **Protects main/master** branches from deletion

## Common Issues

### "Found unpushed submodule commits"

Push your submodule changes first:

```bash
cd vendor/beorn-inkx
git push
cd ../..
bun worktree create my-feature
```

### "Worktree has uncommitted changes"

Either commit your changes or use `--force`:

```bash
# Option 1: Commit first
cd ../km-my-feature
git add . && git commit -m "WIP"
cd ../km
bun worktree remove my-feature

# Option 2: Force remove (loses uncommitted changes)
bun worktree remove my-feature --force
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
