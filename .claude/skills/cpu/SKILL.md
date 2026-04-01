---
description: "CPU — Rogue Process Hunter"
argument-hint: "[process-name or symptom]"
---

# CPU — Rogue Process Hunter

**Keywords**: cpu, processes, rogue, runaway, slow, fan, hot, kill, cleanup, memory, ram

Find and kill rogue processes, then fix root causes so they don't recur.

**Proactive trigger**: Run this when the user mentions "fan is loud", "laptop is hot", "things are slow", "CPU", or "memory".

## Phase 1: Survey

Run all survey commands in parallel:

```bash
# Top CPU consumers (>3% CPU)
ps aux | awk 'NR==1 || $3 > 3.0' | sort -k3 -rn | head -25
```

```bash
# Top memory consumers (>1% RAM)
ps aux | awk 'NR==1 || $4 > 1.0' | sort -k4 -rn | head -15
```

```bash
# Zombie processes
ps aux | awk 'NR>1 && $8 ~ /Z/' | head -10
```

```bash
# Processes running >1 hour with >1% CPU (stuck or leaked)
ps -eo pid,etime,pcpu,pmem,comm | awk 'NR>1 && $3 > 1.0' | while read pid etime cpu mem comm; do
  case "$etime" in
    *-*|??:??:??) echo "$pid $etime ${cpu}% ${mem}% $comm" ;;  # days or hours
  esac
done | head -15
```

```bash
# Multiple instances of the same binary (fork bombs, leaked daemons)
ps -eo comm= | sort | uniq -c | sort -rn | awk '$1 > 3' | head -10
```

```bash
# Tribe daemons (should be exactly 1)
ps aux | grep tribe-daemon | grep -v grep
```

```bash
# Claude Code / node / bun sprawl
ps aux | grep -E "node|bun" | grep -v grep | wc -l
echo "node/bun processes"
```

```bash
# macOS-specific hogs
ps aux | grep -E "mds_stores|mdworker|WindowServer|kernel_task|nsurlsessiond|trustd|bird" | grep -v grep | awk '$3 > 3.0 || $4 > 2.0'
```

```bash
# System overview
echo "=== Load ===" && sysctl -n vm.loadavg
echo "=== Memory ===" && vm_stat | head -5
echo "=== Swap ===" && sysctl vm.swapusage
```

## Phase 2: Classify

For each suspicious process found in Phase 1:

| Category | Examples | Action |
|----------|----------|--------|
| **Auto-kill** | Duplicate daemons, orphaned watchers, zombies, stuck builds | Kill immediately |
| **Ask first** | IDE processes, user apps, unknown high-CPU processes | Present to user |
| **Expected** | Active builds, test suites, WindowServer, kernel_task | Note as normal |

### Auto-kill rules (no confirmation needed)

- Duplicate `tribe-daemon` (keep newest PID, kill older ones)
- Orphaned `tribe-watch` / `tribe-proxy` with no parent (PPID=1)
- Zombie processes (`Z` state) — `kill -9 <PPID>` to reap
- Orphaned `node`/`bun` with PPID=1 running >30 min and <1% CPU (leaked, doing nothing)
- Multiple identical file watchers (fswatch, watchman) — keep 1

### Investigate before classifying

For any process you can't immediately classify:
```bash
ps -p <PID> -o pid,ppid,etime,pcpu,pmem,command
lsof -p <PID> 2>/dev/null | grep -E "cwd|txt" | head -5
```

Key signals:
- **PPID=1** (orphaned) + **low CPU** + **long runtime** → leaked, safe to kill
- **PPID=1** + **high CPU** → stuck, probably safe to kill but ask
- **PPID is a shell/tmux** → user started it intentionally, ask
- **CWD in ~/Code** → dev process, check if project is still active

## Phase 3: Act

Kill auto-kill targets:
```bash
kill <PID>  # graceful
sleep 2
kill -0 <PID> 2>/dev/null && kill -9 <PID>  # force if still alive
```

For each kill, report one line: `Killed PID <PID> — <command> (age: <etime>, CPU: <cpu>%) — <reason>`

For ask-first targets, present concisely:
```
PID 12345 — bun tribe-daemon (2h, 15% CPU, parent: launchd)
  RECOMMENDATION: Kill — duplicate daemon
```

Wait for user response before killing ask-first targets. If user says "kill all" or "clean up everything", proceed with all recommendations.

## Phase 4: Root Cause (5 Whys)

After cleanup, group the killed processes by **category** (e.g., "duplicate daemons", "orphaned watchers", "leaked node processes"). For each category:

```
CATEGORY: <name> (found <N>)

Why 1: <what was observed>
Why 2: <why did that happen>
Why 3: <why did THAT happen>
Why 4: <deeper cause>
Why 5: <root cause>

ROOT CAUSE: <one sentence>
FIX: <specific change — file, function, what to do>
```

Then check if the fix already exists:
```bash
# Search for guards, locks, cleanup code related to the root cause
grep -r "<relevant pattern>" vendor/bearly/tools/ --include="*.ts" | head -5
```

Decision:
- **Fix exists but process was running old code** → "Restart required — fix deployed in commit <hash>"
- **Simple fix (add guard, cleanup handler)** → implement directly, commit
- **Complex fix (architecture change)** → create a bead: `bd create --id km-tribe.<slug> --type task --title "<title>"`

## Phase 5: Verify

```bash
echo "=== After cleanup ==="
ps aux | awk '$3 > 5.0' | wc -l | xargs -I{} echo "High-CPU processes: {}"
ps aux | grep tribe-daemon | grep -v grep | wc -l | xargs -I{} echo "Tribe daemons: {}"
ps aux | awk '$8 ~ /Z/' | wc -l | xargs -I{} echo "Zombies: {}"
ps aux | grep -E "node|bun" | grep -v grep | wc -l | xargs -I{} echo "Node/Bun processes: {}"
sysctl -n vm.loadavg
```

## Report

```
## CPU Cleanup

### Before
- Load: X.XX
- High-CPU (>5%): N processes
- Node/Bun total: N

### Killed
| PID | Command | Age | CPU% | Reason |
|-----|---------|-----|------|--------|

### Left alone (user confirmed)
| PID | Command | CPU% | Why |
|-----|---------|------|-----|

### Root Causes
| Category | Count | Root Cause | Fix | Status |
|----------|-------|------------|-----|--------|

### After
- Load: X.XX
- High-CPU (>5%): N
- Tribe daemons: 1
- Zombies: 0
```
