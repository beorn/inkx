#!/usr/bin/env bun
/**
 * OpenTUI Storybook - Visual Component Catalog
 *
 * Renders visual examples of TUI component styling using chalk.
 * Since OpenTUI's test renderer doesn't support ANSI output capture,
 * this storybook outputs styled text directly to stdout.
 *
 * Run: bun run storybook2
 */

import { getStatusIcon, GTD_BOARD_COLORS } from "@km/ink";
import { wrapText, truncateText, padText, constrainText } from "@km/ink";
import chalk, { type ChalkInstance } from "chalk";
import type { TaskStatus } from "@km/board";

// Force chalk colors in terminal
chalk.level = 3;

// Helper to safely get chalk color function by name
function getChalkColorFn(color: string): ChalkInstance {
  const colorMap: Record<string, ChalkInstance> = {
    green: chalk.green,
    yellow: chalk.yellow,
    red: chalk.red,
    blue: chalk.blue,
    cyan: chalk.cyan,
    magenta: chalk.magenta,
    white: chalk.white,
    gray: chalk.gray,
    dim: chalk.dim,
  };
  return colorMap[color] ?? chalk.white;
}

// ============================================================================
// Section Header Functions
// ============================================================================

function sectionHeader(title: string): string {
  const divider = "═".repeat(60);
  return [
    "",
    chalk.cyan.bold(divider),
    chalk.cyan.bold(` ${title}`),
    chalk.cyan.bold(divider),
  ].join("\n");
}

function subsectionHeader(title: string): string {
  const subDivider = "─".repeat(40);
  return ["", chalk.dim(subDivider), chalk.bold(title), ""].join("\n");
}

// ============================================================================
// Layer 1: Rich Text Rendering
// ============================================================================

function layer1RichText(): string {
  const lines: string[] = [];
  lines.push(sectionHeader("Layer 1: Rich Text Rendering"));

  lines.push(subsectionHeader("Inline Field Examples (stripped in display)"));
  const inlineFields = [
    "Task with due date [due:: 2024-01-15]",
    "Task [priority:: 1] [status:: wip] with multiple fields",
    "No inline fields here",
  ];
  for (const text of inlineFields) {
    lines.push(chalk.dim(`input: ${text}`));
    lines.push("output: [field-free version shown in Card/TreeNode]");
    lines.push("");
  }

  lines.push(subsectionHeader("Wiki Link Examples (styled in display)"));
  const wikiLinks = [
    "See [[note]] for details",
    "Link to [[path/to/document|Document Title]]",
    "Multiple [[link1]] and [[link2|Second Link]]",
  ];
  for (const text of wikiLinks) {
    lines.push(chalk.dim(`input: ${text}`));
    lines.push(chalk.blue("[links rendered in blue]"));
    lines.push("");
  }

  lines.push(subsectionHeader("Markdown Formatting Examples"));
  const markdown = [
    "This has **bold** text",
    "This has *italic* text",
    "This has `inline code` text",
    "This has ~~strikethrough~~ text",
    "**Bold** and *italic* and `code` together",
  ];
  for (const text of markdown) {
    lines.push(chalk.dim("input: ") + text);
  }

  return lines.join("\n");
}

// ============================================================================
// Layer 1: Tag Pills / Board Colors
// ============================================================================

function layer1TagPills(): string {
  const lines: string[] = [];
  lines.push(sectionHeader("Layer 1: Tag Pills / Board Colors"));

  lines.push(subsectionHeader("GTD Board Colors (preset tag colors)"));
  lines.push(chalk.dim(" Tag Name    Color    Description"));
  lines.push(chalk.dim(" ──────────  ───────  ─────────────────────"));

  const presetTags = [
    { name: "inbox", desc: "Uncategorized items" },
    { name: "next", desc: "Ready to work on" },
    { name: "waiting", desc: "Blocked on external" },
    { name: "someday", desc: "Future consideration" },
    { name: "done", desc: "Completed" },
    { name: "blocked", desc: "Cannot proceed" },
  ];

  for (const { name, desc } of presetTags) {
    const color = GTD_BOARD_COLORS[name] || "white";
    const colorFn = getChalkColorFn(color);
    lines.push(
      ` ${colorFn(`@${name.padEnd(10)}`)} ${chalk.dim(color.padEnd(7))} ${chalk.dim(`← ${desc}`)}`,
    );
  }
  lines.push("");

  lines.push(subsectionHeader("Custom Tag Colors (via color= attribute)"));
  lines.push(
    chalk.dim(" Custom colors override presets using color=value in headings"),
  );
  const customTags = [
    { name: "Sprint", color: "magenta" },
    { name: "Urgent", color: "red" },
    { name: "Research", color: "blue" },
  ];
  for (const { name, color } of customTags) {
    const colorFn = getChalkColorFn(color);
    lines.push(` ${colorFn(`@${name}`)} ${chalk.dim(`← color=${color}`)}`);
  }

  return lines.join("\n");
}

// ============================================================================
// Layer 1: Task Status Styling
// ============================================================================

function layer1TaskStyling(): string {
  const lines: string[] = [];
  lines.push(sectionHeader("Layer 1: Task Status Styling"));

  lines.push(subsectionHeader("Standard Status States"));
  lines.push(chalk.dim(" Plain  Icon  Description"));
  lines.push(chalk.dim(" ─────  ────  ─────────────────────"));

  const statusTable: Array<{ mark: string; status: TaskStatus; desc: string }> =
    [
      { mark: " ", status: "todo", desc: "Not started" },
      { mark: "/", status: "wip", desc: "Work in progress" },
      { mark: "!", status: "blocked", desc: "Blocked" },
      { mark: "x", status: "done", desc: "Completed" },
      { mark: "-", status: "dropped", desc: "Dropped" },
    ];

  for (const { mark, status, desc } of statusTable) {
    const icon = getStatusIcon(status);
    const colorFn = getChalkColorFn(icon.color);
    const isDoneOrDropped = status === "done" || status === "dropped";
    const descText = isDoneOrDropped ? chalk.dim(desc) : desc;
    lines.push(` [${mark}]   ${colorFn(icon.char)}     ${descText}`);
  }
  lines.push("");

  lines.push(subsectionHeader("Status Icons in Cards"));
  lines.push(chalk.bold("Todo (open):"));
  lines.push(`  ${chalk.green("○")} Setup CI pipeline`);
  lines.push(chalk.bold("WIP (in progress):"));
  lines.push(`  ${chalk.yellow("◐")} Review PR #42`);
  lines.push(chalk.bold("Blocked:"));
  lines.push(`  ${chalk.red("⊘")} Wait on API`);
  lines.push(chalk.bold("Done:"));
  lines.push(`  ${chalk.dim.green("✓")} ${chalk.dim("Implement auth")}`);

  return lines.join("\n");
}

// ============================================================================
// Layer 2: Layout Functions
// ============================================================================

function layer2Layout(): string {
  const lines: string[] = [];
  lines.push(sectionHeader("Layer 2: Layout Functions"));

  const longText =
    "This is a longer text that needs to be wrapped at a certain width to fit in a column";
  const truncText = "This is text that might be truncated";

  lines.push(subsectionHeader("wrapText() - Word Wrapping"));
  lines.push(chalk.dim("Width 30:"));
  for (const line of wrapText(longText, 30)) {
    lines.push(` |${line}|`);
  }
  lines.push("");

  lines.push(subsectionHeader("truncateText() - Truncation with Ellipsis"));
  lines.push(` width=50: |${truncateText(truncText, 50)}|`);
  lines.push(` width=30: |${truncateText(truncText, 30)}|`);
  lines.push(` width=20: |${truncateText(truncText, 20)}|`);
  lines.push(` width=10: |${truncateText(truncText, 10)}|`);
  lines.push("");

  lines.push(subsectionHeader("padText() - Padding to Width"));
  lines.push(` |${padText("Hi", 15)}| (length 15)`);
  lines.push(` |${padText("Hello", 15)}| (length 15)`);
  lines.push(` |${padText("Hello World", 15)}| (length 15)`);
  lines.push("");

  lines.push(
    subsectionHeader("constrainText() - Wrap + Truncate + Limit Lines"),
  );
  lines.push(chalk.dim("Width=25, maxLines=2:"));
  const constrained = constrainText(
    "This is a longer piece of text that needs both wrapping and line limiting",
    25,
    2,
  );
  for (const line of constrained.lines) {
    lines.push(` |${line}|`);
  }
  lines.push(` truncated: ${constrained.truncated}`);

  return lines.join("\n");
}

// ============================================================================
// Layer 3: TreeNode Component (simulated with chalk)
// ============================================================================

function renderTreeNode(
  title: string,
  status: TaskStatus,
  isSelected: boolean,
): string {
  const icon = getStatusIcon(status);
  const colorFn = getChalkColorFn(icon.color);
  const isDoneOrDropped = status === "done" || status === "dropped";

  let line = `  ${colorFn(icon.char)} ${title}`;
  if (isDoneOrDropped) {
    line = chalk.dim(line);
  }
  if (isSelected) {
    line = chalk.bgCyan.black(line);
  }
  return line;
}

function layer3TreeNode(): string {
  const lines: string[] = [];
  lines.push(sectionHeader("Layer 3: TreeNode Component"));

  lines.push(subsectionHeader("TreeNode - Different Task States"));
  lines.push(chalk.dim("Each node rendered at width=40:"));
  lines.push("");

  lines.push(chalk.bold("Todo (open):"));
  lines.push(renderTreeNode("Setup CI pipeline", "todo", false));

  lines.push(chalk.bold("WIP (in progress):"));
  lines.push(renderTreeNode("Review PR #42", "wip", false));

  lines.push(chalk.bold("Blocked:"));
  lines.push(renderTreeNode("Wait on API", "blocked", false));

  lines.push(chalk.bold("Done (dim):"));
  lines.push(renderTreeNode("Implement auth", "done", false));

  lines.push(chalk.bold("Dropped (dim):"));
  lines.push(renderTreeNode("Old approach", "dropped", false));

  lines.push("");
  lines.push(subsectionHeader("TreeNode - Selection States"));

  lines.push(chalk.bold("Normal (not selected):"));
  lines.push(renderTreeNode("Example task content", "todo", false));

  lines.push(chalk.bold.cyan("Selected (cyan background):"));
  lines.push(renderTreeNode("Example task content", "todo", true));

  return lines.join("\n");
}

// ============================================================================
// Visual Language Section - Design System Reference
// ============================================================================

function visualLanguageSection(): string {
  const lines: string[] = [];
  lines.push(sectionHeader("Visual Language - Design System"));
  lines.push(chalk.dim("Reference: docs/08-ui.md"));
  lines.push("");

  lines.push(subsectionHeader("Selection States (RESERVED COLOR)"));
  lines.push(
    chalk.dim(" Cyan bg = selection ONLY (cursor, focused, multi-select)"),
  );
  lines.push("");

  lines.push(chalk.bold("Normal (no selection):"));
  lines.push(renderTreeNode("Example task content", "todo", false));
  lines.push(chalk.bold.cyan("Selected (cyan bg):"));
  lines.push(renderTreeNode("Example task content", "todo", true));
  lines.push("");

  lines.push(subsectionHeader("Column Header States"));
  lines.push(
    chalk.bold.yellow("Selected Column (4)") +
      "     " +
      chalk.dim("color: yellow, bold: true"),
  );
  lines.push(
    chalk.yellowBright.dim("Unselected Column (2)") +
      "  " +
      chalk.dim("color: yellowBright, dim: true"),
  );
  lines.push(
    chalk.bgCyan.black(" Header at Cursor ") +
      "  " +
      chalk.dim("bg: cyan (cursor level)"),
  );
  lines.push("");

  lines.push(subsectionHeader("Task Status States"));
  lines.push(chalk.bold("Active states:"));
  lines.push(renderTreeNode("Example task content", "todo", false));
  lines.push(renderTreeNode("Work in progress task", "wip", false));
  lines.push(chalk.bold("Terminal states (dim):"));
  lines.push(renderTreeNode("Completed task item", "done", false));
  lines.push(renderTreeNode("Dropped task item", "dropped", false));
  lines.push("");

  lines.push(subsectionHeader("Due Date Urgency Colors"));
  lines.push("");
  lines.push(chalk.red(" Overdue: red"));
  lines.push(chalk.red(" Today/Tomorrow: red"));
  lines.push(chalk.yellow(" Within 3 days: yellow"));
  lines.push(chalk.gray(" Beyond 7 days: gray (no urgency)"));

  return lines.join("\n");
}

// ============================================================================
// Summary
// ============================================================================

function summary(): string {
  const lines: string[] = [];
  lines.push(sectionHeader("Summary"));
  lines.push("All OpenTUI visual styles demonstrated.");
  lines.push("");
  lines.push("To verify TUI components with real data, use:");
  lines.push(chalk.cyan(" bun km view @next"));
  lines.push("");
  return lines.join("\n");
}

// ============================================================================
// Main Output
// ============================================================================

console.log(layer1RichText());
console.log(layer1TagPills());
console.log(layer1TaskStyling());
console.log(layer2Layout());
console.log(layer3TreeNode());
console.log(visualLanguageSection());
console.log(summary());
