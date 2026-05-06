---
id: "@km/session/0430-bead-plateau"
aliases:
  - km-session.0430-bead-plateau
  - km-session-0430-bead-plateau
created_at: 2026-04-30T07:34:04.730Z
type: task
priority: P2
---

# Session: bead identity plateau — Bead/Task interfaces + L4 + L5 + name-is-identity

## Tracking bead for the 2026-04-30 plateau push

Single index for all work in this session pushing the bead architecture toward L5.

### Shipped to origin/main

| SHA                   | What                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------- |
| a11be57b1             | scope bd list to configured boardRoots (read-side fix; closed km-beads.identity-by-structure) |
| 5c6553f8d             | introduce Bead + Task domain interfaces (legacy aliases retained)                             |
| c0c0e3ee3             | migrate km-cli to Bead/Task namespaces                                                        |
| 66f4fa18e             | docs: Bead+Task in Domain Object Inventory                                                    |
| efbd8463a             | /pm groom skill update (km bd switchover, Inbox triage)                                       |
| 520195e1c             | inbox frontmatter rewrite — @km/_orphan/<slug> → @km/inbox/<slug> (1059 files)                |
| 89a453c14             | migrate inline km-parent-id-leaf-materializes-inline to standalone file                       |
| 62a7d76e0 + b5cd1c6cc | Bead.create materializes file at @<prefix>/<scope>/<leaf>.md (P2 fix)                         |
| 46bf3552e             | L4: drop legacy Issue/displayId/nodeToIssue aliases (33 files)                                |
| 2bdab7fb6             | regression test: bd close ↔ bd show resolver symmetry                                         |
| 104b6da5a             | L5 property tests: 4 invariants, 11 tests, fast-check                                         |

### Closed beads

- `km-bead-domain-interface` (P1) — umbrella for namespace + L4
- `km-path-is-the-name` (P1) — display = sigil-rooted path
- `km-beads.identity-by-structure` (P0) — read-side scoping
- `km-wt1`, `km-wt3`, `km-wt6`, `km-wt9` — slot leases
- 4 stale-WIP grooming closures

### Open / in-flight

- `@km/beads/name-is-identity` (P1) — persistence-model cleanup (eliminate duplicate identity fields). Multi-session, /refactor migrate scope. Arch verification in progress.
- `@km/beads/parent-id-leaf-materializes-inline` (P2) — file-mat fix shipped, bead state stuck (resolver lookup quirk).
- `@km/beads/close-resolver-asymmetric` (P2) — already fixed at 51bb1b423 + 46bf3552e + 2bdab7fb6 regression test; ready to close pending bead-state propagation.
- `@km/beads/bead-domain-interface` (P1) — closed today; supersedes most cited beads.

### Plateau scorecard

| Surface                              | Level reached today | Where left                                      |
| ------------------------------------ | ------------------- | ----------------------------------------------- |
| Bead.from(node) → Bead \| null       | L4                  | type-enforced                                   |
| Bead.displayId (sigil-path, no ULID) | L3 → L4             | aliases dropped                                 |
| Bead.create (file-materializes)      | L1 → L4             | tests pin                                       |
| Task namespace (in @km/storage)      | L3                  | callback-based km-beads boundary                |
| Property tests + regression guard    | L5                  | shipped                                         |
| Persistence-model duplication        | L1                  | covered by @km/beads/name-is-identity follow-up |

### Files / metrics

- 11 commits to origin/main today
- ~50 source files touched (L4 + Bead/Task namespace + Bead.create fix)
- 1059 inbox frontmatter rewrites (data migration)
- 12 + 13 + 11 = 36 new tests added (Bead.create + resolver-symmetry + property tests)
- 0 net new TS errors

