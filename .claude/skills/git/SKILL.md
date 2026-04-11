---
description: Git operations — commits and worktrees. For releases, use /release.
argument-hint: [commit]
allowed-tools: Bash, Read, Write, Glob, Skill, AskUserQuestion
---

# Git Operations

**Keywords**: commit, git, push, worktree

Commit changes and manage worktrees. For releases, use `/release`.

## Quick Commands

| Action             | Command                       |
| ------------------ | ----------------------------- |
| Commit all changes | `/commit`                     |
| Create release     | `/release [vendor/pkg] [patch\|minor\|major]` |
| Merge worktree     | `bun worktree merge <name>`   |

## Commit Rules

- **Atomic**: One logical commit (even across packages)
- **Beads first**: `bd dolt push` after commit to sync beads
- **Conventional commits**: `type(scope): message`

## Sub-Skills

| File                       | Purpose                                |
| -------------------------- | -------------------------------------- |
| [/commit](../commit/SKILL.md) | Multi-repo commit workflow, submodules |
| [/release](../release/SKILL.md) | Release packages (version, changelog, npm publish) |
| [worktree.md](worktree.md) | Parallel development with worktrees    |

## Conventional Commit Types

| Type       | Use                          |
| ---------- | ---------------------------- |
| `feat`     | New feature                  |
| `fix`      | Bug fix                      |
| `refactor` | Code change (no feature/fix) |
| `docs`     | Documentation                |
| `test`     | Adding tests                 |
| `chore`    | Maintenance                  |
