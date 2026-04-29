---
id: "@km/rev-0129/2-refactor-command-registry-to-use-injection"
aliases:
  - km-rev-0129.2
  - km-rev-0129-2
  - "@km/rev-0129/2"
created_at: 2026-01-29T16:36:05Z
closed_at: 2026-01-29T18:09:24Z
---

# [x] Refactor command registry to use injection @km/rev-0129 #task #P2 @claude:298008b9

packages/@km/_orphan/commands/src/registry.ts:3 uses module-level Map:
const commands = new Map<string, CommandDef>()

This breaks test isolation. Convert to factory pattern with explicit injection. Make code more composable.