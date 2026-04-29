---
id: "@km/silvery/profile-immutable"
aliases:
  - km-silvery.profile-immutable
  - km-silvery-profile-immutable
created_by: claude:c6244087
created_at: 2026-04-23T10:24:05Z
closed_at: 2026-04-23T10:48:20Z
close_reason: done in silvery 5c0df5f4 + km 4a2ccbfb4. Readonly<TerminalProfile>
  + dev Object.freeze. 5 invariant tests (colorTier===caps.colorLevel, mutation
  throws TypeError). Tests pass.
---

# [x] Readonly<TerminalProfile> + dev-freeze + invariant test @km/silvery #task #P2 @claude:c6244087

blocks:: [[@km/silvery]]

Per /pro review. Make TerminalProfile Readonly. Freeze in dev builds. Invariant test: profile.colorTier === profile.caps.colorLevel. Prevents silent mutation of the single source of truth.