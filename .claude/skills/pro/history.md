# Adaptive Learning via Review History

The history system enables pro-review to improve over time — adjusting cost estimates, prioritizing high-yield packages, and focusing on recurring patterns.

## History File

`history.jsonl` — append-only, one JSON line per package review:

```jsonl
{"date":"2026-03-13","package":"km-storage","path":"packages/km-storage","loc":4200,"cost":9.22,"findings":{"P0":9,"P1":8,"P2":5,"P3":1},"bead":"km-storage.pro-review-0313","fixed":{"P0":9,"P1":8},"duration_min":12,"patterns":["missing error handling","off-by-one in ranges"]}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | ISO date of review |
| `package` | string | Package name |
| `path` | string | Package path relative to repo root |
| `loc` | number | Lines of code reviewed |
| `cost` | number | Actual cost in USD (from LLM output metadata) |
| `findings` | object | Count by classification: `{P0, P1, P2, P3}` |
| `bead` | string | Review bead ID |
| `fixed` | object | Count of fixed findings by classification |
| `duration_min` | number | Minutes from launch to output |
| `patterns` | string[] | Recurring issue patterns found (for focus areas) |

## Writing History

After each package review is triaged, append a line:

```bash
echo '{"date":"<date>","package":"<pkg>","path":"<path>","loc":<loc>,"cost":<cost>,"findings":{"P0":<n>,"P1":<n>,"P2":<n>,"P3":<n>},"bead":"<bead-id>","fixed":{"P0":<n>,"P1":<n>},"duration_min":<min>,"patterns":[<patterns>]}' >> .claude/skills/pro/history.jsonl
```

**After fixing**: Update the `fixed` counts by reading and rewriting the last line for that package (or just append a correction entry).

## Reading History

### For Discovery (cost + staleness)

```bash
# Get latest review for each package
cat .claude/skills/pro/history.jsonl | while read line; do
  pkg=$(echo "$line" | jq -r '.package')
  date=$(echo "$line" | jq -r '.date')
  echo "$pkg $date"
done | sort -k1,1 -k2,2r | sort -u -k1,1
```

### For Staleness Detection

```bash
# Commits since last review
LAST_DATE=$(grep '"km-storage"' .claude/skills/pro/history.jsonl | tail -1 | jq -r '.date')
git log --oneline --since="$LAST_DATE" -- packages/km-storage/ | wc -l
```

Mark as stale if:
- Last review >2 weeks ago, OR
- >20 commits since last review, OR
- Major version bump (check git log for "feat:" or "refactor:" commits)

### For Focus Areas (recurring patterns)

```bash
# Extract all patterns across reviews
cat .claude/skills/pro/history.jsonl | jq -r '.patterns[]' | sort | uniq -c | sort -rn
```

Patterns appearing in 3+ package reviews become **focus areas** added to the review prompt:

```
Additional focus areas based on prior reviews:
- "Missing error handling" — found in 5/8 packages reviewed. Pay special attention to error
  propagation paths, especially in async code.
- "Off-by-one in range calculations" — found in 3/8 packages. Verify loop bounds and slice operations.
```

### For Yield Prioritization

```bash
# Findings density (findings per 1000 LOC)
cat .claude/skills/pro/history.jsonl | jq '{package, density: ((.findings.P0 + .findings.P1) / .loc * 1000)}'
```

Packages with historically higher finding density get recommended first in the discovery table.

## History Dashboard (`/pro-review --history`)

Present a summary:

```markdown
## Pro Review History

### Reviews (N total, $X spent)
| Date | Package | LOC | Findings | Fixed | Cost |
|------|---------|-----|----------|-------|------|
| 2026-03-13 | km-storage | 4,200 | 23 | 23/23 | $9.22 |
| 2026-03-13 | km-markdown | 2,900 | 24 | 22/24 | $7.24 |
| ... | | | | | |

### Recurring Patterns
1. Missing error handling (5 packages)
2. Off-by-one in ranges (3 packages)
3. Resource leak potential (2 packages)

### Package Health
| Package | Last Review | Findings/kLOC | Fix Rate | Status |
|---------|-------------|---------------|----------|--------|
| km-storage | 2026-03-13 | 5.5 | 100% | Up to date |
| km-commands | never | - | - | Needs review |
| km-board | never | - | - | Needs review |
```
