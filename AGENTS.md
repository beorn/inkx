# Agent Instructions (opencode)

This project uses **bd** (beads v1.0.0) for issue tracking.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
bd dolt push          # Push beads to remote
```

## Session Workflow

1. **Find work**: `bd ready` or check open beads
2. **Claim before coding**: `bd update <id> --claim`
3. **Recall context**: `bun recall "<bead-id>"` or `bun recall "<keywords>"`
4. **Implement**: Do the work
5. **Complete**: Run `bun fix && bun run test:all` then `bd close <id>`

## Comprehensive Documentation

For full technical documentation (architecture, commands, principles), see [CLAUDE.md](./CLAUDE.md).

This file contains opencode-specific guidance. Claude Code users should refer to `CLAUDE.md` for the complete experience.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

1. **File issues for remaining work** — create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) — `bun fix && bun run test:all`
3. **Update issue status** — close finished work, update in-progress items
4. **Push** — this is mandatory:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Verify** — all changes committed AND pushed
6. **Hand off** — provide context for next session

**Rules:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing — that leaves work stranded locally
- If push fails, resolve and retry until it succeeds

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
<!-- Beads integration managed by `bd setup claude`. Do not remove markers. -->
<!-- END BEADS INTEGRATION -->
