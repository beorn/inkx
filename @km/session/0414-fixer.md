---
id: "@km/session/0414-fixer"
aliases:
  - km-session.0414-fixer
  - km-session-0414-fixer
created_by: Bjørn Stabell
created_at: 2026-04-14T18:56:08Z
closed_at: 2026-04-26T06:24:19Z
close_reason: Session complete — fixer work done, taxes filed
---

# [x] Session: fixer coordinating km bug fixes with taxes 2026-04-14 @km/session #task #P2 @Bjørn Stabell

blocks:: [[@km/tui]]

Tracking bead for the fixer session coordinating with taxes session to fix km bugs.

**Session role**: fixer takes km bug reports from anyone (user, tribe member 'taxes', agents) and fixes them immediately with TDD + regression tests. Tribe member: fixer (renamed from km-5).

**Bugs fixed this session** (chronological):

1. **@km/tui/zoom-stack-overflow** (P1) — closed
   - 27db42fcf (initial chain-walk off-by-one)
   - a47ea59e6 (re-entry guard + embed mismatch guard)
   - Stack: parent() / children() mutual recursion via lazy cache
   - silvery commits: 74b466b2 + ffd278809 (eventLoop error dump for diagnosis)

2. **@km/tui/folder-note-same-name** (P2) — closed
   - 27db42fcf (computeColumnChildren expands folder-note's children)
   - Column was (empty) when folder had same-name.md index

3. **@km/tui/popover-nodestore** (P2) — closed  
   - ad1a1c7aa (context bridge initial)
   - 323f11168 (proper fix: move PopoverProvider inside per-pane providers)
   - /big analysis rejected duct-tape bridge, picked structural fix

4. **@km/tui/task-hierarchy-flat** (P2) — closed
   - 202eb2efa (paddingLeft off-by-one in TreeNode)
   - Was exposed by the inline formatting fix

5. **@km/tui/inline-format-in-blocks** (P2) — closed
   - efb1db1ff (preserve inline formatting + bullets in body blocks)
   - Parent fix for bold/italic/wikilinks in non-task body content

6. **@km/tui/folder-card-empty-title** (P2) — closed  
   - 0e6d8d545 (single-sigil title not swallowed by excludedSigils)

7. **@km/tui/checkbox-spacing** (P2) — closed
   - 0fb432d18 (regression guard for prior fix)

8. **@km/tui/detail-view-bg-conflict** (P2) — closed
   - c0e2dffd8 (removed dead chalk-bg path)

9. **@km/markdown/block-id-prod-sync** (P1, from taxes) — closed
   - 0d9efb31b (resolver: ^id lookup for non-numeric block ids)
   - 8e30b2f9c (write path: block_id column in applyNodeCreated + CHILD_DIFF_FIELDS)
   - Two independent write/read bugs both had to be fixed

10. **@km/markdown/heading-task-refs** (P2, from taxes) — closed
    - bc2141776 (heading handler reads tags/mentions/props from heading.data)

11. **@km/tui/inline-format-task-with-props** (P2) — closed
    - c08133942 (strip props from source slice, preserve bold/link/code)

12. **@km/tui/inline-format-bareurl-underline** (this session) — open
    - In progress: UrlHoverBox now sets underlineStyle='dotted' (not underline=false)
    - Matches InlineWikiLink treatment

**Bugs tracked but not yet fixed**:
- @km/tui/slow-folder-discovery (P3) — needs verification after view-lens fixes
- @km/tui/zoom-stack-overflow — closed but view-lens robustness /big plan (fuzz + downward walk) is separate
- @km/tui/folder-note-model (P3) — parked design analysis
- @km/_orphan/bug-03 (tribe rename/disconnect) — from taxes, outside km proper

**Cli/infra changes this session**:
- c380c27bc: km list --broken [scope]
- 32b599ccf: km list --broken absolute-path scope resolution
- 24c32b6c3: remove km worktree (it's a dev-setup concern; bun worktree stays)

**Other commits**:
- 95591cbf1: bare sigils default to 'go to' (was 'add link')
- 319c616cb: picker dialog title reflects pending verb
- de982703a: body blocks borderless redesign
- 4b2a383ed: shift+L/H extends column range
- eccae25bd: folder-note model design doc (parked)

**Coordination**: fixer ↔ taxes via tribe_send. taxes reports bugs with repro + DB query; fixer claims bead, fixes, reports back. Protocol in handshake message.

**Not pushed**: ~30+ commits local on main + silvery submodule. Awaiting user push confirmation.