# km Roadmap

Implementation plan. Beads (`bd ready`) track individual tasks.

---

## Phases

```
Phase 1: Parser          Phase 2: Query         Phase 3: TUI
├── Inline refs          ├── Query syntax       ├── Detail pane
├── Inline fields        ├── Date shortcuts     ├── Project picker
└── Section tree         └── Search phrases     └── Column display

Phase 4: CLI             Phase 5: Sync          Phase 6: Daemon
├── Quick capture        ├── Write to files     └── Lifecycle
├── Mark done            └── Watch mode
└── GTD bootstrap

Phase 7: Automation      Phase 8: Polish        Phase 9: Future
├── Board sync rules     └── Bug fixes          ├── Connectors
└── Recurring tasks                             └── Drag-drop
```

---

## Dependencies

```
Parser ──────────→ Query ──────────→ TUI
        │                   │
        │                   └───────→ CLI
        │
        └────────→ Sync ───────────→ Daemon ───→ Automation
```

Start with **Parser** — it unblocks everything else.
