---
id: "@km/termless/update-cmd"
aliases:
  - km-termless.update-cmd
  - km-termless-update-cmd
created_by: claude:4929065a
created_at: 2026-03-23T00:57:43Z
closed_at: 2026-03-23T05:35:56Z
close_reason: "Implemented: bun cli update checks npm/crates.io/github for newer
  upstream versions. --apply to write backends.json."
owner: bjorn@stabell.org
---

# [x] CLI: termless update — check upstream versions + update backends @km/termless #feature #P2

bunx termless update: queries npm/crates.io for latest upstream versions, updates backends.json, reinstalls changed backends. --check flag for dry run. Does NOT run census — that's separate. Replaces current 'upgrade' command.