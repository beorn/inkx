import {
  renderRich,
  displayLength,
  constrainText,
  stripAnsi,
} from "../src/tui/render-text.ts";

const text1 = "Fill in [[inventory/inventory-icloud]] - ✅ Complete";
const text2 = "Financial POA for both spouses";

const styled1 = renderRich(text1);
const styled2 = renderRich(text2);

console.log("Text 1:", text1);
console.log("Styled 1:", JSON.stringify(styled1));
console.log("Display length 1:", displayLength(styled1));
console.log("Plain 1:", stripAnsi(styled1));

console.log("\nText 2:", text2);
console.log("Styled 2:", JSON.stringify(styled2));
console.log("Display length 2:", displayLength(styled2));

const constrained1 = constrainText(styled1, 50, 1);
const constrained2 = constrainText(styled2, 50, 1);

console.log("\nConstrained 1:", JSON.stringify(constrained1.lines[0]));
console.log(
  "Constrained 1 display len:",
  displayLength(constrained1.lines[0] || ""),
);
console.log("\nConstrained 2:", JSON.stringify(constrained2.lines[0]));
console.log(
  "Constrained 2 display len:",
  displayLength(constrained2.lines[0] || ""),
);
