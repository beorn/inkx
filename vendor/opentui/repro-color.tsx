/**
 * Minimal reproduction of color rendering bug
 *
 * Bug: Named colors (especially "black") render as incorrect colors when used
 * as text foreground on colored backgrounds.
 *
 * Run with: bun run vendor/opentui/repro-color.tsx
 *
 * Environment:
 * - macOS (Apple Silicon) - Darwin arm64
 * - Bun 1.3.6
 * - @opentui/core 0.1.73
 * - @opentui/react 0.1.73
 *
 * Expected: All lines should show black text on cyan background
 * Actual: Text appears red/magenta instead of black
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

if (!process.stdout.isTTY) {
  console.error("This example requires a TTY");
  process.exit(1);
}

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  onDestroy: () => process.exit(0),
});

// Test component showing various color approaches
function ColorTest() {
  return (
    <box flexDirection="column" width={60} height={20}>
      <text bold>OpenTUI Color Rendering Test</text>
      <text dimColor>Press Ctrl+C to exit</text>
      <text> </text>

      {/* Reference: What cyan bg + black fg should look like */}
      <text bold>Expected: Black text on cyan background</text>
      <text> </text>

      {/* Test 1: Named colors */}
      <text>Test 1 - Named colors:</text>
      <text backgroundColor="cyan" color="black">
        {" "}
        color="black" backgroundColor="cyan"{" "}
      </text>
      <text> </text>

      {/* Test 2: Hex colors */}
      <text>Test 2 - Hex colors:</text>
      <text backgroundColor="#00ffff" color="#000000">
        {" "}
        color="#000000" backgroundColor="#00ffff"{" "}
      </text>
      <text> </text>

      {/* Test 3: Inverse (workaround) */}
      <text>Test 3 - Inverse styling (workaround):</text>
      <text inverse> inverse={"{true}"} </text>
      <text> </text>

      {/* Test 4: Just black text (no background) */}
      <text>Test 4 - Just black text, no background:</text>
      <text color="black"> color="black" (no bg) </text>
      <text> </text>

      {/* Test 5: Other colors on cyan */}
      <text>Test 5 - Other colors on cyan:</text>
      <text backgroundColor="cyan" color="white">
        {" "}
        color="white"{" "}
      </text>
      <text backgroundColor="cyan" color="red">
        {" "}
        color="red"{" "}
      </text>
      <text backgroundColor="cyan" color="blue">
        {" "}
        color="blue"{" "}
      </text>
    </box>
  );
}

createRoot(renderer).render(<ColorTest />);
