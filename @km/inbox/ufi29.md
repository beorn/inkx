---
id: "@km/inbox/ufi29"
aliases:
  - km-ufi29
  - "@km/_orphan/ufi29"
created_by: claude:148be06c
created_at: 2026-03-21T00:58:17Z
closed_at: 2026-03-21T01:03:36Z
close_reason: Created /release skill with vendor package support, bead
  integration, changelog generation
owner: bjorn@stabell.org
---

# [x] Release skill: bead-integrated changelog + vendor publish @km/_orphan #feature #P2

Extract /git release into standalone /release skill. Support km root and vendor submodule packages. Generate changelogs from git log + closed beads. Detect changed packages, publish in dependency order. Track bead→release mapping.