# Exploration End / Finish

Triggered by `/explore end`, `/explore finish`, or **proactively** when the conversation moves to non-exploration work.

## When to Proactively End

If the user starts working on something unrelated to the exploration (different feature, different package, design discussion, etc.) and there's an active exploration session bead, **proactively suggest ending**:

> "We have an active exploration session (km-session.XXX) with N bugs found. Want me to wrap it up? (`/explore end`)"

Don't let exploration sessions stay open indefinitely — they become stale context.

## End Protocol

### 1. Collect Results

```bash
# List all bugs created during this session
bd children <session-id>
# Or check notes for bug references
bd show <session-id>
```

### 2. Final Dashboard

Update the session bead description with the final status of every bug:

```bash
bd update <session-id> --description "<final dashboard table>"
```

### 3. Summary Stats

Print to user:

```
Exploration complete (km-session.XXX):
  Bugs found: N (M fixed, K open, J deferred)
  Tests added: N
  Commits: N
  Areas covered: [list]
  Duration: ~Xh
```

### 4. Rename Session

Ask the user to rename the session to something descriptive:

> "Please rename the session: `! bd update km-session.XXX --title 'Session: <descriptive name>'`"

(Claude can't rename via tribe — the user runs it directly.)

### 5. Retrospective

Analyze the session to improve future explorations:

**What worked well?**
- Which exploration patterns found the most bugs?
- Which agent roles were most productive?
- What invariant checks caught bugs automatically?

**What was missed?**
- Were there areas we didn't cover?
- Did any bugs require multiple rounds to find? Why?
- Were there false starts or wasted effort?

**Process improvements?**
- Should any new invariant checks be added?
- Should the explorer prompt be updated with new scenarios?
- Are there new bug patterns to add to the pattern library?
- Should the fixer /tdd → /why → /big protocol be adjusted?

Write improvements directly to the relevant skill files:
- `explore/team.md` — agent prompts, roles, flow
- `explore/SKILL.md` — decision tree, commands
- `explore/reporting.md` — dashboard format, close reasons

### 6. Close Session Bead

```bash
bd close <session-id> --reason "Explored <areas>. Found N bugs (M fixed, K open). Added N tests. Retro: <1-line improvement note>."
```

### 7. Sync Beads + Push

```bash
git add .beads && git commit -m "chore: sync beads — close exploration session <id>"
```
