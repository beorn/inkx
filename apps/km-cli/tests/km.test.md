---
mdtest:
  plugin: ../apps/km-cli/tests/mdtest-plugin.ts
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
  Created: @inbox.md
  Created: @next.md
  Created: @someday.md
✓ Synced ... file(s) in ... directories
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
$ km new "Test task from mdtest"
✓ Added to inbox: Test task from mdtest

$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced 2 change(s) in ... directories (...ms)
```

### km tasks - List tasks

```console
$ km tasks
inbox / .md
 [ ] Test task from mdtest
1 task(s)
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
$ TASK_ID=$(km tasks --json | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
$ km status "$TASK_ID" done
[...]done[...]
```

## Node Resolution

### Resolve by filename

Commands accept filenames like `@inbox`:

```console
$ km show @inbox
ID: ...
Type: file
Path: .../@inbox.md
Title: Inbox
[...]
```

### Resolve by path

Commands accept relative paths:

```console
$ km show ./@inbox.md
ID: ...
Type: file
Path: .../@inbox.md
Title: Inbox
[...]
```

## Init Command

### km init in new directory

```console
$ mkdir -p /tmp/km-mdtest-init
$ cd /tmp/km-mdtest-init && km init .
Initializing .km (repo ...)
✓ Created .km/
  Created: inbox/
  Created: archive/
  Created: @inbox.md
  Created: @next.md
  Created: @someday.md
✓ Synced ... file(s) in ... directories
Next steps:
[...]

$ ls /tmp/km-mdtest-init/.km
events.jsonl
state.db

$ rm -rf /tmp/km-mdtest-init
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
     [ ] First project task
     [ ] Second project task
     [ ] Third project task
... task(s)
```

Add (link) all tasks from projects to @next:

```console
$ km add @next './projects**'
✓ Linked 3 task(s) to Next Actions...
[...]
```

Verify tasks now appear under @next in the default (Processing) column:

```console
$ km show --tree @next
[...]
Children:
[...]section[...]Processing...
[...]
```

Verify original file STILL shows tasks (they were linked, not moved):

```console
$ km tasks './projects**'
[...]
     [ ] First project task
     [ ] Second project task
     [ ] Third project task
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
Type: file
Path: .../docs/readme.md
Title: Welcome to My Project
[...]
```

H2 sections should be direct children of the file (not nested under an H1 section):

```console
$ km show --tree docs/readme.md
[...]
Children:
[...]paragraph[...]This is the intro paragraph.
[...]section[...]Getting Started
[...]task[...]Read the docs
[...]task[...]Install dependencies
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
