---
title: Project outline — multi-year engineering program
id: 01HVQZ3MZYX0RNK8QKM7B1F4J7
type: outline
---

# Multi-year engineering program outline

Large outline exercising deeply nested lists, mixed task markers, code
samples inside items, and wikilink-heavy references. Models what a real
planning doc looks like when it accretes over 18 months.

## Year 1 ^year-1

### Q1: Foundation

- Epic: Core architecture decisions
  - Initiative: Data model
    - [x] Define KNode shape ^t-knode-shape
    - [x] Document in [[Design/KNode]]
    - [x] Write property-based tests for structural invariants
    - [ ] Publish externally (when stable)
  - Initiative: Storage layer
    - [x] SQLite baseline ^t-sqlite-baseline
    - [x] Schema migrations tooling
    - [x] WAL mode + journal size tuning
    - [ ] Backup strategy — see [[Beads/km-storage.backup]]
  - Initiative: Markdown conversion
    - [x] mdast round-trip parser ^t-mdast-parser
    - [x] km-ast ↔ mdast bridge
    - [x] Obsidian extensions (wikilinks, tags, block IDs)
    - [ ] Fidelity corpus — see [[Beads/km-storage.markdown-fidelity-corpus]]
- Epic: First UI
  - Initiative: TUI (silvery)
    - [x] Render a board view ^t-tui-board
    - [x] Keyboard navigation
    - [x] Edit mode for paragraphs and headings
    - [ ] Rich text inline formatting
  - Initiative: Web (future)
    - [ ] Adapter layer between km-core and a DOM renderer
    - [ ] Defer until TUI is stable

### Q2: Collaboration

- Epic: Sync layer
  - Initiative: Yjs integration
    - [x] KNode → Y.Map mapping ^t-yjs-map
    - [x] Y.Array for ordered children
    - [x] Awareness protocol for presence
    - [x] Reconnection handling
  - Initiative: Conflict resolution
    - [x] Last-writer-wins for leaf text
    - [x] CRDT merge for structural changes
    - [ ] Undo across collaborators — see [[Design/Multi-user-undo]]
  - Initiative: Persistence
    - [x] LevelDB for single-process
    - [ ] Postgres for multi-server
    - [ ] Redis for short-term state

### Q3: API and integrations

- Epic: Public API
  - Initiative: REST endpoints
    - [x] GET/POST/PATCH/DELETE /documents ^t-rest-docs
    - [x] GET /documents/:id/events (SSE stream)
    - [x] POST /webhooks (register webhook)
    - [ ] Rate limiting tiers
  - Initiative: Client libraries
    - [x] TypeScript SDK ^t-sdk-ts
    - [ ] Python SDK
    - [ ] Go SDK
  - Initiative: OAuth
    - [ ] OAuth 2.0 app registrations ^t-oauth
    - [ ] PKCE for public clients
- Epic: Integrations
  - Initiative: Obsidian import
    - [x] Folder-based vault import ^t-obs-folder
    - [x] File-by-file import
    - [x] Link preservation across rename
  - Initiative: Notion import
    - [x] Zip export parser ^t-notion-zip
    - [ ] Rich-text mapping to km-ast — partial
    - [ ] Database import — deferred
  - Initiative: Plaintext import
    - [x] Folder of .md files ^t-md-folder
    - [x] Individual .md file
    - [ ] Other formats (org, rst) — probably won't

### Q4: Mobile + growth

- Epic: Mobile apps
  - Initiative: iOS read-only
    - [x] Core viewer ^t-ios-viewer
    - [x] Sync integration (read path)
    - [x] Offline cache
    - [ ] Edit support — Q1 next year
  - Initiative: Android read-only
    - [x] Core viewer ^t-and-viewer
    - [x] Sync integration
    - [x] Offline cache
    - [ ] Edit support — Q1 next year
  - Initiative: Cross-platform polish
    - [x] Consistent dark mode
    - [x] Consistent typography
    - [ ] Consistent gestures (pinch, swipe)

## Year 2 ^year-2

### Q1: Mobile editing + plugins

- Epic: Mobile edit v2
  - Initiative: Inline editing
    - [ ] Tap to edit paragraph
    - [ ] Soft keyboard with markdown shortcuts
    - [ ] Autosuggest for wikilinks
  - Initiative: Structural editing
    - [ ] Drag to reorder items
    - [ ] Long-press to reveal actions
    - [ ] Batch selection
- Epic: Plugin system
  - Initiative: Plugin runtime
    - [ ] Sandboxed TypeScript execution ^t-plugin-sandbox
    - [ ] Capability-based API
    - [ ] Version compatibility
  - Initiative: Plugin registry
    - [ ] Registry server
    - [ ] Discoverability (search, ratings)
    - [ ] Signed plugins

### Q2: Enterprise

- Epic: Identity
  - Initiative: SSO
    - [ ] SAML 2.0 ^t-saml
    - [ ] OIDC providers (Okta, Google, Azure AD)
    - [ ] SCIM user provisioning
  - Initiative: Roles and permissions
    - [ ] Workspace roles (admin, member, guest)
    - [ ] Document-level ACLs
    - [ ] Role inheritance
- Epic: Auditing
  - Initiative: Audit log
    - [ ] Event stream ^t-audit-stream
    - [ ] Export to SIEM
    - [ ] Retention policies
  - Initiative: Compliance
    - [ ] SOC 2 Type 1 ^t-soc2-1
    - [ ] SOC 2 Type 2
    - [ ] HIPAA assessment (if customer demand)

### Q3: Offline-first desktop

- Epic: Local-first operation
  - Initiative: Server-optional mode
    - [ ] Full feature parity without server ^t-local-first
    - [ ] Peer-to-peer sync (WebRTC)
    - [ ] Local encryption
  - Initiative: Backup and export
    - [ ] Full workspace export
    - [ ] Incremental backup
    - [ ] Encrypted backup format

### Q4: Consolidation

- Review and rationalize accumulated scope
- Retire deprecated APIs (version bump to v2)
- Performance optimization pass
- Security audit
- Compliance certifications

## Appendix A: Architecture principles ^arch

### A.1 Layer discipline

```
┌─────────────────────────────────────────────┐
│ APP (apps/km-tui, km-cli, km-repl, km-web)  │
├─────────────────────────────────────────────┤
│ COMMANDS (@km/commands)                     │
├─────────────────────────────────────────────┤
│ BOARD (@km/board)                           │
├─────────────────────────────────────────────┤
│ TREE (@km/tree)    STORAGE (@km/storage)    │
├─────────────────────────────────────────────┤
│ PARSER (@km/markdown)                       │
├─────────────────────────────────────────────┤
│ CORE (@km/core)                             │
├─────────────────────────────────────────────┤
│ FILESYSTEM (.md files — source of truth)    │
└─────────────────────────────────────────────┘
```

Dependencies flow downward. Each layer's `CLAUDE.md` documents its
responsibilities.

### A.2 State machine principle

Every interactive subsystem is a pure `(action, state) → [state, effects]`
function.

```typescript
type Reducer<S, A, E> = (state: S, action: A) => [S, E[]]

// Example: the text edit reducer
const textEditReducer: Reducer<TextEditState, TextEditAction, Effect> = (state, action) => {
  switch (action.type) {
    case "insert":
      return [{ ...state, text: insert(state.text, action) }, []]
    case "delete":
      return [{ ...state, text: del(state.text, action) }, []]
    case "submit":
      return [state, [{ type: "save", text: state.text }]]
  }
}
```

### A.3 Factory functions, not classes

```typescript
// Yes
export function makeStore(config: Config): Store {
  const state = createState(config)
  return {
    dispatch: (action) => update(state, action),
    select: (selector) => selector(state),
    [Symbol.dispose]: () => cleanup(state),
  }
}

// No
export class Store {
  constructor(config: Config) { ... }
  dispatch(action) { ... }
}
```

## Appendix B: Glossary ^glossary

- **KNode**: The core node shape for everything — pages, paragraphs, tasks,
  headings, etc.
- **km-ast**: The internal AST, essentially an array of KNode with parent
  references.
- **mdast**: The external markdown AST from [[unified]] / [[syntax-tree]].
- **CRDT**: Conflict-free Replicated Data Type — enables eventually-consistent
  editing across peers.
- **Yjs**: The specific CRDT library we use for sync.
- **Wikilink**: `[[target]]` syntax for internal links, from Obsidian/Roam.
- **Block ID**: `^identifier` suffix on a block, enabling `[[note#^id]]`
  references.

## Appendix C: Reading list ^reading

Books and papers that shaped this design:

- [[Books/Designing Data-Intensive Applications]] — Kleppmann
- [[Books/How to Take Smart Notes]] — Ahrens (Zettelkasten)
- [[Books/Working in Public]] — Eghbal (OSS sustainability)
- [[Books/The Design of Everyday Things]] — Norman (affordances)
- [[Papers/FIG]] — fractional indexing for collaborative lists
- [[Papers/Yata]] — the original Yjs CRDT paper
- [[Papers/Automerge]] — comparison CRDT, same family
- [[Papers/Local-first software]] — Kleppmann et al
- [[Posts/Building a local-first app in 2024]] — Michael Welch
- [[Posts/Why Obsidian uses Electron]] — Obsidian team

## Appendix D: Dependencies ^deps

External packages we depend on and why:

| Package                 | Why                                   | Risk                     |
| ----------------------- | ------------------------------------- | ------------------------ |
| `bun`                   | Runtime + test + pkg manager          | New but maturing fast    |
| `react`                 | UI framework (via silvery reconciler) | Stable                   |
| `yjs`                   | CRDT for sync                         | Well-maintained          |
| `mdast-util-*`          | Markdown AST utilities                | Stable                   |
| `micromark`             | Markdown tokenizer                    | Stable                   |
| `better-sqlite3`        | (alt) SQLite driver                   | Replaced by `bun:sqlite` |
| `sqlite` (bun built-in) | Primary storage                       | Stable                   |
| `ulid`                  | ID generator                          | Stable                   |
| `yaml`                  | Frontmatter parsing                   | Stable                   |

## Appendix E: Decisions log ^decisions

Chronological list of significant architecture decisions:

1. [[Decisions/2025-01-08-layer-lint]] — enforce layer dependencies
2. [[Decisions/2025-01-15-bun-runtime]] — bun over node
3. [[Decisions/2025-02-03-alpha-criteria]] — define "alpha" scope
4. [[Decisions/2025-03-22-import-flow]] — folder + file-by-file import
5. [[Decisions/2025-04-12-fractional-indexing]] — use FIG for Y.Array ordering
6. [[Decisions/2025-05-01-yjs-for-sync]] — Yjs over custom CRDT
7. [[Decisions/2025-06-14-leveldb-persistence]] — start with LevelDB
8. [[Decisions/2025-07-21-api-rest-not-graphql]] — REST for v1
9. [[Decisions/2025-08-15-token-pat]] — PAT over OAuth for v1
10. [[Decisions/2025-09-02-mobile-readonly-v1]] — read-only first
11. [[Decisions/2025-11-03-plugin-sandbox]] — isolate with iframe worker
12. [[Decisions/2026-01-10-sso-providers]] — support SAML + OIDC
13. [[Decisions/2026-02-28-offline-first-mode]] — feature flag for v2

## Appendix F: Open questions ^questions

Unresolved design questions, parked for future consideration:

- [ ] Should wikilinks target IDs or paths? Paths are human-readable;
      IDs survive rename. Currently paths with rename tracking. Revisit if
      rename tracking proves fragile.
- [ ] Is the KNode shape over-constrained? `data` blob is flexible but
      escapes type safety. Consider a typed extensions map.
- [ ] When to split storage from tree? They're peers now but may diverge.
- [ ] How to handle very large documents (>100k nodes)? Virtualization
      is the obvious answer, but editing in virtualized views is hard.
- [ ] Plugin API surface: what's the MVP? Too small, nobody can build
      useful plugins. Too large, we can't iterate.

## Appendix G: Performance budgets ^perf

Explicit performance budgets — if we exceed these, we regress.

| Operation             | Budget | Current |
| --------------------- | ------ | ------- |
| Cold startup          | <500ms | 420ms   |
| First document render | <200ms | 130ms   |
| Key stroke to screen  | <16ms  | 10ms    |
| Sync propagation p50  | <100ms | 55ms    |
| Sync propagation p99  | <500ms | 380ms   |
| Memory per 10k nodes  | <50MB  | 42MB    |
| CPU idle              | <5%    | 1.8%    |

## Appendix H: Risks and mitigations ^risks

- **Vendor submodule drift**: silvery and friends evolve in-tree as
  submodules. Mitigation: pinned commits, automated drift checks in CI.
- **YAML parser edge cases**: frontmatter YAML is a known source of
  parser surprises. Mitigation: extensive fixture corpus, graceful
  fallback to "preserve as raw string" for unparseable input.
- **Sync scalability**: Yjs is proven to ~10k nodes per doc, less proven
  beyond. Mitigation: doc splitting UI, telemetry on doc sizes.
- **Mobile App Store policies**: rejection risk for each submission.
  Mitigation: early TestFlight, conservative entitlements, responsive
  to reviewer feedback.
- **Open-source maintainer burnout**: real for solo/small teams.
  Mitigation: federation model (see [[Books/Working in Public]]),
  clear contribution guidelines, say no often.

<!-- end of multi-year program outline -->
