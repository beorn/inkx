# Per-Package Review Workflow

Builds context and launches a GPT 5.4 Pro deep research review for a single package.

## Step 1: Build Context File

The context file has three sections:

### Section A: Shared Header

Copy from [templates/context-header.md](templates/context-header.md). This provides the reviewer with km's architecture, principles, and code style — essential for contextual reviews.

### Section B: Package Source

Include **all** TypeScript source files in the package (excluding tests):

```bash
PKG_DIR="<package-path>/src"
CONTEXT="/tmp/pro-review-<package>.md"

# Start with shared header
cp .claude/skills/pro-review/templates/context-header.md "$CONTEXT"

# Append package source
echo -e "\n\n# Package Source: <package>\n" >> "$CONTEXT"

for f in $(find "$PKG_DIR" -name '*.ts' -o -name '*.tsx' | grep -v '.test.' | grep -v '.spec.' | grep -v '__tests__' | sort); do
  lines=$(wc -l < "$f")
  relpath=$(echo "$f" | sed "s|^$(pwd)/||")
  echo -e "\n### $relpath ($lines lines)\n\`\`\`typescript" >> "$CONTEXT"
  cat "$f" >> "$CONTEXT"
  echo -e "\`\`\`" >> "$CONTEXT"
done
```

**For large packages (>15K LOC)**: Split into review units by subdirectory. Launch separate reviews for each unit. Note this in the tracking bead.

### Section C: Prior Findings (Adaptive)

If this package was reviewed before (check `history.jsonl`), include a "Previously Found" section:

```markdown
## Prior Review Findings (YYYY-MM-DD)

The following issues were found in a prior review. Verify that fixes are in place and look
deeper in areas that were problematic:

- [P0] Off-by-one in range calculation (file.ts:120) — FIXED
- [P1] Missing null check in parser (parser.ts:45) — FIXED
- [P1] Resource leak in connection pool (pool.ts:200) — OPEN
...
```

This helps the reviewer verify fixes and focus on historically weak areas.

## Step 2: Launch Review

```bash
bun llm --deep --model gpt-5.4-pro -y --no-recover \
  --context-file /tmp/pro-review-<package>.md \
  "GPT 5.4 Pro code review: <package-name>. Review for correctness bugs, safety issues, API design problems, and performance. Classify findings as P0 (correctness bugs causing wrong behavior), P1 (important safety/quality), P2 (medium quality), P3 (style). For each finding include: file path, line range, classification, description, and suggested fix. Do NOT report style preferences, missing JSDoc, import ordering, or linter-handled issues."
```

**Execution**:
- ALWAYS run in background: `Bash(command='...', run_in_background=true)`
- Launch up to 3 reviews concurrently
- Track task IDs for each package

## Step 3: Retrieve Results

After background task completes:

```bash
# Find the output file (NOT the task output — that's streaming tokens)
ls -lt /tmp/llm-${CLAUDE_SESSION_ID:0:8}-*.txt | head -5
```

Read the output file with `Read`. Then proceed to [triage.md](triage.md).

## Review Prompt Customization

The base prompt covers standard review areas. Add **dynamic focus areas** based on history:

```
# Additional focus areas based on prior reviews:
- [If history shows pattern]: Pay special attention to <pattern> — prior reviews found this across multiple packages
- [If package had specific weakness]: Deep dive into <area> — historically problematic in this package
```

These focus areas come from [history.md](history.md) pattern analysis.

## Parallel Execution

When reviewing multiple packages:

```
# Launch all reviews in background (max 3 at a time)
Bash(command='bun llm --deep ...for pkg1...', run_in_background=true)  → task_id_1
Bash(command='bun llm --deep ...for pkg2...', run_in_background=true)  → task_id_2
Bash(command='bun llm --deep ...for pkg3...', run_in_background=true)  → task_id_3

# Wait for first batch
TaskOutput(task_id=task_id_1, block=true, timeout=600000)
# Triage pkg1, then launch pkg4 if queue remains
...
```

As each completes, triage immediately and launch the next queued package. This keeps the pipeline flowing without overloading the deep research queue.
