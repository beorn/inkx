# Explore Invariants

Invariant-driven TTY exploration: catch bugs automatically instead of relying
on visual inspection.

Today, `/explore` sessions find bugs by accident — the agent presses nav keys
on an empty card, notices corruption in the screenshot, files a bead. This
module makes that loop mechanical: every action is wrapped with invariant
checks that flag violations immediately.

## Layers

This is a **TTY-level** invariant layer. It operates on the rendered screen
text and on-disk vault state. It is deliberately separate from
`src/invariants.ts`, which checks the live app's internal state (tree, cursor,
selection) via `OpCtx`. Use:

- `src/invariants.ts` — inside the app, after every `dispatchAction`,
  against `OpCtx`. Throws on violation (programming error).
- `src/explore/invariants.ts` — outside the app, after every TTY/driver
  action, against `ExploreState`. Returns violations (a diagnostic, not a
  crash).

## What it checks

| Invariant                   | Severity | What it catches                                                                 |
| --------------------------- | -------- | ------------------------------------------------------------------------------- |
| `no-internal-ids`           | P1       | 8-char hex/alphanum IDs in parens leaking into rendered text, e.g. `(XWJE24KP)` |
| `no-object-object`          | P1       | `[object Object]` — a value rendered without a proper toString                  |
| `no-nan`                    | P1       | `NaN` (word-boundary match) — numeric computation produced an invalid value     |
| `no-typeerror`              | P0       | `TypeError` in rendered text — runtime error escaped into UI                    |
| `vault-unchanged-by-nav`    | P0       | Vault file md5 changed after a pure navigation action                           |
| `cursor-on-visible-node`    | P1       | Cursor points at a node not among the currently visible ones                    |
| `breadcrumb-matches-cursor` | P2       | Top-of-screen breadcrumb is inconsistent with the cursor's path                 |

`vault-unchanged-by-nav` is a _nav-only_ invariant — the runner skips it when
`isMutation: true`, because mutations are expected to change files.

## API

```typescript
import {
  allInvariants,
  alwaysInvariants,
  navOnlyInvariants,
  runAll,
  type ExploreState,
  type ExploreInvariant,
  type InvariantViolation,
} from "@km/tui/explore/invariants"
import { createExploreRunner, hashVault, withInvariants } from "@km/tui/explore/runner"
```

### `ExploreState`

```typescript
interface ExploreState {
  vaultPath: string
  vaultMd5: Map<string, string> // rel path → md5 hex
  rendered: string // ANSI-stripped screen text
  cursor: {
    nodeId: string | null
    visibleNodeIds?: Set<string> // optional
    path?: string[] | null // optional breadcrumb
  }
}
```

Callers assemble this from whatever tools they have — `mcp__tty__screenshot`
plus `hashVault(...)` plus `driver.getState().selectedNodeId` is a common
combination. Optional fields can be omitted; invariants that need them are
skipped when data is missing.

### `createExploreRunner(options)`

Creates a reusable runner that takes before/after snapshots around each
action and runs the configured invariants. Typical usage in a TTY session:

```typescript
import { createExploreRunner, hashVault } from "@km/tui/explore/runner"
import { alwaysInvariants, navOnlyInvariants } from "@km/tui/explore/invariants"

const vaultPath = "/tmp/tst-vault"
const runner = createExploreRunner({
  vaultPath,
  async snapshot() {
    return {
      vaultPath,
      vaultMd5: hashVault(vaultPath),
      rendered: await tty.screenshot(), // plain text from mcp__tty__screenshot
      cursor: { nodeId: driver.getState().selectedNodeId },
    }
  },
  onViolation(v, label) {
    console.error(`[${v.severity}] ${v.invariant} (${label}): ${v.details}`)
  },
})

// Pure navigation — all invariants including vault-unchanged-by-nav
await runner.run(() => tty.press("j"), { isMutation: false, label: "j" })
await runner.run(() => tty.press("k"), { isMutation: false, label: "k" })

// A mutation — skips nav-only invariants
await runner.run(() => tty.press("Enter"), { isMutation: true, label: "Enter" })
```

### `withInvariants(before, action, snapshot, isMutation)`

One-shot helper for quick scripts that don't want a runner. Requires an
externally-captured `before` state and a `snapshot` function; returns
`{ result, after, violations }`.

### `hashVault(vaultPath, options?)`

Walks the vault and returns `Map<relPath, md5hex>`. By default it only hashes
`.md` / `.markdown` files and skips `.km`, `.git`, `node_modules`. Override
with `{ extensions, skipDirs }`.

### `runAll(state, invariants, before?)`

Low-level: run a list of invariants over one snapshot (optionally with a
`before` for diff checks). Returns all violations in order.

## Extending

Adding a new invariant:

1. Implement `ExploreInvariant` in `invariants.ts`:
   ```typescript
   export const noFooBar: ExploreInvariant = {
     name: "no-foo-bar",
     description: "...",
     severity: "P1",
     check(state, before) {
       if (!state.rendered.includes("foo bar")) return null
       return { invariant: "no-foo-bar", severity: "P1", details: "..." }
     },
   }
   ```
2. Add to `alwaysInvariants` (runs on every action) or `navOnlyInvariants`
   (skipped on mutations).
3. Add a row to the table above.
4. Add a passing/failing test pair in `apps/km-tui/tests/explore-invariants.test.ts`.

## Related

- `apps/km-tui/src/invariants.ts` — state-level runtime invariants (throws)
- `apps/km-tui/tests/helpers/fuzz-invariants.ts` — fuzz-test invariants (vitest expect)
- `.claude/skills/explore/` — exploration session workflow
- Bead `km-tui.explore-automation` — the tracking bead for this feature
