---
mentions:
  - km
id: "@km/inbox/inf2"
aliases:
  - km-inf2
  - "@km/_orphan/inf2"
created_at: 2026-01-22T16:02:12Z
closed_at: 2026-01-23T14:42:20Z
---

# [x] Flatten km-tui: merge packages/km-ink into apps/km-tui @km/_orphan #task #P2

## Current Structure

```
apps/km-tui/                    # @km/tui-app - just re-exports @km/ink
  packages/km-ink/              # @km/ink - all the actual code
```

The wrapper `@km/tui-app` does nothing but `export * from "@km/ink"`. The CLI imports `@km/ink` directly anyway.

## Plan

1. Move all code from `packages/km-ink/` up to `apps/km-tui/`
2. Rename the package from `@km/ink` to `@km/tui`
3. Update the 3 import sites in `apps/km-cli/` (`view.ts`, `show.ts`, `list.ts`)
4. Delete the empty `packages/` dir

## Result

- `apps/km-tui/` → `@km/tui` (clean, flat)
- Consistent with `apps/km-cli/` → `@km/cli`

