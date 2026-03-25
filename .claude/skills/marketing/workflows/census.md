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
bun census:run              # All backends, cached
bun census:run --force      # Force re-run (skip cache)
bun census:run xtermjs/*    # Specific backend versions
```

Results land in `content/probes-libs/{backend}-{version}.json`.

### 2. Run App Census (Optional — requires macOS + installed terminals)

```bash
bun census:apps             # All installed terminals
bun census:apps ghostty     # Specific terminal
bun census:apps --list      # Show available
```

Results land in `content/probes-apps/{terminal}-{version}-{os}.json`.

### 3. Check for Unannotated Failures

```bash
bun census:run  # Reports unannotated failures at the end
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
git commit -m "census: update results"
git push
```
