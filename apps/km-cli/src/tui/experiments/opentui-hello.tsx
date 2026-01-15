/**
 * OpenTUI Hello World - Minimal test to verify the framework works
 *
 * Run with: nix develop -c bun apps/km-cli/src/tui/experiments/opentui-hello.tsx
 */

/// <reference types="@opentui/react/jsx-namespace" />

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

function App() {
  return (
    <box border borderStyle="single" padding={1}>
      <text>Hello from OpenTUI!</text>
    </box>
  );
}

const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
