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
cp .claude/skills/pro/templates/context-header.md "$CONTEXT"

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

**Execution — fire-and-forget**:

Deep research is always fire-and-forget. The command fires the request, prints the response ID, and exits immediately (~5s). No poll loop, no background tasks, no timeout.

1. Run the command normally (NOT in background): `bun llm --deep --model gpt-5.4-pro -y --no-recover --context-file /tmp/pro-review-<pkg>.md "..."`
2. Note the response ID from the output
3. Move on to other work
4. Recover later: `bun llm recover <response-id>`

Launch up to 3 reviews sequentially — each exits in ~5s after firing.

## Step 3: Retrieve Results

After 15-30 minutes, recover the results:

```bash
bun llm recover <response-id>
```

If you forgot the ID: `bun llm recover` lists all partial responses.

Read the recovered output, then proceed to [triage.md](triage.md).

## Review Prompt Customization

The base prompt covers standard review areas. Add **dynamic focus areas** based on history:

```
# Additional focus areas based on prior reviews:
- [If history shows pattern]: Pay special attention to <pattern>
- [If package had specific weakness]: Deep dive into <area>
```

These focus areas come from [history.md](history.md) pattern analysis.

## Parallel Execution

When reviewing multiple packages, fire all sequentially (each exits in ~5s):

```bash
bun llm --deep --model gpt-5.4-pro -y --no-recover --context-file /tmp/pro-review-pkg1.md "..."
# → Response ID: resp_abc123...
bun llm --deep --model gpt-5.4-pro -y --no-recover --context-file /tmp/pro-review-pkg2.md "..."
# → Response ID: resp_def456...
bun llm --deep --model gpt-5.4-pro -y --no-recover --context-file /tmp/pro-review-pkg3.md "..."
# → Response ID: resp_ghi789...
```

Recover each after 15-30 min: `bun llm recover resp_abc123...`
