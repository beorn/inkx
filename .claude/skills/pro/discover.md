# Discovery & Cost Estimation

Scans the km monorepo to find reviewable TypeScript packages, estimates review cost, and checks history for prior reviews.

## Package Discovery

Scan these directories for TypeScript packages:

```bash
# Find all packages with TypeScript source
for dir in packages/*/src apps/*/src vendor/*/src; do
  [ -d "$dir" ] || continue
  pkg=$(echo "$dir" | sed 's|/src$||')
  # Count TypeScript LOC (excluding tests, node_modules, generated files)
  loc=$(find "$dir" -name '*.ts' -o -name '*.tsx' | grep -v '.test.' | grep -v '.spec.' | grep -v '__tests__' | grep -v 'node_modules' | grep -v '.generated.' | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
  echo "$pkg $loc"
done
```

### Vendor Subpackages

Vendor packages like `silvery` contain multiple internal packages. Group them as logical review units:

```bash
# For vendor packages with internal packages/ dir
for vendor in vendor/*/; do
  if [ -d "${vendor}packages" ]; then
    # List internal packages
    for sub in ${vendor}packages/*/src; do
      [ -d "$sub" ] || continue
      subpkg=$(echo "$sub" | sed 's|/src$||')
      loc=$(find "$sub" -name '*.ts' -o -name '*.tsx' | grep -v '.test.' | grep -v '.spec.' | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
      echo "$subpkg $loc"
    done
  fi
done
```

**Grouping rules**:
- silvery internal packages with <1000 LOC: group with their closest sibling (e.g., `@silvery/theme` + `@silvery/ag-react/ui`)
- flexily: single review unit (all under `vendor/flexily/src/`)
- Small packages (<500 LOC): skip unless specifically requested

## Cost Estimation

```
Input tokens ≈ (source_chars / 4) + 3000 (context header)
Output tokens ≈ 2000 (typical review response)
Cost ≈ (input_tokens * $25 / 1M) + (output_tokens * $200 / 1M)
     ≈ (input_tokens * 0.000025) + (2000 * 0.0002)
     ≈ (input_tokens * 0.000025) + $0.40
```

For a quick per-package estimate:
```
cost ≈ (LOC * 40 * 0.000025) + 0.40
     ≈ (LOC * 0.001) + 0.40
```

So: 1000 LOC ≈ $1.40, 5000 LOC ≈ $5.40, 10000 LOC ≈ $10.40

## History Check

Before presenting the table, read `history.jsonl` (if it exists) to enrich each package:

```bash
cat .claude/skills/pro/history.jsonl 2>/dev/null
```

For each package, extract:
- **Last reviewed**: Most recent entry's `date`
- **Findings**: Sum of findings from last review
- **Fix rate**: `fixed / total` from last review
- **Staleness**: Count commits since last review: `git log --oneline --since="<date>" -- <path> | wc -l`

## Output Table

Present using `AskUserQuestion`:

```markdown
## Pro Review Targets

| # | Package | LOC | Est. Cost | Last Reviewed | Findings | Commits Since |
|---|---------|-----|-----------|---------------|----------|---------------|
| 1 | km-storage | 4,200 | ~$4.60 | 2026-03-13 | 23 (all fixed) | 5 |
| 2 | km-commands | 5,500 | ~$5.90 | never | - | - |
| 3 | km-board | 3,800 | ~$4.20 | never | - | - |
| ... | | | | | | |
| | **TOTAL (all)** | | **~$48** | | | |

Enter packages to review (numbers like "2,3,5", or "all", "unreviewed", "stale"):
```

**Adaptive adjustments** (when history exists):
- Use actual cost from history instead of formula estimate when available
- Sort by recommendation: unreviewed first, then stale, then recently reviewed
- Flag packages with historically high finding density (findings/LOC > 0.01)
- Add "Recommended" column if history suggests high yield
