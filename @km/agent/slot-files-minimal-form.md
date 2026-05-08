---
aliases:
  - km-agent.slot-files-minimal-form
  - km-agent-slot-files-minimal-form
created_at: 2026-05-08T19:27:26.929Z
closed_at: 2026-05-08T20:55:08.731Z
closeReason: "shipped d7402a634 on origin/main. All 10 @agent/N.md normalized to
  single-line H1 (km.add:: . km.default:: true; no type:task, no frontmatter, no
  persona, no working agreement, no H2 phase headings). @agent.md parent epic
  also stripped (dropped id/mentions/created_at frontmatter; queue-only model in
  prose; bare wikilinks in slot list).
  .claude/skills/{claim,do,worktree}/SKILL.md synced to canonical .agents
  versions; .agents/skills/beads/SKILL.md synced from .claude (had the
  queue-only subsection). Persona-self-relabel rule (§ 4½) removed. wc -l
  @agent/*.md → all 1 line. Slot/hat used interchangeably per user."
---

# [x] @agent/N slot files: minimal queue-only form (drop frontmatter + persona + working agreement) #P2

The @agent/0..9.md slot files should be **queue-only**: the H1 rule and any
materialized top-level `![[<bead>]]` queue embeds, nothing else. The current state
(rich Persona / Working agreement / scope_fit / model / harness frontmatter)
reflects an earlier philosophy where the slot was a contract; the user
clarified during groom 2026-05-08 that slots are ad-hoc — the claiming agent
brings their own working context, and the slot is just a queue holder.

## Acceptance

For each `@agent/N.md` (N = 0..9):

- [ ] Frontmatter: deleted (path-form is canonical id; no other fields are
      load-bearing for queue-only slots)
- [ ] Body: `# @agent/N km.add:: type:task . km.default:: true` (with `[/]`
      checkbox marker if currently wip), followed by materialized
      top-level `![[<bead>]]` embeds only
- [ ] No `## Persona`, no `## Working agreement`, no `## Queue` heading
      (the embeds are self-explanatory)
- [ ] No HTML comments, no descriptive prose, no `(open slot)` placeholders
- [ ] `km bd show @agent/N` still resolves and reports correct status
- [ ] `km bd children @agent/<parent>` still works correctly
- [ ] Sync materialization (the queue embeds) still works correctly

## Blocked-by

- `@km/storage/fs-writer-stale-hash-revert` (P0) — until the fs-writer stops
  reverting unrelated edits, every Write to slot files gets undone the next
  time any `km bd update` runs in the session. Cannot reliably land minimal
  slot files until that ships.

## Related cleanups (do alongside)

- `.claude/skills/claim/SKILL.md § 4½` — "Persona-self-relabel" rule. With
  queue-only slots there's no persona to relabel, so § 4½ is dead text. Remove.
- `.claude/skills/claim/SKILL.md § 2` — "Read the persona body" step. With
  no persona body, simplify to "the slot file is the queue; no envelope to
  load."
- `@agent.md` parent epic — describes the OLD slot model ("Frontmatter — model,
  harness, scope_fit", "Body — system-prompt content injected as session
  context (`<persona>...</persona>`)"). Update to "queue-only slot holder".
- `~/.config/claude-profiles/d@delei.org/.../memory/feedback-persona-self-relabel.md`
  — retract or revise; the rule no longer applies.

## Why this matters

Slot files were over-engineered. Pre-defining a persona for each slot
constrained ad-hoc claiming, forced agents to either follow a stale persona
or rewrite it on claim. Queue-only is the simpler, more honest model: the
slot is a parking spot for beads; whoever picks it up brings their own
working context. The claim is the lease; the file is the queue.

## Steering doc update

Also update steering docs (CLAUDE.md sections, beads SKILL.md) to make the
"don't add unnecessary frontmatter" rule more prominent, so future bead
creations don't reintroduce the cruft. The rule already exists ("Path-form ==
canonical id == wikilink target. Do not add redundant `id:` frontmatter when
the path already carries the id.") but isn't being followed in practice.

## Origin

Surfaced during groom 2026-05-08 in /plat agent-dispatch lens P1. User
redirected slot philosophy four times during the session ("not too rich" →
"no comments" → "drop frontmatter" → "mostly delete frontmatter"); the
fs-writer bug (P0 above) prevented the cleanup from landing in that session.

