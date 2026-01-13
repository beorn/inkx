# km Roadmap

High-level implementation phases.

**Beads are the source of truth** for individual tasks. This roadmap provides:
- Phase groupings and dependencies
- Over-engineering warnings
- Quick reference of bead IDs

**When to update each:**
| What | When | How |
|------|------|-----|
| Beads | Every task change | `bd create/update/close` |
| ROADMAP.md | Major scope changes | Add/remove phases, cut features |

```bash
bd ready              # Find actionable work
bd show <id>          # View task details + acceptance test
```

---

## Over-Engineering Warnings

| Feature | Risk | Alternative |
|---------|------|-------------|
| Transclusions (![[path]]) | Complex embedding | Just use wikilinks |
| Socket IPC for daemon | Complexity | Direct DB access (beads pattern) |
| Query language parser | Overkill | CLI flags first (--status, --due) |
| TUI drag-and-drop | Terminal flaky | Keyboard commands |
| Auto-start daemon | Magic behavior | Explicit `km daemon start` |

**Cuts made:**
- km-fat (transclusions) — Removed
- km-5q8 (HTML comment attrs) — Removed, use frontmatter
- km-fru (board add= rule) — Deferred, depends on HTML attrs

**Code to refactor:**
- `tasks.ts` (908 lines) — Extract formatting to @km/shared

---

## Phases

```
Phase 1: Parser          Phase 2: Query         Phase 3: TUI
├── km-c9x refs          ├── km-qft syntax      ├── km-0ps detail pane
├── km-1ar fields        ├── km-539 dates       ├── km-oox project picker
└── km-bjm sections      └── km-jow search      └── km-uhy columns
        │                        │
        └────────────────────────┘
                    │
Phase 4: CLI             Phase 5: Sync          Phase 6: Daemon
├── km-3lx new           ├── km-yh2 writes      └── km-bil lifecycle
├── km-sh9 done          └── km-cf2 watch
└── km-zr8 gtd                   │
                                 │
Phase 7: Automation      Phase 8: Polish        Phase 9: Future
├── Board sync rules     ├── km-abc move bug    ├── km-xns connectors
└── Recurring tasks      └── Test coverage      ├── km-fno drag-select
                                                └── km-jya drag-drop
```

---

## Dependency Graph

```
km-c9x (refs) ──┬──→ km-qft (query syntax)
km-1ar (fields)─┘         │
        │                 ├──→ km-539 (date shortcuts)
        │                 │
km-bjm (sections)         └──→ km-0ps (detail pane)
        │
        └──→ km-yh2 (bidirectional sync)
                    │
                    └──→ km-bil (daemon)
                              │
                              └──→ Automation (board sync, recurring)
```

Start with **Phase 1 parser** — it unblocks everything else.
