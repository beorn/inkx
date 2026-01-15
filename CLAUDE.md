# Agent Instructions

## Architectural Rules (MUST FOLLOW)

Before writing ANY code, you MUST understand and follow these rules. See [specs/README.md](specs/README.md) for full details.

### 1. Clear Layering

```
UI Layer (km-cli)     → Query Layer (km-store)
                      → Model Layer (km-store, km-core)
                      → Sync Layer (km-watch)
                      → Parser Layer (km-markdown)
                      → Filesystem (markdown files)
```

- Each layer only calls the layer directly below it
- UI never touches filesystem directly
- Model changes MUST propagate to filesystem (bidirectional)

### 2. Bidirectional Sync

ALL task edits MUST flow both directions:

- TUI edit → Model → File
- File edit → Model → TUI re-render

### 4. TUI Design System

When modifying TUI styling (colors, selection states, visual hierarchy), you MUST consult [specs/km-design-system.md](specs/km-design-system.md). Key rules:

- **Selection**: `cyan` background + `black` foreground (NEVER blue/white)
- **Reserved colors**: `cyan` bg = selection only, `inverse` = input cursor only
- **Headers**: `yellow` (selected) / `yellowBright` + dim (unselected)
- **Status icons**: Use both color AND shape (colorblind-safe)

### 5. Test-Driven Development

**BEFORE committing any code changes:**

```bash
bun fix              # MUST pass - auto-fix lint + format
bun test             # MUST pass - all 351+ tests
```

**When implementing features:**

1. Write acceptance test first (should fail)
2. Implement feature
3. Test passes
4. `bun fix` passes
5. Commit

---

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- bv-agent-instructions-v1 -->

---

## Beads Workflow Integration

This project uses [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) for issue tracking. Issues are stored in `.beads/` and tracked in git.

### Essential Commands

```bash
# View issues (launches TUI - avoid in automated sessions)
bv

# CLI commands for agents (use these instead)
bd ready              # Show issues ready to work (no blockers)
bd list --status=open # All open issues
bd show <id>          # Full issue details with dependencies
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id> --reason="Completed"
bd close <id1> <id2>  # Close multiple issues at once
bd sync               # Commit and push changes
```

### Workflow Pattern

1. **Start**: Run `bd ready` to find actionable work
2. **Claim**: Use `bd update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `bd close <id>`
5. **Sync**: Always run `bd sync` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `bd ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers, not words)
- **Types**: task, bug, feature, epic, question, docs
- **Blocking**: `bd dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status              # Check what changed
git add <files>         # Stage code changes
bd sync                 # Commit beads changes
git commit -m "..."     # Commit code
bd sync                 # Commit any new beads changes
git push                # Push to remote
```

### Best Practices

- Check `bd ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `bd create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always `bd sync` before ending session

<!-- end-bv-agent-instructions -->

## Visual Testing

**Default: Use headless methods** (ttyd + Playwright) for TUI/CLI visual testing. These run in the background without taking over the user's screen.

```bash
# Start TUI in headless terminal
pkill -f ttyd 2>/dev/null || true
ttyd -W -p 7681 bun km view -r /tmp/test-vault @next.md &
sleep 3

# Capture with Playwright (HEADLESS=true prevents browser window)
HEADLESS=true bun x playwright screenshot --viewport-size=1400,900 http://localhost:7681 /tmp/tui.png

# View the screenshot
# Use Read tool on /tmp/tui.png
```

See `.claude/skills/visual-test.md` for full documentation.

**Desktop capture (Peekaboo)**: Only use when the user EXPLICITLY asks you to check their Ghostty window or desktop. Do NOT use Peekaboo for general visual testing - it takes over the user's screen.
