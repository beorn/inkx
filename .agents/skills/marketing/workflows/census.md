# Census Pipeline Workflow

Run terminal probes and update the measured data layer.

## When to Run

- After a new terminal emulator release (e.g., Ghostty 1.4)
- After adding new probes/features
- Monthly maintenance run
- Before publishing comparison articles

## Steps

### 1. Run Headless Census

```bash
cd /Users/beorn/Code/pim/km/vendor/terminfo.dev
bun terminfo probe termless --all         # All backends, cached
bun terminfo probe termless --all --force # Force re-run
bun terminfo probe termless xtermjs/*     # Specific backend versions
```

Results land in `content/probes-libs/{backend}-{version}.json`.

### 2. Probe App Terminals (launches + daemon)

```bash
bun terminfo probe app --all              # Launch all + probe via daemon
bun terminfo probe app ghostty            # Specific terminal
bun terminfo probe app                    # List available
```

Results land in `content/probes-apps/{terminal}-{version}-{os}.json`.

### 3. Probe Running Daemons (user starts `serve` in terminals)

```bash
bun terminfo probe server                 # List running daemons
bun terminfo probe server --all           # Probe all
```

### 4. Check for Unannotated Failures

```bash
bun terminfo probe termless --all  # Reports unannotated failures at the end
```

If new failures appear, add annotations to `content/annotations.json` explaining why.

### 4. Rebuild Site

```bash
bun run build
```

Verify:
- Page count hasn't dropped
- New terminals appear in sidebar/comparisons
- Feature counts are correct

### 5. Report

```bash
bun census:report           # Summary of all results
bun census:status           # Cache status
```

### 6. Deploy

Push changes and let CI deploy:
```bash
git add content/probes-apps/ content/probes-libs/ content/annotations.json
git commit -m "census: fresh probe results"
git push
```
