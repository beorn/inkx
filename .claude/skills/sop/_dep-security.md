# Dependency Security Procedures

Referenced by SKILL.md §8 (security domain). These are the how-to procedures; SKILL.md defines the what and when.

## Dependency update protocol

Applies to all dep updates — `bun update`, `nix flake update`, major version bumps. Balance safety with efficiency: don't skip steps, but don't over-engineer them either.

**1. Baseline** — capture test state *before* updating:
```bash
bun run test:fast 2>&1 | tail -5   # note pass/fail count
```

**2. Update** — run the update:
```bash
bun update                         # npm: compatible bumps
nix flake update                   # nix: latest nixpkgs
```
Check what actually changed — `git diff bun.lock | head -80` or `git diff flake.lock`. For major version bumps, scan the changelog/migration guide first (a quick web search for `<pkg> changelog` or check the GitHub releases page).

**3. Verify** — typecheck + tests immediately after:
```bash
bunx tsc --noEmit 2>&1 | head -20  # catch type breaks
bun run test:fast 2>&1 | tail -5   # compare to baseline
```

**4. If tests break — bisect** to find which dep caused it:
- If only a few packages were bumped, the diff is usually obvious from the error (e.g., `InstalledClock` renamed → `@sinonjs/fake-timers`)
- If many packages bumped and the cause isn't obvious, pin deps back one-by-one in `package.json` and re-test. Start with the biggest version jumps.
- Fix the breakage in our code (update types, adjust API calls) — don't pin to old versions unless the new version has a genuine bug.

**5. Record** — if the update caused a non-obvious break, add it to the `_sop-rules.md` anti-pattern table so future updates watch for it.

**Efficiency notes**: don't read every changelog for patch bumps — only check changelogs for major/minor bumps or when something breaks. The baseline test run is cheap (~16s) and catches real problems. Skip it only if you just ran tests moments ago.

## CVE impact analysis (for unfixable CVEs)

When CVEs remain after `bun update`, don't just list them — evaluate actual risk to *us*. For each CVE:

1. **Trace the dependency chain**: `bun audit` shows the path (e.g., `bearly → @modelcontextprotocol/sdk → hono`). Document it.
2. **Check if the vulnerable code path is exercised**: grep for imports of the vulnerable package in our source. If it's transitive, check whether our direct dep actually calls the vulnerable API. Example: we import `@modelcontextprotocol/sdk` but only use `StdioServerTransport` — hono's HTTP vulnerabilities are never reached.
3. **Classify the exposure**:
   - **Runtime + untrusted input** → HIGH (e.g., a parsing lib processing user content)
   - **Runtime + own data only** → LOW (e.g., text measurer processing our own UI strings)
   - **Dev-only tooling** → NEGLIGIBLE (e.g., vite dev server, esbuild, vitest — never deployed)
   - **Bundled but unreachable** → NEGLIGIBLE (e.g., hono in MCP SDK when we use stdio transport)
4. **Report with context**, not just advisory links:
   ```
   hono <4.12.12 (5 moderate) — NEGLIGIBLE
     Chain: bearly → @modelcontextprotocol/sdk → hono
     Why: We use StdioServerTransport, not HTTP. Hono's cookie/IP/path 
     vulnerabilities require HTTP requests, which never reach our MCP servers.
     Action: Wait for @modelcontextprotocol/sdk to bump hono.
   ```
5. **Escalate only real risks**: if a CVE is HIGH and exercised, create a bead immediately. If NEGLIGIBLE, just document in the report.

## Nix security check

Dev tools come from Nix flakes pinned to a nixpkgs revision. Stale pins = unpatched CVEs in bun, nodejs, ripgrep, etc.

**Flake locations**: `~/Code/pim/km/flake.nix` (project), `~/Code/flake.nix` (workspace)

**Check**: parse `flake.lock` → `nodes.nixpkgs.locked.lastModified` → flag if >30 days old.

```bash
python3 -c "
import json, datetime, sys
with open('flake.lock') as f:
    lock = json.load(f)
nixpkgs = lock['nodes'].get('nixpkgs', {}).get('locked', {})
ts = nixpkgs.get('lastModified', 0)
age = (datetime.datetime.now().timestamp() - ts) / 86400
rev = nixpkgs.get('rev', '?')[:12]
status = 'STALE' if age > 30 else 'ok'
print(f'{status}: nixpkgs rev={rev} age={age:.0f}d')
sys.exit(1 if age > 30 else 0)
"
```

**Auto-fix**: `nix flake update` (updates nixpkgs to latest, inheriting all upstream security patches).

**Deep scan** (optional, monthly): install `vulnix` and scan the dev shell closure for known CVEs:
```bash
nix run nixpkgs#vulnix -- --system $(nix build .#devShells.$(nix eval --impure --expr 'builtins.currentSystem') --no-link --print-out-paths)
```
