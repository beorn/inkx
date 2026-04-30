---
description: "Checkpoint session context to a tracking bead. Ensures ONE bead captures all active work, recent commits, uncommitted changes, and next steps. Use before /compact, at natural breakpoints, or when context is getting long."
keywords: [checkpoint, compact, resume, context, bead]
argument-hint: "[message]"
---

# Checkpoint

**Keywords**: checkpoint, compact, resume, context, bead

Save session context to a single tracking bead so it survives compaction and can be recovered by the next session or post-compact continuation.

**Argument**: $ARGUMENTS

## What It Does

1. **Find or create ONE tracking bead** for this session
2. **Gather all context**: active beads, git status, recent commits, uncommitted changes
3. **Update the bead** with a structured checkpoint including next steps
4. **Report** the bead ID so the user (or post-compact) can recover with `km bd show <id>`

## Instructions

### Step 1: Find the tracking bead

Look for an existing in-progress bead that serves as the session's tracking bead. Prefer:
1. A bead the user explicitly mentioned as the tracking/epic bead
2. The most recently claimed in-progress bead by this session. In Claude Code,
   check `claimed_by` for `$CLAUDE_SESSION_ID`; in Codex, prefer the active bead
   named in the current task or recent session context.
3. If none exists, create one: `km bd create "Session checkpoint: <brief work summary>" --type task --priority P3`

There must be exactly ONE tracking bead. If multiple candidates exist, pick the one most relevant to the current work.

**IMPORTANT**: Claim the tracking bead so future session recovery can identify
the intended work item. Claude Code's pre-compact hook also depends on this:
```bash
km bd update <BEAD_ID> --claim
```

### Step 2: Gather context

Collect ALL of these:

```bash
# Active beads
km bd list --status=in_progress

# Git state
git status --short | head -20
git log --oneline -10
git branch --show-current

# Any open beads this session created or closed
km bd list --status=open | head -10
```

### Step 3: Build the checkpoint

Update the tracking bead with structured notes. The **first line MUST be the RESUME directive** — this is what post-compact Codex sees first:

```bash
km bd update <BEAD_ID> --notes="RESUME: km bd show <BEAD_ID>
After compact, run the command above FIRST. Do not list all beads or start new work.

## Session Checkpoint
**Session:** <session id if available; otherwise "codex">
**Branch:** <branch>
**Time:** <timestamp>

### What was done
<1-3 bullet summary of session work>

### Active beads
<list of in-progress beads with titles>

### Open beads (created this session)
<any new beads that need future work>

### Recent commits
<last 10 commits>

### Uncommitted changes
<git status>

### Next steps
<what should be picked up next — be specific>
<reference file paths, bead IDs, function names>

### Key context
<anything that would be lost in compaction — design decisions, failed approaches, gotchas>"
```

If the user provided an argument (message), include it as the primary "Next steps" content.

### Step 4: Report

Tell the user:
- Which bead was updated (ID + title)
- The exact command to recover: `km bd show <id>`
- That post-compact will automatically see the RESUME directive

## Multi-session awareness

Multiple sessions share the same repo. In Claude Code, the tracking bead is
identified by `claimed_by` matching that session's `CLAUDE_SESSION_ID`, and the
pre-compact hook searches for beads claimed by the current session. In Codex,
do not assume that hook or env var exists; make the bead reference explicit in
the checkpoint.

## Auto-trigger

In Claude Code, this skill may run automatically via the pre-compact hook when
the user types `/compact`. In Codex, invoke it manually with `/checkpoint` or
when context is getting long.

## Pairs with

- **`/merge`** — orthogonal axis. `/checkpoint` preserves narrative for *resume*; `/merge` integrates *work* back to main. They compose: `/checkpoint` before `/compact`, `/merge` before stopping the workday.
- **`/complete`** — different question. `/complete` audits whether the work is finished; `/checkpoint` saves the context whether or not it's finished.
- **`/discuss`** — `/discuss` checkpoints to the bead automatically when entering discussion mode; uses the same machinery.
- **`/recall`** — recovers checkpoint content in a future session via `bun recall "<bead-id>"` or `km bd show <bead-id>`.
