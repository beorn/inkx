---
id: "@km/tribe/plugin-boundary-tightening"
aliases:
  - km-tribe.plugin-boundary-tightening
  - km-tribe-plugin-boundary-tightening
created_by: Bjørn Stabell
created_at: 2026-04-19T17:55:27Z
closed_at: 2026-04-20T18:46:26Z
close_reason: Dissolved. No plugins in the new model; observers are independent
  connectors per hub/km/design/tribe-matrix.md.
---

# [x] tribe: tighten plugin boundary — remove db/session-name leaks @km/tribe #feature #P3

blocks:: [[@km/tribe]]

Pro review 2026-04-19 P1.5: plugin boundary is narrower than before but still leaky.

Plugins no longer see the db or clients map directly, but they DO see:
- sessionName (mutable, can be renamed)
- claudeSessionId (identifying info)
- The ability to call api.broadcast() with any sender — no enforcement that sender matches plugin name
- Optional roster helpers that let plugins enumerate who's connected

Design: plugins get a fixed sender (their own pluginName); broadcasts automatically prefix with their ID; roster helpers return only counts + role kinds, not names/ids/PIDs. Plugin can write events but cannot impersonate a session.

Effort: ~0.5 day. All 5 plugins need light updates.