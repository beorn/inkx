---
mentions:
  - km
id: "@km/tribe/session-identity"
aliases:
  - km-tribe.session-identity
  - km-tribe-session-identity
created_by: Bjørn Stabell
created_at: 2026-04-19T04:28:46Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.session-identity
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T21:28:46Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [ ] tribe: stable session identity across Claude Code restarts @km/tribe #feature #P3

blocks:: [[@km/tribe]]

Session reconnect recovery currently relies on ORDER BY updated_at DESC lookups by (claude_session_id, pid). After restarting Claude Code, a new session id + new PID means cursor recovery falls back to skip-to-latest. Name and role also start fresh (member-N). Design: handshake carries a stable identity token derived from (hashed-claude-creds, project, role-hint); daemon maps token → durable sessionId that survives restart. Piggyback on existing sessions table. Scope: handler opt-in with fallback to current behavior. Depends on: none. Part of the plateau follow-up trio (1.5/1.6/1.7).

