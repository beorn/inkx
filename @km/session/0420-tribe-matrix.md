---
id: "@km/session/0420-tribe-matrix"
aliases:
  - km-session.0420-tribe-matrix
  - km-session-0420-tribe-matrix
created_by: claude:18c72b43
created_at: 2026-04-20T18:48:12Z
closed_at: 2026-04-26T06:24:20Z
close_reason: Session complete — tribe matrix design simplified and documented
---

# [x] Session 2026-04-20: tribe design simplified to matrix-connector + km primitives @km/session #task #P2 @claude:18c72b43

blocks:: [[@km/all]]

## Session checkpoint — ready for a new session to take over

This session iteratively simplified the tribe design across ~12 hours. The final shape is captured in two docs; bead + code cleanup is done.

## Where things landed

**Final design**: hub/km/design/tribe-matrix.md (~450 lines, just rewritten)

Core model (Twitter-shaped):
- Every author (user, agent) has a daily log: users/@bjorn/<date>/, agents/@silvery-refactor/<date>/
- Entries are KNodes with plain markdown content + ts frontmatter
- Sigils in content (#channel, @user) route via save-time transclusion
- Replies are tree children of parent entries
- Rooms = nodes with type: chatlog + remote: matrix:... URI
- Personas = agents/<name>.md with matrix_id: frontmatter
- Role leases = @km/beads tasks with assigned_to + due_at
- Title @mention = assignment (@km/beads already does this); body @mention = notification only
- Name = short_id = identity (no separate short_id field)
- Journal + chat unify: private entries have no sigils/transclusions

**Vision doc**: hub/km/design/vision.md — three-axis framing (Knowledge / Communication / Agents), updated

**Roadmap**: docs/roadmap.md — holistic 5-track view with P2 near-term sequencing

## What retires when connector-matrix ships

- @bearly/tribe daemon (8300 LOC)
- bearly tribe-related skills/vendored code
- hub/bearly/design/tribe-*.md files (old custom-wire designs)

## Beads closed this session

- @km/tribe/minimal-protocol (superseded)
- @km/tribe/stable-identity (dissolved — names are stable ids)
- @km/tribe/daemon-authority (dissolved — no daemon)
- @km/tribe/scope-model (dissolved — tree placement + remote: URI)
- @km/tribe/role-register-cleanup (dissolved — role = task)
- @km/tribe/plugin-boundary-tightening (dissolved — connectors, not plugins)
- @km/tribe/polish-v2 (most dissolved)
- @km/infra/namespaces (dissolved — name IS the identifier)
- @km/tribe/delivery-correctness (shipped this morning as bearly a12dc91 + afb35e7)

## Beads filed

- @km/all/connector-matrix (P3) — the actual build work, three phases
- @km/tui/backlog-view (P3) — ordered-tree render with prominent names
- @km/infra/facet-system (P3, deferred indefinitely) — only needed when 2-3 new facet types accumulate

## Open items for next session

### Immediate doc cleanup (not yet done)

1. Mark hub/bearly/design/tribe-*.md as superseded (add header pointing at hub/km/design/tribe-matrix.md)
2. Update docs/roadmap.md references: strike out namespaces/facet-system from near-term plan; point to connector-matrix
3. Update docs/future/agents.md if it mentions old tribe concepts
4. Update docs/future/services.md to reference Matrix as a planned connector

### Immediate near-term (per P2 sequencing)

1. Continue W3 omnibox finish (@km/tui/omnibox-dialog) — active top of backlog
2. @km/infra/bd-v1-compat Phase 1 — bd write path persistence (in-progress)

### Medium-term

3. @km/all/connector-matrix Phase 0 — after bd-v1-compat lands

## Commits this session

Pushed main branch commits (chronological):
- a12dc91 (bearly): fix(tribe) P0 message loss + poll-era cleanup
- afb35e7 (bearly): chore(tribe) poll-era cleanup migration
- eb2814608 (km): chore(bearly) bump
- bfb02672e (km): design(tribe) minimal-protocol v1 spike
- 242d5b52d (km): design(tribe) revise v2 per pro review
- 19b00740d (km): design(tribe) delivery simplified
- 134b6224d (km): design(tribe) chief-is-LLM clarification
- 68bc16fb3 (km): design(km) tribe-matrix DR adapter layer
- c08a4b706 (km): design(km) vision doc + tribe-matrix DR arch fixes
- 168b9c2be (km): design(km) vision — arch auto-fixes
- 280361e6c (km): design(km) namespaces unifying primitive
- 67cd72c16 (km): docs(roadmap) holistic 5-track roadmap
- 83e2b5ffd (km): design(km) facets — rooms as node-facet
- 49b5792b3 (km): design(km) simplify tribe — reuse km primitives (Twitter-shaped)
- 64ca48788 (km): design(km) clarify sigil semantics

## Open design questions for future consideration

- When DM vs room vs inbox is most natural (convention emerges from use)
- Whether bearly-tribe's delivery-correctness fix is reusable in connector-matrix (probably yes)
- E2E encryption decision (defer until sharing with collaborator)
- Multi-homeserver federation UX (defer until multi-human collaboration)

## Research trail (still in /tmp/)

- /tmp/pro-review-*.txt — pro review v1/v2 of tribe-minimal spec
- /tmp/tribe-prior-art-*.txt — multi-agent coordination prior art surveys
- /tmp/xmpp-research-*.txt — XMPP vs Matrix deep research
- /tmp/pro/tribe-full-plan-review.md — final pro review context + response