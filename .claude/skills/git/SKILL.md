---
description: Git operations and releases. Use when committing changes or creating GitHub releases.
argument-hint: [commit|release]
allowed-tools: Bash, Read, Write, Glob, Skill, AskUserQuestion
---

# Git Operations

**Keywords**: commit, release, git, push, tag, version

Commit changes and create releases.

## Quick Commands

| Action             | Command        |
| ------------------ | -------------- |
| Commit all changes | `/git commit`  |
| Create release     | `/git release` |

## Commit Rules

- **Atomic**: One logical commit (even across packages)
- **Beads first**: `bd sync` runs automatically before commit
- **Co-author**: Include Claude attribution
- **Conventional commits**: `type(scope): message`

## Release Workflow

1. Uncommitted changes? Auto-commits
2. Must be on `main` branch
3. Tests pass
4. Preview dry-run
5. Confirm version type (patch/minor/major)
6. Execute + verify

## Sub-Skills

| File                     | Purpose                                |
| ------------------------ | -------------------------------------- |
| [commit.md](commit.md)   | Multi-repo commit workflow, submodules |
| [release.md](release.md) | GitHub release process, versioning     |

## Conventional Commit Types

| Type       | Use                          |
| ---------- | ---------------------------- |
| `feat`     | New feature                  |
| `fix`      | Bug fix                      |
| `refactor` | Code change (no feature/fix) |
| `docs`     | Documentation                |
| `test`     | Adding tests                 |
| `chore`    | Maintenance                  |
