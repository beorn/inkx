# Vitest CI Integration

## Overview

The test suite now generates multiple report formats suitable for CI/CD pipelines while maintaining TAP output for terminal usage.

## Configuration

See `vitest.config.ts`:

```typescript
reporters: ["tap", "html", "junit"],
outputFile: {
  html: "./test-results/vitest-report.html",
  junit: "./test-results/junit.xml",
},
```

**Important**: The npm scripts `test:fast` and `test:all` use `--reporter=tap` to provide dot output for local development. This overrides the config reporters, so HTML/JUnit are not generated.

To generate reports for CI, run vitest directly without the reporter override:

```bash
bun vitest run  # Uses config reporters: tap + html + junit
```

## Report Formats

### TAP (Terminal)

- **Output**: Terminal stdout
- **Purpose**: Developer feedback during local test runs
- **Format**: TAP (Test Anything Protocol)
- **Usage**: Default for `bun run test:fast` and `bun run test:all`

### HTML Report

- **Output**: `test-results/vitest-report.html`
- **Purpose**: Interactive web-based test results browser
- **Format**: HTML + JavaScript + compressed JSON metadata
- **Features**:
  - File tree navigation
  - Test status filtering
  - Execution times
  - Error messages and stack traces
- **Viewing**: `npx vite preview --outDir test-results`

### JUnit XML

- **Output**: `test-results/junit.xml`
- **Purpose**: CI/CD integration (GitHub Actions, GitLab CI, Jenkins, etc.)
- **Format**: JUnit XML schema
- **Usage**: Most CI systems can parse this format to:
  - Display test results in PR checks
  - Track test history and trends
  - Generate failure notifications
  - Create test dashboards

## Example JUnit Structure

```xml
<testsuites name="vitest tests" tests="517" failures="13" errors="0" time="0.268">
  <testsuite name="apps/km-tui/tests/board-render.test.ts" tests="8" failures="0">
    <testcase classname="..." name="Board Pure Rendering > renderStatusBar shows visual mode" time="0.000795">
    </testcase>
    ...
  </testsuite>
  <testsuite name="apps/km-tui/tests/board.spec.ts" tests="1" failures="1">
    <testcase classname="..." name="..." time="0">
      <failure message="Cannot find package 'bun:sqlite'" type="Error">
        Error: Cannot find package 'bun:sqlite' imported from ...
      </failure>
    </testcase>
  </testsuite>
</testsuites>
```

## CI Integration Examples

### GitHub Actions

```yaml
- name: Run tests
  run: bun vitest run # Generates HTML/JUnit reports

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: test-results/

- name: Publish test results
  if: always()
  uses: EnricoMi/publish-unit-test-result-action@v2
  with:
    files: test-results/junit.xml
```

Note: Use `bun vitest run` instead of `bun run test:all` in CI to generate HTML/JUnit reports. The `test:all` script uses `--reporter=tap` which overrides the config reporters.

### GitLab CI

```yaml
test:
  script:
    - bun vitest run # Generates HTML/JUnit reports
  artifacts:
    when: always
    reports:
      junit: test-results/junit.xml
    paths:
      - test-results/
```

Note: Use `bun vitest run` instead of `bun run test:all` in CI to generate HTML/JUnit reports.

## Output Directory

The `test-results/` directory is gitignored and contains:

- `junit.xml` - JUnit XML report
- `vitest-report.html` - HTML report entry point
- `html.meta.json.gz` - Compressed test metadata
- `assets/` - HTML report JavaScript and CSS
- `bg.png`, `favicon.ico`, `favicon.svg` - HTML report assets

## Benefits

1. **Developer Experience**: TAP output in terminal for quick feedback
2. **Local Debugging**: HTML report for detailed test exploration
3. **CI Integration**: JUnit XML for automated test result tracking
4. **Artifact Storage**: All reports saved for historical analysis
5. **Zero Runtime Impact**: Report generation happens after tests complete

## Hybrid Test Strategy

Note: The project uses a hybrid testing approach:

- **Vitest**: Pure TypeScript packages (km-tree, km-board, km-tui, km-markdown)
- **Bun Test**: Packages requiring Bun APIs (km-storage with bun:sqlite, Worker)

The reporters only capture Vitest test results. Bun test results are shown via TAP output in terminal only.
