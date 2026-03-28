# Lessons Learned: Structural vs Visual vs Physical

> Emerged from detail pane, breadcrumb, and card rendering refactoring (Feb 2026).

## The Layering Philosophy

The structural layer (the universal tree) is where we do as much work as possible. We *materialize* down to the physical layer (filesystem) and *visualize* up to the visual/spatial layer (cards, columns, cursor). The structural tree is the canonical, source-agnostic representation — everything that can work at this level should.

Bugs happen when code in one layer branches on properties from another.

| Concern | Question | Properties | Lives in |
|---------|----------|------------|----------|
| **Structural** | What IS this node? | `type` (oi/li/p/h/hr/...), `content`, `parent_id`, `children`, `task_marker`, `rules` | @km/core, @km/tree |
| **Visual** | How does it LOOK? | depth, isSelected, isFolded, column width, cursor position | apps/km-tui views |
| **Physical** | Where did it come FROM? | `fstype` (folder/file/mdfile/mdsection), `fs_path`, `fs_ino` | @km/storage, @km/markdown |

## What Went Wrong

The visual layer was branching on physical properties (`fstype`) when it should have been using structural properties (`type`, `content`, children).

### Example 1: Breadcrumb filtering

**Before**: `getProjectPath()` only included ancestors with `fstype` of folder/file/mdfile.
**Bug**: Nodes without filesystem backing (Asana imports, inline items) disappeared from breadcrumbs.
**Fix**: Show all ancestors unconditionally. Containment is structural (parent chain), not physical (filesystem path).

### Example 2: Card title boldness

**Before**: `bold={depth === 0 && hasChildren}` — only bold if node has children.
**Bug**: Tasks without subtasks looked visually weaker than tasks with subtasks, for no user-facing reason.
**Fix**: `bold={depth === 0}`. Visual weight comes from position in the visual hierarchy, not structural properties.

### Example 3: Detail pane routing

**Before**: `if (fstype === "folder") return <FolderDetailPane>` — two completely different detail pane components based on physical origin.
**Problem**: A "folder" node and a "section" node with identical structure render completely differently.
**Better**: Route on structural properties — does it have subitems? Has body content? Has task marker?

### Example 4: Body text line breaks

**Before**: Parser's `nodeToText()` didn't handle mdast `break` nodes.
**Bug**: Hard line breaks (`  \n`) silently collapsed, making body text run together.
**Fix**: Return `"\n"` for break nodes. The parser must faithfully represent all markdown constructs — the visual layer depends on it.

## The Pattern

Every time the visual layer branched on `fstype`, it created inconsistent rendering:

```
WRONG:  if (node.fstype === "folder") renderAsFolder()
        else renderAsTask()

RIGHT:  if (hasSubitems(node)) renderWithSubitems()
        if (hasBody(node)) renderBody()
        if (hasTaskMarker(node)) renderTaskStatus()
```

The structural API provides the right predicates (via `KNode` namespace from `@km/core`):
- `KNode.isOutline(node)` — is it an outline item (`oi`)?
- `KNode.isItem(node)` — can it have children (`oi` or `li`)?
- `KNode.isBlock(node)` — is it a content leaf?
- `extractBody(children)` — separate body content from structural children

These never check `fstype`. The visual layer should use these, not physical metadata.

## Where `fstype` Legitimately Belongs

1. **Storage layer**: Discovery, sync, file writing — mapping between node tree and filesystem.
2. **Parser**: Setting `fstype` during parsing, checking it during serialization.
3. **Cosmetic hints**: Icons (folder icon vs section icon), breadcrumb separators. Clearly labeled as "origin hints", not behavioral forks.

## What To Watch For

When adding new view code, ask: "Would this break if the node came from a different source?"

- If yes → you're branching on physical properties. Use structural properties instead.
- If it's purely cosmetic (icon, separator character) → acceptable, but keep it isolated.
- If it's in storage/parser → fine, that's where fstype lives.

### Red flags in view code

```typescript
// 🚩 Branching on fstype
if (node.fstype === "folder") ...
if (node.fstype === "mdsection") ...

// 🚩 Branching on type when structure would do
if (node.type === "oi" && node.fstype === "file") ...

// ✅ Branching on structural properties
if (extractBody(children).body.length > 0) ...
if (node.task_marker) ...
if (node.rules) ...
if (depth === 0) ...
```
