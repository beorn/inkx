/**
 * Spelling checker example - IDE-style error highlighting
 *
 * Demonstrates using curly underlines for spell check errors,
 * similar to how IDEs highlight misspelled words.
 *
 * Run with: bun examples/spelling-checker/index.ts
 */

import {
  chalk,
  curlyUnderline,
  styledUnderline,
  hyperlink,
} from "../../src/index.js";

// Sample text with "misspelled" words
const text = `The quik brown fox jumps over the layz dog.
This sentance contains severel mispelled words.
Please reveiw and corect the erors.`;

// Words that are "misspelled" (for demo purposes)
const misspelledWords = new Map([
  ["quik", "quick"],
  ["layz", "lazy"],
  ["sentance", "sentence"],
  ["severel", "several"],
  ["mispelled", "misspelled"],
  ["reveiw", "review"],
  ["corect", "correct"],
  ["erors", "errors"],
]);

console.log("📝 Spelling Checker Demo\n");
console.log("=".repeat(60));

// Display original text with errors highlighted
console.log("\n" + chalk.bold("Original text with errors highlighted:") + "\n");

let highlightedText = text;
for (const [wrong, _correct] of misspelledWords) {
  // Red curly underline for spelling errors (like VS Code)
  highlightedText = highlightedText.replace(
    new RegExp(`\\b${wrong}\\b`, "gi"),
    styledUnderline("curly", [255, 100, 100], wrong)
  );
}
console.log(highlightedText);

// Show corrections
console.log("\n" + chalk.bold("Suggested corrections:") + "\n");
for (const [wrong, correct] of misspelledWords) {
  console.log(
    `  ${styledUnderline("curly", [255, 100, 100], wrong)} → ${chalk.green(correct)}`
  );
}

// Different error types with different underline styles
console.log("\n" + chalk.bold("Error type indicators:") + "\n");

const errorTypes = [
  { style: "curly" as const, color: [255, 100, 100] as [number, number, number], label: "Spelling error", example: "mispeled" },
  { style: "curly" as const, color: [255, 200, 100] as [number, number, number], label: "Grammar warning", example: "they is" },
  { style: "dashed" as const, color: [100, 180, 255] as [number, number, number], label: "Style suggestion", example: "utilize" },
  { style: "dotted" as const, color: [180, 180, 180] as [number, number, number], label: "Hint", example: "TODO" },
];

for (const { style, color, label, example } of errorTypes) {
  console.log(`  ${styledUnderline(style, color, example)}  ← ${label}`);
}

// Code example
console.log("\n" + chalk.bold("Code with diagnostics:") + "\n");

const codeLines = [
  `function ${styledUnderline("curly", [255, 200, 100], "getUserData")}(${styledUnderline("curly", [255, 100, 100], "usrId")}) {`,
  `  const ${styledUnderline("dotted", [180, 180, 180], "result")} = fetchUser(${styledUnderline("curly", [255, 100, 100], "usrId")});`,
  `  return ${styledUnderline("dashed", [100, 180, 255], "result.data")};`,
  `}`,
];

for (const line of codeLines) {
  console.log(`  ${line}`);
}

console.log("\n" + chalk.dim("Legend:"));
console.log(chalk.dim(`  ${styledUnderline("curly", [255, 100, 100], "red")} = error`));
console.log(chalk.dim(`  ${styledUnderline("curly", [255, 200, 100], "yellow")} = warning`));
console.log(chalk.dim(`  ${styledUnderline("dashed", [100, 180, 255], "blue")} = suggestion`));
console.log(chalk.dim(`  ${styledUnderline("dotted", [180, 180, 180], "gray")} = hint`));

// Hyperlinks for more info
console.log("\n" + chalk.bold("Learn more:") + "\n");
console.log(`  ${hyperlink("VS Code Diagnostics", "https://code.visualstudio.com/api/language-extensions/diagnostics")}`);
console.log(`  ${hyperlink("LSP Specification", "https://microsoft.github.io/language-server-protocol/")}`);

console.log("\n" + "=".repeat(60));
