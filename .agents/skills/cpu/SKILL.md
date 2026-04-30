---
description: "CPU & I/O — Rogue Process Hunter + Bottleneck Finder"
argument-hint: "[process-name or symptom]"
---

# CPU & I/O — Rogue Process Hunter + Bottleneck Finder

**Keywords**: cpu, processes, rogue, runaway, slow, fan, hot, kill, cleanup, memory, ram, io, disk, network, bottleneck, fd, file descriptor

Find and kill rogue processes, identify I/O bottlenecks (disk, network, file descriptors), then fix root causes so they don't recur.

**Proactive trigger**: Run this when the user mentions "fan is loud", "laptop is hot", "things are slow", "disk thrashing", "network slow", "CPU", "I/O", or "memory".

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
# Codex / node / bun sprawl
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

## Phase 1b: I/O Bottleneck Survey

Run when CPU looks fine but the system *feels* slow, or when symptoms include "disk thrashing", "network slow", or "spinning beachball". I/O bottlenecks rarely show up as %CPU because the offending process is *blocked*, not running.

```bash
# Disk I/O — interval sample (1s × 2 to see current rate)
iostat -d -w 1 -c 2 2>/dev/null | tail -10
```

Read the second sample. Look for:
- **KB/t high (~1000+) + tps low**: large sequential I/O (backup, indexer, copy)
- **tps high (>100/sec) + KB/t small (<8)**: random thrashing (DB, fsevents storm)
- **MB/s sustained >100**: heavy write — Spotlight reindex, mdworker, snapshot

```bash
# Pageout pressure — paging is the canary for memory→disk thrash
vm_stat | awk '/Pageouts/ || /Swapouts/ || /Pageins/'
```

If `Pageouts` is climbing during the survey window (run twice 5s apart, compare), the system is swapping → kill memory hogs from Phase 1.

```bash
# Top file-descriptor holders (often the smoking gun for "things feel slow")
lsof -nP 2>/dev/null | awk 'NR>1 { c[$2]++ } END { for (p in c) if (c[p] > 200) printf "%6d  fds: %5d\n", p, c[p] }' | sort -k3 -rn | head -10 | while read pid fdlabel fds; do
  cmd=$(ps -p $pid -o command= 2>/dev/null | head -c 120)
  printf "PID %s  fds: %s  %s\n" "$pid" "$fds" "$cmd"
done
```

>500 fds is normal for browsers/IDEs. >2000 on a CLI tool is a leak. >10000 anywhere → serious leak (forgotten `close`, unbounded watcher, undisposed AbortControllers). Check `lsof -p <pid> | sort | uniq -c | sort -rn | head` to see what kind of fds — sockets, pipes, files, kqueue.

```bash
# Network connections — saturated outbound or stuck-in-CLOSE_WAIT
echo "=== Connections by state ==="
netstat -an 2>/dev/null | awk '/^tcp/ { print $6 }' | sort | uniq -c | sort -rn
echo "=== Top connection holders ==="
lsof -nP -iTCP -sTCP:ESTABLISHED 2>/dev/null | awk 'NR>1 { c[$2"|"$1]++ } END { for (k in c) printf "%5d  %s\n", c[k], k }' | sort -rn | head -10
```

Red flags:
- **CLOSE_WAIT > 50**: app forgot to close sockets — restart the app, file a bug
- **TIME_WAIT > 5000**: lots of short-lived connections (testing, scraping) — usually fine, transient
- **One process holding >100 ESTABLISHED**: connection leak (HTTP client without keepalive limit, undisposed WebSockets)

```bash
# Active disk readers/writers (BSD jobs path; macOS-friendly)
ps -eo pid,ppid,pcpu,pmem,state,command | awk '$5 ~ /U|D/' | head -10
# State U = uninterruptible sleep (usually disk I/O wait)
# State D = disk wait (less common on macOS)
```

```bash
# Suspicious mdworker/backupd/snapshot activity (common macOS culprits)
ps aux | grep -E "mdworker|mds|backupd|fseventsd|cloudd|bird|nsurlsessiond|trustd|distnoted" | grep -v grep | awk '$3 > 1.0 || $4 > 0.5' | sort -k3 -rn
```

```bash
# fs_usage spot check — top syscall-heavy processes (10s sample, requires sudo)
# Skip if non-interactive; this is the deepest tool, often most informative.
# sudo timeout 10 fs_usage -w -f filesys 2>/dev/null | head -200 | awk '{ print $7 }' | sort | uniq -c | sort -rn | head
echo "(skip fs_usage in non-interactive mode; ask user to run if disk thrashing suspected)"
```

### I/O classification table

| Signal | Likely cause | Action |
|--------|-------------|--------|
| Pageouts climbing | Memory pressure → swap | Kill top memory consumers (Phase 1) |
| Single process: >2000 fds | FD leak | Find owner, restart, file root-cause bead |
| CLOSE_WAIT > 50 | Socket close bug | Restart app, file bug |
| iostat MB/s high + mdworker hot | Spotlight indexing | `sudo mdutil -i off /Volumes/<vol>` for noisy volumes; usually transient |
| iostat tps high + low MB/s | Random disk thrash | Check fseventsd / running tests / DB process |
| Process in U-state for minutes | Stuck on disk wait (NFS, dead drive) | Investigate filesystem health |
| Many TIME_WAIT (>5000) | Short-lived connections | Usually transient (scraping, tests); check for bug if persistent |

## Phase 2: Classify

For each suspicious process found in Phase 1:

| Category | Examples | Action |
|----------|----------|--------|
| **Auto-kill** | Duplicate daemons, orphaned watchers, zombies, stuck builds | Kill immediately |
| **Ask first** | IDE processes, user apps, unknown high-CPU processes | Present to user |
| **Expected** | Active builds, test suites, WindowServer, kernel_task | Note as normal |

### Auto-kill rules (no confirmation needed)

- Duplicate `tribe-daemon` (keep newest PID, kill older ones)
- Orphaned `tribe-watch` / `stdio-adapter` with no parent (PPID=1)
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
- **Complex fix (architecture change)** → create a bead: `km bd create --id km-tribe.<slug> --type task --title "<title>"`

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
## CPU & I/O Cleanup

### Before
- Load: X.XX
- High-CPU (>5%): N processes
- Node/Bun total: N
- Pageouts climbing: yes/no
- Top fd holders (>2000): N processes
- CLOSE_WAIT count: N

### Killed
| PID | Command | Age | CPU% | Reason |
|-----|---------|-----|------|--------|

### Left alone (user confirmed)
| PID | Command | CPU% | Why |
|-----|---------|------|-----|

### I/O findings
| Signal | Source | Action |
|--------|--------|--------|

### Root Causes
| Category | Count | Root Cause | Fix | Status |
|----------|-------|------------|-----|--------|

### After
- Load: X.XX
- High-CPU (>5%): N
- Tribe daemons: 1
- Zombies: 0
- Pageouts stable: yes/no
- fd hogs: N
```
