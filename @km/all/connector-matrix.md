---
id: "@km/all/connector-matrix"
aliases:
  - km-all.connector-matrix
  - km-all-connector-matrix
created_by: claude:18c72b43
created_at: 2026-04-20T18:47:14Z
---

# [ ] @km/connector-matrix — Matrix homeserver sync @km/all #feature #P3

blocks:: [[@km/all]]

New connector package following the CalDAV/CardDAV pattern. Syncs Matrix rooms bidirectionally into km vault nodes as chatlogs.

## Design reference

See hub/km/design/tribe-matrix.md (the DR). Under the simplified model:

- A room = KNode with type: chatlog + remote: matrix:... URI
- Messages = transclusions pointing at author daily-log entries
- Personas = nodes in agents/ with matrix_id: frontmatter
- Role leases = @km/beads tasks (assigned_to + due_at)
- Sigil routing (#channel, @user) = save-time transclusion action

## Phase 0 — Scaffolding (4-5d)

- km matrix init: install homeserver (Synapse default, Conduit opt-in), write connector config
- @km/connector-matrix package skeleton using matrix-js-sdk
- Network modes chosen at init: local / tailscale / public-TLS
- Create one chatlog node with remote: matrix:... and verify it syncs to a real Matrix room
- Element connects and reads the room

## Phase 1 — Full sync + personas (1-2w)

- Inbound: write each Matrix event as a source entry under users/@sender/<date>/...
- Outbound: watch vault for new entries in subscribed chatlogs; publish
- Persona nodes (agents/<name>.md with matrix_id:) login at session start
- Role lease pattern (task with assigned_to + due_at) + heartbeat
- Save-time sigil → transclusion (extends km parser)
- Reply-via-tree-children handling

## Phase 2 — Polish (1w)

- Durable (com/rooms/) vs ephemeral (com/chats/) directory convention
- DMs (1:1 rooms resolved via @person sigil)
- Chatlog view type in silvery
- Bead linking in chat (existing wikilink + @mention semantics)

## Phase 3+ — Deferred

- E2E encryption
- Matrix federation (multi-human collaboration)
- Other connectors (git, github, health as standalone packages)

## What retires when this ships Phase 1

- @bearly/tribe daemon (8300 LOC)
- bearly tribe-related skills
- Old hub/bearly/design/tribe-*.md artifacts (already superseded)

## Prerequisites

- @km/infra/bd-v1-compat Phase 1 (bd write path persistence)
- @km/tui/omnibox-dialog (W3 omnibox finish — per roadmap P2 sequencing)
- No blockers beyond that.

## Budget

~3 weeks total end-to-end for Phases 0-2. ~1000-1500 LOC in @km/connector-matrix plus minor @km/tui rendering work.