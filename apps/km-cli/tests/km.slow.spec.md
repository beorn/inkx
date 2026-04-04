---
mdspec:
  plugin: ./mdspec-plugin.ts
---

# KM CLI - Happy Path Tests

End-to-end tests for the km (Knowledge Machine) CLI.

## Setup

Initialize a test repo:

```console
$ km init .
Initializing .km (repo ...)
✓ Created .km/
  Created: inbox/
  Created: archive/
  Created: @next.md
  Created: @someday.md
[...]
✓ Synced ... file(s) in ... directories
[...]
Next steps:
[...]
```

### km sync

Sync filesystem to database:

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

## Task Management

### km new - Create a task

Create a task and sync to see it:

```console
$ km new "Test task from mdspec"
✓ Added to inbox: Test task from mdspec

$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

### km tasks - List tasks

```console
$ km tasks
inbox / .md
 [ ] Test task from mdspec
[...]
... task(s)
```

### km tasks with query

Query by path:

```console
$ km tasks inbox
[...]
inbox / .md
[...]
```

### km status - Complete a task

Get a task and mark it done:

```console
$ TASK_ID=$(km tasks --json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4) && km status "$TASK_ID" done
[...]done[...]
```

## Node Resolution

### Resolve by filename

Commands accept filenames like `@next`:

```console
$ km show @next
ID: ...
Type: ...
Path: .../@next.md
Title: Next Actions
[...]
```

### Resolve by path

Commands accept relative paths:

```console
$ km show ./@next.md
ID: ...
Type: ...
Path: .../@next.md
Title: Next Actions
[...]
```

## Init Command

### km init in new directory

```console
$ export INIT_DIR=$(mktemp -d /tmp/km-mdspec-init-XXXXXX)
$ cd "$INIT_DIR" && km init .
Initializing .km (repo ...)
✓ Created .km/
  Created: inbox/
  Created: archive/
  Created: @next.md
  Created: @someday.md
[...]
✓ Synced ... file(s) in ... directories
[...]
Next steps:
[...]

$ ls "$INIT_DIR/.km"
changes.jsonl
state.db
[...]

$ rm -rf "$INIT_DIR"
```

## Add Command (Transclusion)

### km add - Link tasks to board (transclusion)

Tasks added to a board are transcluded (linked) - they remain in their original location
while also appearing on the board. This allows tasks to keep their original context.

Create a project file with tasks, then link them to @next:

```console
$ mkdir projects
$ cat << 'EOF' > projects/p1.md
> # Test Project
> Some tasks.
> ## Tasks
> - [ ] First project task
> - [ ] Second project task
> - [ ] Third project task
> EOF
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

Verify tasks exist in the project file:

```console
$ km tasks './projects**'
[...]
[...]First project task
[...]Second project task
[...]Third project task
[...]
... task(s)
```

Add (link) all tasks from projects to @next (also adds @next sigil to source tasks):

```console
$ km add @next './projects**'
✓ Linked 3 task(s) to Next Actions
[...]
✓ Added @next to ... task(s)
```

Verify tasks now appear under @next in the default (Inbox) column:

```console
$ km show --tree @next
[...]
Children:
[...]
[...]h[...]Inbox
[...]
```

Verify original file STILL shows tasks (they were linked, not moved).
Source tasks now include the @next sigil:

```console
$ km tasks './projects**'
[...]
[...]First project task @next
[...]Second project task @next
[...]Third project task @next
[...]
... task(s)
```

Clean up:

```console
$ rm -rf projects
```

## H1 Merge into File Node

### File title comes from H1 heading

Create a markdown file with an H1 heading and verify the file node gets the title:

```console
$ mkdir docs
$ cat << 'EOF' > docs/readme.md
> # Welcome to My Project
> This is the intro paragraph.
> ## Getting Started
> - [ ] Read the docs
> - [ ] Install dependencies
> EOF
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

The file node should display with the H1 title "Welcome to My Project":

```console
$ km show docs/readme.md
ID: ...
Type: ...
Path: .../docs/readme.md
Title: Welcome to My Project
[...]
```

H2 sections should be direct children of the file (not nested under an H1 section):

```console
$ km show --tree docs/readme.md
[...]
Children:
[...]p[...]This is the intro paragraph.
[...]h[...]Getting Started
[...]p[...]Read the docs
[...]p[...]Install dependencies
```

Clean up:

```console
$ rm -rf docs
```

## Error Handling

### Invalid node ID

```console
$ km show nonexistent-id-12345 2>&1
Node not found: nonexistent-id-12345
[1]
```

### km --help

```console
$ km --help
Usage: km [options] [command]
[...]
```

## Basic Commands

### km list

List all nodes in the repo:

```console
$ km ls
[...]
  inbox/
[...]
... node(s)
```
