---
description: "Infrastructure health check — CI/CD, plugins, databases, deployments, hooks. Diagnoses and fixes broken infrastructure across the km ecosystem."
argument-hint: [ci|plugins|deploy|db|hooks|tribe|recall|sites|all]
---

# Infrastructure Health Check

**Keywords**: infra, ci, cd, pipeline, broken, health, status, plugins, tribe, recall, deploy, hooks, database

Comprehensive infrastructure audit across the km ecosystem. Checks everything that runs behind the scenes: CI/CD pipelines, Claude Code plugins, databases, deployments, hooks, and communication systems. Fixes what's broken.

## Sub-Commands

| Command | Scope | What It Checks |
|---------|-------|----------------|
| `/infra` | All | Full infrastructure audit (default) |
| `/infra ci` | CI/CD | GitHub Actions workflows across all repos |
| `/infra plugins` | Plugins | Tribe, recall, LLM, TTY, telegram MCP servers |
| `/infra deploy` | Deployments | Sites live, sitemaps, DNS, GitHub/Cloudflare Pages |
| `/infra db` | Databases | Beads, tribe.db, state.db, session-index, Dolt |
| `/infra hooks` | Hooks | Claude Code hooks (session, compact, cleanup) |
| `/infra tribe` | Tribe | Daemon, sessions, messaging, GitHub plugin |
| `/infra recall` | Recall | Session index, indexing freshness, search |
| `/infra sites` | Sites | All websites live, sitemaps valid, glossary working |
| `/infra npm` | npm | Published vs local version drift across all packages |
| `/infra submodules` | Git | Vendor submodule sync status (ahead/behind remote) |
| `/infra logs` | Logs | Log file sizes, rotation needs (daemon.log, dolt, etc.) |
| `/infra all` | Everything | All checks, parallel where possible |

`/ci` is an alias for `/infra ci`.

## Phase 1: CI/CD Pipelines (`/infra ci`)

Check GitHub Actions status for ALL vendor repos. Run in parallel:

```bash
# Check last workflow run status for each repo
REPOS="silvery termless terminfo.dev flexily loggily bearly mdspec vimonkey vt100 watcher-chaos"
for repo in $REPOS; do
  gh run list --repo beorn/$repo --limit 3 --json status,conclusion,name,createdAt 2>/dev/null
done
```

### What to check:
1. **Recent failures** — Any workflow with `conclusion: "failure"` in last 5 runs
2. **Stale workflows** — No runs in >7 days (repo might have broken triggers)
3. **Missing workflows** — Repos without CI (tap, accountly, ansi)
4. **Workflow file validity** — Parse each `.github/workflows/*.yml` for syntax errors
5. **Secret availability** — Check `NPM_TOKEN`, `CLOUDFLARE_API_TOKEN` referenced but possibly expired

### Fix workflow:
- Read the failed workflow log: `gh run view <id> --repo beorn/<repo> --log-failed`
- Identify root cause (dependency issue, test failure, secret expiry)
- Fix and push, or re-run: `gh run rerun <id> --repo beorn/<repo>`

### Repos & Workflows:

| Repo | Workflows | Triggers |
|------|-----------|----------|
| silvery | release.yml, docs.yml | tag v*, push main |
| termless | release.yml, ci.yml, docs.yml | tag v*, push main, PR |
| terminfo.dev | deploy.yml | push main |
| flexily | test.yml, ci.yml, release.yml | push main, PR, tag v* |
| loggily | test.yml, docs.yml, release.yml | push main, tag v* |
| bearly | (none — inline in km) | — |
| mdtest | deploy-docs.yml, release.yml | push main, tag v* |
| vimonkey | release.yml | tag v* |
| vt100 | (npm publish from monorepo) | manual |
| watcher-chaos | release.yml | tag v* |

## Phase 2: Claude Code Plugins (`/infra plugins`)

Check all MCP servers and tools are functioning:

### Tribe (inter-session coordination)
```bash
# Check daemon is running
ls -la /tmp/km-tribe-*.sock 2>/dev/null || echo "NO DAEMON SOCKET"
# Check tribe health
mcp__tribe__tribe_health 2>/dev/null || echo "TRIBE UNHEALTHY"
# Check sessions
mcp__tribe__tribe_sessions 2>/dev/null || echo "NO SESSIONS"
```

### Recall (session history search)
```bash
# Check index exists and is recent
ls -la ~/.claude/session-index.db 2>/dev/null
# Check index freshness
bun recall status 2>/dev/null | head -20
# Test search works
bun recall --raw "test" -n 1 2>/dev/null && echo "RECALL OK" || echo "RECALL BROKEN"
```

### TTY (terminal automation)
```bash
# Check MCP server responds
mcp__tty__list 2>/dev/null || echo "TTY MCP UNAVAILABLE"
```

### Telegram (optional)
```bash
# Check if configured
ls ~/.claude/telegram/ 2>/dev/null || echo "TELEGRAM NOT CONFIGURED (optional)"
```

### LLM tools
```bash
# Check API keys are set
[ -n "$ANTHROPIC_API_KEY" ] && echo "ANTHROPIC OK" || echo "NO ANTHROPIC KEY"
[ -n "$OPENAI_API_KEY" ] && echo "OPENAI OK" || echo "NO OPENAI KEY"
```

## Phase 3: Deployments (`/infra deploy`)

Check all deployed sites are live and correct:

```bash
# Check each site responds with 200
for site in terminfo.dev silvery.dev termless.dev beorn.codes; do
  curl -sI "https://$site" | head -1
done

# Check sitemaps exist
for site in terminfo.dev silvery.dev termless.dev beorn.codes; do
  curl -sI "https://$site/sitemap.xml" | head -1
done

# Check robots.txt
for site in terminfo.dev silvery.dev termless.dev beorn.codes; do
  curl -s "https://$site/robots.txt" | head -3
done
```

### Site deployment configs:

| Site | Platform | Config | CNAME |
|------|----------|--------|-------|
| terminfo.dev | Cloudflare Pages | deploy.yml (wrangler) | DNS |
| silvery.dev | GitHub Pages | docs.yml | vendor/silvery/docs/CNAME |
| termless.dev | GitHub Pages | docs.yml | vendor/termless/docs/CNAME |
| beorn.codes | GitHub Pages | auto | ~/Code/beorn.github.io/CNAME |
| beorn.codes/flexily | GitHub Pages | docs.yml (base: /flexily/) | via beorn.codes |
| loggily.dev | GitHub Pages | docs.yml (base: /) | vendor/loggily/docs/public/CNAME |
| beorn.codes/mdspec | GitHub Pages | deploy-docs.yml (base: /mdspec/) | via beorn.codes |

## Phase 4: Databases (`/infra db`)

Check database health:

```bash
# Beads
bd doctor 2>/dev/null
bd stats 2>/dev/null | head -10

# Tribe database
ls -la .beads/tribe.db 2>/dev/null
sqlite3 .beads/tribe.db "SELECT count(*) FROM sessions WHERE pruned_at IS NULL" 2>/dev/null

# Dolt server
ls -la .beads/dolt-server.pid 2>/dev/null
cat .beads/dolt-server.port 2>/dev/null

# KM state
ls -la .km/state.db 2>/dev/null

# Session index
ls -la ~/.claude/session-index.db 2>/dev/null
```

### Health indicators:
- **beads.db** — `bd doctor` should report no issues
- **tribe.db** — Should have active sessions, WAL not excessively large (>50MB = concern)
- **Dolt** — PID file should reference running process
- **state.db** — Should exist, WAL not excessively large
- **session-index.db** — Should be <1h old (auto-refreshed on session start)

## Phase 5: Hooks (`/infra hooks`)

Check Claude Code hooks are configured and functional:

```bash
# List hook files
ls -la .claude/hooks/*.sh 2>/dev/null

# Check each hook is executable
for hook in .claude/hooks/*.sh; do
  [ -x "$hook" ] && echo "OK: $hook" || echo "NOT EXECUTABLE: $hook"
done

# Check settings.json references valid hooks
cat .claude/settings.json | grep -A2 hooks 2>/dev/null
```

### Expected hooks:

| Hook | File | Purpose |
|------|------|---------|
| PreToolUse:Bash | run-hook.sh | DCG safety guard for destructive commands |
| UserPromptSubmit | user-prompt-submit.sh | Auto-recall on user messages |
| PreCompact | run-hook.sh bd-prime:PreCompact | Beads context recovery |
| SessionStart | session-start.sh | BD_ACTOR, recall index, daily summary |
| SessionEnd | session-end.sh | Kill vitests, prune tribe, save transcript |
| SubagentCleanup | subagent-cleanup.sh | Agent termination cleanup |

## Phase 6: Communication (`/infra tribe`)

Deep tribe health check:

```bash
# Daemon status
mcp__tribe__tribe_health

# Active sessions
mcp__tribe__tribe_sessions

# Recent messages (last hour)
mcp__tribe__tribe_history --since 1h

# GitHub plugin status
cat .beads/github-cursor.json 2>/dev/null | head -5
```

### Health indicators:
- Daemon socket exists and responds
- Sessions list shows this session
- GitHub cursor is recent (updated within last hour if commits happened)
- No "connection refused" or timeout errors

## Execution Strategy

### `/infra` or `/infra all` — Full audit

Run all 6 phases. Use parallel Agent calls for phases 1-3 (CI, plugins, deploy) since they're independent. Phases 4-6 (db, hooks, tribe) run sequentially since they're fast.

Present results as a dashboard:

```
## Infrastructure Health Report

| System | Status | Details |
|--------|--------|---------|
| CI/CD (10 repos) | 9 green, 1 failing | flexily ci.yml failed 2h ago |
| Plugins | All OK | tribe, recall, tty, llm |
| Deployments (6 sites) | All live | Last deploy: termless 3h ago |
| Databases | Healthy | tribe.db 3.3M, state.db 13M |
| Hooks | All configured | 6/6 executable |
| Tribe | Active | 3 sessions, github polling OK |

### Action Items
1. Fix flexily ci.yml — test failure in compose.test.ts (pre-existing)
2. Recall index is 3h stale — run `bun recall index --incremental`
```

### Auto-Fix Policy

**Fix immediately without asking** (obvious, safe, reversible):
- Hook not executable → `chmod +x`
- Recall index stale → `bun recall index --incremental`
- CI failure from flaky test → re-run workflow
- Outdated action versions → update to latest (e.g., v3 → v4)
- Missing robots.txt or sitemap → create from template
- WAL file oversized → `PRAGMA wal_checkpoint(TRUNCATE)`
- Hook script missing shebang → add `#!/bin/bash`
- npm version drift (local ahead of published) → note for next release

**Fix after reading the error** (need diagnosis first):
- CI failure from test/build error → read log, fix root cause, push
- Plugin not responding → check process, restart if dead
- Site returning non-200 → check deploy logs, re-deploy if config OK
- Tribe daemon not running → check why it stopped, restart

**Ask user first** (destructive or ambiguous):
- Database corruption → recovery may lose data
- Deleting stale lock files → another process might hold them
- Force-pushing to fix CI → could overwrite work
- Changing DNS/domain config → affects live traffic
- Removing/archiving old workflows → might be intentionally preserved

### Fix mode

When a check fails, classify it using the policy above and act accordingly. For auto-fix items, just fix them and report what you did. For diagnosis items, read the error first. For destructive items, ask.

## Anti-Patterns

- Don't ask permission for obviously safe fixes (chmod, re-run, index refresh)
- Don't restart services without checking WHY they failed first
- Don't delete databases without user approval
- Don't re-run CI without reading the failure log
- Don't ignore "optional" infrastructure (telegram) — report its status even if unconfigured
- Don't create beads for transient issues (flaky CI, stale index) — just fix them
