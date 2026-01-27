# Debugging Guide

Practical guide for debugging km TUI, storage, and sync issues.

---

## Quick Start

```bash
# Enable debug logging
DEBUG=km:* bun km view /path/to/repo

# Log to file (for TUI debugging - can't see logs in same terminal)
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path/to/repo
tail -f /tmp/km.log  # In another terminal

# Specific namespace
DEBUG=km:sync bun km view /path/to/repo

# Multiple namespaces
DEBUG=km:sync,km:store bun km view /path/to/repo
```

---

## Debug Output System

km uses the `debug` package for structured logging. All debug output is controlled via the `DEBUG` environment variable.

### Debug Namespaces

| Namespace     | Shows                   | When to use                         |
| ------------- | ----------------------- | ----------------------------------- |
| `km:*`        | All km logging          | General debugging                   |
| `km:sync`     | File sync operations    | File not updating, sync loops       |
| `km:store`    | Database operations     | Node not found, query issues        |
| `km:parse`    | Markdown parsing        | Parse errors, content issues        |
| `km:watcher`  | File watcher events     | Files not being detected            |
| `km:events`   | Event emitter activity  | Cross-layer communication issues    |
| `km:commands` | Command execution       | Key bindings not working            |
| `km:render`   | TUI rendering (verbose) | Layout issues, performance problems |
| `km:board`    | Board state changes     | Cursor/selection bugs               |
| `km:loader`   | Repo loading pipeline   | Slow startup, loading issues        |

### Using debug() in Code

```typescript
import { debug } from "@km/core"

const log = debug("km:mymodule")

export function myFunction() {
  log("Starting operation")
  log("Details: %o", { foo: "bar" }) // %o for objects
  log("Count: %d", 42) // %d for numbers
  log("Error: %O", error) // %O for deep object inspection
}
```

**Formatting**:

- `%s` — String
- `%d` — Number
- `%o` — Object (shallow)
- `%O` — Object (deep)
- `%j` — JSON

---

## Common Debugging Scenarios

### TUI Not Rendering

**Symptoms**: TUI shows blank screen or freezes

**Debug steps**:

1. **Check for React errors**:

   ```bash
   DEBUG=km:render bun km view
   ```

2. **Check useEffect dependencies**:
   - Missing dependencies cause stale closures
   - Use ESLint `react-hooks/exhaustive-deps` rule

3. **Verify data is loading**:

   ```bash
   DEBUG=km:loader,km:store bun km view
   ```

4. **Check for infinite render loop**:
   - Look for rapid `render()` calls in debug output
   - Usually caused by creating new objects/arrays in render

**Common causes**:

- Creating new objects in render: `style={{ width: 10 }}`
- Missing useEffect deps
- State updates during render

### Node Not Found After Edit

**Symptoms**: Edit file in vim, TUI shows error or old content

**Debug steps**:

1. **Enable sync logging**:

   ```bash
   DEBUG=km:sync,km:watcher DEBUG_LOG=/tmp/km.log bun km view
   # In another terminal:
   tail -f /tmp/km.log
   ```

2. **Verify file was saved**:

   ```bash
   ls -l path/to/file.md  # Check mtime
   ```

3. **Check for parse errors**:

   ```bash
   DEBUG=km:parse bun km view
   ```

4. **Inspect database**:

   ```bash
   sqlite3 .km/state.db
   sqlite> SELECT id, name, fs_path, updated_at FROM nodes WHERE fs_path LIKE '%filename%';
   ```

**Common causes**:

- File watcher debounce (wait 5s after save)
- Parse error in markdown (check syntax)
- Node ID changed (memory mode uses path:line)
- File moved but DB not updated

### Sync Loop (File Keeps Changing)

**Symptoms**: File continuously modified, TUI flickering, high CPU

**Debug steps**:

1. **Check actor attribution**:

   ```bash
   DEBUG=km:sync DEBUG_LOG=/tmp/km.log bun km view
   # Look for "actor:tui" vs "actor:fs" in logs
   ```

2. **Inspect fs_mtime vs actual mtime**:

   ```bash
   sqlite3 .km/state.db
   sqlite> SELECT name, fs_path, updated_at, datetime(updated_at/1000, 'unixepoch')
           FROM nodes WHERE fs_path = '/path/to/file.md';
   ```

3. **Check for conflicting edits**:
   - TUI writing while file open in editor
   - Multiple TUI instances

**Common causes**:

- TUI modifying file that's open in editor
- Sync logic bug (writes even when content identical)
- Clock skew (updated_at vs fs_mtime mismatch)

### File Watcher Not Firing

**Symptoms**: Edit file, TUI doesn't update

**Debug steps**:

1. **Enable watcher logging**:

   ```bash
   DEBUG=km:watcher DEBUG_LOG=/tmp/km.log bun km view
   ```

2. **Check if file is watched**:
   - Watcher only watches repo root recursively
   - Symlinks may not be followed

3. **Test manually**:

   ```bash
   # In repo:
   touch test.md
   # Should see "file added" in DEBUG_LOG
   ```

**Common causes**:

- File outside repo root
- Too many files (inotify limit on Linux)
- Symlink not followed
- Debounce delay (default 5s)

### Slow Startup

**Symptoms**: `km view` takes >10s to show board

**Debug steps**:

1. **Profile loading**:

   ```bash
   DEBUG=km:loader,km:parse DEBUG_LOG=/tmp/km.log bun km view
   # Check timestamps between log lines
   ```

2. **Check repo size**:

   ```bash
   find . -name "*.md" | wc -l  # How many markdown files?
   ```

3. **Look for large files**:

   ```bash
   find . -name "*.md" -exec ls -lh {} \; | sort -k5 -h | tail
   ```

**Optimization tips**:

- Loading is parallel (uses all CPUs)
- First render shows immediately (deferred files load after)
- Large files (>1MB) slow parsing
- Deep directory trees slow filesystem scan

### Command Not Executing

**Symptoms**: Press key, nothing happens

**Debug steps**:

1. **Enable command logging**:

   ```bash
   DEBUG=km:commands bun km view
   # Press the key, check if command fires
   ```

2. **Check key binding**:
   - Bindings are context-aware
   - `when` predicates filter bindings

3. **Inspect command context**:

   ```typescript
   // In command definition:
   const myCommand: Cmd = (ctx) => {
     console.log("Context:", {
       knode: ctx.knode?.id,
       mode: ctx.mode,
       dialog: ctx.ui.dialog,
     })
   }
   ```

**Common causes**:

- Key bound in different context
- `when` predicate returns false
- Command throws error (check logs)
- Input captured by dialog/modal

### Query Returning Wrong Results

**Symptoms**: `status:todo` shows tasks with status `done`

**Debug steps**:

1. **Test query in SQLite**:

   ```bash
   sqlite3 .km/state.db
   sqlite> SELECT id, name, task_status FROM nodes WHERE task_status = 'todo';
   ```

2. **Check query parsing**:

   ```bash
   DEBUG=km:query bun km view
   # Type query in search box, check parsed AST
   ```

3. **Verify node data**:

   ```bash
   sqlite> SELECT * FROM nodes WHERE id = 'abc123';
   ```

**Common causes**:

- Query syntax error (silent failure)
- Index not used (slow query)
- Status stored as `null` vs `undefined`
- Case sensitivity (use COLLATE NOCASE)

---

## Debugging Tests

### Test Failing Intermittently

**Symptoms**: Test passes locally, fails in CI (or vice versa)

**Debug steps**:

1. **Check for timing issues**:
   - Are you awaiting all promises?
   - Using `vi.useFakeTimers()`?

2. **Check for shared state**:

   ```typescript
   // ❌ BAD - shared between tests
   const db = openDatabase(":memory:")

   // ✅ GOOD - isolated per test
   test("something", async () => {
     await withTestEnv(async ({ db }) => {
       // Test uses isolated db
     })
   })
   ```

3. **Add logging**:

   ```typescript
   test("something", async () => {
     console.log("Step 1")
     await step1()
     console.log("Step 2")
     await step2()
     // See which step fails
   })
   ```

4. **Run test multiple times**:

   ```bash
   for i in {1..100}; do bun test path/to/test.ts || break; done
   ```

**Common causes**:

- Shared mutable state
- Race conditions (missing await)
- Clock-dependent code (Date.now())
- Environment differences (file paths, env vars)

### Test Timeout

**Symptoms**: Test hangs, eventually times out

**Debug steps**:

1. **Check for unclosed resources**:
   - Database connections
   - File handles
   - Watchers
   - Timers

2. **Use `using` for cleanup**:

   ```typescript
   test("something", async () => {
     using repo = createRepo(path)
     // repo.close() called automatically
   })
   ```

3. **Add timeout logging**:

   ```typescript
   test("something", async () => {
     const timeout = setTimeout(() => {
       console.log("Still waiting after 5s...")
     }, 5000)

     await longOperation()
     clearTimeout(timeout)
   })
   ```

**Common causes**:

- Forgot to close database
- Watcher not stopped
- Promise never resolves
- Infinite loop

---

## Tools

### Node Inspector

Attach debugger to running process:

```bash
# Terminal 1: Run with inspector
node --inspect $(which bun) km view

# Terminal 2: Connect
chrome://inspect  # In Chrome
# Or use VSCode "Attach to Node Process"
```

Set breakpoints in TypeScript source (works with source maps).

### SQLite Inspector

Inspect database directly:

```bash
sqlite3 .km/state.db

# Useful queries:
.schema nodes              # Show schema
.tables                    # List tables
.mode column               # Pretty output
.headers on                # Show column names

# Find node by name
SELECT * FROM nodes WHERE name LIKE '%search%';

# Show recent changes
SELECT * FROM nodes ORDER BY updated_at DESC LIMIT 10;

# Count by type
SELECT type, COUNT(*) FROM nodes GROUP BY type;
```

### Ink DevTools (Future)

Not yet implemented, but planned:

- Visual component tree inspector
- Props/state viewer
- Performance profiler for renders

---

## Performance Debugging

### Profiling Startup Time

```bash
# Enable timing logs
DEBUG=km:loader,km:perf bun km view

# Or use time
time bun km view --no-tui  # Measure load only
```

**What to look for**:

- Parsing time (should be <5s for 1000 files)
- Database operations (BEGIN/COMMIT)
- First render time (<100ms)

### Profiling Rendering

```typescript
// Add timing to component
export function MyComponent() {
  const start = performance.now()

  const result = expensiveCalculation()

  const end = performance.now()
  if (end - start > 16) { // > 1 frame at 60fps
    console.warn(`Slow render: ${end - start}ms`)
  }

  return <Text>{result}</Text>
}
```

### Memory Leaks

Check for growing memory:

```bash
# Run with heap snapshots
node --inspect --heap-prof $(which bun) km view

# Or monitor in another terminal
while true; do
  ps -o rss,vsz,pid,comm | grep km
  sleep 5
done
```

**Common causes**:

- Event listeners not removed
- Closures capturing large objects
- Cache growing unbounded
- File handles not closed

---

## Debugging Checklist

Before asking for help or filing a bug:

- [ ] Enabled debug logging (`DEBUG=km:*`)
- [ ] Checked for errors in logs
- [ ] Reproduced with minimal example
- [ ] Tested in memory mode (no `.km/`)
- [ ] Verified file permissions
- [ ] Checked SQLite database directly
- [ ] Tried with empty repo
- [ ] Noted km version (`bun km version`)
- [ ] Noted OS and shell

---

## See Also

- [testing.md](testing.md) — Test debugging strategies
- [principles.md](../principles.md) — Fail fast principle
- [architecture.md](../architecture.md) — System layers and data flow
