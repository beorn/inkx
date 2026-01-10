#!/usr/bin/env bun
/**
 * Simple key debugging tool to see exactly what Ink receives
 */

import React, { useState } from "react";
import { render, Box, Text, useInput, useApp } from "ink";

function KeyDebugger() {
  const { exit } = useApp();
  const [keys, setKeys] = useState<string[]>([]);
  const [moveMode, setMoveMode] = useState(false);

  useInput((input, key) => {
    const keyInfo = `input="${input}" key=${JSON.stringify(key)} moveMode=${moveMode}`;
    setKeys(prev => [...prev.slice(-10), keyInfo]);

    // Test move mode logic
    if (input === "m" && !moveMode) {
      setMoveMode(true);
      setKeys(prev => [...prev, ">>> ENTERED MOVE MODE"]);
      return;
    }

    if (moveMode) {
      if (input === "j" || input === "k" || input === "h" || input === "l") {
        setKeys(prev => [...prev, `>>> MOVE KEY: ${input} - would move card`]);
        setMoveMode(false);
        return;
      }
      if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
        setKeys(prev => [...prev, `>>> ARROW KEY in move mode - would move card`]);
        setMoveMode(false);
        return;
      }
      if (input === "") {
        // Ignore empty inputs
        return;
      }
      // Other key - cancel move mode
      setKeys(prev => [...prev, `>>> OTHER KEY: "${input}" - canceling move mode`]);
      setMoveMode(false);
    }

    if (input === "q") {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold>Key Debugger - Press 'q' to quit</Text>
      <Text color="cyan">Move mode: {moveMode ? "ON" : "OFF"}</Text>
      <Text>Try: press 'm' then 'j' to test move mode</Text>
      <Text>---</Text>
      {keys.map((k, i) => (
        <Text key={i} dimColor={i < keys.length - 3}>{k}</Text>
      ))}
    </Box>
  );
}

render(<KeyDebugger />);
