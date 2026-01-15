#!/usr/bin/env bun
/**
 * TUI Storybook - Visual Component Catalog
 *
 * Renders all TUI components in various states for visual inspection.
 * Run: bun run apps/km-cli/tests/tui/storybook.ts
 *
 * This is a non-interactive "poor man's storybook" for quick visual verification.
 */

import chalk from "chalk";
import {
  renderRich,
  renderPlain,
  displayLength,
  stripAnsi,
  getStatusIcon,
  getTypeIcon,
} from "../../src/text/index.ts";
import {
  wrapText,
  truncateText,
  padText,
  constrainText,
  renderPath,
  renderParentPath,
  type PathSegment,
} from "../../src/tui/layout/index.ts";

// Force chalk colors
chalk.level = 3;

const divider = "═".repeat(60);
const subDivider = "─".repeat(40);

function section(title: string) {
  console.log();
  console.log(chalk.bold.cyan(divider));
  console.log(chalk.bold.cyan(` ${title}`));
  console.log(chalk.bold.cyan(divider));
  console.log();
}

function subsection(title: string) {
  console.log(chalk.dim(subDivider));
  console.log(chalk.bold(title));
  console.log();
}

// ============================================================================
// Layer 1: Rich Text Rendering
// ============================================================================

section("Layer 1: Rich Text Rendering");

subsection("renderRich() - Inline Field Stripping");
const samples = [
  "Task with due date [due:: 2024-01-15]",
  "Task [priority:: 1] [status:: wip] with multiple fields",
  "No inline fields here",
];
for (const sample of samples) {
  console.log(chalk.dim("input:  ") + sample);
  console.log(chalk.dim("output: ") + renderRich(sample));
  console.log();
}

subsection("renderRich() - Wiki Link Styling");
const linkSamples = [
  "See [[note]] for details",
  "Link to [[path/to/document|Document Title]]",
  "Multiple [[link1]] and [[link2|Second Link]]",
];
for (const sample of linkSamples) {
  console.log(chalk.dim("input:  ") + sample);
  console.log(chalk.dim("output: ") + renderRich(sample));
  console.log();
}

subsection("renderRich() - Markdown Formatting");
const mdSamples = [
  "This has **bold** text",
  "This has *italic* text",
  "This has `inline code` text",
  "This has ~~strikethrough~~ text",
  "**Bold** and *italic* and `code` together",
];
for (const sample of mdSamples) {
  console.log(chalk.dim("input:  ") + sample);
  console.log(chalk.dim("output: ") + renderRich(sample));
  console.log();
}

subsection("renderPlain() - No Styling");
for (const sample of linkSamples.slice(0, 2)) {
  console.log(chalk.dim("input:  ") + sample);
  console.log(chalk.dim("plain:  ") + renderPlain(sample));
  console.log();
}

subsection("displayLength() vs string.length");
const styledText = chalk.bold.red("Hello") + " " + chalk.blue("World");
console.log("Styled text:     " + styledText);
console.log("string.length:   " + styledText.length);
console.log("displayLength(): " + displayLength(styledText));
console.log();

// ============================================================================
// Layer 1: Icons
// ============================================================================

section("Layer 1: Status & Type Icons");

subsection("Status Icons (Tasks)");
// Actual statuses from km-core/src/types.ts: todo, wip, blocked, done, dropped
const statuses = ["todo", "wip", "blocked", "done", "dropped"];
for (const status of statuses) {
  const icon = getStatusIcon(status);
  const colorFn = chalk[icon.color as keyof typeof chalk] as (
    s: string,
  ) => string;
  console.log(`  ${colorFn(icon.char)}  ${status}`);
}
console.log();
// Error cases - null/undefined/unknown should show inverted ? marker
console.log(chalk.dim("Error cases (null/undefined/invalid):"));
for (const status of [null, undefined, "invalid"]) {
  const icon = getStatusIcon(status);
  // Apply background color for error states
  let styledChar = icon.char;
  if (icon.backgroundColor) {
    const bgFn = chalk[`bg${icon.backgroundColor.charAt(0).toUpperCase()}${icon.backgroundColor.slice(1)}` as keyof typeof chalk] as (s: string) => string;
    const fgFn = chalk[icon.color as keyof typeof chalk] as (s: string) => string;
    styledChar = bgFn(fgFn(icon.char));
  }
  const label = status === null ? "null" : status === undefined ? "undefined" : status;
  console.log(`  ${styledChar}  ${label}`);
}
console.log();

subsection("Type Icons (Non-Tasks)");
// Note: code/quote return empty - rich text handles their visual styling
const types = ["folder", "file", "section", "paragraph", "code", "quote", "list-item"];
for (const type of types) {
  const icon = getTypeIcon(type);
  console.log(`  ${icon || " "}  ${type}`);
}
console.log();

// ============================================================================
// Layer 2: Layout Functions
// ============================================================================

section("Layer 2: Layout Functions");

subsection("wrapText() - Word Wrapping");
const longText =
  "This is a longer text that needs to be wrapped at a certain width to fit in a column";
console.log(chalk.dim("Width 30:"));
for (const line of wrapText(longText, 30)) {
  console.log(`  |${line}|`);
}
console.log();
console.log(chalk.dim("Width 20:"));
for (const line of wrapText(longText, 20)) {
  console.log(`  |${line}|`);
}
console.log();

subsection("truncateText() - Truncation with Ellipsis");
const textToTrunc = "This is text that might be truncated";
for (const w of [50, 30, 20, 10]) {
  const truncated = truncateText(textToTrunc, w);
  console.log(`  width=${w.toString().padStart(2)}: |${truncated}|`);
}
console.log();

subsection("padText() - Padding to Width");
for (const text of ["Hi", "Hello", "Hello World"]) {
  const padded = padText(text, 15);
  console.log(`  |${padded}| (length ${padded.length})`);
}
console.log();

subsection("constrainText() - Wrap + Truncate + Limit Lines");
const constrainSample =
  "This is a longer piece of text that needs both wrapping and line limiting";
console.log(chalk.dim("Width=25, maxLines=2:"));
const { lines, truncated } = constrainText(constrainSample, 25, 2);
for (const line of lines) {
  console.log(`  |${line}|`);
}
console.log(`  truncated: ${truncated}`);
console.log();

console.log(chalk.dim("Width=25, maxLines=5:"));
const r2 = constrainText(constrainSample, 25, 5);
for (const line of r2.lines) {
  console.log(`  |${line}|`);
}
console.log(`  truncated: ${r2.truncated}`);
console.log();

subsection("renderPath() - Breadcrumb Truncation");
const pathSegments: PathSegment[] = [
  { name: "Projects", sep: "/", isWithinBoard: false },
  { name: "Work", sep: "/", isWithinBoard: false },
  { name: "Q1-2024", sep: ">", isWithinBoard: true },
  { name: "Sprint 1", sep: ">", isWithinBoard: true },
  { name: "Tasks", sep: "", isWithinBoard: true },
];
const fullPath = pathSegments.map((s) => s.name + (s.sep ? ` ${s.sep} ` : "")).join("");
console.log(chalk.dim(`Full path (length=${fullPath.length}):`));
console.log(`  |${fullPath}|`);
console.log();

for (const w of [60, 40, 25]) {
  const result = renderPath(pathSegments, w);
  const rendered = result.map((s) => s.name + (s.sep ? ` ${s.sep} ` : "")).join("");
  console.log(chalk.dim(`Width=${w.toString().padStart(2)}: |${rendered}| (len=${rendered.length})`));
}
console.log();

subsection("renderParentPath() - Separate Line Context (compact/multi-line)");
// Used when context is on a separate line (compact mode or multi-line content)
// Right-aligns and truncates from left with "…"
const parentPath = "Projects/Work/Tasks/Subtask";
console.log(chalk.dim(`Input: "${parentPath}" (len=${parentPath.length})`));
console.log();
for (const w of [30, 25, 20, 15]) {
  const result = renderParentPath(parentPath, w);
  console.log(chalk.dim(`Width=${w.toString().padStart(2)}:`) + ` |${result}| (len=${result.length})`);
}
console.log();

subsection("Inline Context (wide mode, single-line)");
// Used when context is inline: " < parentContext"
console.log(chalk.dim("Format: ` < {context}` suffix on same line as content"));
console.log();
const inlineContext = "Projects/Tasks";
console.log(`  ○ My task content ${chalk.dim(`< ${inlineContext}`)}`);
console.log(`  ○ Another task ${chalk.dim(`< ${inlineContext.slice(0, 10)}…`)}`);
console.log();

// ============================================================================
// Summary
// ============================================================================

section("Summary");
console.log("All components rendered successfully.");
console.log();
console.log("To verify TUI components with real data, use:");
console.log(chalk.cyan("  bun km view @next"));
console.log();
